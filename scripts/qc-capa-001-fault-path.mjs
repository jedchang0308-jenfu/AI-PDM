import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { AsyncApprovalPlatformRepository } from "../src/lib/repositories/approval-platform-async-repository.ts";
import { projectApprovalDecisionFeedback } from "../src/lib/approval-outcome-feedback.ts";

const root = process.cwd();
const configuredDataDir = path.resolve(process.env.PDM_DATA_DIR ?? "");
const taskOwnedDataPrefix = `${path.resolve(root, ".tmp")}${path.sep}`;
if (process.env.PDM_QC_ISOLATED_TARGET !== "1" || !configuredDataDir.startsWith(taskOwnedDataPrefix) || !configuredDataDir.includes("capa-001-runtime-")) {
  throw new Error("CAPA-001 fault path requires PDM_QC_ISOLATED_TARGET=1 and a task-owned capa-001 runtime data directory");
}
const actor = { id: "user-manager-demo", role: "R&D Manager" };
const target = {
  role: "primary",
  type: "capa_fixture",
  targetId: "capa-001-fault-fixture",
  code: "CAPA-001-FAULT",
  label: "CAPA-001 apply-failed fixture",
  snapshot: { source: "isolated-qc-only" }
};

const repo = new AsyncApprovalPlatformRepository(getAsyncDatabaseClient());
const request = await repo.createRequest({
  companyId: "company-jenfu",
  actionCode: "platform.test.fake",
  title: "CAPA-001 apply failure fixture",
  reason: "Independent QC controlled apply-failed path",
  requestedBy: actor.id,
  payload: { capaId: "CAPA-001", qcOnly: true },
  impactSnapshot: { capaId: "CAPA-001", qcOnly: true },
  targets: [target]
});

const decided = await repo.decideNativeRequest({
  requestId: request.id,
  decision: "approved",
  comment: "QC controlled failure",
  approverRole: actor.role,
  approverId: actor.id
});
const failed = await repo.markApplyResult({
  requestId: request.id,
  actorId: actor.id,
  success: false,
  error: "APPROVAL_APPLY_POSTCONDITION_FAILED"
});

assert.equal(decided.status, "approved");
assert.equal(failed.status, "apply_failed");
assert.equal(failed.applyStatus, "failed");
assert.equal(failed.applyAttempts, 1);
const outcome = projectApprovalDecisionFeedback(failed);
assert.equal(outcome.kind, "apply_failed");
assert.equal(outcome.isSuccess, false);
assert.equal(outcome.canRetryApply, true);

const evidenceRoot = path.join(root, "output", "qa", "capa-001-approval-outcome", "fault-path-20260902");
fs.mkdirSync(evidenceRoot, { recursive: true });
const report = {
  capaId: "CAPA-001",
  dev: "DEV-114",
  runner: "qc-capa-001-fault-path.mjs",
  generatedAt: new Date().toISOString(),
  requestId: request.id,
  mutationLedger: [{ target: "task-owned isolated SQLite clone", operation: "create approval fixture and persist apply_failed", productionWrites: false }],
  checks: { passed: 7, failed: 0, total: 7 },
  outcome,
  databaseMutation: true,
  productionWrites: false,
  disposition: "isolated_fault_path_pass_clone_cleanup_required"
};
fs.writeFileSync(path.join(evidenceRoot, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, evidence: path.relative(root, path.join(evidenceRoot, "report.json")) }, null, 2));
