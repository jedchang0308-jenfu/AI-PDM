import assert from "node:assert/strict";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { PdmChangeControlDomainService } from "../src/lib/pdm-change-control-domain.ts";
import {
  listReplacementAttachmentCandidatesAsync,
  replacementAttachmentSelectionFingerprint
} from "../src/lib/replacement-part-attachments.ts";

const db = createFixtureDatabase();
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
const actor = { userId: ids.owner, companyId: ids.company, role: "Engineer", roleCodes: ["engineer"] };
const now = "2026-08-22T01:00:00.000Z";
const sourceHash = "a".repeat(64);

const insertAsset = db.prepare(`
  INSERT INTO file_assets (
    id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
    content_hash, linked_entity_type, linked_entity_id, document_category,
    display_name, uploaded_by, deleted_at, created_at, updated_at
  ) VALUES (
    @id, 'local_repository', @storageKey, @fileName, @fileExt, @mimeType, @fileSize,
    @contentHash, 'part_number', @partId, @category,
    @displayName, @owner, @deletedAt, @createdAt, @updatedAt
  )
`);
insertAsset.run({
  id: "dev088-source-manual",
  storageKey: "master-attachments/A0002/manual.pdf",
  fileName: "manual.pdf",
  fileExt: "pdf",
  mimeType: "application/pdf",
  fileSize: 128,
  contentHash: sourceHash,
  partId: ids.part,
  category: "other",
  displayName: "組裝說明",
  owner: ids.owner,
  deletedAt: null,
  createdAt: now,
  updatedAt: now
});
insertAsset.run({
  id: "dev088-source-2d",
  storageKey: "drawings/A0002-M01.slddrw",
  fileName: "A0002-M01.slddrw",
  fileExt: "slddrw",
  mimeType: "application/octet-stream",
  fileSize: 256,
  contentHash: "b".repeat(64),
  partId: ids.part,
  category: "drawing_2d",
  displayName: "2D",
  owner: ids.owner,
  deletedAt: null,
  createdAt: now,
  updatedAt: now
});
insertAsset.run({
  id: "dev088-source-3d",
  storageKey: "models/A0002.sldprt",
  fileName: "A0002.sldprt",
  fileExt: "sldprt",
  mimeType: "application/octet-stream",
  fileSize: 512,
  contentHash: "c".repeat(64),
  partId: ids.part,
  category: "cad_3d",
  displayName: "3D",
  owner: ids.owner,
  deletedAt: null,
  createdAt: now,
  updatedAt: now
});
insertAsset.run({
  id: "dev088-source-deleted",
  storageKey: "master-attachments/A0002/deleted.txt",
  fileName: "deleted.txt",
  fileExt: "txt",
  mimeType: "text/plain",
  fileSize: 32,
  contentHash: "d".repeat(64),
  partId: ids.part,
  category: "other",
  displayName: "已刪除",
  owner: ids.owner,
  deletedAt: now,
  createdAt: now,
  updatedAt: now
});

const firstCandidates = await listReplacementAttachmentCandidatesAsync({
  client,
  companyId: ids.company,
  sourcePartNumber: "A0002-P01"
});
assert(firstCandidates);
assert.deepEqual(firstCandidates.candidates.map((candidate) => candidate.id), ["dev088-source-manual"]);
assert.equal(await listReplacementAttachmentCandidatesAsync({ client, companyId: ids.otherCompany, sourcePartNumber: "A0002-P01" }), null);

