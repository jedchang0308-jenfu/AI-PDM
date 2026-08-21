#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import { projectEffectiveDrawingRevisionLifecycle } from "@/lib/drawing-revision-effective-lifecycle";
import { EMPTY_PDM_DETAIL_ACTION_CAPABILITIES } from "@/lib/pdm-detail-action-capabilities";
import { resolvePdmDetailActions } from "@/lib/pdm-detail-action-resolver";
import {
  pdmDetailActionabilityInvariant,
  projectPdmDetailObjectiveStatus,
  projectPdmDetailViewerStatus
} from "@/lib/pdm-detail-status-actionability";

const allowedCapabilities = Object.fromEntries(
  Object.entries(EMPTY_PDM_DETAIL_ACTION_CAPABILITIES).map(([key, value]) => [key, { ...value, allowed: true }])
);

function facts(overrides = {}) {
  return {
    entityKey: "drawing:dev073-drawing",
    surface: "drawing",
    stateFamily: "in_review",
    actorId: "dev073-engineer",
    ownerId: "dev073-engineer",
    ownerHref: "/numbering/drawings?detail=drawing%3Adev073-drawing",
    returnTo: "/numbering/drawings?view=all",
    capabilities: allowedCapabilities,
    readinessBlockers: [],
    candidate: null,
    formalDrawing: {
      drawingNumber: "A0005-M01",
      requestId: null,
      submittedBy: "dev073-engineer",
      decisionCount: 0
    },
    review: null,
    ...overrides
  };
}

const confirmedMinor = projectEffectiveDrawingRevisionLifecycle({
  revision: "0.5",
  physicalStatus: "Pending",
  lifecycleState: "in_review",
  hasLegacyTerminalConfirmation: true
});
assert.equal(confirmedMinor, "rd_controlled", "terminal FFF evidence must project a minor revision as R&D controlled");
assert.equal(projectEffectiveDrawingRevisionLifecycle({ revision: "0.5", physicalStatus: "Pending", lifecycleState: "in_review" }), "in_review");
assert.equal(projectEffectiveDrawingRevisionLifecycle({ revision: "0.1", physicalStatus: "Pending", lifecycleState: null, candidateStatus: "promoted" }), "rd_controlled", "a promoted revision without an active request is controlled evidence");
assert.equal(projectEffectiveDrawingRevisionLifecycle({ revision: "0.5", physicalStatus: "Pending", lifecycleState: "in_review", candidateStatus: "promoted", hasActiveApprovalRequest: true }), "in_review", "published provenance must not hide an active review");
assert.equal(projectEffectiveDrawingRevisionLifecycle({ revision: "1", physicalStatus: "Pending", lifecycleState: "in_review", hasLegacyTerminalConfirmation: true }), "in_review", "integer revision must not inherit the minor-review compatibility projection");

const usableStatus = projectPdmDetailObjectiveStatus({ stateFamily: "rd_controlled", entityKind: "drawing" });
const usableActions = resolvePdmDetailActions(facts({ stateFamily: "rd_controlled" }));
const usableViewer = projectPdmDetailViewerStatus({
  objectiveStatus: usableStatus,
  stateFamily: "rd_controlled",
  actorId: "dev073-engineer",
  ownerId: "dev073-engineer",
  actionBar: usableActions
});
assert.equal(usableViewer.category, "usable");
assert.equal(usableViewer.label, "可使用");
assert.deepEqual(pdmDetailActionabilityInvariant({ viewerStatus: usableViewer, actionBar: usableActions }), []);

const orphanActions = resolvePdmDetailActions(facts());
const orphanReviewAction = [orphanActions.primary, ...orphanActions.secondary].find((action) => action?.kind === "view_review");
assert.equal(orphanReviewAction?.enabled, false);
assert.equal(orphanReviewAction?.disabledReasonCode, "PDM_ACTION_TARGET_UNAVAILABLE");
assert.match(orphanReviewAction?.disabledReason ?? "", /找不到有效的審核工作項/);
const waitingStatus = projectPdmDetailObjectiveStatus({ stateFamily: "in_review", entityKind: "drawing" });
const orphanViewer = projectPdmDetailViewerStatus({
  objectiveStatus: waitingStatus,
  stateFamily: "in_review",
  actorId: "dev073-engineer",
  ownerId: "dev073-engineer",
  reviewRequestId: null,
  actionBar: orphanActions
});
assert.equal(orphanViewer.category, "unknown");
assert.equal(orphanViewer.label, "負責人待確認");

