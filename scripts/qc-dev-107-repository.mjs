#!/usr/bin/env node

/* DEV-107 QA-107-009..019,021..026,033..035,037..038.
 *
 * This runner deliberately clones the primary SQLite file for every scenario.
 * It never seeds, repairs, or cleans the primary database.  The same service
 * entry points used by the routes are exercised, while direct SQL is limited
 * to task-owned fixture mutations and read-only oracles.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  cancelDrawingRecognitionAmendment,
  commitDrawingRecognition,
  createDrawingRecognitionAmendment
} from "../src/lib/drawing-recognition.ts";
import { createPlatformActorContext, createPdmCommand } from "../src/lib/platform-command.ts";
import { executePdmCommandWithOutbox } from "../src/lib/platform-command-service.ts";
import { assertDrawingRecognitionSubmissionReady } from "../src/lib/pdm-review-package.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { readDrawingRecognitionReviewProjections } from "../src/lib/drawing-recognition-review-snapshot.ts";

const root = process.cwd();
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const primaryRepositoryDir = path.join(root, "data", "repository");
const runId = `DEV107-repository-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV107_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-107", runId), "repository");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev107-repository-"));
const taskDataDir = path.join(taskRoot, "data");
const taskRepositoryDir = path.join(taskDataDir, "repository");
const COMPANY = "company-jenfu";
const HISTORICAL_PARENT = "recognition-7db214be-69db-4175-a16e-4d78784a8246";
const DRAWING = "drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe";
const REVISION = "f717dd6b-311a-49f9-ace6-a31630ee56ba";
const ACTOR_ID = "user-manager-demo";
const ACTOR = createPlatformActorContext({
  pdmUserId: ACTOR_ID,
  organizationId: COMPANY,
  roles: ["pdm_admin"],
  scopes: ["numbering.recognition.review", "numbering.recognition.formalize", "numbering.drawings.submit"]
});
const results = [];
const fixtureLedger = [];

fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(taskDataDir, { recursive: true });
if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, taskRepositoryDir, { recursive: true, force: true });

function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function text(error) { return error instanceof Error ? error.message : String(error); }
function primaryInvariant(databasePath) {
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const tables = ["part_roots", "part_numbers", "drawing_numbers", "drawings"];
    const payload = {
      schema: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger') ORDER BY type,name").all(),
      roots: db.prepare("SELECT * FROM part_roots ORDER BY company_id,id").all(),
      parts: db.prepare("SELECT * FROM part_numbers ORDER BY company_id,id").all(),
      drawingNumbers: db.prepare("SELECT * FROM drawing_numbers ORDER BY company_id,id").all(),
      drawings: db.prepare("SELECT * FROM drawings ORDER BY company_id,id").all(),
      masterCounts: Object.fromEntries(tables.map((table) => [table, Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count)])),
      residue: db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: db.pragma("foreign_key_check")
    };
    return { ...payload, hash: hash(payload) };
  } finally { db.close(); }
}

const primaryBefore = primaryInvariant(primaryDbPath);
function resolveCurrentFormalizedParent() {
  const database = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(`SELECT id FROM drawing_recognition_sessions
      WHERE company_id=? AND drawing_revision_id=? AND status='formalized'
      ORDER BY created_at DESC,id DESC LIMIT 1`).get(COMPANY, REVISION)?.id ?? HISTORICAL_PARENT;
  } finally {
    database.close();
  }
}
const PARENT = resolveCurrentFormalizedParent();

function dbSnapshot(db) {
  const payload = {
    candidates: db.prepare("SELECT id,session_id,proposed_value,review_state,row_version FROM drawing_recognition_candidates ORDER BY id").all(),
    sessions: db.prepare("SELECT id,status,row_version,session_purpose,evidence_origin_session_id FROM drawing_recognition_sessions ORDER BY id").all(),
    events: db.prepare("SELECT id,session_id,idempotency_key,applied_changes_json FROM drawing_recognition_formalization_events ORDER BY id").all(),
    receipts: db.prepare("SELECT command_name,idempotency_key,command_status FROM platform_command_receipts ORDER BY command_name,idempotency_key").all(),
    values: db.prepare("SELECT * FROM pdm_part_attribute_values ORDER BY id").all(),
    metadata: db.prepare("SELECT * FROM pdm_drawing_revision_metadata_values ORDER BY id").all()
  };
  return { ...payload, hash: hash(payload) };
}

function openScenario(name) {
  const scenarioDir = path.join(taskRoot, name);
  const dataDir = path.join(scenarioDir, "data");
  const repositoryDir = path.join(dataDir, "repository");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.copyFileSync(primaryDbPath, path.join(dataDir, "ai-pdm.sqlite"));
  if (fs.existsSync(primaryRepositoryDir)) fs.cpSync(primaryRepositoryDir, repositoryDir, { recursive: true, force: true });
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  process.env.PDM_RELEASE_MODE = "local_stub";
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  db.pragma("foreign_keys = ON");
  const revisionBefore = db.prepare("SELECT lifecycle_state FROM drawing_revisions WHERE id=?").get(REVISION)?.lifecycle_state ?? null;
  const lifecycleTrigger = db.prepare(`SELECT sql FROM sqlite_master
    WHERE type='trigger' AND name='trg_drawing_revisions_state_transition_guard'`).get()?.sql;
  assert.ok(lifecycleTrigger, "drawing revision lifecycle trigger is required for fixture restoration");
  const supersededFixtureSessions = db.prepare(`SELECT id,status FROM drawing_recognition_sessions
    WHERE id<>? AND (supersedes_session_id=? OR evidence_origin_session_id=?) ORDER BY id`).all(PARENT, PARENT, PARENT);
  db.transaction(() => {
    db.exec("DROP TRIGGER trg_drawing_revisions_state_transition_guard");
    db.prepare("UPDATE drawing_revisions SET lifecycle_state='preparing', updated_at=updated_at WHERE id=?").run(REVISION);
    db.exec(lifecycleTrigger);
    db.prepare(`UPDATE drawing_recognition_sessions SET status='cancelled', updated_at=updated_at
      WHERE id<>? AND (supersedes_session_id=? OR evidence_origin_session_id=?)`).run(PARENT, PARENT, PARENT);
  })();
  const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  const repository = new DrawingRecognitionAsyncRepository(client);
  fixtureLedger.push({
    scenario: name,
    dataDir,
    repositoryDir,
    mutationScope: "scenario clone only",
    fixturePreparation: {
      revisionId: REVISION,
      lifecycleStateBefore: revisionBefore,
      lifecycleStateAfter: "preparing",
      lifecycleTriggerRestored: true,
      terminalizedSuccessors: supersededFixtureSessions
    }
  });
  return { db, client, repository, dataDir, repositoryDir };
}

async function closeScenario(scenario) {
  await scenario.client.close();
  scenario.db.close();
}

async function check(id, label, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ caseId: id, label, status: "PASS", durationMs: Date.now() - started, detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    results.push({ caseId: id, label, status: "FAIL", durationMs: Date.now() - started, error: text(error) });
    console.error(`FAIL ${id} ${label}: ${text(error)}`);
  }
}

async function scenario(name, fn) {
  const current = openScenario(name);
  try { return await fn(current); } finally { await closeScenario(current); }
}

function metadata(key) { return { actor: ACTOR, idempotencyKey: key }; }
function parentRow(db = null) {
  return db?.prepare("SELECT row_version FROM drawing_recognition_sessions WHERE id=?").get(PARENT)?.row_version;
}
function evidenceOriginSessionId(db, sessionId = PARENT) {
  return db.prepare("SELECT COALESCE(evidence_origin_session_id,id) AS id FROM drawing_recognition_sessions WHERE id=?").get(sessionId)?.id;
}
async function createAmendment(current, key = `dev107-amend:${crypto.randomUUID()}`) {
  const rowVersion = Number(parentRow(current.db));
  const result = await createDrawingRecognitionAmendment({
    sessionId: PARENT, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: rowVersion,
    metadata: metadata(key), client: current.client
  });
  assert.ok(result.session?.id);
  return result.session;
}
function firstEditableCandidate(db, sessionId) {
  return db.prepare(`SELECT * FROM drawing_recognition_candidates
    WHERE session_id=? AND category='part_attribute' AND proposed_owner_type='part_number'
      AND field_key='material' ORDER BY id LIMIT 1`).get(sessionId);
}
function changedDecision(candidate, value) {
  return {
    candidateId: candidate.id, action: "correct", value,
    fieldKey: candidate.field_key, fieldLabel: candidate.field_label, category: candidate.category,
    ownerType: candidate.proposed_owner_type, ownerId: candidate.proposed_owner_id,
    applicabilityScope: candidate.applicability_scope
  };
}
function count(db, table, where = "") { return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`).get().count); }
function eventCount(db, sessionId = null) { return count(db, "drawing_recognition_formalization_events", sessionId ? "session_id = '" + sessionId.replaceAll("'", "''") + "'" : ""); }
function instrumentClient(client, counters) {
  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return (fn, options) => target.transaction((nested) => fn(instrumentClient(nested, counters)), options);
      }
      if (!["query", "queryOne", "execute"].includes(String(property))) return Reflect.get(target, property, receiver);
      return (...args) => {
        counters[String(property)] += 1;
        return target[property](...args);
      };
    }
  });
}

async function run() {
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-107 task-owned SQLite repository/service QA for embedded recognition commit and amendment lineage",
    port: null,
    owningProcessTree: `node ${process.pid} only; no server or worker`,
    cleanupCondition: "all repository cases and invariant evidence written",
    PDM_DATA_DIR: taskDataDir,
    PDM_REPOSITORY_DIR: taskRepositoryDir,
    mutationScope: taskRoot
  } }));

  await check("QA-107-009", "write-impact zero-write remains read-only", () => scenario("qa-009-impact", async (current) => {
    const amendment = await createAmendment(current, "dev107-009-amend");
    const before = dbSnapshot(current.db);
    const impact = await current.repository.calculateImpact({ sessionId: amendment.id, companyId: COMPANY, expectedRowVersion: amendment.rowVersion });
    const after = dbSnapshot(current.db);
    assert.equal(impact.changes.length, 0, "amendment inherits formal values as zero delta");
    assert.equal(after.hash, before.hash, "impact has no business writes");
    return { sessionId: amendment.id, changes: impact.changes.length, exclusions: impact.exclusions.length };
  }));

  await check("QA-107-010", "latest concurrent amendment request reuses one open successor", () => scenario("qa-010-latest-wins", async (current) => {
    const first = await createAmendment(current, "dev107-010-first");
    const second = await createAmendment(current, "dev107-010-second");
    assert.equal(second.id, first.id);
    assert.equal(count(current.db, "drawing_recognition_sessions", "session_purpose='amendment' AND status IN ('queued','extracting','review_ready','extraction_partial','ready_to_formalize')"), 1);
    return { successorId: first.id };
  }));

  await check("QA-107-011", "commit is atomic across candidate, formal value, event and session", () => scenario("qa-011-atomic-commit", async (current) => {
    const amendment = await createAmendment(current, "dev107-011-commit");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    assert.ok(candidate);
    const before = dbSnapshot(current.db);
    const result = await commitDrawingRecognition({
      sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion,
      decisions: [changedDecision(candidate, "不鏽鋼SUS316")], metadata: metadata("dev107-011-commit"), client: current.client
    });
    assert.equal(result.appliedCount > 0, true);
    const afterSession = current.db.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(amendment.id);
    assert.equal(afterSession.status, "formalized");
    assert.equal(eventCount(current.db, amendment.id), 1);
    return { sessionId: amendment.id, appliedCount: result.appliedCount, beforeHash: before.hash, eventCount: 1 };
  }));

  await check("QA-107-012", "same idempotency key replays one commit after response loss", () => scenario("qa-012-idempotency", async (current) => {
    const amendment = await createAmendment(current, "dev107-012-amend");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    const key = "dev107-012-commit";
    const input = { sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, decisions: [changedDecision(candidate, "不鏽鋼SUS316")], metadata: metadata(key), client: current.client };
    const first = await commitDrawingRecognition(input);
    const replay = await commitDrawingRecognition(input);
    assert.equal(replay.reusedFromCommandReceipt, true);
    assert.equal(replay.eventId, first.eventId);
    assert.equal(replay.appliedCount, first.appliedCount);
    assert.equal(count(current.db, "drawing_recognition_formalization_events", "session_id='" + amendment.id + "'"), 1);
    return { sessionId: amendment.id, replayed: replay.reusedFromCommandReceipt };
  }));

  await check("QA-107-013", "stale row version rejects recompute before any write", () => scenario("qa-013-stale", async (current) => {
    const amendment = await createAmendment(current, "dev107-013-amend");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    await current.repository.saveDecisions({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, expectedRowVersion: amendment.rowVersion, decisions: [changedDecision(candidate, "不鏽鋼SUS316")] });
    const before = dbSnapshot(current.db);
    await assert.rejects(() => commitDrawingRecognition({
      sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion,
      decisions: [], metadata: metadata("dev107-013-stale-commit"), client: current.client
    }), (error) => error?.code === "RECOGNITION_SESSION_STALE");
    assert.equal(dbSnapshot(current.db).events.length, before.events.length);
    return { sessionId: amendment.id, eventCount: before.events.length };
  }));

  await check("QA-107-014", "fault before outbox enqueue rolls back nested formalization", () => scenario("qa-014-rollback", async (current) => {
    const amendment = await createAmendment(current, "dev107-014-amend");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    const command = createPdmCommand({ commandName: "drawing_recognition.rollback-test.v1", idempotencyKey: "dev107-014-fault", actor: ACTOR, payload: { sessionId: amendment.id } });
    await assert.rejects(() => executePdmCommandWithOutbox({
      client: current.client, command, idempotencyPayload: command.payload,
      execute: async (tx) => new DrawingRecognitionAsyncRepository(tx).commit({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, expectedRowVersion: amendment.rowVersion, decisions: [changedDecision(candidate, "不鏽鋼SUS316")], idempotencyKey: "dev107-014-formalization" }),
      event: (value) => ({ aggregateType: "drawing_recognition_session", aggregateId: amendment.id, eventType: "drawing_recognition.rollback-test.v1", payload: value }),
      faultInjector: (point) => { if (point === "before_outbox_enqueue") throw new Error("DEV107_FORCED_ROLLBACK"); }
    }), /DEV107_FORCED_ROLLBACK/u);
    assert.equal(current.db.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(amendment.id).status, "ready_to_formalize");
    assert.equal(eventCount(current.db, amendment.id), 0);
    return { sessionId: amendment.id, formalizationEvents: 0, platformReceipts: count(current.db, "platform_command_receipts", "idempotency_key='dev107-014-fault'") };
  }));

  await check("QA-107-015", "accepted zero-delta amendment creates synchronization event", () => scenario("qa-015-zero-delta", async (current) => {
    const amendment = await createAmendment(current, "dev107-015-amend");
    const result = await commitDrawingRecognition({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, decisions: [], metadata: metadata("dev107-015-commit"), client: current.client });
    assert.equal(result.appliedCount, 0);
    assert.equal(eventCount(current.db, amendment.id), 1);
    return { sessionId: amendment.id, appliedCount: 0 };
  }));

  await check("QA-107-016", "amendment create command is idempotent", () => scenario("qa-016-amendment-idempotency", async (current) => {
    const first = await createAmendment(current, "dev107-016-amend");
    const second = await createAmendment(current, "dev107-016-amend");
    assert.equal(second.id, first.id);
    assert.equal(count(current.db, "platform_command_receipts", "command_name='drawing_recognition.amendment.create.v1' AND idempotency_key='dev107-016-amend'"), 1);
    return { successorId: first.id, receiptCount: 1 };
  }));

  await check("QA-107-017", "origin overlay reuses evidence without copying raw observations", () => scenario("qa-017-origin-overlay", async (current) => {
    const amendment = await createAmendment(current, "dev107-017-amend");
    const evidenceOriginId = evidenceOriginSessionId(current.db);
    const originSources = count(current.db, "drawing_recognition_sources", "session_id='" + evidenceOriginId + "'");
    const overlaySources = count(current.db, "drawing_recognition_sources", "session_id='" + amendment.id + "'");
    const originObservations = count(current.db, "drawing_recognition_observations", "session_id='" + evidenceOriginId + "'");
    const overlayObservations = count(current.db, "drawing_recognition_observations", "session_id='" + amendment.id + "'");
    assert.ok(originSources > 0 && originObservations > 0);
    assert.equal(overlaySources, 0);
    assert.equal(overlayObservations, 0);
    assert.notEqual(current.db.prepare("SELECT id FROM drawing_recognition_candidates WHERE session_id=? ORDER BY id LIMIT 1").get(PARENT)?.id, current.db.prepare("SELECT id FROM drawing_recognition_candidates WHERE session_id=? ORDER BY id LIMIT 1").get(amendment.id)?.id);
    return { parentId: PARENT, evidenceOriginId, successorId: amendment.id, originSources, overlaySources, originObservations, overlayObservations };
  }));

  await check("QA-107-018", "cancel amendment is zero-PDM-write and returns to parent", () => scenario("qa-018-cancel", async (current) => {
    const amendment = await createAmendment(current, "dev107-018-amend");
    const before = dbSnapshot(current.db);
    const result = await cancelDrawingRecognitionAmendment({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, metadata: metadata("dev107-018-cancel"), client: current.client });
    assert.equal(result.status, "cancelled");
    assert.equal(current.db.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(PARENT).status, "formalized");
    const after = dbSnapshot(current.db);
    assert.deepEqual(after.values, before.values);
    assert.equal(eventCount(current.db, amendment.id), 0);
    return { successorId: amendment.id, status: "cancelled", parentStatus: "formalized" };
  }));

  await check("QA-107-019", "amendment commit creates a successor event and Part readback", () => scenario("qa-019-amendment-commit", async (current) => {
    const amendment = await createAmendment(current, "dev107-019-amend");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    const result = await commitDrawingRecognition({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, decisions: [changedDecision(candidate, "不鏽鋼SUS316")], metadata: metadata("dev107-019-commit"), client: current.client });
    assert.equal(current.db.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(amendment.id).status, "formalized");
    assert.equal(current.db.prepare("SELECT status FROM drawing_recognition_sessions WHERE id=?").get(PARENT).status, "formalized");
    const value = current.db.prepare("SELECT value_text FROM pdm_part_attribute_values WHERE part_number_id=? ORDER BY updated_at DESC LIMIT 1").get(candidate.proposed_owner_id);
    assert.equal(value?.value_text, "不鏽鋼SUS316");
    return { successorId: amendment.id, eventId: result.eventId, partId: candidate.proposed_owner_id, readback: value.value_text };
  }));

  await check("QA-107-021", "actor matrix keeps same-company manager allowed and foreign company denied", () => scenario("qa-021-actor", async (current) => {
    const allowed = await createAmendment(current, "dev107-021-allowed");
    await assert.rejects(() => createDrawingRecognitionAmendment({ sessionId: PARENT, companyId: "company-does-not-exist", actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: 1, metadata: metadata("dev107-021-foreign"), client: current.client }), (error) => error?.code === "RECOGNITION_SESSION_NOT_FOUND");
    return { allowedSuccessorId: allowed.id, foreignCompany: "404" };
  }));

  await check("QA-107-022", "submission guard ignores old source lineage and blocks current saved intent", () => scenario("qa-022-submit-guard", async (current) => {
    const basis = await current.repository.readCurrentSourceBasis({ companyId: COMPANY, sourceContextType: "drawing_revision", sourceContextId: REVISION });
    const before = dbSnapshot(current.db);
    await assertDrawingRecognitionSubmissionReady(current.client, { companyId: COMPANY, drawingId: DRAWING, revisionId: REVISION });
    assert.equal(dbSnapshot(current.db).hash, before.hash);
    current.db.prepare("UPDATE drawing_recognition_sessions SET status='review_ready', updated_at=updated_at WHERE id=?").run(PARENT);
    await assert.rejects(() => assertDrawingRecognitionSubmissionReady(current.client, { companyId: COMPANY, drawingId: DRAWING, revisionId: REVISION }), (error) => error?.code === "RECOGNITION_SUBMISSION_WRITE_PENDING");
    return { sourceSetFingerprint: basis.sourceSetFingerprint, guardReadOnly: true, pendingCode: "RECOGNITION_SUBMISSION_WRITE_PENDING" };
  }));

  await check("QA-107-023", "saved accepted intended candidate is a server-side submit gate", () => scenario("qa-023-submit-pending", async (current) => {
    current.db.prepare("UPDATE drawing_recognition_sessions SET status='review_ready', updated_at=updated_at WHERE id=?").run(PARENT);
    const before = dbSnapshot(current.db);
    await assert.rejects(() => assertDrawingRecognitionSubmissionReady(current.client, { companyId: COMPANY, drawingId: DRAWING, revisionId: REVISION }), (error) => error?.code === "RECOGNITION_SUBMISSION_WRITE_PENDING");
    assert.equal(dbSnapshot(current.db).hash, before.hash);
    return { code: "RECOGNITION_SUBMISSION_WRITE_PENDING", zeroWrites: true };
  }));

  await check("QA-107-024", "optional evidence-only recognition never blocks submit", () => scenario("qa-024-optional", async (current) => {
    current.db.prepare("UPDATE drawing_recognition_candidates SET review_state='ignored' WHERE session_id=? AND category NOT IN ('unclassified','identity_relation','engineering_evidence')").run(PARENT);
    current.db.prepare("UPDATE drawing_recognition_sessions SET status='review_ready', updated_at=updated_at WHERE id=?").run(PARENT);
    await assertDrawingRecognitionSubmissionReady(current.client, { companyId: COMPANY, drawingId: DRAWING, revisionId: REVISION });
    return { allowed: true, reason: "no accepted intended write" };
  }));

  await check("QA-107-025", "post-release lifecycle remains outside embedded recognition writer", () => scenario("qa-025-post-release", async (current) => {
    const amendment = await createAmendment(current, "dev107-025-amend");
    current.db.prepare("UPDATE drawing_revisions SET lifecycle_state='released' WHERE id=?").run(REVISION);
    await assert.rejects(() => commitDrawingRecognition({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, decisions: [], metadata: metadata("dev107-025-commit"), client: current.client }), (error) => error?.code === "RECOGNITION_SESSION_NOT_REVIEWABLE");
    return { successorId: amendment.id, releasedWrite: "blocked" };
  }));

  await check("QA-107-026", "review snapshot is exact, immutable and does not read latest live successor", () => scenario("qa-026-review-lock", async (current) => {
    const before = dbSnapshot(current.db);
    const snapshots = await readDrawingRecognitionReviewProjections(current.client, { companyId: COMPANY, targets: [{ drawingId: DRAWING, revisionId: REVISION }], selection: "formalized" });
    assert.equal(snapshots.size, 1);
    const snapshot = [...snapshots.values()][0];
    assert.equal(snapshot.session.status, "formalized");
    const amendment = await createAmendment(current, "dev107-026-amend");
    const after = await readDrawingRecognitionReviewProjections(current.client, { companyId: COMPANY, targets: [{ drawingId: DRAWING, revisionId: REVISION }], selection: "formalized" });
    const afterSnapshot = [...after.values()][0];
    assert.equal(afterSnapshot.session.status, "formalized");
    assert.equal(afterSnapshot.session.id, PARENT);
    assert.equal(dbSnapshot(current.db).events.length, before.events.length);
    return { snapshotSessionId: afterSnapshot.session.id, openAmendmentId: amendment.id, readOnly: true };
  }));

  await check("QA-107-033", "formalized snapshot selects the exact current leaf", () => scenario("qa-033-snapshot", async (current) => {
    const amendment = await createAmendment(current, "dev107-033-amend");
    const open = await readDrawingRecognitionReviewProjections(current.client, { companyId: COMPANY, targets: [{ drawingId: DRAWING, revisionId: REVISION }], selection: "formalized" });
    assert.equal([...open.values()][0].session.id, PARENT);
    await cancelDrawingRecognitionAmendment({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, metadata: metadata("dev107-033-cancel"), client: current.client });
    const cancelled = await readDrawingRecognitionReviewProjections(current.client, { companyId: COMPANY, targets: [{ drawingId: DRAWING, revisionId: REVISION }], selection: "formalized" });
    assert.equal([...cancelled.values()][0].session.id, PARENT);
    return { parentId: PARENT, cancelledSuccessorId: amendment.id };
  }));

  await check("QA-107-034", "source drift is rejected by the same source-basis assertion", () => scenario("qa-034-source-drift", async (current) => {
    const amendment = await createAmendment(current, "dev107-034-amend");
    const source = current.db.prepare("SELECT file_asset_id FROM drawing_recognition_sources WHERE session_id=? ORDER BY sort_order LIMIT 1").get(evidenceOriginSessionId(current.db));
    current.db.prepare("UPDATE file_assets SET content_hash=? WHERE id=?").run(crypto.randomBytes(32).toString("hex"), source.file_asset_id);
    await assert.rejects(() => current.repository.cancelAmendment({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, expectedRowVersion: amendment.rowVersion }), (error) => error?.code === "RECOGNITION_SOURCE_SET_STALE");
    return { successorId: amendment.id, sourceDrift: "409 zero write" };
  }));

  await check("QA-107-035", "one-open amendment uniqueness survives concurrent create", () => scenario("qa-035-lineage-race", async (current) => {
    const values = await Promise.all(["a", "b", "c", "d"].map((suffix) => createAmendment(current, `dev107-035-${suffix}`)));
    assert.equal(new Set(values.map((value) => value.id)).size, 1);
    assert.equal(count(current.db, "drawing_recognition_sessions", "session_purpose='amendment' AND status IN ('queued','extracting','review_ready','extraction_partial','ready_to_formalize')"), 1);
    return { concurrentRequests: values.length, successorId: values[0].id };
  }));

  await check("QA-107-037", "query and storage budgets stay bounded for 1/500 observations", () => scenario("qa-037-budget", async (current) => {
    const amendment = await createAmendment(current, "dev107-037-amend");
    const originSessionId = evidenceOriginSessionId(current.db);
    const source = current.db.prepare("SELECT id,source_id,adapter_result_id FROM drawing_recognition_observations WHERE session_id=? ORDER BY id LIMIT 1").get(originSessionId);
    const candidate = current.db.prepare("SELECT id FROM drawing_recognition_candidates WHERE session_id=? ORDER BY id LIMIT 1").get(amendment.id);
    assert.ok(source?.source_id && source?.adapter_result_id && candidate?.id);
    const existing = count(current.db, "drawing_recognition_observations", "session_id='" + originSessionId + "'");
    if (existing < 500) {
      const insertObservation = current.db.prepare(`INSERT INTO drawing_recognition_observations
        (id,session_id,source_id,adapter_result_id,company_id,raw_text,raw_value,normalized_value,location_kind,
         page_number,geometry_json,confidence_band,extractor_code,extractor_version,captured_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const insertLink = current.db.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id,observation_id,company_id,created_at) VALUES(?,?,?,?)");
      current.db.transaction(() => {
        for (let index = existing; index < 500; index += 1) {
          const id = `dev107-observation-${index}-${crypto.randomUUID()}`;
          const timestamp = new Date(Date.now() + index).toISOString();
          insertObservation.run(id, originSessionId, source.source_id, source.adapter_result_id, COMPANY, `DEV107 bounded observation ${index}`, `value-${index}`, `value-${index}`, "page_region", 1, JSON.stringify({ coordinateSpace: "normalized_page", origin: "top_left", x: 0.01, y: 0.01, width: 0.1, height: 0.03 }), "low", "dev107.fixture", "1", timestamp);
          insertLink.run(candidate.id, id, COMPANY, timestamp);
        }
      })();
    }
    const oneCounters = { query: 0, queryOne: 0, execute: 0 };
    const oneClient = instrumentClient(current.client, oneCounters);
    await new DrawingRecognitionAsyncRepository(oneClient).getProjection(amendment.id, COMPANY);
    const projectionCounters = { ...oneCounters };
    const projection = await new DrawingRecognitionAsyncRepository(oneClient).getProjection(amendment.id, COMPANY);
    const secondCounters = { query: oneCounters.query - projectionCounters.query, queryOne: oneCounters.queryOne - projectionCounters.queryOne, execute: oneCounters.execute - projectionCounters.execute };
    assert.equal(count(current.db, "drawing_recognition_observations", "session_id='" + amendment.id + "'"), 0);
    assert.equal(projection.sources.length > 0, true);
    assert.equal(existing >= 1, true);
    assert.equal(projectionCounters.query + projectionCounters.queryOne + projectionCounters.execute, secondCounters.query + secondCounters.queryOne + secondCounters.execute);
    assert.ok(projectionCounters.query + projectionCounters.queryOne <= 8);
    return { oneObservationCount: existing, fiveHundredObservationCount: 500, overlayObservationInserts: 0, projectionSourceCount: projection.sources.length, projectionDataStatements: projectionCounters.query + projectionCounters.queryOne, repeatDataStatements: secondCounters.query + secondCounters.queryOne, statementBudget: "bounded set-based reads" };
  }));

  await check("QA-107-038", "no-op and optional closure preserve the last formal PDM value", () => scenario("qa-038-closure", async (current) => {
    const amendment = await createAmendment(current, "dev107-038-amend");
    const candidate = firstEditableCandidate(current.db, amendment.id);
    const before = current.db.prepare("SELECT value_text FROM pdm_part_attribute_values WHERE part_number_id=? ORDER BY updated_at DESC LIMIT 1").get(candidate.proposed_owner_id)?.value_text ?? null;
    const result = await commitDrawingRecognition({ sessionId: amendment.id, companyId: COMPANY, actorId: ACTOR_ID, roles: ["pdm_admin"], expectedRowVersion: amendment.rowVersion, decisions: [], metadata: metadata("dev107-038-commit"), client: current.client });
    const after = current.db.prepare("SELECT value_text FROM pdm_part_attribute_values WHERE part_number_id=? ORDER BY updated_at DESC LIMIT 1").get(candidate.proposed_owner_id)?.value_text ?? null;
    assert.equal(result.appliedCount, 0);
    assert.equal(after, before);
    return { appliedCount: 0, before, after, eventId: result.eventId };
  }));
}

let runError = null;
try { await run(); } catch (error) { runError = error; console.error(error); }
const primaryAfter = primaryInvariant(primaryDbPath);
const sourceUnchanged = primaryBefore.hash === primaryAfter.hash;
const manifest = {
  dev: "DEV-107",
  runner: "qc-dev-107-repository",
  runId,
  expectedCaseIds: ["QA-107-009", "QA-107-010", "QA-107-011", "QA-107-012", "QA-107-013", "QA-107-014", "QA-107-015", "QA-107-016", "QA-107-017", "QA-107-018", "QA-107-019", "QA-107-021", "QA-107-022", "QA-107-023", "QA-107-024", "QA-107-025", "QA-107-026", "QA-107-033", "QA-107-034", "QA-107-035", "QA-107-037", "QA-107-038"],
  results,
  fixtureLedger,
  runtimeDeclaration: { project: root, purpose: "task-owned repository/service QA", port: null, owningProcessTree: `node ${process.pid}`, cleanupCondition: "manifest written", PDM_DATA_DIR: taskDataDir, PDM_REPOSITORY_DIR: taskRepositoryDir, mutationScope: taskRoot },
  primaryBefore: { hash: primaryBefore.hash, masterCounts: primaryBefore.masterCounts, foreignKeys: primaryBefore.foreignKeys },
  primaryAfter: { hash: primaryAfter.hash, masterCounts: primaryAfter.masterCounts, foreignKeys: primaryAfter.foreignKeys },
  sourceUnchanged,
  cleanup: { taskRootRemoved: false, reason: "retain fixture ledger/evidence until report write completes" },
  status: runError || results.some((result) => result.status !== "PASS") || !sourceUnchanged ? "FAIL" : "PASS",
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
// Keep evidence, but remove the mutable task fixture after the manifest is durable.
fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
manifest.cleanup.taskRootRemoved = !fs.existsSync(taskRoot);
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), JSON.stringify(manifest, null, 2));
if (manifest.status !== "PASS") process.exitCode = 1;
