#!/usr/bin/env node

import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const readRequired = (relativePath) => readProjectFile(root, relativePath);
const existsRequired = (relativePath) => projectFileExists(root, relativePath);

const devTask = readRequired(".ai-doc/dev_task.md");
const devTaskLower = devTask.toLowerCase();
const documentationMap = readRequired(".ai-doc/documentation_map.md");
const spec = readRequired(".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md");
const contract = readRequired(".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md");
const qaPlan = readRequired(".ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md");
const packageJson = readProjectJson(root, "package.json");

const requiredPackageScripts = [
  "qc:pdm-lifecycle-actions",
  "qc:pdm-lifecycle-actions-ui",
  "qc:pdm-lifecycle-draft-ui",
  "qc:pdm-lifecycle-import-ui",
  "qc:pdm-lifecycle-obsolete",
  "qc:pdm-lifecycle-submission-obsolete",
  "qc:pdm-lifecycle-controlled-history",
  "qc:pdm-lifecycle-controlled-history-ui",
  "qc:pdm-lifecycle-actions-git-boundary",
  "qc:pdm-lifecycle-release-readiness"
];

const requiredEvidenceFiles = [
  ".ai-doc/decisions/ADR-PDM-LIFECYCLE-ACTIONS-001-ui-vocabulary-and-backend-lifecycle.md",
  ".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-delete-restore-obsolete.md",
  ".ai-doc/specs/SPEC-PDM-LIFECYCLE-ACTIONS-001-implementation-contract.md",
  ".ai-doc/qa/qa-pdm-lifecycle-actions-validation-plan-2026-06-29.md",
  ".ai-doc/reports/pm/pdm-lifecycle-actions-phase-1-git-boundary-handoff-2026-06-29.md",
  "scripts/qc-pdm-lifecycle-actions.mjs",
  "scripts/qc-pdm-lifecycle-actions-ui.mjs",
  "scripts/qc-pdm-lifecycle-draft-ui.mjs",
  "scripts/qc-pdm-lifecycle-import-ui.mjs",
  "scripts/qc-pdm-lifecycle-obsolete.mjs",
  "scripts/qc-pdm-lifecycle-submission-obsolete.mjs",
  "scripts/qc-pdm-lifecycle-controlled-history.mjs",
  "scripts/qc-pdm-lifecycle-controlled-history-ui.mjs",
  "output/playwright/pdm-lifecycle-controlled-history-desktop.png",
  "output/playwright/pdm-lifecycle-controlled-history-mobile.png"
];

assert(spec.includes("Phase 6") && spec.includes("Local/staging release readiness"), "SPEC defines Phase 6 local/staging release-readiness");
assert(contract.includes("Phase 6 excludes production deployment and Supabase production cutover"), "Implementation contract excludes production in Phase 6");
assert(qaPlan.includes("QA-LIFE-027") && qaPlan.includes("QA-LIFE-028"), "QA plan defines release-readiness and production-exclusion criteria");
assert(qaPlan.includes("full regression against `QA-LIFE-001` to `QA-LIFE-026`"), "QA plan requires full lifecycle regression before release readiness");

for (const scriptName of requiredPackageScripts) {
  assert(Boolean(packageJson.scripts?.[scriptName]), `Package script ${scriptName} is registered`);
}

for (const relativePath of requiredEvidenceFiles) {
  assert(existsRequired(relativePath), `Required lifecycle release evidence file exists: ${relativePath}`);
}

assert(devTask.includes("Phase 5 unified controlled-history UI/API slice is implemented/QC-checked"), "dev_task records Phase 5 unified controlled-history QC state");
assert(devTask.includes("Phase 6 local/staging release readiness"), "dev_task records Phase 6 release-readiness scope");
assert(devTask.includes("production/Supabase production exclusion"), "dev_task preserves production and Supabase production exclusion");
assert(devTask.includes("User has authorized scoped Git/index cleanup"), "dev_task records Git cleanup authorization");
assert(devTask.includes("npm.cmd run qc:pdm-lifecycle-controlled-history` 56/56"), "dev_task records controlled-history static QC result");
assert(devTask.includes("npm.cmd run qc:pdm-lifecycle-controlled-history-ui` 30/30"), "dev_task records controlled-history UI QC result");
assert(devTask.includes("npm.cmd run qc:pdm-lifecycle-submission-obsolete` 20/20"), "dev_task records dynamic submission obsolete/history QC result");

assert(documentationMap.includes("src/app/api/lifecycle/controlled-history/route.ts"), "documentation_map indexes controlled-history API route");
assert(documentationMap.includes("scripts/qc-pdm-lifecycle-controlled-history-ui.mjs"), "documentation_map indexes controlled-history UI QC");
assert(documentationMap.includes("output/playwright/pdm-lifecycle-controlled-history-desktop.png"), "documentation_map indexes controlled-history desktop screenshot");
assert(documentationMap.includes("output/playwright/pdm-lifecycle-controlled-history-mobile.png"), "documentation_map indexes controlled-history mobile screenshot");
assert(documentationMap.includes("production and Supabase production cutover excluded"), "documentation_map preserves production cutover exclusion");

assert(!devTask.includes("Production remains approved for lifecycle release"), "No lifecycle production approval is recorded in dev_task");
assert(!documentationMap.includes("Lifecycle production cutover approved"), "No lifecycle production cutover approval is recorded in documentation_map");

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: checks.length,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
      checks
    },
    null,
    2
  )
);
