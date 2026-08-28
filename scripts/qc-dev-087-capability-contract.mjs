#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  artifactReference,
  manifestBase,
  readJson,
  runnerCoverage,
  writeCapabilityManifest
} from "./dev-087-evidence-lib.mjs";

const root = process.cwd();
const runner = "qc-dev-087-capability-contract";
const runId = `DEV087-product-contract-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const parentRunId = process.env.DEV087_AGGREGATE_RUN_ID ?? null;
const outputRoot = path.join("output", "qa", "dev-087-capability");
const outputDir = path.join(root, outputRoot, runId);
const registry = readJson(path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json"));
const coverage = runnerCoverage(registry, runner);
const assertions = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function assertCase(caseId, assertionId, condition, evidence) {
  assertions.push({ caseId, assertionId, result: condition ? "PASS" : "FAIL", evidence });
}

fs.mkdirSync(outputDir, { recursive: true });
const baseContract = spawnSync(process.execPath, [
  "--experimental-transform-types",
  "--experimental-loader",
  "./scripts/qc-ts-path-loader.mjs",
  "scripts/qc-dev-087-contract.mjs"
], { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const rawOutputPath = path.join(outputDir, "base-contract-output.txt");
fs.writeFileSync(rawOutputPath, `${baseContract.stdout ?? ""}${baseContract.stderr ?? ""}`, "utf8");

const workbench = read("src/components/canonical-pdm-workbench.tsx");
const taskRoute = read("src/app/api/numbering/tasks/route.ts");
const sidebar = read("src/components/sidebar-nav.tsx");
const dashboard = read("src/components/dashboard.tsx");
const permissionMap = read("src/lib/numbering-permission-codes.ts");
const productionSlice = read("src/lib/production-slice.ts");
const taskContract = read("src/lib/numbering-task-center-contract.ts");
const formalObsoleteImpactRoute = read("src/app/api/lifecycle/obsolete-impact/route.ts");
const variantRoute = read("src/app/api/parts/[partNumber]/variant/route.ts");
const historyService = read("src/lib/pdm-canonical-drawing-history.ts");
const workbenchService = read("src/lib/pdm-canonical-workbench.ts");
const matrix = read("src/components/relation-matrix-table.tsx");
const relationAuthority = read("src/lib/repositories/relation-formal-authority-async-repository.ts");
const controller = read("src/components/use-pdm-workbench-controller.ts");
const aggregate = read("scripts/qc-dev-087-aggregate.mjs");
const retiredRevisionRouteSources = [
  "src/components/sidebar-nav.tsx",
  "src/app/upload/page.tsx",
  "src/lib/drawing-revision-lifecycle.ts",
  "src/lib/drawing-submission-workbench.ts",
  "src/lib/numbering-permission-codes.ts",
  "src/lib/numbering-task-center-contract.ts",
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/route.ts"
].map(read);

assertCase("QA-087-187", "CONTRACT_CANONICAL_DRAWING_ADVANCE", workbench.includes("建立進版工作") && workbench.includes("/revision-works"), "src/components/canonical-pdm-workbench.tsx");
assertCase(
  "QA-087-191",
  "CONTRACT_LEGACY_DRAWING_ROUTE_REMOVED",
  !fs.existsSync(path.join(root, "src/app/numbering/revisions/page.tsx")) &&
    retiredRevisionRouteSources.every((source) => !source.includes("/numbering/revisions")) &&
    !sidebar.includes("圖面進版") &&
    read("src/app/api/numbering/drawing-revisions/submissions/route.ts").includes("DRAWING_REVISION_LEGACY_WORKFLOW_RETIRED"),
  "deleted legacy page/sidebar and zero current hrefs; retired mutation route remains 410"
);
assertCase(
  "QA-087-193",
  "CONTRACT_TASK_CENTER_PAGE_REMOVED_BACKEND_RETAINED",
  !fs.existsSync(path.join(root, "src/app/numbering/tasks/page.tsx")) &&
    !fs.existsSync(path.join(root, "src/components/numbering-task-center.tsx")) &&
    !sidebar.includes('href: "/numbering/tasks"') &&
    !dashboard.includes('href="/numbering/tasks"') &&
    !/^\s*"\/numbering\/tasks":/mu.test(permissionMap) &&
    !/^\s*"\/numbering\/tasks",?\s*$/mu.test(productionSlice) &&
    !taskContract.includes('"/numbering/tasks"') &&
    taskRoute.includes('requireNumberingPageAsync(request, "numbering.tasks")'),
  "standalone page/component/navigation removed; permission-protected task API retained"
);
assertCase(
  "QA-087-202",
  "CONTRACT_DIRECT_INVALIDATION_RETIRED",
  !fs.existsSync(path.join(root, "src/app/numbering/impact/page.tsx")) &&
    !fs.existsSync(path.join(root, "src/app/api/numbering/impact-analysis/route.ts")) &&
    formalObsoleteImpactRoute.includes("getFormalObsoleteImpactAsync"),
  "retired standalone page/API + formal obsolete impact route"
);
assertCase("QA-087-206", "CONTRACT_DIRECT_VARIANT_WRITE_RETIRED", variantRoute.includes("PART_VARIANT_DIRECT_WRITE_RETIRED") && variantRoute.includes("status: 410"), "src/app/api/parts/[partNumber]/variant/route.ts");
assertCase("QA-087-207", "CONTRACT_EXACT_HISTORY_REVISION", workbench.includes("onHistoryRevisionChange(history.id)") && workbench.includes("replaceLocation({ historyRevision: revisionId, historyMode: \"push\" })") && historyService.includes("contextId: revision.id") && historyService.includes("bindingId: String(file.id)"), "history row -> URL-preserved exact revision/file binding");
assertCase("QA-087-209", "CONTRACT_EXACT_WORK_FILE_READ", workbenchService.includes("pdmFileReadHref") && workbenchService.includes("bindingId: String(row.id)"), "canonical workbench exact file-read projection");
assertCase("QA-087-212", "CONTRACT_MATRIX_IDENTITY_NAVIGATION", matrix.includes("onOpenDrawing") && matrix.includes("onOpenPart") && matrix.includes("detailHref") && workbench.includes("onOpenDrawing=") && workbench.includes("onOpenPart=") && workbench.includes("openMatrixIdentity") && workbench.includes("關聯矩陣尚未儲存") && relationAuthority.includes("navigation_row_id") && relationAuthority.includes("drawing_production"), "exact matrix identity href plus callbacks and dirty navigation guard");
assertCase("QA-087-214", "CONTRACT_BIDIRECTIONAL_CURSOR", workbench.includes("previousCursor") && workbench.includes('direction: "before"') && controller.includes('paginationMode === "server-bidirectional"'), "canonical server bidirectional cursor plus shared controller");
assertCase("QA-087-218", "CONTRACT_AGGREGATE_REGISTRY_FAIL_CLOSED", aggregate.includes("dev-087-current-case-registry.json") && aggregate.includes("completionCandidate"), "aggregate registry consumption and completion candidate gate");

const assertionPath = path.join(outputDir, "contract-assertions.json");
fs.writeFileSync(assertionPath, `${JSON.stringify({ runner, baseContractExitCode: baseContract.status, assertions }, null, 2)}\n`, "utf8");
const manifest = manifestBase({ root, runId, gateStage: "product", runner, provider: "source_contract", dataScope: "read_only_source_and_in_memory_contract_fixture", parentRunId });
const caseIds = coverage.caseIds;
const artifacts = [
  artifactReference(root, rawOutputPath, "qc-dev-087-contract", caseIds, baseContract.status === 0 ? "PASS" : "FAIL"),
  artifactReference(root, assertionPath, runner, caseIds, assertions.every((item) => item.result === "PASS") ? "PASS" : "FAIL")
];
manifest.childManifests = artifacts;
manifest.caseResults = caseIds.map((caseId) => {
  const rows = assertions.filter((item) => item.caseId === caseId);
  const pass = baseContract.status === 0 && rows.length > 0 && rows.every((item) => item.result === "PASS");
  return { caseId, result: pass ? "PASS" : "FAIL", assertionIds: rows.map((item) => item.assertionId), firstFailurePointer: pass ? null : "contract-assertions.json" };
});
manifest.caseEvidence = Object.fromEntries(caseIds.map((caseId) => [caseId, {
  evidenceTypes: [...coverage.requiredEvidence],
  artifactPaths: artifacts.map((item) => item.path)
}]));
manifest.assertions = assertions;
manifest.primaryInvariant = { status: "not_applicable", delta: 0 };
manifest.cleanupReceipt = { status: "complete", taskOwnedRuntime: false, portsReleased: true };
if (manifest.caseResults.some((item) => item.result !== "PASS")) {
  manifest.result = "FAIL";
  manifest.errorCode = baseContract.status === 0 ? "CASE_SPECIFIC_CONTRACT_INCOMPLETE" : "BASE_CONTRACT_FAILED";
  const failed = manifest.caseResults.find((item) => item.result !== "PASS");
  manifest.firstFailure = { code: manifest.errorCode, caseId: failed.caseId, pointer: failed.firstFailurePointer };
}
const manifestPath = writeCapabilityManifest(root, outputRoot, manifest);
console.log(JSON.stringify({ result: manifest.result, failedCases: manifest.caseResults.filter((item) => item.result !== "PASS").map((item) => item.caseId), manifest: manifestPath }, null, 2));
if (manifest.result !== "PASS") process.exitCode = 1;
