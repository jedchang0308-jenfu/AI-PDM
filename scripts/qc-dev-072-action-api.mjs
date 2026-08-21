#!/usr/bin/env node

import assert from "node:assert/strict";
import { EMPTY_PDM_DETAIL_ACTION_CAPABILITIES } from "@/lib/pdm-detail-action-capabilities";
import { resolvePdmDetailActions } from "@/lib/pdm-detail-action-resolver";

const allowedCapabilities = Object.fromEntries(Object.entries(EMPTY_PDM_DETAIL_ACTION_CAPABILITIES).map(([key, value]) => [key, { ...value, allowed: true }]));

function facts(overrides = {}) {
  return {
    entityKey: "candidate:dev072-workspace",
    surface: "drawing",
    stateFamily: "drawing_preparation",
    actorId: "dev072-owner",
    ownerId: "dev072-owner",
    ownerHref: "/numbering/drawings/dev072-drawing/workspace?intent=edit_revision&returnTo=%2Fnumbering%2Fdrawings%3Fview%3Dwork",
    returnTo: "/numbering/drawings?view=work",
    capabilities: allowedCapabilities,
    readinessBlockers: ["2D 圖面", "3D 模型"],
    candidate: {
      workspaceId: "dev072-workspace",
      rowVersion: 4,
      lifecycleV2: true,
      requestId: null,
      submittedBy: null,
      decisionCount: 0,
      canUpdate: true,
      canSubmitReview: true,
      canWithdrawReview: false,
      applyFailed: false
    },
    formalDrawing: null,
    review: null,
    ...overrides
  };
}

function allActions(model) {
  return [model.primary, ...model.secondary].filter(Boolean);
}

function byKind(model, kind) {
  return allActions(model).find((action) => action.kind === kind);
}

function assertDescriptorContract(model) {
  assert.ok([0, 1].includes(model.primary ? 1 : 0));
  const actions = allActions(model);
  assert.equal(new Set(actions.map((action) => action.id)).size, actions.length);
  const groupRank = { object: 0, workflow: 1, review: 2, utility: 3 };
  const sortedSecondary = [...model.secondary].sort((left, right) => groupRank[left.group] - groupRank[right.group] || left.order - right.order);
  assert.deepEqual(model.secondary.map((action) => action.id), sortedSecondary.map((action) => action.id));
  for (const action of actions) {
    assert.equal(action.enabled, action.execution !== null);
    if (action.enabled) {
      assert.equal(action.disabledReason, null);
      assert.equal(action.disabledReasonCode, null);
    } else {
      assert.ok(action.disabledReason);
      assert.ok(action.disabledReasonCode);
      assert.equal(action.execution, null);
      assert.equal(action.tone, "secondary");
      assert.equal(action.placement, "secondary");
    }
  }
}

const building = resolvePdmDetailActions(facts());
assertDescriptorContract(building);
assert.equal(byKind(building, "edit")?.enabled, true);
assert.equal(byKind(building, "edit")?.label, "圖面維護");
assert.equal(byKind(building, "manage_files"), undefined);
const formalFileDenied = resolvePdmDetailActions(facts({
  entityKey: "drawing:dev072-formal",
  stateFamily: "building",
  candidate: null,
  formalDrawing: { drawingNumber: "DEV072-M01", requestId: null, submittedBy: null, decisionCount: 0 },
  capabilities: { ...allowedCapabilities, manageFiles: EMPTY_PDM_DETAIL_ACTION_CAPABILITIES.manageFiles }
}));
assert.equal(byKind(formalFileDenied, "edit")?.label, "圖面維護");
assert.equal(byKind(formalFileDenied, "edit")?.disabledReasonCode, "PDM_ACTION_PERMISSION_REQUIRED");
assert.equal(byKind(formalFileDenied, "manage_files"), undefined);
assert.equal(byKind(building, "submit_review")?.enabled, false);
assert.equal(byKind(building, "submit_review")?.disabledReasonCode, "PDM_ACTION_PREREQUISITE_MISSING");
assert.equal(byKind(building, "view_review"), undefined);
assert.equal(byKind(building, "withdraw_review"), undefined);

const ready = resolvePdmDetailActions(facts({ stateFamily: "bundle_ready", readinessBlockers: [] }));
assertDescriptorContract(ready);
assert.equal(ready.primary?.kind, "submit_review");
assert.equal(byKind(ready, "submit_review")?.enabled, true);
assert.equal(byKind(ready, "submit_review")?.id, byKind(building, "submit_review")?.id);
assert.equal(byKind(ready, "submit_review")?.order, byKind(building, "submit_review")?.order);

