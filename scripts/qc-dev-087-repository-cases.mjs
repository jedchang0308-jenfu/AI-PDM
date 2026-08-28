#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { normalizeDrawingChangeImpact } from "../src/lib/drawing-change-impact.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { readCanonicalDrawingHistoryRevision } from "../src/lib/pdm-canonical-drawing-history.ts";
import { pdmFileReadHref } from "../src/lib/pdm-file-read-contract.ts";
import { PdmCanonicalWorkbenchService } from "../src/lib/pdm-canonical-workbench.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";
import { getFormalObsoleteImpactAsync } from "../src/lib/numbering-obsolete-impact.ts";
import {
  resolveTaskActionUrl,
  sortTaskCenterNotifications,
  sortTaskCenterTasks
} from "../src/lib/numbering-task-center-contract.ts";
import { AsyncNumberingRepository } from "../src/lib/repositories/numbering-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import {
  oracleAffectedParts,
  oracleGroupedCursor,
  oracleObsoleteFingerprint,
  oracleTaskOrder,
  sha256Json
} from "./qc-dev-087-reference-oracles.mjs";

const outputPath = process.env.DEV087_REPOSITORY_CASE_EVIDENCE_PATH;
if (!outputPath) throw new Error("DEV087_REPOSITORY_CASE_EVIDENCE_PATH_REQUIRED");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-repository-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
Object.assign(process.env, {
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  PDM_WORKBENCH_CURSOR_SECRET: "dev087-repository-cursor-secret",
  PDM_REVIEW_PACKAGE_V2_WRITE: "true"
});

const results = [];
const owner = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false } };
const reviewer = { id: ids.reviewer, companyId: ids.company, canEditNonOwned: true, permissions: { create: true, update: true, submit: true, cancel: true, decide: true, obsolete: true } };
const ownerView = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: true } };
const reviewerView = { id: ids.reviewer, companyId: ids.company, canEditNonOwned: true, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: true, obsoleteDrawing: true } };

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : String(error);
}

function databaseFingerprint(database, tables) {
  return sha256Json(Object.fromEntries(tables.map((table) => [table, database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()])));
}

function providerReceipt(database, extra = {}) {
  return { provider: "sqlite", databaseScope: "task_owned_in_memory", foreignKeyViolations: database.pragma("foreign_key_check").length, ...extra };
}

async function capture(caseId, assertionId, probe) {
  try {
    const evidence = await probe();
    results.push({ caseId, result: evidence.pass === true ? "PASS" : "FAIL", assertionIds: [assertionId], ...evidence });
  } catch (error) {
    results.push({ caseId, result: "FAIL", assertionIds: [assertionId], pass: false, error: error instanceof Error ? `${error.name}:${error.message}` : String(error) });
  }
}

function fresh(options = {}) {
  const database = createFixtureDatabase(options);
  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  return { database, client, workbench: new PdmCanonicalWorkbenchService(client) };
}

function seedPart(database, input = {}) {
  const id = input.id ?? "part-dev087-a0002-p02";
  const partNumber = input.partNumber ?? "A0002-P02";
  const sequence = input.sequence ?? 2;
  const sequenceCode = input.sequenceCode ?? `P${String(sequence).padStart(2, "0")}`;
  const aggregateId = `aggregate-${id}`;
  const stateId = `state-${id}`;
  database.prepare(`INSERT INTO part_numbers
    (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, series_code, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Released', ?, ?)`).run(
      id, ids.company, ids.root, partNumber, sequence, sequenceCode, input.partName ?? `Part ${sequence}`,
      input.itemKind ?? "manufactured", input.seriesCode ?? null, ids.owner
    );
  database.prepare("INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id) VALUES (?, ?, 'part', ?)").run(aggregateId, ids.company, id);
  database.prepare("INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer) VALUES (?, ?, 'part', ?, 'part_formal')").run(stateId, ids.company, id);
  if (input.materialCode || input.colorCode || input.surfaceTreatment || input.variantNote) {
    database.prepare(`INSERT INTO part_variant_attributes
      (id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        `variant-${id}`, id, input.materialCode ?? null, input.materialLabel ?? input.materialCode ?? null,
        input.colorCode ?? null, input.colorLabel ?? input.colorCode ?? null, input.surfaceTreatment ?? null,
        input.variantNote ?? null, ids.owner
      );
  }
  return { id, partNumber, aggregateId, stateId };
}

function seedDrawing(database, part, input = {}) {
  const drawingNumberId = input.drawingNumberId ?? "drawing-number-dev087-a0002-r01";
  const drawingId = input.drawingId ?? "drawing-dev087-a0002-r01";
  const revisionId = input.revisionId ?? "revision-dev087-a0002-r01-1";
  const drawingNumber = input.drawingNumber ?? "A0002-R01";
  const purpose = input.purpose ?? "R";
  const sequence = input.sequence ?? 1;
  database.prepare(`INSERT INTO drawing_numbers
    (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'Released', ?)`).run(drawingNumberId, ids.company, ids.root, drawingNumber, purpose, input.purposeDescription ?? "參考圖", sequence, ids.owner);
  database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
    VALUES (?, ?, ?, 'reference', ?)`).run(`link-${drawingNumberId}-${part.id}`, drawingNumberId, part.id, ids.owner);
  database.prepare(`INSERT INTO drawings
    (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, purpose_description, sequence_no, owner_id, created_by)
    VALUES (?, ?, ?, 'released', ?, ?, ?, ?, ?, ?, ?)`).run(drawingId, ids.company, drawingNumber, drawingNumberId, ids.root, purpose, input.purposeDescription ?? "參考圖", sequence, ids.owner, ids.owner);
  database.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, controlled_at, released_at)
    VALUES (?, ?, ?, '1', 'released', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(revisionId, ids.company, drawingId, ids.owner);
  const aggregateId = `aggregate-${drawingId}`;
  const stateId = `state-${drawingId}`;
  database.prepare("INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id) VALUES (?, ?, 'drawing', ?)").run(aggregateId, ids.company, drawingId);
  database.prepare(`INSERT INTO canonical_workbench_states
    (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id)
    VALUES (?, ?, 'drawing', ?, 'drawing_production', ?)`).run(stateId, ids.company, drawingId, revisionId);
  return { drawingNumberId, drawingId, revisionId, drawingNumber, aggregateId, stateId };
}

async function createDrawingWork(context, options = {}) {
  if (options.replacementPart) seedPart(context.database, options.replacementPart);
  const service = new DrawingRevisionWorkService(context.client);
  const list = await context.workbench.list(new URL("http://local?query=A0002-M01"), "drawing", ownerView);
  const source = list.data.groups.flatMap((group) => group.rows).find((row) => row.layer === "production");
  if (!source) throw new Error("DRAWING_SOURCE_MISSING");
  const targets = await service.targets(ids.drawing, source.rowKey, owner);
  const target = targets.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled);
  if (!target?.candidateToken) throw new Error("DRAWING_TARGET_MISSING");
  const work = await service.create(ids.drawing, { sourceRowKey: source.rowKey, selectionMode: "recommended", candidateToken: target.candidateToken }, owner, {
    idempotencyKey: options.idempotencyKey ?? "repository-create", contractToken: targets.meta.contractToken, expectedRowVersion: source.rowVersion
  });
  return { service, source, targets, work };
}

