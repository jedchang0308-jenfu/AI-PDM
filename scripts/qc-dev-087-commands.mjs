import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { assert, createFixtureDatabase, ids, pass } from "./qc-dev-087-fixtures.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { PdmCanonicalWorkbenchService } from "../src/lib/pdm-canonical-workbench.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { AsyncNumberingRepository } from "../src/lib/repositories/numbering-async-repository.ts";

const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-upload-"));
process.env.PDM_DATA_DIR = path.join(taskRoot, "data");
process.env.PDM_REPOSITORY_DIR = path.join(taskRoot, "repository");
fs.mkdirSync(process.env.PDM_DATA_DIR, { recursive: true });
fs.mkdirSync(process.env.PDM_REPOSITORY_DIR, { recursive: true });
process.on("exit", () => fs.rmSync(taskRoot, { recursive: true, force: true }));

const db = createFixtureDatabase();
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
const workbench = new PdmCanonicalWorkbenchService(client);
const owner = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false } };
const ownerView = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: true } };
const reviewer = { id: ids.reviewer, companyId: ids.company, canEditNonOwned: true, permissions: { create: true, update: true, submit: true, cancel: true, decide: true } };
const reviewerView = { id: ids.reviewer, companyId: ids.company, canEditNonOwned: true, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: true, obsoleteDrawing: true } };

