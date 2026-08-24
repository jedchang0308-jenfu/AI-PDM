#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const normalize = (value) => value.replaceAll("\\", "/");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const check = (name, condition, detail = "") => checks.push({ name, pass: Boolean(condition), detail });

function visit(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...visit(target, predicate));
    else if (predicate(target)) files.push(target);
  }
  return files;
}

const sourceFiles = visit(path.join(root, "src"), (file) => /\.(?:ts|tsx|js|jsx|mjs)$/u.test(file));
const runtimeScriptFiles = visit(path.join(root, "scripts"), (file) => /[\\/]run-[^\\/]+\.mjs$/u.test(file));
const scannedFiles = [...sourceFiles, ...runtimeScriptFiles];
const bannedFragments = [
  "/api/numbering/draft-workspaces",
  "/api/pdm/entity-details",
  "/numbering/workspaces",
  "@/components/drawing-workbench",
  "@/components/part-workbench",
  "@/components/relation-workbench",
  "@/components/number-state-workspace",
  "@/components/numbering-workspace-editor",
  "@/lib/drawing-workbench",
  "@/lib/part-workbench",
  "@/lib/relation-workbench",
  "@/lib/pdm-workbench-lane",
  "from \"@/lib/pdm-entity-detail\"",
  "PdmEntityDetailService",
  "UnifiedPdmEntityDetailDrawer",
  "canonicalToLegacyFallback",
  "WORKBENCH_LEGACY_FALLBACK"
];

function runtimeViolations(files = scannedFiles) {
  const violations = [];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8").replaceAll("\\/", "/");
    for (const fragment of bannedFragments) {
      if (source.includes(fragment)) violations.push({ file: normalize(path.relative(root, file)), fragment });
    }
  }
  return violations;
}

const violations = runtimeViolations();
check("runtime-navigation-api-worker-caller=0", violations.length === 0, JSON.stringify(violations));

const retiredFiles = [
  "src/app/numbering/workspaces/[workspaceId]/page.tsx",
  "src/components/drawing-workbench.tsx",
  "src/components/part-workbench.tsx",
  "src/components/relation-workbench.tsx",
  "src/components/number-state-workspace.tsx",
  "src/components/numbering-workspace-editor.tsx",
  "src/lib/drawing-workbench.ts",
  "src/lib/part-workbench.ts",
  "src/lib/relation-workbench.ts",
  "src/lib/pdm-workbench-lane.ts",
  "src/lib/repositories/drawing-workbench-async-repository.ts",
  "src/lib/repositories/part-workbench-async-repository.ts",
  "src/lib/repositories/relation-workbench-async-repository.ts",
  "src/app/api/pdm/drawing-revision-works/[workId]/files/[fileId]/route.ts",
  "src/app/api/numbering/drawing-revision-packages/[packageId]/files/[fileId]/route.ts",
  "src/app/api/approvals/requests/[requestId]/evidence/[fileId]/route.ts",
  "src/app/api/pdm/entity-details/[entityKey]/route.ts",
  "src/components/unified-pdm-entity-detail-drawer.tsx",
  "src/lib/pdm-entity-detail.ts",
  "src/lib/repositories/pdm-entity-detail-async-repository.ts",
  "src/components/part-workspace-editor.tsx",
  "src/components/relation-workspace-editor.tsx"
];
check("retired-runtime-files-absent", retiredFiles.every((file) => !exists(file)), JSON.stringify(retiredFiles.filter(exists)));

const draftRouteRoot = path.join(root, "src", "app", "api", "numbering", "draft-workspaces");
const remainingDraftRoutes = visit(draftRouteRoot, (file) => path.basename(file) === "route.ts");
check("retired-draft-routes-absent", remainingDraftRoutes.length === 0, JSON.stringify(remainingDraftRoutes.map((file) => normalize(path.relative(root, file)))));

const entrypoints = [
  "src/app/numbering/drawings/page.tsx",
  "src/components/part-detail-content.tsx"
];
for (const entrypoint of entrypoints) check(`${entrypoint}:canonical-entry`, read(entrypoint).includes("CanonicalPdmWorkbench"));
const relationSearchSource = read("src/app/numbering/search/page.tsx");
check("src/app/numbering/search/page.tsx:direct-identity-search-entry", relationSearchSource.includes("/api/numbering/search") && !relationSearchSource.includes("CanonicalPdmWorkbench"));

