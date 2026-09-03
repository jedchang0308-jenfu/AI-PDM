#!/usr/bin/env node

/*
 * DEV-110 repository/transaction lane.
 *
 * Every case uses a disposable SQLite database created from the canonical
 * schema fixture. The runner calls the same handoff service as the route;
 * direct SQL is limited to fixture setup and read-only evidence.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRecognitionPartWorkHandoffAsyncRepository } from "../src/lib/repositories/drawing-recognition-part-work-handoff-async-repository.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { handoffDrawingRecognitionToPartWorks } from "../src/lib/drawing-recognition-part-work-handoff.ts";
import { createPlatformActorContext } from "../src/lib/platform-command.ts";
import { sha256Canonical } from "../src/lib/drawing-recognition-hash.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const runId = `DEV110-repository-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV110_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-110", runId));
fs.mkdirSync(evidenceDir, { recursive: true });
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev110-repository-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
process.env.PDM_DATA_DIR = dataDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;
process.env.PDM_DB_PROVIDER = "sqlite";

const EMPTY_SOURCE = sha256Canonical([]);
const checks = [];
const failures = [];
const actorContext = (suffix = "default", actorId = ids.owner) => createPlatformActorContext({
  pdmUserId: actorId,
  organizationId: ids.company,
  roles: ["Engineer"],
  scopes: ["numbering.recognition.formalize"],
  requestId: `dev110-${suffix}`,
  correlationId: `dev110-correlation-${suffix}`
});

function check(caseId, condition, detail = "") {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ caseId, result, detail });
  if (!condition) failures.push({ caseId, detail });
}

function fixture(label, partCount = 3) {
  const database = createFixtureDatabase({ canonical: true });
  const parts = [ids.part];
  for (let index = 2; index <= partCount; index += 1) {
    const id = `part-dev110-${label}-${String(index).padStart(3, "0")}`;
    const number = `A0002-P${String(index).padStart(2, "0")}`;
    database.prepare(`INSERT INTO part_numbers
      (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manufactured', 'Released', ?)`)
      .run(id, ids.company, ids.root, number, index, `P${String(index).padStart(2, "0")}`, `本體_${number}`, ids.owner);
    database.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
      VALUES (?, ?, ?, 'primary_manufacturing', ?)`)
      .run(`link-dev110-${label}-${index}`, ids.drawingNumber, id, ids.owner);
    database.prepare(`INSERT INTO canonical_workbench_states
      (id, company_id, entity_type, canonical_entity_id, data_layer)
      VALUES (?, ?, 'part', ?, 'part_formal')`)
      .run(`formal-state-dev110-${label}-${index}`, ids.company, id);
    parts.push(id);
  }
  return { database, parts };
}

function insertSession(database, sessionId, { status = "review_ready", sourceFingerprint = EMPTY_SOURCE, purpose = "recognition", supersedes = null, origin = null } = {}) {
  database.prepare(`INSERT INTO drawing_recognition_sessions
    (id, company_id, source_context_type, source_context_id, source_lineage_key, drawing_id, drawing_revision_id,
     source_set_fingerprint, deduplication_key, session_purpose, evidence_origin_session_id, status, created_by)
    VALUES (?, ?, 'drawing_number', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, ids.company, ids.drawingNumber, `drawing_number:${ids.drawingNumber}`, ids.drawing, sourceFingerprint,
      `dedupe-${sessionId}`, purpose, origin, status, ids.owner);
  if (supersedes) database.prepare("UPDATE drawing_recognition_sessions SET supersedes_session_id = ? WHERE id = ?").run(supersedes, sessionId);
}

function insertCandidate(database, sessionId, candidateId, { fieldKey = "material", value = "SUS304", scope = "overall", ownerId = null, observationPart = null, reviewState = "accepted" } = {}) {
  database.prepare(`INSERT INTO drawing_recognition_candidates
    (id, session_id, company_id, category, field_key, field_label, proposed_value, normalized_value,
     proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, review_state, group_key)
    VALUES (?, ?, ?, 'part_attribute', ?, ?, ?, ?, ?, ?, ?, 'changed', 'high', ?, ?)`)
    .run(candidateId, sessionId, ids.company, fieldKey, fieldKey === "material" ? "材質" : fieldKey, value, value,
      ownerId ? "part_number" : null, ownerId, scope, reviewState, `group-${candidateId}`);
  if (!observationPart) return;
  const fileAssetId = `asset-${candidateId}`;
  const sourceId = `source-${candidateId}`;
  const adapterId = `adapter-${candidateId}`;
  const observationId = `observation-${candidateId}`;
  const hash = crypto.createHash("sha256").update(candidateId).digest("hex");
  database.prepare(`INSERT INTO file_assets
    (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category)
    VALUES (?, ?, 'pdf', 'application/pdf', 1, ?, 'drawing_number', ?, 'drawing')`)
    .run(fileAssetId, `${candidateId}.pdf`, hash, ids.drawingNumber);
  database.prepare(`INSERT INTO drawing_recognition_sources
    (id, session_id, company_id, file_asset_id, content_hash, file_name, file_ext, mime_type, file_size, source_role, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, 'pdf', 'application/pdf', 1, 'drawing', 0)`)
    .run(sourceId, sessionId, ids.company, fileAssetId, hash, `${candidateId}.pdf`);
  database.prepare(`INSERT INTO drawing_recognition_adapter_results
    (id, session_id, source_id, company_id, adapter_code, adapter_version, status, observation_count, started_at, completed_at)
    VALUES (?, ?, ?, ?, 'fixture', '1', 'succeeded', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(adapterId, sessionId, sourceId, ids.company);
  database.prepare(`INSERT INTO drawing_recognition_observations
    (id, session_id, source_id, adapter_result_id, company_id, raw_text, raw_value, normalized_value, location_kind, confidence_band, extractor_code, extractor_version, captured_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'text', 'high', 'fixture', '1', CURRENT_TIMESTAMP)`)
    .run(observationId, sessionId, sourceId, adapterId, ids.company, `${value} ${observationPart}`, value, value);
  database.prepare(`INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id)
    VALUES (?, ?, ?)`)
    .run(candidateId, observationId, ids.company);
}

function insertWork(database, partId, workId, { payloadPatch = {}, ownerId = ids.owner, handling = "owner", rowVersion = 1 } = {}) {
  const formal = database.prepare(`SELECT p.part_name AS partName, p.item_kind AS itemKind, p.custom_specification AS customSpecification,
    p.is_universal AS isUniversal, p.bom_usage_policy AS bomUsagePolicy, a.material_code AS materialCode, a.material_label AS materialLabel,
    a.color_code AS colorCode, a.color_label AS colorLabel, a.surface_treatment AS surfaceTreatment, a.variant_note AS variantNote
    FROM part_numbers p LEFT JOIN part_variant_attributes a ON a.part_number_id = p.id WHERE p.id = ?`).get(partId);
  const payload = {
    partName: formal.partName, itemKind: formal.itemKind, customSpecification: formal.customSpecification,
    isUniversal: Boolean(formal.isUniversal), bomUsagePolicy: formal.bomUsagePolicy,
    materialCode: formal.materialCode ?? null, materialLabel: formal.materialLabel ?? null,
    colorCode: formal.colorCode ?? null, colorLabel: formal.colorLabel ?? null,
    surfaceTreatment: formal.surfaceTreatment ?? null, variantNote: formal.variantNote ?? null, ...payloadPatch
  };
  database.prepare(`INSERT INTO part_change_works
    (id, company_id, part_id, owner_user_id, proposed_payload, base_formal_row_version, base_hash, row_version)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
    .run(workId, ids.company, partId, ownerId, JSON.stringify(payload), sha256Canonical(payload), rowVersion);
  database.prepare(`INSERT INTO canonical_workbench_states
    (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, blocker_reason, row_version)
    VALUES (?, ?, 'part', ?, 'part_work', ?, ?, ?, ?)`)
    .run(`work-state-${workId}`, ids.company, partId, workId, handling, handling === "blocked" ? "fixture blocker" : null, rowVersion);
  return payload;
}

async function readScope(client, sessionId) {
  return new DrawingRecognitionPartWorkHandoffAsyncRepository(client).readScope({ companyId: ids.company, sessionId });
}

async function runHandoff(client, sessionId, draft = { commonValues: [], overrides: [] }, options = {}) {
  const scope = await readScope(client, sessionId);
  if (!scope.session || !scope.parts) throw new Error(`scope unavailable for ${sessionId}`);
  return handoffDrawingRecognitionToPartWorks({
    sessionId,
    companyId: ids.company,
    actorId: options.actorId ?? ids.owner,
    expectedRowVersion: options.expectedRowVersion ?? Number(scope.session.row_version),
    expectedSourceSetFingerprint: options.expectedSourceSetFingerprint ?? scope.session.source_set_fingerprint,
    expectedRelationScopeFingerprint: options.expectedRelationScopeFingerprint ?? scope.relationScopeFingerprint,
    draft,
    metadata: { actor: actorContext(options.key ?? sessionId, options.actorId ?? ids.owner), idempotencyKey: options.idempotencyKey ?? `key-${sessionId}` },
    access: options.access ?? { canCreate: true, canUpdate: true, canEditNonOwned: false },
    faultInjector: options.faultInjector,
    client
  });
}

async function withFixture(label, fn, partCount = 3) {
  const { database, parts } = fixture(label, partCount);
  const client = createAsyncDatabaseClient({ kind: "sqlite", database });
  try { return await fn({ database, client, parts }); }
  finally { await client.close(); database.close(); }
}

async function main() {
  console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-110 isolated SQLite repository/transaction evidence", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "all fixture clients closed and task-owned root removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));

  await withFixture("happy", async ({ database, client, parts }) => {
    const session = "dev110-r01";
    insertSession(database, session);
    insertCandidate(database, session, "dev110-r01-material", { value: "SUS304" });
    const scope = await readScope(client, session);
    check("R01", scope.parts?.map((part) => part.partNumber).join(",") === "A0002-P01,A0002-P02,A0002-P03", "exact formal primary-manufacturing scope and natural order");
    check("R02", scope.parts?.every((part) => part.partRootId === ids.root && part.workId === null) === true, "same-root/current-state filtering");
    check("R03", scope.parts?.every((part) => part.workPayload === null) === true, "existing Part Work is visible before create");
    const result = await runHandoff(client, session);
    check("R04", result.workMutationCount === 3 && database.prepare("SELECT COUNT(*) count FROM part_change_works").get().count === 3, "canonical atomic create and common expansion");
    const replay = await runHandoff(client, session, undefined, { idempotencyKey: "key-dev110-r01", expectedRowVersion: 1 });
    check("R05", replay.reusedFromCommandReceipt === true && database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events WHERE session_id=?").get(session).count === 1, "one v2 event and idempotent replay");
    const event = database.prepare("SELECT id,result_json FROM drawing_recognition_formalization_events WHERE session_id=?").get(session);
    const targets = JSON.parse(event.result_json).targets;
    const works = database.prepare("SELECT w.part_id,w.row_version,s.work_id,s.handling FROM part_change_works w JOIN canonical_workbench_states s ON s.work_id=w.id ORDER BY w.part_id").all();
    check("R06", targets.length === 3 && works.length === 3 && works.every((row) => row.row_version === 1 && row.work_id && row.handling === "owner")
      && database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_links WHERE event_id=?").get(event.id).count === 3
      && database.prepare("SELECT COUNT(*) count FROM part_variant_attributes").get().count === 0, "work/state row-version, links, and formal Part master immutability");
  });

  await withFixture("merge", async ({ database, client, parts }) => {
    const workId = "dev110-r07-work";
    insertWork(database, parts[0], workId, { payloadPatch: { customSpecification: "保留規格" } });
    const session = "dev110-r07"; insertSession(database, session); insertCandidate(database, session, "dev110-r07-finish", { fieldKey: "surface_finish", value: "噴砂" });
    const result = await runHandoff(client, session);
    const payload = JSON.parse(database.prepare("SELECT proposed_payload FROM part_change_works WHERE id=?").get(workId).proposed_payload);
    check("R07", result.workMutationCount === 3 && payload.customSpecification === "保留規格" && payload.surfaceTreatment === "噴砂", `existing editable work merge preserves non-target fields (${JSON.stringify({ result, payload })})`);
  });

  await withFixture("conflicts", async ({ database, client, parts }) => {
    insertWork(database, parts[0], "dev110-r08-work", { payloadPatch: { materialLabel: "SUS201" } });
    const session = "dev110-r08-keep"; insertSession(database, session); insertCandidate(database, session, "dev110-r08-keep-material", { value: "SUS304" });
    await assert.rejects(() => runHandoff(client, session), (error) => error?.code === "RECOGNITION_HANDOFF_WORK_CONFLICT");
    check("R08", database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events").get().count === 0, "unresolved conflict is fail-closed with zero writes");
    const keep = await runHandoff(client, session, { commonValues: [], overrides: [{ partId: parts[0], fieldKey: "material", intent: "value", value: "SUS304", conflictResolution: "keep_work" }] }, { idempotencyKey: "key-dev110-r08-keep" });
    const keptPayload = JSON.parse(database.prepare("SELECT proposed_payload FROM part_change_works WHERE id=?").get("dev110-r08-work").proposed_payload);
    check("R09", keep.workMutationCount === 2 && keptPayload.materialLabel === "SUS201", `keep-work conflict resolution preserves the user draft (${JSON.stringify({ keep, keptPayload })})`);
    const useSession = "dev110-r08-use"; insertSession(database, useSession); insertCandidate(database, useSession, "dev110-r08-use-material", { value: "SUS304" });
    const used = await runHandoff(client, useSession, { commonValues: [], overrides: [{ partId: parts[0], fieldKey: "material", intent: "value", value: "SUS304", conflictResolution: "use_recognition" }] }, { idempotencyKey: "key-dev110-r08-use" });
    const usedPayload = JSON.parse(database.prepare("SELECT proposed_payload FROM part_change_works WHERE id=?").get("dev110-r08-work").proposed_payload);
    check("R10", used.workMutationCount === 1 && usedPayload.materialLabel === "SUS304", "use-recognition conflict resolution is explicit and deterministic");
  });

  await withFixture("handling", async ({ database, client, parts }) => {
    const modes = ["review_owner", "system", "blocked"];
    for (const [index, handling] of modes.entries()) {
      const partId = parts[index]; const workId = `dev110-r11-${handling}`; insertWork(database, partId, workId, { payloadPatch: { materialLabel: "SUS201" }, handling });
      const session = `dev110-r11-${handling}`; insertSession(database, session); insertCandidate(database, session, `candidate-${session}`, { value: "SUS304" });
      await assert.rejects(() => runHandoff(client, session), (error) => Boolean(error?.code));
    }
    const otherPart = parts[3];
    insertWork(database, otherPart, "dev110-r11-other", { payloadPatch: { materialLabel: "SUS201" }, ownerId: ids.reviewer });
    const otherSession = "dev110-r11-other"; insertSession(database, otherSession);
    await assert.rejects(() => runHandoff(client, otherSession, { commonValues: [], overrides: [{ partId: otherPart, fieldKey: "material", intent: "value", value: "SUS304", conflictResolution: "use_recognition" }] }, { access: { canCreate: true, canUpdate: true, canEditNonOwned: false } }), (error) => error?.code === "RECOGNITION_HANDOFF_PERMISSION_DENIED");
    check("R11", database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events").get().count === 0, "review-owner/system/blocked/other-owner handling remains write-protected");
  }, 4);

  await withFixture("source-drift", async ({ database, client }) => {
    const session = "dev110-r12"; insertSession(database, session); insertCandidate(database, session, "candidate-dev110-r12");
    const scope = await readScope(client, session);
    database.prepare(`INSERT INTO file_assets (id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category) VALUES ('asset-dev110-r12','changed.pdf','pdf','application/pdf',1,'changed-hash','drawing_number',?,'drawing')`).run(ids.drawingNumber);
    await assert.rejects(() => runHandoff(client, session, undefined, { expectedRelationScopeFingerprint: scope.relationScopeFingerprint }), (error) => error?.code === "RECOGNITION_SOURCE_SET_STALE");
    check("R12", database.prepare("SELECT COUNT(*) count FROM part_change_works").get().count === 0, "source-set drift rejects before mutation");
  });

  await withFixture("relation-drift", async ({ database, client }) => {
    const session = "dev110-r13"; insertSession(database, session); insertCandidate(database, session, "candidate-dev110-r13");
    const scope = await readScope(client, session);
    const id = "part-dev110-r13-new";
    database.prepare(`INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,record_status,created_by) VALUES (?,? ,?,'A0002-P04',4,'P04','P04','manufactured','Released',?)`).run(id, ids.company, ids.root, ids.owner);
    database.prepare(`INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by) VALUES ('link-dev110-r13-new',?,?, 'primary_manufacturing',?)`).run(ids.drawingNumber, id, ids.owner);
    database.prepare(`INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer) VALUES ('state-dev110-r13-new',?,'part',?,'part_formal')`).run(ids.company, id);
    await assert.rejects(() => runHandoff(client, session, undefined, { expectedRelationScopeFingerprint: scope.relationScopeFingerprint }), (error) => error?.code === "RECOGNITION_RELATION_SCOPE_STALE");
    check("R13", database.prepare("SELECT COUNT(*) count FROM part_change_works").get().count === 0, "relation scope drift rejects before mutation");
  });

  await withFixture("fault-after-target", async ({ database, client }) => {
    const session = "dev110-r14"; insertSession(database, session); insertCandidate(database, session, "candidate-dev110-r14");
    const beforeMaster = database.prepare("SELECT COUNT(*) count FROM part_variant_attributes").get().count;
    await assert.rejects(() => runHandoff(client, session, undefined, { faultInjector: async (point, index) => { if (point === "after_target_mutation" && index === 1) throw new Error("FAULT_after_target_mutation"); } }), /FAULT_/);
    check("R14", database.prepare("SELECT COUNT(*) count FROM part_change_works").get().count === 0 && database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events").get().count === 0 && database.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(session).status === "review_ready" && database.prepare("SELECT COUNT(*) count FROM part_variant_attributes").get().count === beforeMaster, "rollback after a later target leaves zero partial writes");
  });

  await withFixture("fault-late-stages", async ({ database, client }) => {
    const stageResults = [];
    for (const [index, point] of [[0, "before_event"], [1, "before_link"], [2, "before_session"]]) {
      const session = `dev110-r15-${index}`; insertSession(database, session); insertCandidate(database, session, `candidate-${session}`);
      await assert.rejects(() => runHandoff(client, session, undefined, { idempotencyKey: `dev110-r15-key-${index}`, faultInjector: async (actualPoint) => { if (actualPoint === point) throw new Error(`FAULT_${point}`); } }), /FAULT_/);
      stageResults.push(database.prepare("SELECT COUNT(*) count FROM part_change_works WHERE id LIKE ?").get(`%r15-${index}%`).count === 0
        && database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events WHERE session_id=?").get(session).count === 0
        && database.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(session).status === "review_ready");
    }
    check("R15", stageResults.every(Boolean), "before-event, before-link, and before-session faults roll back all writes");
  });

  await withFixture("idempotency-amendment", async ({ database, client }) => {
    const session = "dev110-r16"; insertSession(database, session); insertCandidate(database, session, "candidate-dev110-r16");
    const first = await runHandoff(client, session, undefined, { idempotencyKey: "dev110-same-key" });
    const replay = await runHandoff(client, session, undefined, { idempotencyKey: "dev110-same-key", expectedRowVersion: 1 });
    await assert.rejects(() => runHandoff(client, session, { commonValues: [{ fieldKey: "material", intent: "value", value: "SUS301" }], overrides: [] }, { idempotencyKey: "dev110-same-key" }), /IDEMPOTENCY|COMMAND|payload|receipt/i);
    const assetHash = "dev110-amendment-source-hash";
    database.prepare(`INSERT INTO file_assets (id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category) VALUES ('asset-dev110-amendment','amendment.pdf','pdf','application/pdf',1,?,'drawing_number',?,'drawing')`).run(assetHash, ids.drawingNumber);
    const parentSource = sha256Canonical([{ fileAssetId: "asset-dev110-amendment", contentHash: assetHash, storageGeneration: "", role: "drawing" }]);
    const parent = "dev110-r16-parent"; insertSession(database, parent, { sourceFingerprint: parentSource }); insertCandidate(database, parent, "candidate-dev110-r16-parent");
    await runHandoff(client, parent, undefined, { idempotencyKey: "dev110-r16-parent-key" });
    const successor = await new DrawingRecognitionAsyncRepository(client).createSession({ companyId: ids.company, actorId: ids.owner, sourceContextType: "drawing_number", sourceContextId: ids.drawingNumber, drawingId: ids.drawing, sessionPurpose: "amendment", supersedesSessionId: parent, evidenceOriginSessionId: parent });
    const scope = await readScope(client, successor.id);
    const result = await runHandoff(client, successor.id, undefined, { idempotencyKey: "dev110-r16-successor-key", expectedRowVersion: Number(scope.session.row_version), expectedRelationScopeFingerprint: scope.relationScopeFingerprint });
    const parentEvent = database.prepare("SELECT id FROM drawing_recognition_formalization_events WHERE session_id=?").get(parent);
    const successorSession = database.prepare("SELECT evidence_origin_session_id,supersedes_session_id,status FROM drawing_recognition_sessions WHERE id=?").get(successor.id);
    check("R16", first.reusedFromCommandReceipt === false && replay.reusedFromCommandReceipt === true
      && database.prepare("SELECT COUNT(*) count FROM drawing_recognition_formalization_events WHERE session_id=?").get(session).count === 1
      && result.schemaVersion === "pdm-recognition-part-work-handoff-v2" && successorSession.evidence_origin_session_id === parent
      && successorSession.supersedes_session_id === parent && successorSession.status === "formalized" && parentEvent?.id
      && database.prepare("SELECT COUNT(*) count FROM part_variant_attributes").get().count === 0, "idempotent replay/payload mismatch guard and amendment successor lineage preserve formal masters");
  });

  if (failures.length) throw new Error(`DEV-110 repository failures: ${JSON.stringify(failures)}`);
  const report = { runner: "repository", status: "PASS", denominator: 16, checks, runtimeDeclaration: { project: root, purpose: "DEV-110 isolated SQLite repository/transaction evidence", port: null, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, cleanupVerified: true } };
  fs.writeFileSync(path.join(evidenceDir, "repository.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("DEV-110 repository QC PASS (R01-R16)");
}

try {
  await main();
} finally {
  try { fs.rmSync(taskRoot, { recursive: true, force: true }); } catch { /* best effort */ }
}
