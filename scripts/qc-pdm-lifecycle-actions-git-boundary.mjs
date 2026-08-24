#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const handoffPath = ".ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md";

const lifecycleCandidateFiles = [
  ".ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md",
  ".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md",
  ".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md",
  ".ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md",
  ".ai-doc/dev_task.md",
  ".ai-doc/documentation_map.md",
  handoffPath,
  "package.json",
  "src/lib/pdm-lifecycle-policy.ts",
  "src/lib/repositories/master-attachment-async-repository.ts",
  "src/lib/master-attachments-async.ts",
  "src/lib/master-attachment-response.ts",
  "src/lib/repositories/submission-list-async-repository.ts",
  "src/lib/types.ts",
  "src/app/api/lifecycle/policy/route.ts",
  "src/app/api/lifecycle/controlled-history/route.ts",
  "src/app/api/parts/[partNumber]/attachments/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/restore/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/restore/route.ts",
  "src/app/api/submissions/route.ts",
  "src/app/api/search/route.ts",
  "src/components/master-attachment-panel.tsx",
  "src/components/dashboard.tsx",
  "src/app/globals.css",
  "src/app/styles/responsive.css",
  "scripts/qc-pdm-lifecycle-actions.mjs",
  "scripts/qc-pdm-lifecycle-actions-ui.mjs",
  "scripts/qc-pdm-lifecycle-actions-git-boundary.mjs",
  "scripts/qc-pdm-lifecycle-controlled-history.mjs",
  "scripts/qc-pdm-lifecycle-controlled-history-ui.mjs",
  "scripts/qc-pdm-lifecycle-release-readiness.mjs"
];

const lifecycleQcInfrastructureFiles = [
  "scripts/qc-pdm-lifecycle-isolated-runtime.mjs"
];

const protectedParallelTaskPatterns = [
  /(?:^|\/)db\/postgres\/023_remove_project_status_authority\.sql$/iu,
  /(?:^|\/)db\/postgres\/024_remove_submission_phase_gate\.sql$/iu,
  /(?:^|\/)\.ai-doc\/archived\/legacy-supabase-migration-mirror\/migrations\/20260804030000_remove_project_status_authority\.sql$/iu,
  /(?:^|\/)\.ai-doc\/archived\/legacy-supabase-migration-mirror\/migrations\/20260805010000_remove_submission_phase_gate\.sql$/iu,
  /(?:^|\/)(?:DEV-054|dev054)(?:\/|[-_.])/iu,
  /(?:^|\/)(?:dvt|development[_-]phase)(?:\/|[-_.])/iu
];

const requiredEvidenceArtifacts = [
  "output/playwright/pdm-lifecycle-attachments-desktop-final.png",
  "output/playwright/pdm-lifecycle-attachments-laptop-final.png",
  "output/playwright/pdm-lifecycle-attachments-mobile-final.png",
  "output/playwright/pdm-lifecycle-attachments-deleted-fixture.png",
  "output/playwright/pdm-lifecycle-controlled-history-desktop.png",
  "output/playwright/pdm-lifecycle-controlled-history-mobile.png"
];

const knownUnrelatedStagedFiles = [
  ".ai-doc/qa/qa-pdm-change-control-validation-plan-2026-06-24.md",
  ".ai-doc/qa/qa-supabase-data-parity-policy-2026-06-16.md",
  ".ai-doc/reports/pm/pdm-file-storage-cost-control-development-plan-2026-06-10.md",
  ".ai-doc/reports/pm/pm-sw-license-pdm-company-git-boundary-handoff-2026-06-18.md",
  ".ai-doc/reports/pm/pm-sw-license-pdm-company-operational-shared-development-plan-2026-06-18.md",
  ".ai-doc/specs/SPEC-PDM-CHANGE-CONTROL-001-revision-part-bom-flow.md",
  ".ai-doc/specs/SPEC-SUPABASE-DB-001-runtime-postgres-migration.md"
];

const mixedFileWarnings = [
  "package.json",
  "src/components/master-attachment-panel.tsx",
  "src/lib/repositories/master-attachment-async-repository.ts",
  "src/lib/repositories/submission-list-async-repository.ts",
  "src/app/api/submissions/route.ts",
  "src/app/api/search/route.ts",
  "src/components/dashboard.tsx",
  "src/app/globals.css",
  "src/app/styles/responsive.css",
  ".ai-doc/dev_task.md",
  ".ai-doc/documentation_map.md"
];

const failures = [];
const notes = [];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" })
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
}

function exists(relativePath) {
  return projectFileExists(root, relativePath);
}

function read(relativePath) {
  return readProjectFile(root, relativePath);
}

const lifecycleScopeManifest = [...lifecycleCandidateFiles, ...lifecycleQcInfrastructureFiles];
for (const relativePath of lifecycleScopeManifest) {
  if (!exists(relativePath)) failures.push(`missing lifecycle boundary candidate: ${relativePath}`);
}