const partService = new PartChangeWorkService(client);
const initialPart = await workbench.list(new URL("http://local"), "part", ownerView);
const formal = initialPart.data.groups[0].rows[0];
const created = await partService.create(ids.part, owner, { idempotencyKey: "part-create", contractToken: initialPart.meta.contractToken, expectedRowVersion: formal.rowVersion });
assert.equal(db.prepare(`DELETE FROM canonical_workbench_states WHERE id = ? AND data_layer = 'part_formal'`).run(ids.statePart).changes, 1, "reproduce a migrated work-only Part without a formal baseline");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.part).n, 0);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE canonical_entity_id = ? AND data_layer = 'part_work'`).get(ids.part).n, 1);
const changedPayload = { ...created.payload, partName: "本體_BS_右_Xx5_核准" };
const updated = await partService.update(created.workId, changedPayload, owner, { idempotencyKey: "part-update", contractToken: initialPart.meta.contractToken, expectedRowVersion: created.rowVersion });
assert.equal(updated.rowVersion, 2);
assert.equal(db.prepare(`SELECT part_name FROM part_numbers WHERE id = ?`).get(ids.part).part_name, "本體_BS_右_Xx5", "formal stays unchanged before approval");
const submitted = await partService.submit(created.workId, owner, { idempotencyKey: "part-submit", contractToken: initialPart.meta.contractToken, expectedRowVersion: updated.rowVersion });
assert.equal(db.prepare(`SELECT handling FROM canonical_workbench_states WHERE work_id = ?`).get(created.workId).handling, "review_owner");
await assert.rejects(() => partService.update(created.workId, changedPayload, owner, { idempotencyKey: "part-update-after-submit", contractToken: initialPart.meta.contractToken, expectedRowVersion: updated.rowVersion }), (error) => error.code === "WORKBENCH_ROW_VERSION_CONFLICT");
const reviewList = await workbench.list(new URL("http://local"), "part", reviewerView);
const decision = await partService.decide(submitted.requestId, "approve", reviewer, { idempotencyKey: "part-approve", contractToken: reviewList.meta.contractToken, expectedRowVersion: submitted.rowVersion });
assert.deepEqual(decision, { acknowledged: true });
assert.equal(db.prepare(`SELECT part_name FROM part_numbers WHERE id = ?`).get(ids.part).part_name, changedPayload.partName);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM part_change_works`).get().n, 0);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM part_approved_change_snapshots`).get().n, 1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM pdm_review_traces`).get().n, 1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM pdm_work_review_requests`).get().n, 0);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE canonical_entity_id = ? AND data_layer = 'part_formal'`).get(ids.part).n, 1, "approval creates exactly one formal navigation state");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE canonical_entity_id = ? AND data_layer = 'part_work'`).get(ids.part).n, 0, "approval removes the work state");
const formalizedPartList = await workbench.list(new URL("http://local"), "part", ownerView);
const formalizedPartRow = formalizedPartList.data.groups.flatMap((group) => group.rows).find((row) => row.entityId === ids.part);
assert(formalizedPartRow, "approved work-only Part remains visible in the canonical list");
assert.equal((await workbench.detail(formalizedPartRow.rowKey, "part", ownerView)).data.presentation.kind, "part", "approved work-only Part remains detail-resolvable");
const decisionReplay = await partService.decide(submitted.requestId, "approve", reviewer, { idempotencyKey: "part-approve", contractToken: reviewList.meta.contractToken, expectedRowVersion: submitted.rowVersion });
assert.deepEqual(decisionReplay, { acknowledged: true }, "response-loss replay returns a content-free acknowledgement");
await assert.rejects(() => partService.decide(submitted.requestId, "return_for_correction", reviewer, { idempotencyKey: "part-approve", contractToken: reviewList.meta.contractToken, expectedRowVersion: submitted.rowVersion }), (error) => error.code === "IDEMPOTENCY_KEY_REUSED");

const drawingService = new DrawingRevisionWorkService(client);
async function completeNoImpact(workId, contractToken, expectedRowVersion, idempotencyKey) {
  const readable = await drawingService.read(workId, owner);
  assert.equal(readable.data.changeImpactRequired, true, "only a revision with a predecessor requires FFF");
  assert(readable.data.payload.changeImpact, "required FFF projection is present");
  return drawingService.update(workId, {
    ...readable.data.payload,
    changeImpact: {
      ...readable.data.payload.changeImpact,
      formState: "no_impact",
      fitState: "no_impact",
      functionState: "no_impact",
      reasonCategory: null,
      note: null,
      replacement: null
    }
  }, owner, { idempotencyKey, contractToken, expectedRowVersion });
}
const drawingList = await workbench.list(new URL("http://local"), "drawing", ownerView);
const production = drawingList.data.groups[0].rows.find((row) => row.layer === "production");
assert(production);
const targets = await drawingService.targets(ids.drawing, production.rowKey, owner);
assert.deepEqual(targets.data.candidates.map((candidate) => candidate.label), ["量產版 2", "研發版 1.2"]);
const rdTarget = targets.data.candidates.find((candidate) => candidate.kind === "rd");
assert(rdTarget?.candidateToken);
const newWork = await drawingService.create(ids.drawing, { sourceRowKey: production.rowKey, selectionMode: "recommended", candidateToken: rdTarget.candidateToken }, owner, { idempotencyKey: "drawing-create", contractToken: targets.meta.contractToken, expectedRowVersion: production.rowVersion });
assert.equal(newWork.revision, "1.2");
assert.equal(db.prepare(`SELECT open_branch_count FROM pdm_workbench_aggregates WHERE id = ?`).get(ids.aggregateDrawing).open_branch_count, 2);
const preparedCancelledWork = await completeNoImpact(newWork.workId, targets.meta.contractToken, newWork.rowVersion, "drawing-fff-cancel-no-impact");
const cancelled2d = await drawingService.uploadFile(newWork.workId, {
  file: new File(["DEV087-SLDDRW-CANCEL"], "A0002-M01.SLDDRW", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-cancel-2d", contractToken: targets.meta.contractToken, expectedRowVersion: preparedCancelledWork.rowVersion });
assert.equal(cancelled2d.rowVersion, preparedCancelledWork.rowVersion + 1, "upload advances the canonical work row version");
await assert.rejects(
  () => drawingService.submit(newWork.workId, owner, { idempotencyKey: "drawing-submit-without-3d", contractToken: targets.meta.contractToken, expectedRowVersion: cancelled2d.rowVersion }),
  (error) => error.code === "DRAWING_3D_REQUIRED",
  "submit rejects a revision that did not re-upload its 3D primary file"
);
const cancelled3d = await drawingService.uploadFile(newWork.workId, {
  file: new File(["DEV087-SLDPRT-CANCEL"], "A0002-M01.SLDPRT", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-cancel-3d", contractToken: targets.meta.contractToken, expectedRowVersion: cancelled2d.rowVersion });
assert.equal(cancelled3d.rowVersion, cancelled2d.rowVersion + 1);
const cancelledReadable = await drawingService.read(newWork.workId, owner);
assert.deepEqual(cancelledReadable.data.files.map((file) => file.role).sort(), ["cad_3d", "drawing_2d"]);
assert(cancelledReadable.data.files.every((file) => Boolean(file.current_revision_upload)), "uploaded files belong to the target revision");
const cancelledWorkRevisionId = db.prepare(`SELECT revision_id FROM canonical_workbench_states WHERE work_id = ?`).get(newWork.workId).revision_id;
await new DrawingRecognitionAsyncRepository(client).createSession({ companyId: ids.company, actorId: ids.owner, sourceContextType: "drawing_revision", sourceContextId: cancelledWorkRevisionId, sourceAssetIds: cancelledReadable.data.files.map((file) => file.source_file_asset_id) });
await drawingService.cancel(newWork.workId, owner, { idempotencyKey: "drawing-cancel", contractToken: targets.meta.contractToken, expectedRowVersion: cancelled3d.rowVersion });
assert.equal(db.prepare(`SELECT open_branch_count FROM pdm_workbench_aggregates WHERE id = ?`).get(ids.aggregateDrawing).open_branch_count, 1);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_revision_claims WHERE target_label = '1.2'`).get().n, 0, "unapproved revision claim is reusable");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_recognition_sessions WHERE drawing_revision_id = ?`).get(cancelledWorkRevisionId).n, 0, "cancel removes unapproved recognition work data");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_revisions WHERE id = ?`).get(cancelledWorkRevisionId).n, 0, "cancel removes the unapproved revision identity");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_revision_files WHERE drawing_revision_id = ?`).get(cancelledWorkRevisionId).n, 0, "cancel removes target revision file bindings");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM file_assets WHERE id IN (?, ?) AND deleted_at IS NOT NULL`).get(cancelled2d.file.sourceFileAssetId, cancelled3d.file.sourceFileAssetId).n, 2, "cancel soft-deletes target revision upload receipts");
const refreshedDrawingList = await workbench.list(new URL("http://local"), "drawing", ownerView);
const refreshedProduction = refreshedDrawingList.data.groups[0].rows.find((row) => row.layer === "production");
assert(refreshedProduction);
const refreshedTargets = await drawingService.targets(ids.drawing, refreshedProduction.rowKey, owner);
const reusableTarget = refreshedTargets.data.candidates.find((candidate) => candidate.kind === "rd");
const approvedWork = await drawingService.create(ids.drawing, { sourceRowKey: refreshedProduction.rowKey, selectionMode: "recommended", candidateToken: reusableTarget.candidateToken }, owner, { idempotencyKey: "drawing-create-approved", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: refreshedProduction.rowVersion });
const approvedWorkRevisionId = db.prepare(`SELECT revision_id FROM canonical_workbench_states WHERE work_id = ?`).get(approvedWork.workId).revision_id;
const preparedApprovedWork = await completeNoImpact(approvedWork.workId, refreshedTargets.meta.contractToken, approvedWork.rowVersion, "drawing-fff-approve-no-impact");
const approved2d = await drawingService.uploadFile(approvedWork.workId, {
  file: new File(["DEV087-SLDDRW-APPROVE"], "A0002-M01.SLDDRW", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-approved-2d", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: preparedApprovedWork.rowVersion });
const approved2dReplay = await drawingService.uploadFile(approvedWork.workId, {
  file: new File(["DEV087-SLDDRW-APPROVE"], "A0002-M01.SLDDRW", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-approved-2d", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: preparedApprovedWork.rowVersion });
assert.deepEqual(approved2dReplay, approved2d, "upload is safe to replay with the same idempotency key");
const approved2dReplacement = await drawingService.uploadFile(approvedWork.workId, {
  file: new File(["DEV087-SLDDRW-APPROVE-REPLACED"], "A0002-M01-R2.SLDDRW", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-approved-2d-replacement", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: approved2d.rowVersion });
assert.equal(db.prepare(`SELECT deleted_at FROM file_assets WHERE id = ?`).get(approved2d.file.sourceFileAssetId).deleted_at !== null, true, "same-role replacement retires the previous target upload receipt");
const approved3d = await drawingService.uploadFile(approvedWork.workId, {
  file: new File(["DEV087-SLDASM-APPROVE"], "A0002-M01.SLDASM", { type: "application/octet-stream" })
}, owner, { idempotencyKey: "drawing-upload-approved-3d", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: approved2dReplacement.rowVersion });
const readableWork = await drawingService.read(approvedWork.workId, owner);
assert.equal(readableWork.data.revisionId, approvedWorkRevisionId);
assert.equal(readableWork.data.readonly, false);
assert.equal(readableWork.data.files.filter((file) => file.current_revision_upload).length, 2, "read model identifies current revision uploads");
const recognition = await new DrawingRecognitionAsyncRepository(client).createSession({ companyId: ids.company, actorId: ids.owner, sourceContextType: "drawing_revision", sourceContextId: approvedWorkRevisionId, sourceAssetIds: readableWork.data.files.map((file) => file.source_file_asset_id) });
assert.equal(recognition.sourceContextId, approvedWorkRevisionId, "recognition resolves work-bound files against the new revision");
const drawingSubmit = await drawingService.submit(approvedWork.workId, owner, { idempotencyKey: "drawing-submit", contractToken: refreshedTargets.meta.contractToken, expectedRowVersion: approved3d.rowVersion });
assert.equal((await drawingService.read(approvedWork.workId, owner)).data.readonly, true, "owner workspace is readonly during review");
const reviewerDrawingList = await workbench.list(new URL("http://local"), "drawing", reviewerView);
await drawingService.decide(drawingSubmit.requestId, "approve", { id: ids.reviewer, companyId: ids.company, canEditNonOwned: true, permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true } }, { idempotencyKey: "drawing-approve", contractToken: reviewerDrawingList.meta.contractToken, expectedRowVersion: drawingSubmit.rowVersion });
assert.equal(db.prepare(`SELECT claim_state FROM drawing_revision_claims WHERE target_label = '1.2'`).get().claim_state, "approved");
assert.equal(db.prepare(`SELECT handling FROM canonical_workbench_states WHERE branch_id = ?`).get(approvedWork.branchId).handling, "none");
assert.equal(db.prepare(`SELECT COUNT(*) n FROM canonical_workbench_states WHERE entity_type = 'drawing'`).get().n, 3);
assert.equal(db.prepare(`SELECT COUNT(*) n FROM drawing_revision_files WHERE drawing_revision_id = ? AND removed_at IS NULL`).get(approvedWorkRevisionId).n, 2, "approved revision retains both work-bound controlled files");
assert.deepEqual(db.prepare(`SELECT role FROM drawing_revision_files WHERE drawing_revision_id = ? AND removed_at IS NULL ORDER BY role`).all(approvedWorkRevisionId).map((row) => row.role), ["cad_3d", "drawing_2d"]);

// Regression guard for the real D01-D07 lifecycle. A new manufactured root
// creates its initial 0.1 work before the automatic drawing/part relation is
// inserted. The same transaction must seal that exact relation into the work,
// and the first promotion to production must create (not merely UPDATE) the
// authoritative production row for a drawing that never had one.
const numbering = new AsyncNumberingRepository(client);
const initialRecord = await numbering.createNumberingRecord({
  companyId: ids.company,
  coreName: "DEV087 initial drawing lifecycle regression",
  itemKind: "manufactured",
  structureType: "single_part",
  recordStatus: "Draft",
  isUniversal: false,
  drawingPurposeCode: "M",
  drawingPurposeDescription: "主要加工圖",
  createdBy: ids.owner
});
assert(initialRecord.drawingNumber);
const initialDrawingProjection = db.prepare(`SELECT drawing.id AS drawing_id, state.work_id, state.revision_id
  FROM drawings drawing
  JOIN canonical_workbench_states state
    ON state.company_id = drawing.company_id
   AND state.entity_type = 'drawing'
   AND state.canonical_entity_id = drawing.id
   AND state.data_layer = 'drawing_rd'
  WHERE drawing.company_id = ? AND drawing.formal_drawing_number_id = ?`).get(ids.company, initialRecord.drawingNumber.id);
assert(initialDrawingProjection?.work_id);
const initialDrawingRead = await drawingService.read(initialDrawingProjection.work_id, owner);
assert.equal(initialDrawingRead.data.changeImpactRequired, false, "initial 0.1 revision does not require FFF");
assert.equal(Object.hasOwn(initialDrawingRead.data.payload, "changeImpact"), false, "initial 0.1 payload does not carry FFF");
assert.deepEqual(initialDrawingRead.data.relatedParts.map((part) => part.id), [initialRecord.partNumber.id], "initial 0.1 shows the automatic linked Part as a neutral relation");
assert.deepEqual(initialDrawingRead.data.affectedParts, [], "neutral related Parts are not treated as confirmed affected Parts");
const initial2d = await drawingService.uploadFile(initialDrawingProjection.work_id, {
  file: new File(["DEV087-INITIAL-SLDDRW"], `${initialRecord.drawingNumber.drawingNumber}.SLDDRW`, { type: "application/octet-stream" })
}, owner, { idempotencyKey: "initial-drawing-upload-2d", contractToken: initialDrawingRead.meta.contractToken, expectedRowVersion: initialDrawingRead.data.rowVersion });
const initial3d = await drawingService.uploadFile(initialDrawingProjection.work_id, {
  file: new File(["DEV087-INITIAL-SLDPRT"], `${initialRecord.drawingNumber.drawingNumber}.SLDPRT`, { type: "application/octet-stream" })
}, owner, { idempotencyKey: "initial-drawing-upload-3d", contractToken: initialDrawingRead.meta.contractToken, expectedRowVersion: initial2d.rowVersion });
const initialSubmit = await drawingService.submit(initialDrawingProjection.work_id, owner, {
  idempotencyKey: "initial-drawing-submit",
  contractToken: initialDrawingRead.meta.contractToken,
  expectedRowVersion: initial3d.rowVersion
});
const initialReviewerList = await workbench.list(new URL(`http://local?query=${encodeURIComponent(initialRecord.drawingNumber.drawingNumber)}`), "drawing", reviewerView);
await drawingService.decide(initialSubmit.requestId, "approve", reviewer, {
  idempotencyKey: "initial-drawing-approve",
  contractToken: initialReviewerList.meta.contractToken,
  expectedRowVersion: initialSubmit.rowVersion
});
const controlledInitialList = await workbench.list(new URL(`http://local?query=${encodeURIComponent(initialRecord.drawingNumber.drawingNumber)}`), "drawing", ownerView);
const controlledInitialRow = controlledInitialList.data.groups.flatMap((group) => group.rows).find((row) => row.revision === "0.1");
assert(controlledInitialRow);
const promotionTargets = await drawingService.targets(initialDrawingProjection.drawing_id, controlledInitialRow.rowKey, owner);
const productionTarget = promotionTargets.data.candidates.find((candidate) => candidate.kind === "production" && candidate.enabled);
assert.equal(productionTarget?.label, "量產版 1");
assert(productionTarget?.candidateToken);
const promotionWork = await drawingService.create(initialDrawingProjection.drawing_id, {
  sourceRowKey: controlledInitialRow.rowKey,
  selectionMode: "recommended",
  candidateToken: productionTarget.candidateToken
}, owner, { idempotencyKey: "initial-production-create", contractToken: promotionTargets.meta.contractToken, expectedRowVersion: controlledInitialRow.rowVersion });
const preparedPromotionWork = await completeNoImpact(promotionWork.workId, promotionTargets.meta.contractToken, promotionWork.rowVersion, "initial-production-fff-no-impact");
const promotion2d = await drawingService.uploadFile(promotionWork.workId, {
  file: new File(["DEV087-PRODUCTION-SLDDRW"], `${initialRecord.drawingNumber.drawingNumber}.SLDDRW`, { type: "application/octet-stream" })
}, owner, { idempotencyKey: "initial-production-upload-2d", contractToken: promotionTargets.meta.contractToken, expectedRowVersion: preparedPromotionWork.rowVersion });
const promotion3d = await drawingService.uploadFile(promotionWork.workId, {
  file: new File(["DEV087-PRODUCTION-SLDPRT"], `${initialRecord.drawingNumber.drawingNumber}.SLDPRT`, { type: "application/octet-stream" })
}, owner, { idempotencyKey: "initial-production-upload-3d", contractToken: promotionTargets.meta.contractToken, expectedRowVersion: promotion2d.rowVersion });
const promotionSubmit = await drawingService.submit(promotionWork.workId, owner, {
  idempotencyKey: "initial-production-submit",
  contractToken: promotionTargets.meta.contractToken,
  expectedRowVersion: promotion3d.rowVersion
});
const promotionReviewerList = await workbench.list(new URL(`http://local?query=${encodeURIComponent(initialRecord.drawingNumber.drawingNumber)}`), "drawing", reviewerView);
await drawingService.decide(promotionSubmit.requestId, "approve", reviewer, {
  idempotencyKey: "initial-production-approve",
  contractToken: promotionReviewerList.meta.contractToken,
  expectedRowVersion: promotionSubmit.rowVersion
});
const promotedFacts = db.prepare(`SELECT state.data_layer, revision.revision, state.handling,
    aggregate.open_branch_count,
    (SELECT COUNT(*) FROM canonical_workbench_states rd WHERE rd.company_id=state.company_id AND rd.canonical_entity_id=state.canonical_entity_id AND rd.data_layer='drawing_rd') AS rd_state_count,
    (SELECT COUNT(*) FROM drawing_rd_branches branch WHERE branch.company_id=state.company_id AND branch.drawing_id=state.canonical_entity_id AND branch.status='historical') AS historical_branch_count
  FROM canonical_workbench_states state
  JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
  JOIN pdm_workbench_aggregates aggregate ON aggregate.company_id=state.company_id AND aggregate.entity_type='drawing' AND aggregate.canonical_entity_id=state.canonical_entity_id
  WHERE state.company_id=? AND state.entity_type='drawing' AND state.canonical_entity_id=? AND state.data_layer='drawing_production'`).get(ids.company, initialDrawingProjection.drawing_id);
assert.deepEqual(promotedFacts, { data_layer: "drawing_production", revision: "1", handling: "none", open_branch_count: 0, rd_state_count: 0, historical_branch_count: 1 }, "first production promotion retains one authoritative production row and closes the RD branch");
const promotedList = await workbench.list(new URL(`http://local?query=${encodeURIComponent(initialRecord.drawingNumber.drawingNumber)}`), "drawing", ownerView);
assert.deepEqual(promotedList.data.groups.flatMap((group) => group.rows).map((row) => row.layerLabel), ["量產版 1"]);

assert.equal(db.pragma("foreign_key_check").length, 0);
db.close();
pass("commands", 61);
