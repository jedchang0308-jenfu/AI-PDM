#!/usr/bin/env node

import assert from "node:assert/strict";

const lifecycle = await import("@/lib/number-lifecycle-simplification");
const reconciliation = await import("./dev-076-staging-relation-reconciliation.mjs");

assert.doesNotThrow(() => reconciliation.assertDev076StagingEnvironment({
  PDM_MIGRATION_PACKAGE_TARGET: "staging",
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: reconciliation.DEV076_STAGING_CONNECTION,
  PDM_CLOUD_SQL_DATABASE: "ai_pdm",
  PDM_CLOUD_SQL_HOST: "127.0.0.1"
}));
assert.throws(() => reconciliation.assertDev076StagingEnvironment({
  PDM_MIGRATION_PACKAGE_TARGET: "production",
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-ai-pdm-prod:asia-east1:ai-pdm-prod-postgres"
}), /DEV076_STAGING_TARGET_REQUIRED/u);
assert.match(reconciliation.DEV076_RELATION_RECONCILIATION_SQL, /workspace_rollup/iu);
assert.match(reconciliation.DEV076_RELATION_RECONCILIATION_SQL, /invalid_relation_scope/iu);
assert.match(reconciliation.DEV076_RELATION_RECONCILIATION_SQL, /missing_primary_part_count/iu);
assert.match(reconciliation.DEV076_RELATION_RECONCILIATION_SQL, /relation_pair_hash/iu);

const healthyTarget = (rootCode) => ({
  root_code: rootCode,
  lifecycle_status: "active",
  drawing_count: 1,
  part_count: 1,
  relation_count: 1,
  invalid_scope_count: 0,
  missing_primary_part_count: 0,
  duplicate_primary_part_count: 0
});
const healthyReconciliation = {
  target_workspaces: ["A0002", "A0003", "A0004"].map(healthyTarget),
  active_invalid_scope_count: 0,
  active_missing_primary_part_count: 7,
  active_duplicate_primary_part_count: 2
};
assert.doesNotThrow(
  () => reconciliation.assertDev076ReconciliationResult(healthyReconciliation),
  "unrelated active drafts may remain incomplete without blocking the target rehearsal"
);
assert.throws(
  () => reconciliation.assertDev076ReconciliationResult({ ...healthyReconciliation, active_invalid_scope_count: 1 }),
  /DEV076_ACTIVE_RELATION_SCOPE_INVALID/u,
  "cross-workspace relation corruption remains globally fail-closed"
);

const base = {
  draftMode: "new_bundle",
  sourceDrawingNumberId: null,
  sourcePartNumberId: null,
  sourceLinkType: null,
  parts: [{ id: "part-1", itemKind: "manufactured" }],
  drawings: [{ id: "drawing-1", purposeCode: "M" }],
  relations: [{
    id: "relation-1",
    drawingDraftId: "drawing-1",
    partDraftId: "part-1",
    linkType: "primary_manufacturing",
    isPrimary: true
  }]
};

const ready = lifecycle.evaluateNumberingDraftRelationReadiness(base);
assert.deepEqual(ready, { ready: true, issues: [] }, "one valid primary relation is ready");

const missingSecondPart = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  parts: [...base.parts, { id: "part-2", itemKind: "outsourced" }]
});
assert.equal(missingSecondPart.ready, false);
assert.deepEqual(missingSecondPart.issues, [{ code: "missing_primary_relation", partId: "part-2" }]);

const duplicatePrimary = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  drawings: [...base.drawings, { id: "drawing-2", purposeCode: "MA" }],
  relations: [...base.relations, {
    id: "relation-2",
    drawingDraftId: "drawing-2",
    partDraftId: "part-1",
    linkType: "primary_manufacturing",
    isPrimary: true
  }]
});
assert.equal(duplicatePrimary.ready, false);
assert.ok(duplicatePrimary.issues.some((issue) => issue.code === "duplicate_primary_relation" && issue.partId === "part-1"));