const protectedScopeEntries = lifecycleScopeManifest.filter((relativePath) =>
  protectedParallelTaskPatterns.some((pattern) => pattern.test(relativePath.replaceAll("\\", "/")))
);
if (protectedScopeEntries.length > 0) {
  failures.push(`lifecycle scope manifest crosses protected DEV-054 boundary: ${protectedScopeEntries.join(", ")}`);
}

for (const relativePath of requiredEvidenceArtifacts) {
  if (!exists(relativePath)) failures.push(`missing lifecycle evidence artifact: ${relativePath}`);
}

const packageJson = readProjectJson(root, "package.json");
for (const scriptName of [
  "qc:pdm-lifecycle-actions",
  "qc:pdm-lifecycle-actions-ui",
  "qc:pdm-lifecycle-controlled-history",
  "qc:pdm-lifecycle-controlled-history-ui",
  "qc:pdm-lifecycle-release-readiness",
  "qc:pdm-lifecycle-actions-git-boundary",
  "qc:master-attachments"
]) {
  if (!packageJson.scripts?.[scriptName]) failures.push(`missing package script: ${scriptName}`);
}

const handoff = exists(handoffPath) ? read(handoffPath) : "";
for (const requiredPhrase of [
  "Phase 1-6 local/staging implementation and QC evidence are captured",
  "Do not commit the real index as-is",
  "Lifecycle Phase 1-6 Candidate Group",
  "Mixed-File Caution",
  "Current Real-Index Blockers",
  "Allowed closure paths"
]) {
  if (!handoff.includes(requiredPhrase)) failures.push(`handoff missing phrase: ${requiredPhrase}`);
}

for (const relativePath of [...lifecycleCandidateFiles, ...requiredEvidenceArtifacts, ...knownUnrelatedStagedFiles, ...mixedFileWarnings]) {
  if (!handoff.includes(relativePath)) failures.push(`handoff does not mention expected path: ${relativePath}`);
}

const stagedFiles = git(["diff", "--cached", "--name-only"]);
const stagedSet = new Set(stagedFiles);
const unrelatedStaged = knownUnrelatedStagedFiles.filter((relativePath) => stagedSet.has(relativePath));
if (unrelatedStaged.length > 0) {
  notes.push(`real index is unsafe for direct lifecycle commit; unrelated staged files: ${unrelatedStaged.length}`);
} else {
  notes.push("no known unrelated staged files detected in the real index");
}

const trackedOrUntracked = new Set([...git(["diff", "--name-only"]), ...git(["ls-files", "--others", "--exclude-standard"])]);
const currentlyChangedScopeFiles = lifecycleScopeManifest.filter((relativePath) => trackedOrUntracked.has(relativePath) || stagedSet.has(relativePath));
notes.push(
  `${currentlyChangedScopeFiles.length}/${lifecycleScopeManifest.length} lifecycle scope files currently differ from HEAD; dirty-tree membership is informational, not a product pass condition`
);

const isolationRuntime = read("scripts/qc-pdm-lifecycle-isolated-runtime.mjs");
for (const requiredMarker of [
  "LIFECYCLE_QC_EXTERNAL_TARGET_REFUSED",
  "PDM_DATA_DIR: dataDir",
  "PDM_REPOSITORY_DIR: repositoryDir",
  "PDM_POSTGRES_URL: \"\"",
  "DATABASE_URL: \"\"",
  "productionConnected: false",
  "productionDataUnchanged",
  "cleanupStatus"
]) {
  if (!isolationRuntime.includes(requiredMarker)) failures.push(`isolated lifecycle runtime missing safety marker: ${requiredMarker}`);
}

for (const relativePath of [
  "scripts/qc-pdm-lifecycle-actions-ui.mjs",
  "scripts/qc-pdm-lifecycle-submission-obsolete.mjs",
  "scripts/qc-pdm-lifecycle-controlled-history-ui.mjs"
]) {
  const source = read(relativePath);
  if (!source.includes('from "./qc-pdm-lifecycle-isolated-runtime.mjs"')) {
    failures.push(`mutating lifecycle QC does not use isolated runtime: ${relativePath}`);
  }
  if (source.includes('process.env.PDM_BASE_URL ?? "http://127.0.0.1:3000"')) {
    failures.push(`mutating lifecycle QC still defaults to fixed port 3000: ${relativePath}`);
  }
  if (source.includes('path.join(root, "data", "ai-pdm.sqlite")')) {
    failures.push(`mutating lifecycle QC still targets workspace database: ${relativePath}`);
  }
}

const lifecycleQc = read("scripts/qc-pdm-lifecycle-actions.mjs");
if (!lifecycleQc.includes("qc:pdm-lifecycle-actions-git-boundary")) {
  failures.push("main lifecycle QC does not assert the git-boundary package script");
}

if (failures.length > 0) {
  console.error("QC PDM lifecycle actions git boundary: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("QC PDM lifecycle actions git boundary: PASS");
for (const note of notes) console.log(`- ${note}`);
console.log("- lifecycle Phase 1-6 scope manifest, DEV-054 exclusion, isolated runtime, and evidence files are verified independently of working-tree dirtiness");
