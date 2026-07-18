#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function record(name, passed, detail = {}) {
  checks.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}: ${JSON.stringify(detail)}`);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const engine = await import("@/lib/revision-policy-engine");

for (const revision of ["0.2", "1.1"]) {
  const decision = engine.evaluateRevisionPolicyTransition({
    targetRevision: revision,
    targetLifecycleStatus: "Released",
    workflowIntent: "rd_workspace",
    basisHash: "basis-qc"
  });
  record(`GATE-001 ${revision} is blocked from Released`, !decision.allowed && decision.reasonCode === "minor_revision_cannot_be_released", decision);
}

const majorDecision = engine.evaluateRevisionPolicyTransition({
  targetRevision: "2",
  targetLifecycleStatus: "Released",
  workflowIntent: "release_area",
  basisHash: "basis-qc"
});
record("GATE-002 major revision can continue to existing release workflow", majorDecision.allowed && majorDecision.revisionKind === "major", majorDecision);

const conditionalUseDecision = engine.evaluateRevisionPolicyTransition({
  targetRevision: "0.2",
  targetLifecycleStatus: "Released",
  workflowIntent: "conditional_use",
  basisHash: "basis-qc"
});
record(
  "GATE-003 emergency-use intent is rejected in Phase 1",
  !conditionalUseDecision.allowed && conditionalUseDecision.reasonCode === "conditional_use_not_supported_in_phase_1",
  conditionalUseDecision
);

record(
  "GATE-004 minor release message exposes only Phase 1 recovery paths",
  engine.minorRevisionReleaseBlockMessage.includes("整數正式版") &&
    engine.minorRevisionReleaseBlockMessage.includes("退回修改版次") &&
    !engine.minorRevisionReleaseBlockMessage.includes("條件使用") &&
    !engine.minorRevisionReleaseBlockMessage.includes("試用"),
  engine.minorRevisionReleaseBlockMessage
);

const approvalRoute = read("src/app/api/submissions/[id]/approve/route.ts");
record(
  "GATE-005 final approval checks release policy before approval insert",
  approvalRoute.indexOf("assertSubmissionReleasePolicyAsync") > -1 &&
    approvalRoute.indexOf("assertSubmissionReleasePolicyAsync") < approvalRoute.indexOf("await addApprovalAsync"),
  {}
);

const retryRoute = read("src/app/api/submissions/[id]/retry-release/route.ts");
record(
  "GATE-006 retry-release checks release policy before retry audit and workflow",
  retryRoute.indexOf("assertSubmissionReleasePolicyAsync") > -1 &&
    retryRoute.indexOf("assertSubmissionReleasePolicyAsync") < retryRoute.indexOf("release_incomplete.retry_requested") &&
    retryRoute.indexOf("assertSubmissionReleasePolicyAsync") < retryRoute.indexOf("executeSubmissionReleaseWorkflowAsync"),
  {}
);

const releaseWorkflow = read("src/lib/submission-release-workflow.ts");
record(
  "GATE-007 direct release workflow checks policy before Releasing side effect",
  releaseWorkflow.indexOf("assertSubmissionReleasePolicyAsync") > -1 &&
    releaseWorkflow.indexOf("assertSubmissionReleasePolicyAsync") < releaseWorkflow.indexOf("markSubmissionReleasingAsync"),
  {}
);

const releaseGate = read("src/lib/revision-policy-release-gate.ts");
record(
  "GATE-008 blocked release writes required audit event",
    releaseGate.includes("revision_policy.release_blocked") &&
    releaseGate.includes("companyId") &&
    releaseGate.includes("policyVersion") &&
    releaseGate.includes("reasonCode") &&
    releaseGate.includes("basisHash"),
  {}
);

record(
  "GATE-009 blocked workflow returns 409-capable status without ReleaseFailed mutation",
  releaseWorkflow.includes('status: "Blocked"') && approvalRoute.includes('releaseResult.status === "Blocked"') && retryRoute.includes('releaseResult.status === "Blocked"'),
  {}
);

const packageJson = JSON.parse(read("package.json"));
record(
  "GATE-010 package script is registered",
  packageJson.scripts["qc:pdm-revision-policy-release-gate"]?.includes("qc-pdm-revision-policy-release-gate.mjs"),
  packageJson.scripts["qc:pdm-revision-policy-release-gate"]
);

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), total: checks.length, checks }, null, 2));