function seedInitialDrawingWork(context, options = {}) {
  const drawingNumberId = options.drawingNumberId ?? "drawing-number-dev087-initial";
  const drawingId = options.drawingId ?? "drawing-dev087-initial";
  const branchId = options.branchId ?? "branch-dev087-initial";
  const claimId = options.claimId ?? "claim-dev087-initial";
  const revisionId = options.revisionId ?? "revision-dev087-initial-01";
  const workId = options.workId ?? "work-dev087-initial-01";
  const drawingNumber = options.drawingNumber ?? "A0002-R99";
  context.database.prepare(`INSERT INTO drawing_numbers
    (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by)
    VALUES (?, ?, ?, ?, 'R', '參考圖', 99, 0, 'Draft', ?)`).run(drawingNumberId, ids.company, ids.root, drawingNumber, ids.owner);
  context.database.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES (?, ?, ?, 'reference', ?)").run(`link-${drawingNumberId}`, drawingNumberId, ids.part, ids.owner);
  context.database.prepare(`INSERT INTO drawings
    (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, purpose_description, sequence_no, owner_id, created_by)
    VALUES (?, ?, ?, 'building', ?, ?, 'R', '參考圖', 99, ?, ?)`).run(drawingId, ids.company, drawingNumber, drawingNumberId, ids.root, ids.owner, ids.owner);
  context.database.prepare("INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id, open_branch_count) VALUES (?, ?, 'drawing', ?, 1)").run(`aggregate-${drawingId}`, ids.company, drawingId);
  context.database.prepare("INSERT INTO drawing_rd_branches (id, company_id, drawing_id, base_production_revision_id, status) VALUES (?, ?, ?, NULL, 'open')").run(branchId, ids.company, drawingId);
  context.database.prepare("INSERT INTO drawing_revision_claims (id, company_id, drawing_id, branch_id, target_major, target_minor, target_label, predecessor_revision_id, claim_state) VALUES (?, ?, ?, ?, 0, 1, '0.1', NULL, 'work')").run(claimId, ids.company, drawingId, branchId);
  context.database.prepare("INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by) VALUES (?, ?, ?, '0.1', 'preparing', ?)").run(revisionId, ids.company, drawingId, ids.owner);
  const legacyImpact = { schemaVersion: 1, affectedPartNumberIds: [ids.part], affectedPartFingerprint: "legacy-initial-snapshot", formState: "no_impact", fitState: "no_impact", functionState: "no_impact", reasonCategory: "not_specified", note: null, replacement: null };
  context.database.prepare("INSERT INTO drawing_revision_works (id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id, proposed_payload, base_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(workId, ids.company, drawingId, branchId, claimId, ids.owner, JSON.stringify({ recognitionNotes: "", ...(options.withLegacyImpact === false ? {} : { changeImpact: legacyImpact }) }), sha256Json({ predecessorRevisionId: null }));
  context.database.prepare("INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, work_id, handling) VALUES (?, ?, 'drawing', ?, 'drawing_rd', ?, ?, ?, 'owner')").run(`state-${drawingId}`, ids.company, drawingId, branchId, revisionId, workId);
  return { drawingNumberId, drawingId, drawingNumber, branchId, claimId, revisionId, workId };
}

function changedPartPayload(payload, suffix = "approved") {
  return {
    ...payload,
    partName: `本體_BS_右_Xx5_${suffix}`,
    materialCode: "SUS304",
    materialLabel: "SUS 304",
    colorCode: "BK",
    colorLabel: "Black",
    surfaceTreatment: "BA",
    variantNote: `DEV087-${suffix}`
  };
}

await capture("QA-087-188", "REPOSITORY_AFFECTED_PART_SET_MATCHES_INDEPENDENT_ORACLE", async () => {
  const context = fresh();
  const relationTuples = context.database.prepare(`SELECT drawing.company_id, drawing.id AS drawing_id, revision.id AS revision_id, link.part_number_id, link.link_type
    FROM drawings drawing
    JOIN drawing_revisions revision ON revision.drawing_id=drawing.id AND revision.id=?
    JOIN drawing_part_links link ON link.drawing_number_id=drawing.formal_drawing_number_id
    WHERE drawing.id=? ORDER BY link.part_number_id, link.link_type`).all(ids.productionRevision, ids.drawing)
    .map((row) => [row.company_id, row.drawing_id, row.revision_id, row.part_number_id, row.link_type]);
  const oracle = oracleAffectedParts({ companyId: ids.company, drawingId: ids.drawing, revisionId: ids.productionRevision, relationTuples });
  const created = await createDrawingWork(context, { idempotencyKey: "qa188-create" });
  const readback = await created.service.read(created.work.workId, owner);
  const actualIds = readback.data.payload.changeImpact.affectedPartNumberIds;
  const initialIdentity = seedInitialDrawingWork(context);
  const initialRead = await created.service.read(initialIdentity.workId, owner);
  const initialBefore = databaseFingerprint(context.database, ["drawing_revision_works", "drawing_revision_fff_assessments", "part_number_drafts"]);
  let forbiddenCode = null;
  try {
    await created.service.update(initialIdentity.workId, { ...initialRead.data.payload, changeImpact: readback.data.payload.changeImpact }, owner, { idempotencyKey: "qa188-initial-forbidden", contractToken: initialRead.meta.contractToken, expectedRowVersion: initialRead.data.rowVersion });
  } catch (error) { forbiddenCode = errorCode(error); }
  const initialAfterForbidden = databaseFingerprint(context.database, ["drawing_revision_works", "drawing_revision_fff_assessments", "part_number_drafts"]);
  await created.service.update(initialIdentity.workId, { ...initialRead.data.payload, recognitionNotes: "legal initial edit" }, owner, { idempotencyKey: "qa188-initial-legal", contractToken: initialRead.meta.contractToken, expectedRowVersion: initialRead.data.rowVersion });
  const initialStored = JSON.parse(context.database.prepare("SELECT proposed_payload FROM drawing_revision_works WHERE id=?").get(initialIdentity.workId).proposed_payload);
  const receipt = providerReceipt(context.database, { workId: created.work.workId, relationCount: relationTuples.length });
  context.database.close();
  return { pass: JSON.stringify(actualIds) === JSON.stringify(oracle.partIds) && actualIds.length === 1
      && readback.data.changeImpactRequired === true && JSON.stringify(readback.data.affectedParts.map((part) => part.id).sort()) === JSON.stringify(actualIds)
      && initialRead.data.changeImpactRequired === false && initialRead.data.relatedParts.length === 1 && initialRead.data.affectedParts.length === 0 && !("changeImpact" in initialRead.data.payload)
      && forbiddenCode === "DRAWING_FFF_NOT_APPLICABLE" && initialBefore === initialAfterForbidden && !("changeImpact" in initialStored),
    oracle: { ...oracle, initial: { changeImpactRequired: false, relatedPartIds: [ids.part], affectedPartIds: [], forbiddenCode: "DRAWING_FFF_NOT_APPLICABLE" } },
    actual: { affectedPartNumberIds: actualIds, affectedPartFingerprint: readback.data.payload.changeImpact.affectedPartFingerprint, initial: { changeImpactRequired: initialRead.data.changeImpactRequired, relatedParts: initialRead.data.relatedParts, affectedParts: initialRead.data.affectedParts, payload: initialRead.data.payload, forbiddenCode, zeroWrite: initialBefore === initialAfterForbidden, normalizedStoredPayload: initialStored } }, providerReceipt: receipt };
});

await capture("QA-087-189", "REPOSITORY_FFF_THREE_OUTCOMES_PERSIST_EXACTLY", async () => {
  const context = fresh();
  const created = await createDrawingWork(context, { idempotencyKey: "qa189-create", replacementPart: { id: "part-qa189-replacement", partNumber: "A0002-P02" } });
  const initial = await created.service.read(created.work.workId, owner);
  const baseImpact = initial.data.payload.changeImpact;
  const initialUnassessed = baseImpact.schemaVersion === 2 && baseImpact.formState === null && baseImpact.fitState === null && baseImpact.functionState === null && baseImpact.outcome === null;
  let incompleteCode = null;
  try {
    await created.service.submit(created.work.workId, owner, { idempotencyKey: "qa189-incomplete-submit", contractToken: initial.meta.contractToken, expectedRowVersion: initial.data.rowVersion });
  } catch (error) { incompleteCode = errorCode(error); }
  const payloads = [
    { ...initial.data.payload, changeImpact: { ...baseImpact, formState: "no_impact", fitState: "no_impact", functionState: "no_impact", replacement: null } },
    { ...initial.data.payload, changeImpact: { ...baseImpact, formState: "suspected_impact", fitState: "no_impact", functionState: "no_impact", replacement: null, reasonCategory: "fit_review", note: "suspected" } },
    { ...initial.data.payload, changeImpact: { ...baseImpact, formState: "confirmed_impact", fitState: "no_impact", functionState: "no_impact", reasonCategory: "form_change", note: "confirmed", replacement: { sourcePartNumberId: ids.part, reservedPartNumber: "A0002-P02", itemType: "self_made", detectedPartNumber: null, correctedPartNumber: null, attachmentSnapshot: null } } }
  ];
  let rowVersion = initial.data.rowVersion;
  const actualOutcomes = [];
  for (let index = 0; index < payloads.length; index += 1) {
    const updated = await created.service.update(created.work.workId, payloads[index], owner, { idempotencyKey: `qa189-update-${index}`, contractToken: initial.meta.contractToken, expectedRowVersion: rowVersion });
    rowVersion = updated.rowVersion;
    actualOutcomes.push(normalizeDrawingChangeImpact(updated.payload.changeImpact).outcome);
  }
  const stored = JSON.parse(context.database.prepare("SELECT proposed_payload FROM drawing_revision_works WHERE id=?").get(created.work.workId).proposed_payload);
  const expectedOutcomes = ["no_impact", "suspected_impact", "confirmed_impact"];
  const receipt = providerReceipt(context.database, { workId: created.work.workId, finalRowVersion: rowVersion });
  context.database.close();
  return { pass: initialUnassessed && incompleteCode === "DRAWING_FFF_INCOMPLETE" && JSON.stringify(actualOutcomes) === JSON.stringify(expectedOutcomes) && stored.changeImpact.replacement.reservedPartNumber === "A0002-P02", oracle: { initialStates: [null, null, null], incompleteCode: "DRAWING_FFF_INCOMPLETE", expectedOutcomes }, actual: { initialChangeImpact: baseImpact, incompleteCode, actualOutcomes, storedChangeImpact: stored.changeImpact }, providerReceipt: receipt };
});

async function approvedReplacementScenario(prefix) {
  const context = fresh();
  seedPart(context.database, { id: `part-${prefix}-replacement`, partNumber: "A0002-P02" });
  const created = await createDrawingWork(context, { idempotencyKey: `${prefix}-create` });
  const initial = await created.service.read(created.work.workId, owner);
  const impact = initial.data.payload.changeImpact;
  const updated = await created.service.update(created.work.workId, {
    ...initial.data.payload,
    changeImpact: { ...impact, formState: "confirmed_impact", fitState: "no_impact", functionState: "no_impact", reasonCategory: "form_change", note: prefix, replacement: { sourcePartNumberId: ids.part, reservedPartNumber: "A0002-P02", itemType: "self_made", detectedPartNumber: null, correctedPartNumber: null, attachmentSnapshot: null } }
  }, owner, { idempotencyKey: `${prefix}-impact`, contractToken: initial.meta.contractToken, expectedRowVersion: initial.data.rowVersion });
  const file2d = await created.service.uploadFile(created.work.workId, { file: new File([`${prefix}-2D`], "A0002-M01.SLDDRW", { type: "application/octet-stream" }) }, owner, { idempotencyKey: `${prefix}-2d`, contractToken: initial.meta.contractToken, expectedRowVersion: updated.rowVersion });
  const file3d = await created.service.uploadFile(created.work.workId, { file: new File([`${prefix}-3D`], "A0002-M01.SLDPRT", { type: "application/octet-stream" }) }, owner, { idempotencyKey: `${prefix}-3d`, contractToken: initial.meta.contractToken, expectedRowVersion: file2d.rowVersion });
  const submitted = await created.service.submit(created.work.workId, owner, { idempotencyKey: `${prefix}-submit`, contractToken: initial.meta.contractToken, expectedRowVersion: file3d.rowVersion });
  const reviewerList = await context.workbench.list(new URL("http://local?query=A0002-M01"), "drawing", reviewerView);
  const decisionContext = { idempotencyKey: `${prefix}-approve`, contractToken: reviewerList.meta.contractToken, expectedRowVersion: submitted.rowVersion };
  const decision = await created.service.decide(submitted.requestId, "approve", reviewer, decisionContext);
  const replay = await created.service.decide(submitted.requestId, "approve", reviewer, decisionContext);
  return { context, created, initial, updated, file2d, file3d, submitted, decision, replay };
}

await capture("QA-087-190", "REPOSITORY_REPLACEMENT_RELATION_APPROVE_ONCE_CANCEL_ZERO_RESIDUE", async () => {
  const approved = await approvedReplacementScenario("qa190");
  const links = approved.context.database.prepare("SELECT old_part_number_id, new_part_number_id, source_drawing_number_id, source_revision, reason_category, fff_summary_json FROM part_replacement_links").all();
  const approvedReceipt = providerReceipt(approved.context.database, { replacementLinkCount: links.length });
  approved.context.database.close();

  const cancelled = fresh();
  seedPart(cancelled.database, { id: "part-qa190-cancel-replacement", partNumber: "A0002-P02" });
  const cancelWork = await createDrawingWork(cancelled, { idempotencyKey: "qa190-cancel-create" });
  const cancelRead = await cancelWork.service.read(cancelWork.work.workId, owner);
  const cancelImpact = cancelRead.data.payload.changeImpact;
  const cancelUpdated = await cancelWork.service.update(cancelWork.work.workId, { ...cancelRead.data.payload, changeImpact: { ...cancelImpact, functionState: "confirmed_impact", reasonCategory: "function_change", replacement: { sourcePartNumberId: ids.part, reservedPartNumber: "A0002-P02", itemType: "self_made", detectedPartNumber: null, correctedPartNumber: null, attachmentSnapshot: null } } }, owner, { idempotencyKey: "qa190-cancel-update", contractToken: cancelRead.meta.contractToken, expectedRowVersion: cancelRead.data.rowVersion });
  await cancelWork.service.cancel(cancelWork.work.workId, owner, { idempotencyKey: "qa190-cancel", contractToken: cancelRead.meta.contractToken, expectedRowVersion: cancelUpdated.rowVersion });
  const cancelResidue = { works: cancelled.database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_works").get().count, links: cancelled.database.prepare("SELECT COUNT(*) AS count FROM part_replacement_links").get().count };
  const cancelReceipt = providerReceipt(cancelled.database, cancelResidue);
  cancelled.database.close();
  return { pass: links.length === 1 && links[0].old_part_number_id === ids.part && links[0].new_part_number_id === "part-qa190-replacement" && Number(cancelResidue.works) === 0 && Number(cancelResidue.links) === 0, oracle: { approveLinkCount: 1, cancelLinkCount: 0 }, actual: { approvedLink: links[0] ?? null, cancelResidue, decision: approved.decision, replay: approved.replay }, providerReceipt: { approved: approvedReceipt, cancelled: cancelReceipt } };
});

await capture("QA-087-191", "REPOSITORY_SINGLE_CURRENT_DRAWING_WRITER_NO_LEGACY_ROWS", async () => {
  const context = fresh();
  const before = { submissions: context.database.prepare("SELECT COUNT(*) AS count FROM submissions").get().count, fff: context.database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_fff_assessments").get().count };
  const created = await createDrawingWork(context, { idempotencyKey: "qa191-create" });
  const after = { currentWorks: context.database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_works").get().count, currentStates: context.database.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states WHERE work_id=?").get(created.work.workId).count, submissions: context.database.prepare("SELECT COUNT(*) AS count FROM submissions").get().count, fff: context.database.prepare("SELECT COUNT(*) AS count FROM drawing_revision_fff_assessments").get().count };
  const receipt = providerReceipt(context.database, after);
  context.database.close();
  return { pass: Number(after.currentWorks) === 1 && Number(after.currentStates) === 1 && after.submissions === before.submissions && after.fff === before.fff, oracle: { currentWriterRows: 1, legacyDelta: 0 }, actual: { before, after }, providerReceipt: receipt };
});

await capture("QA-087-192", "REPOSITORY_DRAWING_REVIEW_SNAPSHOT_STABLE_APPROVE_EXACTLY_ONCE", async () => {
  const scenario = await approvedReplacementScenario("qa192");
  const traces = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM pdm_review_traces").get().count;
  const pending = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM pdm_work_review_requests").get().count;
  const revisions = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM drawing_revisions WHERE revision='1.2' AND lifecycle_state='rd_controlled'").get().count;
  const policy = JSON.parse(scenario.context.database.prepare("SELECT policy_snapshot_json FROM drawing_revisions WHERE revision='1.2'").get().policy_snapshot_json);
  const receipt = providerReceipt(scenario.context.database, { traces, pending, revisions });
  scenario.context.database.close();
  return { pass: Number(traces) === 1 && Number(pending) === 0 && Number(revisions) === 1 && policy.changeImpact?.outcome === "confirmed_impact" && scenario.decision.acknowledged === true && scenario.replay.acknowledged === true, oracle: { traceCount: 1, pendingCount: 0, controlledRevisionCount: 1, snapshotOutcome: "confirmed_impact" }, actual: { traces, pending, revisions, policyChangeImpact: policy.changeImpact, decision: scenario.decision, replay: scenario.replay }, providerReceipt: receipt };
});

function insertTask(database, input) {
  database.prepare(`INSERT INTO numbering_task_items
    (id, company_id, task_type, entity_type, entity_id, title, message, risk_level, task_status, assigned_to, action_url, detail_json, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'part_number', ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`).run(
      input.id, ids.company, input.taskType ?? "manual", input.entityId ?? ids.part, input.title ?? input.id, input.message ?? input.id,
      input.riskLevel, ids.reviewer, input.actionUrl ?? "/numbering/drawings", JSON.stringify({ dueAt: input.dueAt ?? null }), ids.owner, input.createdAt, input.createdAt
    );
}

await capture("QA-087-194", "REPOSITORY_TASK_ORDER_RISK_DUE_CREATED_ID", async () => {
  const context = fresh();
  const fixtures = [
    { id: "task-info", riskLevel: "info", dueAt: "2026-08-27T00:00:00.000Z", createdAt: "2026-08-26T02:00:00.000Z" },
    { id: "task-critical-late", riskLevel: "critical", dueAt: "2026-08-29T00:00:00.000Z", createdAt: "2026-08-26T03:00:00.000Z" },
    { id: "task-critical-early", riskLevel: "critical", dueAt: "2026-08-28T00:00:00.000Z", createdAt: "2026-08-26T01:00:00.000Z" },
    { id: "task-warning", riskLevel: "warning", dueAt: null, createdAt: "2026-08-26T04:00:00.000Z" }
  ];
  fixtures.forEach((item) => insertTask(context.database, item));
  const repository = new AsyncNumberingRepository(context.client);
  const actualRows = await repository.listNumberingTasks({ companyId: ids.company, user: { id: ids.reviewer, role: "R&D Manager" }, status: "open" });
  const actual = actualRows.filter((item) => item.id.startsWith("task-")).map((item) => item.id);
  const expected = oracleTaskOrder(fixtures.map((item) => ({ id: item.id, severity: item.riskLevel, dueAt: item.dueAt, createdAt: item.createdAt }))).map((item) => item.id);
  const receipt = providerReceipt(context.database, { rowCount: actualRows.length });
  context.database.close();
  return { pass: JSON.stringify(actual) === JSON.stringify(expected), oracle: { expected }, actual: { order: actual }, providerReceipt: receipt };
});

await capture("QA-087-195", "REPOSITORY_TASK_ACTION_EXACT_IDENTITY_AND_SAFE_ROUTE", async () => {
  const context = fresh();
  insertTask(context.database, { id: "task-qa195", riskLevel: "critical", dueAt: "2026-08-27T00:00:00.000Z", createdAt: "2026-08-26T01:00:00.000Z", actionUrl: `/parts?detail=${encodeURIComponent(`cw_${ids.statePart}`)}` });
  const repository = new AsyncNumberingRepository(context.client);
  const row = (await repository.listNumberingTasks({ companyId: ids.company, user: { id: ids.reviewer, role: "R&D Manager" }, status: "open" })).find((item) => item.id === "task-qa195");
  const resolved = resolveTaskActionUrl(row?.actionUrl);
  const wrong = resolveTaskActionUrl("/api/admin/delete");
  const receipt = providerReceipt(context.database, { taskId: row?.id ?? null });
  context.database.close();
  return { pass: row?.entityId === ids.part && resolved.allowed === true && resolved.href.includes(encodeURIComponent(`cw_${ids.statePart}`)) && wrong.allowed === false, oracle: { entityId: ids.part, allowedPrefix: "/parts", disallowedPrefix: "/api/admin" }, actual: { row, resolved, wrong }, providerReceipt: receipt };
});

await capture("QA-087-196", "REPOSITORY_NOTIFICATION_READ_HANDLED_COUNTS_MATCH", async () => {
  const context = fresh();
  for (const item of [
    { id: "notification-critical", severity: "critical", createdAt: "2026-08-26T01:00:00.000Z" },
    { id: "notification-info", severity: "info", createdAt: "2026-08-26T03:00:00.000Z" }
  ]) {
    context.database.prepare(`INSERT INTO numbering_notifications
      (id, company_id, notification_type, entity_type, entity_id, title, message, severity, recipient_id, action_url, created_by, created_at, updated_at)
      VALUES (?, ?, 'qa196', 'part_number', ?, ?, ?, ?, ?, '/parts', ?, ?, ?)`).run(item.id, ids.company, ids.part, item.id, item.id, item.severity, ids.reviewer, ids.owner, item.createdAt, item.createdAt);
  }
  const repository = new AsyncNumberingRepository(context.client);
  const user = { id: ids.reviewer, role: "R&D Manager" };
  const beforeRows = await repository.listNumberingNotifications({ companyId: ids.company, user, read: "all", handled: "all" });
  await repository.updateNumberingNotificationState({ companyId: ids.company, notificationId: "notification-critical", user, markRead: true, markHandled: true });
  const readRows = await repository.listNumberingNotifications({ companyId: ids.company, user, read: "read", handled: "handled" });
  const projectedOrder = sortTaskCenterNotifications(beforeRows.filter((item) => item.id.startsWith("notification-"))).map((item) => item.id);
  const dbRow = context.database.prepare("SELECT read_at, handled_at FROM numbering_notifications WHERE id='notification-critical'").get();
  const receipt = providerReceipt(context.database, { readHandledCount: readRows.filter((item) => item.id.startsWith("notification-")).length });
  context.database.close();
  return { pass: projectedOrder[0] === "notification-critical" && readRows.some((item) => item.id === "notification-critical") && Boolean(dbRow.read_at) && Boolean(dbRow.handled_at), oracle: { first: "notification-critical", readHandledIds: ["notification-critical"] }, actual: { projectedOrder, readHandledIds: readRows.map((item) => item.id), dbRow }, providerReceipt: receipt };
});

await capture("QA-087-197", "REPOSITORY_EMPTY_IS_DISTINCT_FROM_PROVIDER_FAILURE", async () => {
  const context = fresh();
  const repository = new AsyncNumberingRepository(context.client);
  const empty = await repository.listNumberingTasks({ companyId: ids.company, user: { id: ids.reviewer, role: "R&D Manager" }, status: "open" });
  const throwingClient = new Proxy(context.client, {
    get(target, property) {
      if (["query", "queryOne", "execute", "transaction"].includes(String(property))) return async () => { throw new Error("QA197_PROVIDER_FAILURE"); };
      return Reflect.get(target, property);
    }
  });
  let failure = null;
  try { await new AsyncNumberingRepository(throwingClient).listNumberingTasks({ companyId: ids.company, user: { id: ids.reviewer, role: "R&D Manager" }, status: "open" }); }
  catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const receipt = providerReceipt(context.database, { emptyCount: empty.length });
  context.database.close();
  return { pass: empty.length === 0 && failure === "QA197_PROVIDER_FAILURE", oracle: { emptyResult: [], failureMustPropagate: "QA197_PROVIDER_FAILURE" }, actual: { emptyCount: empty.length, failure }, providerReceipt: receipt };
});

async function obsoleteScenario(entityType, decision, prefix, mutateDependency = false) {
  const context = fresh();
  const entityId = entityType === "drawing_number" ? ids.drawingNumber : ids.part;
  const impact = await getFormalObsoleteImpactAsync({ companyId: ids.company, entityType, entityId, client: context.client });
  const oracle = oracleObsoleteFingerprint({ entityType, entityCode: impact.entityCode, status: impact.recordStatus, dependencyTuples: impact.dependencies.map((item) => [item.kind, item.id, item.code, item.disposition]) });
  const repository = new AsyncNumberingRepository(context.client, () => "2026-08-26T04:00:00.000Z", (() => { let sequence = 0; return () => `${prefix}-${++sequence}`; })());
  const request = await repository.requestNumberingObsoleteApproval({
    companyId: ids.company,
    entityType,
    entityId,
    reason: `${prefix}-reason`,
    requestedBy: ids.owner,
    impactFingerprint: impact.fingerprint,
    impactDependencies: impact.dependencies
  });
  const snapshot = context.database.prepare("SELECT payload_json FROM approval_requests WHERE id=?").get(request.approvalRequest.id);
  if (mutateDependency) {
    if (entityType === "part_number") {
      const replacement = seedPart(context.database, { id: `${prefix}-dependency-part`, partNumber: "A0002-P09", sequence: 9, sequenceCode: "P09" });
      context.database.prepare(`INSERT INTO part_replacement_links
        (id, company_id, old_part_number_id, new_part_number_id, source_drawing_number_id, source_revision, reason_category, released_by)
        VALUES (?, ?, ?, ?, ?, '1', 'negative_stale', ?)`).run(`${prefix}-dependency-link`, ids.company, ids.part, replacement.id, ids.drawingNumber, ids.owner);
    } else {
      const related = seedPart(context.database, { id: `${prefix}-dependency-part`, partNumber: "A0002-P09", sequence: 9, sequenceCode: "P09" });
      context.database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
        VALUES (?, ?, ?, 'reference', ?)`).run(`${prefix}-dependency-link`, ids.drawingNumber, related.id, ids.owner);
    }
  }
  const beforeDecision = databaseFingerprint(context.database, ["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "part_replacement_links", "approval_requests", "approval_decisions", "audit_logs"]);
  let decisionResult = null;
  let failure = null;
  try {
    decisionResult = await repository.decideNumberingApproval({ companyId: ids.company, approvalRequestId: request.approvalRequest.id, approverRole: "rd_manager", approverId: ids.reviewer, decision, comment: `${prefix}-${decision}` });
  } catch (error) {
    failure = errorCode(error);
  }
  const afterDecision = databaseFingerprint(context.database, ["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "part_replacement_links", "approval_requests", "approval_decisions", "audit_logs"]);
  const entityStatus = entityType === "drawing_number"
    ? context.database.prepare("SELECT record_status FROM drawing_numbers WHERE id=?").get(entityId).record_status
    : context.database.prepare("SELECT record_status FROM part_numbers WHERE id=?").get(entityId).record_status;
  const receipt = providerReceipt(context.database, { approvalRequestId: request.approvalRequest.id, entityStatus });
  const output = { context, impact, oracle, request, snapshot: JSON.parse(snapshot.payload_json), decisionResult, failure, beforeDecision, afterDecision, entityStatus, receipt };
  return output;
}

await capture("QA-087-198", "REPOSITORY_DRAWING_OBSOLETE_REJECT_PRESERVES_FORMAL", async () => {
  const scenario = await obsoleteScenario("drawing_number", "rejected", "qa198");
  const decisionCount = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM approval_decisions WHERE approval_request_id=?").get(scenario.request.approvalRequest.id).count;
  scenario.context.database.close();
  return { pass: scenario.entityStatus === "Released" && scenario.decisionResult?.requestStatus === "rejected" && Number(decisionCount) === 1 && scenario.snapshot.impactFingerprint === scenario.impact.fingerprint, oracle: { formalStatus: "Released", requestStatus: "rejected", impact: scenario.oracle }, actual: { entityStatus: scenario.entityStatus, requestStatus: scenario.decisionResult?.requestStatus, snapshot: scenario.snapshot, decisionCount }, providerReceipt: scenario.receipt };
});

await capture("QA-087-199", "REPOSITORY_DRAWING_OBSOLETE_APPROVE_ATOMIC_AND_REPLAY_BLOCKED", async () => {
  const scenario = await obsoleteScenario("drawing_number", "approved", "qa199");
  const partStatus = scenario.context.database.prepare("SELECT record_status FROM part_numbers WHERE id=?").get(ids.part).record_status;
  let replay = null;
  try { await new AsyncNumberingRepository(scenario.context.client).decideNumberingApproval({ companyId: ids.company, approvalRequestId: scenario.request.approvalRequest.id, approverRole: "rd_manager", approverId: ids.reviewer, decision: "approved" }); }
  catch (error) { replay = errorCode(error); }
  const decisionCount = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM approval_decisions WHERE approval_request_id=?").get(scenario.request.approvalRequest.id).count;
  scenario.context.database.close();
  return { pass: scenario.entityStatus === "Obsolete" && partStatus === "MainDrawingInvalid" && Number(decisionCount) === 1 && String(replay).startsWith("APPROVAL_REQUEST_ALREADY_RESOLVED"), oracle: { drawingStatus: "Obsolete", impactedPartStatus: "MainDrawingInvalid", decisionCount: 1 }, actual: { drawingStatus: scenario.entityStatus, partStatus, decisionCount, replay }, providerReceipt: scenario.receipt };
});

await capture("QA-087-200", "REPOSITORY_PART_OBSOLETE_REJECT_PRESERVES_RELATIONS", async () => {
  const scenario = await obsoleteScenario("part_number", "rejected", "qa200");
  const linkCount = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM drawing_part_links WHERE part_number_id=?").get(ids.part).count;
  scenario.context.database.close();
  return { pass: scenario.entityStatus === "Released" && scenario.decisionResult?.requestStatus === "rejected" && Number(linkCount) === 1, oracle: { partStatus: "Released", relationCount: 1 }, actual: { partStatus: scenario.entityStatus, requestStatus: scenario.decisionResult?.requestStatus, relationCount: linkCount }, providerReceipt: scenario.receipt };
});

await capture("QA-087-201", "REPOSITORY_PART_OBSOLETE_REVALIDATES_FINGERPRINT_ZERO_WRITE_ON_STALE", async () => {
  const stale = await obsoleteScenario("part_number", "approved", "qa201-stale", true);
  const approvalStatus = stale.context.database.prepare("SELECT request_status FROM approval_requests WHERE id=?").get(stale.request.approvalRequest.id).request_status;
  const stalePartStatus = stale.context.database.prepare("SELECT record_status FROM part_numbers WHERE id=?").get(ids.part).record_status;
  const staleReceipt = providerReceipt(stale.context.database, { failure: stale.failure, approvalStatus, partStatus: stalePartStatus });
  stale.context.database.close();
  const approved = await obsoleteScenario("part_number", "approved", "qa201-approved");
  const approvedStatus = approved.entityStatus;
  const approvedReceipt = approved.receipt;
  approved.context.database.close();
  return { pass: stale.failure === "LIFE_OBSOLETE_SNAPSHOT_STALE" && stale.beforeDecision === stale.afterDecision && approvalStatus === "pending" && stalePartStatus === "Released" && approvedStatus === "Obsolete", oracle: { staleFailure: "LIFE_OBSOLETE_SNAPSHOT_STALE", staleDelta: 0, approvedStatus: "Obsolete" }, actual: { staleFailure: stale.failure, staleDelta: stale.beforeDecision === stale.afterDecision ? 0 : 1, approvalStatus, stalePartStatus, approvedStatus }, providerReceipt: { stale: staleReceipt, approved: approvedReceipt } };
});

async function createPartWork(prefix) {
  const context = fresh();
  const listing = await context.workbench.list(new URL("http://local?query=A0002-P01"), "part", ownerView);
  const formal = listing.data.groups.flatMap((group) => group.rows).find((row) => row.layer === "formal");
  if (!formal) throw new Error("PART_FORMAL_ROW_MISSING");
  const service = new PartChangeWorkService(context.client);
  const created = await service.create(ids.part, owner, { idempotencyKey: `${prefix}-create`, contractToken: listing.meta.contractToken, expectedRowVersion: formal.rowVersion });
  return { context, service, listing, formal, created };
}

await capture("QA-087-203", "REPOSITORY_PART_VARIANT_FOUR_FIELDS_SAVE_AND_RELOAD", async () => {
  const scenario = await createPartWork("qa203");
  const changed = changedPartPayload(scenario.created.payload, "qa203");
  const updated = await scenario.service.update(scenario.created.workId, changed, owner, { idempotencyKey: "qa203-update", contractToken: scenario.listing.meta.contractToken, expectedRowVersion: scenario.created.rowVersion });
  const reloaded = await scenario.service.read(scenario.created.workId, owner);
  const formal = scenario.context.database.prepare("SELECT COUNT(*) AS count FROM part_variant_attributes WHERE part_number_id=?").get(ids.part).count;
  const receipt = providerReceipt(scenario.context.database, { workId: scenario.created.workId, rowVersion: updated.rowVersion });
  scenario.context.database.close();
  const fields = ["materialCode", "colorCode", "surfaceTreatment", "variantNote"];
  return { pass: fields.every((field) => reloaded.data.payload[field] === changed[field]) && Number(formal) === 0, oracle: { saved: Object.fromEntries(fields.map((field) => [field, changed[field]])), formalDeltaBeforeApproval: 0 }, actual: { reloaded: Object.fromEntries(fields.map((field) => [field, reloaded.data.payload[field]])), formalAttributeRows: formal }, providerReceipt: receipt };
});

await capture("QA-087-204", "REPOSITORY_PART_REVIEW_USES_EXACT_SUBMIT_SNAPSHOT", async () => {
  const scenario = await createPartWork("qa204");
  const changed = changedPartPayload(scenario.created.payload, "qa204");
  const updated = await scenario.service.update(scenario.created.workId, changed, owner, { idempotencyKey: "qa204-update", contractToken: scenario.listing.meta.contractToken, expectedRowVersion: scenario.created.rowVersion });
  const submitted = await scenario.service.submit(scenario.created.workId, owner, { idempotencyKey: "qa204-submit", contractToken: scenario.listing.meta.contractToken, expectedRowVersion: updated.rowVersion });
  const request = scenario.context.database.prepare("SELECT snapshot_payload, snapshot_hash FROM pdm_work_review_requests WHERE id=?").get(submitted.requestId);
  const stored = typeof request.snapshot_payload === "string" ? JSON.parse(request.snapshot_payload) : request.snapshot_payload;
  const submittedTarget = stored.schemaVersion === "pdm-review-package-v2"
    ? stored.targets.find((target) => target.targetKey === stored.primaryTargetKey)?.workspace?.payload
    : stored;
  const before = databaseFingerprint(scenario.context.database, ["part_numbers", "part_variant_attributes", "part_change_works", "pdm_work_review_requests"]);
  let mutationFailure = null;
  try { await scenario.service.update(scenario.created.workId, { ...changed, variantNote: "must-not-change" }, owner, { idempotencyKey: "qa204-late-update", contractToken: scenario.listing.meta.contractToken, expectedRowVersion: updated.rowVersion }); }
  catch (error) { mutationFailure = errorCode(error); }
  const after = databaseFingerprint(scenario.context.database, ["part_numbers", "part_variant_attributes", "part_change_works", "pdm_work_review_requests"]);
  const receipt = providerReceipt(scenario.context.database, { requestId: submitted.requestId, snapshotHash: request.snapshot_hash });
  scenario.context.database.close();
  return { pass: submittedTarget?.variantNote === changed.variantNote && mutationFailure === "WORKBENCH_ROW_VERSION_CONFLICT" && before === after, oracle: { snapshotVariantNote: changed.variantNote, lateMutationFailure: "WORKBENCH_ROW_VERSION_CONFLICT", lateMutationDelta: 0 }, actual: { snapshot: stored, submittedTarget, snapshotHash: request.snapshot_hash, mutationFailure, delta: before === after ? 0 : 1 }, providerReceipt: receipt };
});

await capture("QA-087-205", "REPOSITORY_PART_VARIANT_CANCEL_RETURN_APPROVE_AND_STALE", async () => {
  const approve = await createPartWork("qa205-approve");
  const approvedPayload = changedPartPayload(approve.created.payload, "qa205-approved");
  const approveUpdated = await approve.service.update(approve.created.workId, approvedPayload, owner, { idempotencyKey: "qa205-approve-update", contractToken: approve.listing.meta.contractToken, expectedRowVersion: approve.created.rowVersion });
  const approveSubmitted = await approve.service.submit(approve.created.workId, owner, { idempotencyKey: "qa205-approve-submit", contractToken: approve.listing.meta.contractToken, expectedRowVersion: approveUpdated.rowVersion });
  const reviewerList = await approve.context.workbench.list(new URL("http://local?query=A0002-P01"), "part", reviewerView);
  await approve.service.decide(approveSubmitted.requestId, "approve", reviewer, { idempotencyKey: "qa205-approve-decision", contractToken: reviewerList.meta.contractToken, expectedRowVersion: approveSubmitted.rowVersion });
  const approvedActual = approve.context.database.prepare(`SELECT attr.material_code, attr.color_code, attr.surface_treatment, attr.variant_note
    FROM part_variant_attributes attr WHERE attr.part_number_id=?`).get(ids.part);
  const beforeStale = databaseFingerprint(approve.context.database, ["part_numbers", "part_variant_attributes", "part_approved_change_snapshots", "pdm_review_traces"]);
  let staleFailure = null;
  try { await approve.service.decide(approveSubmitted.requestId, "return_for_correction", reviewer, { idempotencyKey: "qa205-stale", contractToken: reviewerList.meta.contractToken, expectedRowVersion: approveSubmitted.rowVersion }); }
  catch (error) { staleFailure = errorCode(error); }
  const afterStale = databaseFingerprint(approve.context.database, ["part_numbers", "part_variant_attributes", "part_approved_change_snapshots", "pdm_review_traces"]);
  const approveReceipt = providerReceipt(approve.context.database, { staleFailure });
  approve.context.database.close();

  const cancel = await createPartWork("qa205-cancel");
  const cancelPayload = changedPartPayload(cancel.created.payload, "qa205-cancelled");
  const cancelUpdated = await cancel.service.update(cancel.created.workId, cancelPayload, owner, { idempotencyKey: "qa205-cancel-update", contractToken: cancel.listing.meta.contractToken, expectedRowVersion: cancel.created.rowVersion });
  await cancel.service.cancel(cancel.created.workId, owner, { idempotencyKey: "qa205-cancel-decision", contractToken: cancel.listing.meta.contractToken, expectedRowVersion: cancelUpdated.rowVersion });
  const cancelFormal = cancel.context.database.prepare("SELECT COUNT(*) AS count FROM part_variant_attributes WHERE part_number_id=?").get(ids.part).count;
  const cancelReceipt = providerReceipt(cancel.context.database, { formalAttributeRows: cancelFormal });
  cancel.context.database.close();

  const returned = await createPartWork("qa205-return");
  const returnPayload = changedPartPayload(returned.created.payload, "qa205-returned");
  const returnUpdated = await returned.service.update(returned.created.workId, returnPayload, owner, { idempotencyKey: "qa205-return-update", contractToken: returned.listing.meta.contractToken, expectedRowVersion: returned.created.rowVersion });
  const returnSubmitted = await returned.service.submit(returned.created.workId, owner, { idempotencyKey: "qa205-return-submit", contractToken: returned.listing.meta.contractToken, expectedRowVersion: returnUpdated.rowVersion });
  const returnReviewerList = await returned.context.workbench.list(new URL("http://local?query=A0002-P01"), "part", reviewerView);
  await returned.service.decide(returnSubmitted.requestId, "return_for_correction", reviewer, { idempotencyKey: "qa205-return-decision", contractToken: returnReviewerList.meta.contractToken, expectedRowVersion: returnSubmitted.rowVersion });
  const returnFacts = { formalAttributes: returned.context.database.prepare("SELECT COUNT(*) AS count FROM part_variant_attributes WHERE part_number_id=?").get(ids.part).count, workCount: returned.context.database.prepare("SELECT COUNT(*) AS count FROM part_change_works WHERE id=?").get(returned.created.workId).count, handling: returned.context.database.prepare("SELECT handling FROM canonical_workbench_states WHERE work_id=?").get(returned.created.workId)?.handling ?? null };
  const returnReceipt = providerReceipt(returned.context.database, returnFacts);
  returned.context.database.close();
  return { pass: approvedActual.material_code === approvedPayload.materialCode && approvedActual.color_code === approvedPayload.colorCode && approvedActual.surface_treatment === approvedPayload.surfaceTreatment && approvedActual.variant_note === approvedPayload.variantNote && staleFailure !== null && beforeStale === afterStale && Number(cancelFormal) === 0 && Number(returnFacts.formalAttributes) === 0 && Number(returnFacts.workCount) === 1 && returnFacts.handling === "owner", oracle: { approved: { material_code: approvedPayload.materialCode, color_code: approvedPayload.colorCode, surface_treatment: approvedPayload.surfaceTreatment, variant_note: approvedPayload.variantNote }, cancelFormalDelta: 0, returnFormalDelta: 0, staleDelta: 0 }, actual: { approvedActual, staleFailure, staleDelta: beforeStale === afterStale ? 0 : 1, cancelFormal, returnFacts }, providerReceipt: { approve: approveReceipt, cancel: cancelReceipt, returned: returnReceipt } };
});

await capture("QA-087-208", "REPOSITORY_HISTORY_EXACT_REVISION_BINDING_AND_HASH", async () => {
  const context = fresh({ rdLifecycle: "preparing" });
  context.database.prepare(`INSERT INTO file_assets
    (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name, uploaded_by)
    VALUES ('asset-qa208-ok', 'A0002-M01-RD.SLDDRW', 'slddrw', 'application/octet-stream', 12, 'qa208-content-hash', 'drawing_revision', ?, 'drawing_2d', 'RD exact history', ?)`).run(ids.rdRevision, ids.owner);
  context.database.prepare(`INSERT INTO drawing_revision_files
    (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by)
    VALUES ('binding-qa208-ok', ?, ?, 'asset-qa208-ok', 'drawing_2d', 'system', 'RD exact history', 1, ?)`).run(ids.company, ids.rdRevision, ids.owner);
  const readback = await readCanonicalDrawingHistoryRevision({ companyId: ids.company, drawingId: ids.drawing, revisionId: ids.rdRevision, client: context.client });
  const file = readback.data.files[0];
  const expectedHref = pdmFileReadHref({ fileAssetId: "asset-qa208-ok", context: "drawing_revision", contextId: ids.rdRevision, bindingId: "binding-qa208-ok" });
  const receipt = providerReceipt(context.database, { revisionId: readback.data.revisionId, fileCount: readback.data.files.length });
  context.database.close();
  return { pass: readback.data.revisionId === ids.rdRevision && file?.id === "binding-qa208-ok" && file?.contentHash === "qa208-content-hash" && file?.downloadHref === expectedHref && readback.meta.readOnly === true, oracle: { revisionId: ids.rdRevision, bindingId: "binding-qa208-ok", contentHash: "qa208-content-hash", href: expectedHref }, actual: { revisionId: readback.data.revisionId, file, readOnly: readback.meta.readOnly }, providerReceipt: receipt };
});

await capture("QA-087-209", "REPOSITORY_WORK_FILE_BINDING_EXACT_WORK_AND_ASSET", async () => {
  const context = fresh();
  const created = await createDrawingWork(context, { idempotencyKey: "qa209-create" });
  const uploaded = await created.service.uploadFile(created.work.workId, { file: new File(["QA209-PDF-BYTES"], "A0002-M01-note.pdf", { type: "application/pdf" }) }, owner, { idempotencyKey: "qa209-upload", contractToken: created.targets.meta.contractToken, expectedRowVersion: created.work.rowVersion });
  const readback = await created.service.read(created.work.workId, owner);
  const file = readback.data.files.find((item) => item.id === uploaded.file.id);
  const tuple = context.database.prepare(`SELECT binding.work_id, binding.file_binding_id, binding.content_hash, file.drawing_revision_id, file.source_file_asset_id, asset.content_hash AS asset_hash
    FROM drawing_revision_work_files binding
    JOIN drawing_revision_files file ON file.id=binding.file_binding_id
    JOIN file_assets asset ON asset.id=file.source_file_asset_id
    WHERE binding.work_id=? AND binding.file_binding_id=?`).get(created.work.workId, uploaded.file.id);
  const expectedHref = pdmFileReadHref({ fileAssetId: tuple.source_file_asset_id, context: "drawing_revision_work", contextId: created.work.workId, bindingId: tuple.file_binding_id });
  const receipt = providerReceipt(context.database, { workId: created.work.workId, bindingId: tuple.file_binding_id });
  context.database.close();
  return { pass: file?.source_file_asset_id === tuple.source_file_asset_id && tuple.work_id === created.work.workId && tuple.drawing_revision_id === created.work.revisionId && tuple.content_hash === tuple.asset_hash, oracle: { workId: created.work.workId, revisionId: created.work.revisionId, bindingId: uploaded.file.id, expectedHref }, actual: { file, tuple, expectedHref }, providerReceipt: receipt };
});

await capture("QA-087-210", "REPOSITORY_NONPRIMARY_WORK_FILE_REMOVE_READBACK_AND_REPLAY", async () => {
  const context = fresh();
  const created = await createDrawingWork(context, { idempotencyKey: "qa210-create-positive" });
  const uploaded = await created.service.uploadFile(created.work.workId, { file: new File(["QA210-PDF"], "remove-me.pdf", { type: "application/pdf" }) }, owner, { idempotencyKey: "qa210-upload-positive", contractToken: created.targets.meta.contractToken, expectedRowVersion: created.work.rowVersion });
  const removeContext = { idempotencyKey: "qa210-remove-positive", contractToken: created.targets.meta.contractToken, expectedRowVersion: uploaded.rowVersion };
  const removed = await created.service.removeFile(created.work.workId, uploaded.file.id, owner, removeContext);
  const replay = await created.service.removeFile(created.work.workId, uploaded.file.id, owner, removeContext);
  const facts = context.database.prepare(`SELECT
    (SELECT COUNT(*) FROM drawing_revision_work_files WHERE work_id=? AND file_binding_id=?) AS membership,
    (SELECT COUNT(*) FROM drawing_revision_files WHERE id=? AND removed_at IS NOT NULL) AS tombstoned_binding,
    (SELECT COUNT(*) FROM file_assets WHERE id=? AND deleted_at IS NOT NULL) AS tombstoned_asset`).get(created.work.workId, uploaded.file.id, uploaded.file.id, uploaded.file.sourceFileAssetId);
  const receipt = providerReceipt(context.database, facts);
  context.database.close();
  return { pass: removed.removed === true && JSON.stringify(replay) === JSON.stringify(removed) && Number(facts.membership) === 0 && Number(facts.tombstoned_binding) === 1 && Number(facts.tombstoned_asset) === 1, oracle: { membership: 0, tombstonedBinding: 1, tombstonedAsset: 1, replaySame: true }, actual: { removed, replay, facts }, providerReceipt: receipt };
});

await capture("QA-087-211", "REPOSITORY_MULTI_FILE_TERMINALS_AND_PARTIAL_FAILURE_NO_WRITE", async () => {
  const context = fresh();
  const created = await createDrawingWork(context, { idempotencyKey: "qa211-create" });
  let rowVersion = created.work.rowVersion;
  const uploaded = [];
  for (const [name, bytes] of [["A0002-M01.SLDDRW", "QA211-2D"], ["A0002-M01.SLDASM", "QA211-3D"], ["A0002-M01.pdf", "QA211-PDF"]]) {
    const result = await created.service.uploadFile(created.work.workId, { file: new File([bytes], name, { type: "application/octet-stream" }) }, owner, { idempotencyKey: `qa211-${name}`, contractToken: created.targets.meta.contractToken, expectedRowVersion: rowVersion });
    rowVersion = result.rowVersion;
    uploaded.push(result.file);
  }
  const beforeInvalid = databaseFingerprint(context.database, ["file_assets", "drawing_revision_files", "drawing_revision_work_files", "drawing_revision_works"]);
  let invalidFailure = null;
  try { await created.service.uploadFile(created.work.workId, { file: new File(["QA211-BAD"], "malware.exe", { type: "application/octet-stream" }) }, owner, { idempotencyKey: "qa211-invalid", contractToken: created.targets.meta.contractToken, expectedRowVersion: rowVersion }); }
  catch (error) { invalidFailure = errorCode(error); }
  const afterInvalid = databaseFingerprint(context.database, ["file_assets", "drawing_revision_files", "drawing_revision_work_files", "drawing_revision_works"]);
  const readback = await created.service.read(created.work.workId, owner);
  const roles = readback.data.files.map((item) => item.role).sort();
  const receipt = providerReceipt(context.database, { fileCount: readback.data.files.length, invalidFailure });
  context.database.close();
  return { pass: JSON.stringify(roles) === JSON.stringify(["cad_3d", "drawing_2d", "pdf"]) && invalidFailure === "DRAWING_REVISION_FILE_ROLE_INVALID" && beforeInvalid === afterInvalid && readback.data.readonly === false, oracle: { roles: ["cad_3d", "drawing_2d", "pdf"], invalidFailure: "DRAWING_REVISION_FILE_ROLE_INVALID", invalidDelta: 0 }, actual: { roles, invalidFailure, invalidDelta: beforeInvalid === afterInvalid ? 0 : 1, readonly: readback.data.readonly, uploaded }, providerReceipt: receipt };
});

function seedDiscoveryFixture(context) {
  const part2 = seedPart(context.database, { id: "part-qa214-p02", partNumber: "A0002-P02", sequence: 2, sequenceCode: "P02", seriesCode: "S2", itemKind: "purchased", materialCode: "AL6061", colorCode: "BK", surfaceTreatment: "ANODIZE", variantNote: "discovery" });
  const part3 = seedPart(context.database, { id: "part-qa214-p03", partNumber: "A0002-P03", sequence: 3, sequenceCode: "P03", seriesCode: "S3", itemKind: "manufactured", materialCode: "SUS304", colorCode: "SL" });
  const drawing2 = seedDrawing(context.database, part2, { drawingNumberId: "drawing-number-qa214-r01", drawingId: "drawing-qa214-r01", revisionId: "revision-qa214-r01-1", drawingNumber: "A0002-R01", purpose: "R", sequence: 1 });
  const drawing3 = seedDrawing(context.database, part3, { drawingNumberId: "drawing-number-qa214-ot01", drawingId: "drawing-qa214-ot01", revisionId: "revision-qa214-ot01-1", drawingNumber: "A0002-OT01", purpose: "OT", sequence: 1, purposeDescription: "其他圖" });
  return { part2, part3, drawing2, drawing3 };
}

await capture("QA-087-214", "REPOSITORY_DRAWING_FILTERS_PRECEDE_BIDIRECTIONAL_PAGINATION", async () => {
  const context = fresh();
  seedDiscoveryFixture(context);
  const purposeOnly = await context.workbench.list(new URL("http://local?purpose=R&sort=asc&limit=100"), "drawing", ownerView);
  const filtered = await context.workbench.list(new URL("http://local?purpose=R&series=S2&query=R01&sort=asc&limit=1"), "drawing", ownerView);
  const page1 = await context.workbench.list(new URL("http://local?sort=asc&limit=1"), "drawing", ownerView);
  const page2 = await context.workbench.list(new URL(`http://local?sort=asc&limit=1&cursor=${encodeURIComponent(page1.data.nextCursor)}`), "drawing", ownerView);
  const back = await context.workbench.list(new URL(`http://local?sort=asc&limit=1&cursor=${encodeURIComponent(page2.data.previousCursor)}`), "drawing", ownerView);
  let purposeCursorMismatch = null;
  try { await context.workbench.list(new URL(`http://local?purpose=R&sort=asc&limit=1&cursor=${encodeURIComponent(page1.data.nextCursor)}`), "drawing", ownerView); }
  catch (error) { purposeCursorMismatch = errorCode(error); }
  const purposeActualIds = purposeOnly.data.groups.map((group) => group.rows[0]?.entityId).filter(Boolean);
  const purposeSqlIds = context.database.prepare(`SELECT drawing.id
    FROM drawings drawing
    WHERE drawing.company_id=? AND drawing.purpose_code='R'
      AND EXISTS (SELECT 1 FROM canonical_workbench_states state
        WHERE state.company_id=drawing.company_id AND state.entity_type='drawing' AND state.canonical_entity_id=drawing.id)
    ORDER BY COALESCE(drawing.drawing_number, ''), drawing.id`).all(ids.company).map((row) => row.id);
  const filteredCodes = filtered.data.groups.flatMap((group) => group.rows).map((row) => row.code);
  const page1Code = page1.data.groups[0]?.rows[0]?.code ?? null;
  const page2Code = page2.data.groups[0]?.rows[0]?.code ?? null;
  const backCode = back.data.groups[0]?.rows[0]?.code ?? null;
  const receipt = providerReceipt(context.database, { totalGroups: page1.data.totalGroups });
  context.database.close();
  return {
    pass: JSON.stringify(purposeActualIds) === JSON.stringify(purposeSqlIds)
      && purposeActualIds.length > 0
      && JSON.stringify(filteredCodes) === JSON.stringify(["A0002-R01"])
      && page1Code !== page2Code && backCode === page1Code
      && Boolean(page1.data.nextCursor) && Boolean(page2.data.previousCursor)
      && purposeCursorMismatch === "WORKBENCH_BAD_REQUEST",
    oracle: { purposeSqlIds, filteredCodes: ["A0002-R01"], backReturnsFirst: true, noDuplicateAdjacentPages: true, purposeCursorMismatch: "WORKBENCH_BAD_REQUEST" },
    actual: { purposeActualIds, filteredCodes, page1Code, page2Code, backCode, purposeCursorMismatch, cursors: { next: Boolean(page1.data.nextCursor), previous: Boolean(page2.data.previousCursor) } },
    providerReceipt: receipt
  };
});

await capture("QA-087-215", "REPOSITORY_PART_FILTER_AND_SEMANTICS_MATCH_SQL_ORACLE", async () => {
  const context = fresh();
  seedDiscoveryFixture(context);
  const result = await context.workbench.list(new URL("http://local?itemKind=purchased&series=S2&material=AL6061&color=BK&query=P02&sort=asc"), "part", ownerView);
  const actualIds = result.data.groups.flatMap((group) => group.rows).map((row) => row.entityId);
  const sqlIds = context.database.prepare(`SELECT part.id
    FROM part_numbers part
    JOIN part_variant_attributes attr ON attr.part_number_id=part.id
    WHERE part.company_id=? AND part.item_kind='purchased' AND part.series_code='S2'
      AND (attr.material_code='AL6061' OR attr.material_label='AL6061')
      AND (attr.color_code='BK' OR attr.color_label='BK')
      AND (LOWER(part.part_number) LIKE '%p02%' OR LOWER(part.part_name) LIKE '%p02%')
    ORDER BY part.part_number, part.id`).all(ids.company).map((row) => row.id);
  const receipt = providerReceipt(context.database, { resultCount: actualIds.length });
  context.database.close();
  return { pass: JSON.stringify(actualIds) === JSON.stringify(sqlIds) && actualIds.length === 1, oracle: { sqlIds, semantics: "AND_across_dimensions_OR_within_code_label" }, actual: { actualIds }, providerReceipt: receipt };
});

await capture("QA-087-216", "REPOSITORY_CURSOR_FORWARD_BACKWARD_NO_GAP_DUPLICATE", async () => {
  const context = fresh();
  seedDiscoveryFixture(context);
  const first = await context.workbench.list(new URL("http://local?sort=asc&limit=1"), "part", ownerView);
  const second = await context.workbench.list(new URL(`http://local?sort=asc&limit=1&cursor=${encodeURIComponent(first.data.nextCursor)}`), "part", ownerView);
  const third = await context.workbench.list(new URL(`http://local?sort=asc&limit=1&cursor=${encodeURIComponent(second.data.nextCursor)}`), "part", ownerView);
  const back = await context.workbench.list(new URL(`http://local?sort=asc&limit=1&cursor=${encodeURIComponent(second.data.previousCursor)}`), "part", ownerView);
  const codes = [first, second, third].map((page) => page.data.groups[0]?.rows[0]?.code ?? null);
  const backCode = back.data.groups[0]?.rows[0]?.code ?? null;
  const sqlRows = context.database.prepare("SELECT id, part_number AS code FROM part_numbers WHERE company_id=? ORDER BY part_number, id").all(ids.company).map((row) => ({ id: row.id, groupKey: row.id, code: row.code }));
  const oracle = oracleGroupedCursor({ rows: sqlRows, sort: { field: "code", direction: "asc" }, limit: 3 });
  const receipt = providerReceipt(context.database, { totalGroups: first.data.totalGroups });
  context.database.close();
  return { pass: new Set(codes).size === 3 && codes.every(Boolean) && backCode === codes[0] && JSON.stringify(codes) === JSON.stringify(oracle.rows.slice(0, 3).map((row) => row.code)), oracle, actual: { codes, backCode, cursors: { firstNext: Boolean(first.data.nextCursor), secondNext: Boolean(second.data.nextCursor), secondPrevious: Boolean(second.data.previousCursor) } }, providerReceipt: receipt };
});

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify({
  schemaVersion: 1,
  taskOwnedEnvironment: { taskRoot, dataDir, repositoryDir, port: null, runtime: false },
  results,
  cleanupReceipt: { status: "pending_parent", taskRootRemoved: false }
}, null, 2)}\n`, "utf8");

if (results.some((item) => item.result !== "PASS")) process.exitCode = 1;