const part = resolvePdmDetailActions(facts({ entityKey: "part:dev072-part", surface: "part", stateFamily: "rd_controlled", candidate: null, ownerId: null, readinessBlockers: [] }));
assertDescriptorContract(part);
assert.equal(byKind(part, "edit")?.enabled, true);
for (const kind of ["manage_files", "create_revision", "manage_relation"]) assert.equal(byKind(part, kind), undefined);

const relation = resolvePdmDetailActions(facts({ surface: "relation" }));
assertDescriptorContract(relation);
assert.equal(byKind(relation, "manage_relation")?.enabled, true);
assert.equal(byKind(relation, "manage_files"), undefined);
assert.equal(byKind(relation, "edit"), undefined);

const terminal = resolvePdmDetailActions(facts({ stateFamily: "history_only", candidate: null, ownerId: null, readinessBlockers: [] }));
assertDescriptorContract(terminal);
assert.deepEqual(allActions(terminal).map((action) => action.kind), ["view_history", "return"]);

const inReviewCandidate = {
  ...facts().candidate,
  requestId: "dev072-review",
  submittedBy: "dev072-owner",
  canWithdrawReview: true
};
const review = resolvePdmDetailActions(facts({ stateFamily: "in_review", readinessBlockers: [], candidate: inReviewCandidate, review: { requestId: "dev072-review", decisionReady: true, allowedDecisions: ["approved", "needs_info"], drift: false } }));
assertDescriptorContract(review);
assert.equal(review.primary?.kind, "view_review");
assert.equal(byKind(review, "edit")?.disabledReasonCode, "PDM_ACTION_REVIEW_LOCKED");
assert.equal(byKind(review, "manage_files"), undefined);
assert.equal(byKind(review, "view_review")?.enabled, true);
assert.equal(byKind(review, "withdraw_review"), undefined);
assert.equal(byKind(review, "manage_relation"), undefined);
assert.equal(byKind(review, "approve"), undefined);
assert.equal(byKind(review, "return_for_correction"), undefined);
assert.equal(byKind(review, "reject"), undefined);

const drift = resolvePdmDetailActions(facts({ stateFamily: "in_review", readinessBlockers: [], candidate: inReviewCandidate, review: { requestId: "dev072-review", decisionReady: false, allowedDecisions: ["approved", "rejected"], drift: true } }));
assertDescriptorContract(drift);
assert.equal(byKind(drift, "view_review")?.enabled, true);
assert.equal(byKind(drift, "approve"), undefined);
assert.equal(byKind(drift, "reject"), undefined);
assert.equal(drift.primary?.kind, "view_review");

const denied = resolvePdmDetailActions(facts({ capabilities: EMPTY_PDM_DETAIL_ACTION_CAPABILITIES }));
assertDescriptorContract(denied);
assert.equal(byKind(denied, "edit")?.disabledReasonCode, "PDM_ACTION_PERMISSION_REQUIRED");
assert.equal(byKind(denied, "manage_files"), undefined);
assert.equal(byKind(denied, "submit_review")?.disabledReasonCode, "PDM_ACTION_PERMISSION_REQUIRED");
assert.equal(byKind(denied, "submit_review")?.execution, null);

const notOwner = resolvePdmDetailActions(facts({ actorId: "dev072-viewer" }));
assertDescriptorContract(notOwner);
assert.equal(byKind(notOwner, "edit")?.disabledReasonCode, "PDM_ACTION_OWNER_REQUIRED");
assert.equal(byKind(notOwner, "submit_review")?.disabledReasonCode, "PDM_ACTION_OWNER_REQUIRED");

const recoveryCandidate = {
  ...facts().candidate,
  requestId: "dev072-apply-failed",
  submittedBy: "dev072-owner",
  applyFailed: true
};
const recoveryAdmin = resolvePdmDetailActions(facts({
  stateFamily: "recovery_required",
  actorId: "dev072-admin",
  candidate: recoveryCandidate,
  readinessBlockers: []
}));
assertDescriptorContract(recoveryAdmin);
assert.equal(recoveryAdmin.primary?.kind, "retry_apply");
assert.equal(byKind(recoveryAdmin, "retry_apply")?.enabled, true);
assert.equal(byKind(recoveryAdmin, "retry_apply")?.execution?.type, "navigate");
const recoveryDenied = resolvePdmDetailActions(facts({
  stateFamily: "recovery_required",
  actorId: "dev072-admin",
  candidate: recoveryCandidate,
  capabilities: { ...allowedCapabilities, retryPublication: EMPTY_PDM_DETAIL_ACTION_CAPABILITIES.retryPublication },
  readinessBlockers: []
}));
assert.equal(byKind(recoveryDenied, "retry_apply")?.disabledReasonCode, "PDM_ACTION_PERMISSION_REQUIRED");

console.log("QC DEV-072 action API/resolver: PASS (ACT-001..010, ACT-013, ACT-015, recovery retry fixture matrix)");