const contractSource = read("src/lib/pdm-canonical-workbench-contract.ts");
const canonicalServiceSource = read("src/lib/pdm-canonical-workbench.ts");
const clientSource = read("src/components/canonical-pdm-workbench.tsx");
const drawingWorkspaceSource = read("src/components/canonical-drawing-change-workspace.tsx");
const drawingWorkPayloadSource = read("src/lib/drawing-revision-work-payload.ts");
const drawingWorkRepositorySource = read("src/lib/repositories/drawing-revision-work-async-repository.ts");
const fileContractSource = read("src/lib/pdm-file-read-contract.ts");
const requiredContexts = ["candidate_revision", "drawing_revision", "drawing_revision_work", "drawing_revision_package", "drawing_attachment", "part_attachment", "approval_evidence"];
check("typed-detail-discriminated-union", contractSource.includes('kind: "drawing"') && contractSource.includes('kind: "part"') && contractSource.includes("CanonicalRelationMatrixProjection") && contractSource.includes('HistoricalWorkbenchEntityType'));
check("typed-detail-no-unknown-array", !contractSource.includes("history: unknown[]") && !contractSource.includes("relations: unknown[]"));
check("client-no-dynamic-scalar-renderer", !clientSource.includes("ScalarFields") && !clientSource.includes("CompactRecords") && !clientSource.includes("TECHNICAL_KEYS"));
check("single-file-read-context-matrix", requiredContexts.every((context) => fileContractSource.includes(`\"${context}\"`)));
check("canonical-detail-has-no-legacy-schema-read", !canonicalServiceSource.includes("numbering_draft_") && !canonicalServiceSource.includes("PdmEntityDetailService"));
check("canonical-preview-uses-revision-assets", canonicalServiceSource.includes("drawing_revision_files") && canonicalServiceSource.includes("file_derivatives") && canonicalServiceSource.includes("preview_jobs"));
check("drawing-work-retired-fields-absent-from-ui", !drawingWorkspaceSource.includes("payload.title") && !drawingWorkspaceSource.includes("payload.description") && !drawingWorkspaceSource.includes(">標題<") && !drawingWorkspaceSource.includes(">說明<"));
check("drawing-work-retired-fields-sanitized", drawingWorkPayloadSource.includes('["title", "description"]'));
check("drawing-work-retired-fields-absent-from-new-payload", !drawingWorkRepositorySource.includes('title: "", description: ""'));

const mutationRoutes = [
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts"
];
for (const route of mutationRoutes) {
  const source = read(route);
  check(`${route}:mutations-retained`, source.includes("export async function POST") && source.includes("export async function DELETE"));
  check(`${route}:binary-get-retired`, !source.includes("export async function GET"));
}

function gateText(source) {
  return bannedFragments.every((fragment) => !source.includes(fragment));
}
const baseline = scannedFiles.map((file) => fs.readFileSync(file, "utf8")).join("\n");
check("negative-control-baseline", gateText(baseline));
check("negative-control-old-api-rejected", !gateText(`${baseline}\nfetch('/api/numbering/draft-workspaces/x')`));
check("negative-control-old-import-rejected", !gateText(`${baseline}\nimport '@/lib/drawing-workbench'`));
check("negative-control-old-entity-detail-rejected", !gateText(`${baseline}\nfetch('/api/pdm/entity-details/drawing:x')`));
check("negative-control-old-schema-read-rejected", `${canonicalServiceSource}\nSELECT * FROM numbering_draft_workspaces`.includes("numbering_draft_"));

const hashFile = (relativePath) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, relativePath))).digest("hex");
const scanHash = crypto.createHash("sha256").update(scannedFiles.map((file) => `${normalize(path.relative(root, file))}:${crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`).join("\n")).digest("hex");
const schemaFiles = ["db/schema.sql", "db/postgres/042_status_data_rebuild.sql"].filter(exists);
const schemaHash = crypto.createHash("sha256").update(schemaFiles.map((file) => `${file}:${hashFile(file)}`).join("\n")).digest("hex");
const inventoryPath = ".ai-doc/qa/dev-087-old-authority-inventory.json";
const runId = `DEV087-retirement-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-087-retirement", runId);
const manifestPath = path.join(evidenceDir, "manifest.json");
const failed = checks.filter((item) => !item.pass);
const manifest = {
  devId: "DEV-087",
  runId,
  generatedAt: new Date().toISOString(),
  scope: "local-canonical-workbench",
  provider: "sqlite-local",
  transitionMode: "canonical_only",
  productionConnected: false,
  productionMigrationExecuted: false,
  commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  inventoryPath,
  inventoryHash: hashFile(inventoryPath),
  schemaFiles,
  schemaHash,
  scannedFiles: scannedFiles.length,
  scanHash,
  callerCount: violations.length,
  remainingDraftRoutes: remainingDraftRoutes.length,
  removedRuntimeFiles: retiredFiles,
  preservedOutOfScope: ["public-share-download", "bom-and-package-export", "recognition-worker-internal-source-read"],
  localCleanupEvidence: "output/qa/dev-087-local-cleanup/main-apply/manifest.json",
  checks,
  status: failed.length ? "FAIL" : "PASS",
  passed: checks.length - failed.length,
  failed: failed.length
};
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
console.log(JSON.stringify({ status: manifest.status, passed: manifest.passed, failed: manifest.failed, manifestPath }, null, 2));
if (failed.length) process.exitCode = 1;