const staleSnapshot = {
  sourcePartNumberId: ids.part,
  sourceToken: firstCandidates.sourceToken,
  selectedAttachmentIds: ["dev088-source-manual"],
  newAttachments: []
};
db.prepare(`UPDATE file_assets SET updated_at = '2026-08-22T01:01:00.000Z' WHERE id = 'dev088-source-manual'`).run();
const staleService = new PdmChangeControlDomainService(client);
await assert.rejects(
  () => staleService.submitDrawingRevisionFffAssessment({
    drawingNumberId: ids.drawingNumber,
    revision: "1.2",
    formState: "confirmed_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "尺寸 / 公差修正",
    currentPartNumberId: ids.part,
    replacementReservedPartNumber: "A0002-P03",
    detectedPartNumber: "A0002-P03",
    attachmentSnapshot: staleSnapshot,
    actor
  }),
  (error) => error?.code === "SOURCE_ATTACHMENTS_STALE"
);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_number_drafts WHERE reserved_part_number = 'A0002-P03'`).get().count, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_attachment_reuse_snapshots`).get().count, 0);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_type = 'part_number_draft'`).get().count, 0);

const currentCandidates = await listReplacementAttachmentCandidatesAsync({
  client,
  companyId: ids.company,
  sourcePartNumberId: ids.part
});
assert(currentCandidates);
const preparedNew = {
  clientKey: "new-manual",
  ordinal: 0,
  fileName: "manual-updated.pdf",
  fileExt: "pdf",
  mimeType: "application/pdf",
  fileSize: 128,
  contentHash: sourceHash,
  storageProvider: "local_repository",
  originalPath: null,
  storageBucket: null,
  storageKey: "replacement-part-attachments/D87A/aa/updated",
  storageGeneration: null,
  storageMetageneration: null,
  displayName: "新版組裝說明",
  description: "",
  documentCategory: "other",
  revision: null
};
const snapshot = {
  sourcePartNumberId: ids.part,
  sourceToken: currentCandidates.sourceToken,
  selectedAttachmentIds: ["dev088-source-manual"],
  newAttachments: [preparedNew]
};
assert.equal(replacementAttachmentSelectionFingerprint(snapshot).length, 64);

const service = new PdmChangeControlDomainService(client);
const first = await service.submitDrawingRevisionFffAssessment({
  drawingNumberId: ids.drawingNumber,
  revision: "1.2",
  formState: "confirmed_impact",
  fitState: "no_impact",
  functionState: "no_impact",
  reasonCategory: "尺寸 / 公差修正",
  currentPartNumberId: ids.part,
  replacementReservedPartNumber: "A0002-P02",
  replacementItemType: "self_made",
  detectedPartNumber: "A0002-P02",
  attachmentSnapshot: snapshot,
  actor
});
assert(first.replacementDraft);
const draftId = first.replacementDraft.id;
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_attachment_reuse_snapshots WHERE part_number_draft_id = ?`).get(draftId).count, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_type = 'part_number_draft' AND linked_entity_id = ?`).get(draftId).count, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_attachment_reuse_origins`).get().count, 2);
const targetBeforeRelease = db.prepare(`SELECT * FROM file_assets WHERE linked_entity_type = 'part_number_draft' AND linked_entity_id = ?`).get(draftId);
assert.equal(targetBeforeRelease.display_name, "新版組裝說明");
assert.equal(targetBeforeRelease.storage_key, preparedNew.storageKey);
assert.equal(db.prepare(`SELECT linked_entity_id FROM file_assets WHERE id = 'dev088-source-manual'`).get().linked_entity_id, ids.part);

const replay = await service.submitDrawingRevisionFffAssessment({
  drawingNumberId: ids.drawingNumber,
  revision: "1.2",
  formState: "confirmed_impact",
  fitState: "no_impact",
  functionState: "no_impact",
  reasonCategory: "尺寸 / 公差修正",
  currentPartNumberId: ids.part,
  replacementReservedPartNumber: "A0002-P02",
  replacementItemType: "self_made",
  detectedPartNumber: "A0002-P02",
  attachmentSnapshot: snapshot,
  actor
});
assert.equal(replay.replacementDraft?.id, draftId);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_number_drafts WHERE reserved_part_number = 'A0002-P02'`).get().count, 1);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_attachment_reuse_snapshots`).get().count, 1);

await assert.rejects(
  () => service.submitDrawingRevisionFffAssessment({
    drawingNumberId: ids.drawingNumber,
    revision: "1.2",
    formState: "confirmed_impact",
    fitState: "no_impact",
    functionState: "no_impact",
    reasonCategory: "尺寸 / 公差修正",
    currentPartNumberId: ids.part,
    replacementReservedPartNumber: "A0002-P02",
    detectedPartNumber: "A0002-P02",
    attachmentSnapshot: { ...snapshot, selectedAttachmentIds: [] },
    actor
  }),
  (error) => error?.code === "REPLACEMENT_ATTACHMENT_SNAPSHOT_CONFLICT"
);

db.prepare(`UPDATE file_assets SET deleted_at = ? WHERE id = ?`).run(now, targetBeforeRelease.id);
await assert.rejects(
  () => service.applyDrawingRevisionReviewAction({
    assessmentId: first.assessment.id,
    action: "approve_replacement_part_and_drawing_release",
    actor: { ...actor, role: "R&D Manager", roleCodes: ["rd_manager"] }
  }),
  (error) => error?.code === "REPLACEMENT_ATTACHMENT_PROMOTION_INCOMPLETE"
);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_numbers WHERE part_number = 'A0002-P02'`).get().count, 0);

db.prepare(`UPDATE file_assets SET deleted_at = NULL WHERE id = ?`).run(targetBeforeRelease.id);
db.prepare(`
  INSERT INTO file_assets (
    id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
    content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
    created_at, updated_at
  ) VALUES (
    'dev088-unmapped-draft-asset', 'local_repository', 'dev088/unmapped.txt', 'unmapped.txt',
    'txt', 'text/plain', 8, @contentHash, 'part_number_draft', @draftId, 'other',
    '未映射附件', @createdAt, @updatedAt
  )
