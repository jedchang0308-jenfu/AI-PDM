import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectApprovalDecisionFeedback } from "../src/lib/approval-outcome-feedback.ts";
import { projectCanonicalWorkbenchRow, resolveCanonicalWorkbenchActions } from "../src/lib/pdm-canonical-workbench-state.ts";

const root = process.cwd();
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(name, condition, details = undefined) {
  assert.equal(Boolean(condition), true, details ? `${name}: ${JSON.stringify(details)}` : name);
  checks.push({ name, pass: true });
}

const outcomeCases = [
  ["pending", "pending", "pending", false, false],
  ["needs_info", "not_required", "needs_info", false, false],
  ["rejected", "not_required", "rejected", false, false],
  ["approved", "not_required", "decision_saved", true, false],
  ["approved", "pending", "applying", false, false],
  ["approved", "not_ready", "applying", false, false],
  ["apply_failed", "failed", "apply_failed", false, true],
  ["approved", "failed", "apply_failed", false, true],
  ["applied", "applied", "applied", true, false],
  ["applied", "not_required", "unknown", false, false],
  ["approved", "applied", "unknown", false, false]
];

for (const [status, applyStatus, kind, isSuccess, canRetry] of outcomeCases) {
  const result = projectApprovalDecisionFeedback({ status, applyStatus, decision: status === "approved" ? "approved" : status });
  check(`feedback ${status}/${applyStatus} projects ${kind}`, result.kind === kind && result.isSuccess === isSuccess && result.canRetryApply === canRetry, result);
}

const approvalPage = read("src/app/approvals/page.tsx");
const approvalWorkspace = read("src/components/approval-request-workspace.tsx");
const decisionRoute = read("src/app/api/approvals/requests/[requestId]/decisions/route.ts");
const applyRoute = read("src/app/api/approvals/requests/[requestId]/apply/route.ts");
const approvalService = read("src/lib/approval-platform.ts");

check("approval inbox uses the shared outcome projector", approvalPage.includes("projectApprovalDecisionFeedback"));
check("generic approval workspace uses the shared outcome projector", approvalWorkspace.includes("projectApprovalDecisionFeedback"));
check("decision API returns the shared outcome projection", decisionRoute.includes("outcome: projectApprovalDecisionFeedback(result)"));
check("apply API returns the shared outcome projection", applyRoute.includes("outcome: projectApprovalDecisionFeedback(result)"));
check("native apply success is guarded by a postcondition", approvalService.includes("handler.verifyApply?.(decided, applyDetail)") && approvalService.includes("APPROVAL_APPLY_POSTCONDITION_FAILED"));
check("generic approval inbox keeps retry for apply_failed", approvalPage.includes('detail.status === "apply_failed" ?'));
check("old false-success approval notice is gone", !approvalPage.includes("審核決策已重新套用。編號仍需由具發布權限者完成發布。") && !approvalWorkspace.includes("已送出正式化重試。"));

const baseRecord = {
  id: "row-part-draft",
  aggregateId: "aggregate-part",
  companyId: "company-jenfu",
  entityType: "part",
  canonicalEntityId: "part-a0001-p01",
  code: "A0001-P01",
  name: "CAPA fixture",
  dataLayer: "part_formal",
  recordStatus: "Draft",
  branchId: null,
  revisionId: null,
  revision: null,
  dataState: "available",
  workId: null,
  workOwnerId: null,
  reviewRequestId: null,
  reviewerUserId: null,
  handling: "none",
  blockerReason: null,
  rowVersion: 1,
  openBranchCount: 0,
  branchStatus: null,
  baseProductionRevisionId: null,
  currentProductionRevisionId: null,
  currentProductionRowId: null,
  basisState: null,
  updatedAt: "2026-09-02T00:00:00.000Z"
};
const actor = {
  id: "reviewer",
  companyId: "company-jenfu",
  canEditNonOwned: false,
  permissions: {
    createWork: true,
    updateWork: false,
    submitWork: false,
    cancelWork: false,
    decideReview: true,
    obsoleteDrawing: false,
    obsoleteFormalPart: true,
    obsoleteFormalDrawing: false
  }
};
const draftRow = projectCanonicalWorkbenchRow(baseRecord, actor);
check("part formal Draft is visibly a main record draft", draftRow.layerLabel === "主檔 · 草稿（未發行）");
check("part available is not presented as usage qualification", draftRow.dataStateLabel === "資料可見");
check("part Draft cannot request formal obsolete", !draftRow.actions.some((item) => item.key === "request_obsolete"));

const releasedActions = resolveCanonicalWorkbenchActions({ ...baseRecord, recordStatus: "Released" }, actor);
check("released part retains the formal obsolete action", releasedActions.some((item) => item.key === "request_obsolete"));

const evidenceRoot = path.join(root, "output", "qa", "capa-001-approval-outcome", new Date().toISOString().replace(/[:.]/g, "-"));
fs.mkdirSync(evidenceRoot, { recursive: true });
const report = {
  capaId: "CAPA-001",
  dev: "DEV-114",
  runner: "qc-capa-001-approval-outcome.mjs",
  generatedAt: new Date().toISOString(),
  checks: { passed: checks.length, failed: 0, total: checks.length },
  databaseMutation: false,
  productionWrites: false,
  runtimeStarted: false,
  disposition: "local_contract_pass_production_release_gated",
  checksDetail: checks
};
fs.writeFileSync(path.join(evidenceRoot, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, evidence: path.relative(root, path.join(evidenceRoot, "report.json")) }, null, 2));