const referencePrimary = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  drawings: [{ id: "drawing-1", purposeCode: "R" }]
});
assert.equal(referencePrimary.ready, false);
assert.ok(referencePrimary.issues.some((issue) => issue.code === "invalid_primary_relation"));
assert.ok(referencePrimary.issues.some((issue) => issue.code === "missing_primary_relation"));

const orphan = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  relations: [{ ...base.relations[0], drawingDraftId: "drawing-outside-workspace" }]
});
assert.equal(orphan.ready, false);
assert.ok(orphan.issues.some((issue) => issue.code === "orphan_relation"));

const nonManufacturingOnly = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  parts: [
    { id: "part-purchased", itemKind: "purchased" },
    { id: "part-shared", itemKind: "shared" }
  ],
  drawings: [],
  relations: []
});
assert.deepEqual(nonManufacturingOnly, { ready: true, issues: [] }, "purchased/shared-only parts do not require primary manufacturing relations");

const appendPartThroughSource = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  draftMode: "append_part",
  sourceDrawingNumberId: "formal-drawing-1",
  sourceLinkType: "primary_manufacturing",
  drawings: [],
  relations: []
});
assert.deepEqual(appendPartThroughSource, { ready: true, issues: [] }, "append-part may use its validated formal source drawing");

const appendPartReferenceOnly = lifecycle.evaluateNumberingDraftRelationReadiness({
  ...base,
  draftMode: "append_part",
  sourceDrawingNumberId: "formal-drawing-1",
  sourceLinkType: "reference",
  drawings: [],
  relations: []
});
assert.equal(appendPartReferenceOnly.ready, false);
assert.ok(appendPartReferenceOnly.issues.some((issue) => issue.code === "missing_primary_relation"));

const explicitNotReadyProjection = lifecycle.projectNumberLifecycleV2({
  workspaceLifecycle: "active",
  drawingDraftIds: ["drawing-1"],
  relationCount: 1,
  relationsReady: false,
  reservations: [
    { itemType: "root", state: "active" },
    { itemType: "part", state: "active" },
    { itemType: "drawing", state: "active" }
  ],
  legacyApproval: null,
  bundleApproval: null,
  candidateRevisions: [{
    id: "candidate-1",
    companyId: "company-1",
    workspaceId: "workspace-1",
    drawingDraftId: "drawing-1",
    candidateReservationId: "reservation-1",
    revision: "0.1",
    workflowIntent: "rd_workspace",
    policySnapshot: {},
    overrideReason: null,
    lifecycleStatus: "draft",
    rowVersion: 1,
    approvalRequestId: null,
    reviewSnapshotHash: null,
    legacyBaselineRequestId: null,
    legacyBaselineSnapshotHash: null,
    formalDrawingNumberId: null,
    formalRevisionPackageId: null,
    createdBy: "user-1",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedBy: "user-1",
    updatedAt: "2026-08-17T00:00:00.000Z",
    promotedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    files: [
      { id: "file-2d", sourceFileAssetId: "asset-2d", publicationEvidenceId: "evidence-2d", role: "drawing_2d", roleSource: "user", displayName: "a.slddrw", description: "", sortOrder: 1, isPrimary: true, removedAt: null, removedBy: null },
      { id: "file-3d", sourceFileAssetId: "asset-3d", publicationEvidenceId: "evidence-3d", role: "cad_3d", roleSource: "user", displayName: "a.sldprt", description: "", sortOrder: 2, isPrimary: true, removedAt: null, removedBy: null }
    ],
    effectiveStatus: null
  }]
});
assert.equal(explicitNotReadyProjection.stage, "drawing_preparation", "one relation cannot hide another required Part's missing relationship");

console.log("QC DEV-076 candidate relations: PASS (ready, missing, duplicate, reference, orphan, non-manufacturing, source-link and lifecycle fail-closed)");