`).run({ contentHash: "9".repeat(64), draftId, createdAt: now, updatedAt: now });
await assert.rejects(
  () => service.applyDrawingRevisionReviewAction({
    assessmentId: first.assessment.id,
    action: "approve_replacement_part_and_drawing_release",
    actor: { ...actor, role: "R&D Manager", roleCodes: ["rd_manager"] }
  }),
  (error) => error?.code === "REPLACEMENT_ATTACHMENT_PROMOTION_INCOMPLETE"
);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM part_numbers WHERE part_number = 'A0002-P02'`).get().count, 0);
db.prepare(`DELETE FROM file_assets WHERE id = 'dev088-unmapped-draft-asset'`).run();

const released = await service.applyDrawingRevisionReviewAction({
  assessmentId: first.assessment.id,
  action: "approve_replacement_part_and_drawing_release",
  actor: { ...actor, role: "R&D Manager", roleCodes: ["rd_manager"] }
});
assert(released.replacementPartNumberId);
const promoted = db.prepare(`SELECT linked_entity_type, linked_entity_id FROM file_assets WHERE id = ?`).get(targetBeforeRelease.id);
assert.deepEqual(promoted, { linked_entity_type: "part_number", linked_entity_id: released.replacementPartNumberId });
assert.equal(db.prepare(`SELECT linked_entity_id FROM file_assets WHERE id = 'dev088-source-manual'`).get().linked_entity_id, ids.part);
assert.equal(db.prepare(`SELECT status FROM part_number_drafts WHERE id = ?`).get(draftId).status, "released");
assert.equal(db.pragma("foreign_key_check").length, 0);

const scaleInsert = db.prepare(`
  INSERT INTO file_assets (
    id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size,
    content_hash, linked_entity_type, linked_entity_id, document_category, display_name,
    created_at, updated_at
  ) VALUES (
    @id, 'local_repository', @storageKey, @fileName, 'txt', 'text/plain', @fileSize,
    @contentHash, 'part_number', @partId, 'other', @displayName, @createdAt, @updatedAt
  )
`);
for (let index = 0; index < 20; index += 1) {
  scaleInsert.run({
    id: `dev088-scale-${index}`,
    storageKey: `dev088/scale/${index}.txt`,
    fileName: `${index}.txt`,
    fileSize: 10 + index,
    contentHash: index.toString(16).padStart(64, "0"),
    partId: ids.part,
    displayName: `附件 ${index}`,
    createdAt: now,
    updatedAt: now
  });
}
const scaleCandidates = await listReplacementAttachmentCandidatesAsync({ client, companyId: ids.company, sourcePartNumberId: ids.part });
assert(scaleCandidates);
assert.equal(scaleCandidates.candidates.length, 21);
let statementCount = 0;
const countingClient = {
  kind: client.kind,
  query: (...args) => { statementCount += 1; return client.query(...args); },
  queryOne: (...args) => { statementCount += 1; return client.queryOne(...args); },
  execute: (...args) => { statementCount += 1; return client.execute(...args); },
  transaction: (fn, options) => client.transaction(() => fn(countingClient), options),
  close: () => Promise.resolve()
};
const scaleDraft = await countingClient.transaction((transactionClient) =>
  new PdmChangeControlDomainService(transactionClient).reservePartNumberDraft({
    reservedPartNumber: "A0002-P04",
    draftType: "replacement_part",
    itemType: "self_made",
    sourcePartNumberId: ids.part,
    attachmentSnapshot: {
      sourcePartNumberId: ids.part,
      sourceToken: scaleCandidates.sourceToken,
      selectedAttachmentIds: scaleCandidates.candidates.map((candidate) => candidate.id),
      newAttachments: []
    },
    actor
  })
);
assert(statementCount <= 16, `21-attachment commit query budget exceeded: ${statementCount}`);
assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_type = 'part_number_draft' AND linked_entity_id = ?`).get(scaleDraft.id).count, 21);

await client.close();
db.close();
console.log(`DEV-088 repository: PASS (29 checks, 21-attachment statements=${statementCount})`);