const requestFacts = facts({ formalDrawing: { ...facts().formalDrawing, requestId: "dev073-request" } });
const requestActions = resolvePdmDetailActions(requestFacts);
const reviewerViewer = projectPdmDetailViewerStatus({
  objectiveStatus: waitingStatus,
  stateFamily: "in_review",
  actorId: "dev073-reviewer",
  ownerId: "dev073-engineer",
  reviewerIds: ["dev073-reviewer"],
  reviewRequestId: "dev073-request",
  actionBar: requestActions
});
assert.equal(reviewerViewer.category, "current_user");
assert.deepEqual(pdmDetailActionabilityInvariant({ viewerStatus: reviewerViewer, actionBar: requestActions }), []);
const submitterViewer = projectPdmDetailViewerStatus({
  objectiveStatus: waitingStatus,
  stateFamily: "in_review",
  actorId: "dev073-engineer",
  ownerId: "dev073-engineer",
  reviewerIds: ["dev073-reviewer"],
  reviewRequestId: "dev073-request",
  actionBar: requestActions
});
assert.equal(submitterViewer.category, "other_user", "optional withdraw must not create a mandatory submitter task");

const deniedBuildingFacts = facts({
  entityKey: "candidate:dev073-workspace",
  stateFamily: "drawing_preparation",
  capabilities: EMPTY_PDM_DETAIL_ACTION_CAPABILITIES,
  candidate: {
    workspaceId: "dev073-workspace",
    rowVersion: 1,
    lifecycleV2: true,
    requestId: null,
    submittedBy: null,
    decisionCount: 0,
    canUpdate: true,
    canSubmitReview: false,
    canWithdrawReview: false,
    applyFailed: false
  },
  formalDrawing: null
});
const deniedBuildingActions = resolvePdmDetailActions(deniedBuildingFacts);
const buildingStatus = projectPdmDetailObjectiveStatus({ stateFamily: "drawing_preparation", entityKind: "candidate" });
const deniedBuildingViewer = projectPdmDetailViewerStatus({
  objectiveStatus: buildingStatus,
  stateFamily: "drawing_preparation",
  actorId: "dev073-engineer",
  ownerId: "dev073-engineer",
  actionBar: deniedBuildingActions
});
assert.equal(deniedBuildingViewer.category, "current_user");
assert.equal(deniedBuildingViewer.canAct, false);
assert.deepEqual(pdmDetailActionabilityInvariant({ viewerStatus: deniedBuildingViewer, actionBar: deniedBuildingActions }), []);

const serviceSource = fs.readFileSync("src/lib/pdm-entity-detail.ts", "utf8");
const workbenchSource = fs.readFileSync("src/lib/repositories/drawing-workbench-async-repository.ts", "utf8");
const changeControlSource = fs.readFileSync("src/lib/pdm-change-control-domain.ts", "utf8");
assert.match(serviceSource, /candidate\.lifecycleStatus === "published"/);
assert.match(serviceSource, /candidateState === "recovery_required"/, "bundle apply failure must project the retry action into unified detail");
assert.match(serviceSource, /projectPdmDetailStatusPair/, "unified detail must expose stable responsibility status plus viewer actionability");
assert.match(serviceSource, /package\.revision LIKE '%\.%'/, "minor-revision SQL must stay portable across SQLite and PostgreSQL");
assert.doesNotMatch(serviceSource, /instr\(package\.revision/u, "SQLite-only revision predicates must not enter the shared detail reader");
assert.match(workbenchSource, /projectEffectiveDrawingRevisionLifecycle/);
assert.match(changeControlSource, /synchronizeFormalDrawing/);

console.log("QC DEV-073 status/actionability contract: PASS (CAPA-001..012)");
