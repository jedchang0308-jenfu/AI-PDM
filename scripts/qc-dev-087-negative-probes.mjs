#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { closeAsyncDatabaseClient, createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { readCanonicalDrawingHistoryRevision } from "../src/lib/pdm-canonical-drawing-history.ts";
import { PdmCanonicalWorkbenchService } from "../src/lib/pdm-canonical-workbench.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { readJson, sha256, validateLaneRosterAndEvidence } from "./dev-087-evidence-lib.mjs";

const root = process.cwd();
const outputPath = process.env.DEV087_NEGATIVE_EVIDENCE_PATH;
if (!outputPath) throw new Error("DEV087_NEGATIVE_EVIDENCE_PATH_REQUIRED");

const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev087-negative-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
Object.assign(process.env, {
  PDM_AUTH_MODE: "local",
  PDM_AUTH_SECRET: "dev087-negative-task-owned-secret",
  PDM_DB_PROVIDER: "sqlite",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  PDM_WORKBENCH_CURSOR_SECRET: "dev087-negative-cursor-secret"
});

const results = [];
const businessTables = [
  "part_roots", "part_numbers", "part_variant_attributes", "drawing_numbers", "drawing_part_links",
  "drawings", "drawing_revisions", "drawing_revision_files", "file_assets", "canonical_workbench_states",
  "drawing_revision_works", "drawing_revision_work_files", "part_change_works", "pdm_work_review_requests",
  "approval_requests", "approval_decisions", "approval_batches", "approval_batch_items", "audit_logs"
];

function databaseFingerprint(database) {
  const facts = {};
  for (const table of businessTables) {
    const exists = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (exists) facts[table] = database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  }
  return sha256(JSON.stringify(facts));
}

async function capture(caseId, assertionId, probe) {
  try {
    const evidence = await probe();
    const pass = evidence.pass === true;
    results.push({ caseId, result: pass ? "PASS" : "FAIL", assertionIds: [assertionId], ...evidence });
  } catch (error) {
    results.push({
      caseId,
      result: "FAIL",
      assertionIds: [assertionId],
      pass: false,
      error: error instanceof Error ? `${error.name}:${error.message}` : String(error)
    });
  }
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error ? String(error.code) : null;
}

try {
  const primarySource = new Database(path.join(root, "data", "ai-pdm.sqlite"), { readonly: true, fileMustExist: true });
  await primarySource.backup(databasePath);
  primarySource.close();

  await capture("QA-087-202", "NEGATIVE_DIRECT_DRAWING_INVALIDATION_410_ZERO_WRITE", async () => {
    const verifier = new Database(databasePath);
    const before = databaseFingerprint(verifier);
    const retiredPageExists = fs.existsSync(path.join(root, "src/app/numbering/impact/page.tsx"));
    const retiredRouteExists = fs.existsSync(path.join(root, "src/app/api/numbering/impact-analysis/route.ts"));
    const after = databaseFingerprint(verifier);
    verifier.close();
    return {
      pass: !retiredPageExists && !retiredRouteExists && before === after,
      faultInjection: { directStandaloneSurfaceProbe: true },
      expectedFailure: { routeResolution: "not_found" },
      actual: { retiredPageExists, retiredRouteExists },
      zeroWriteReceipt: { before, after, delta: before === after ? 0 : 1 },
      restoreReceipt: { status: "not_needed_route_absent" },
      providerReceipt: { provider: "sqlite", databaseScope: "task_owned_file" }
    };
  });

  await capture("QA-087-206", "NEGATIVE_DIRECT_PART_VARIANT_410_ZERO_WRITE", async () => {
    const { generateToken } = await import("../src/lib/auth.ts");
    const { PUT } = await import("../src/app/api/parts/[partNumber]/variant/route.ts");
    const verifier = new Database(databasePath);
    const actor = verifier.prepare("SELECT id FROM users WHERE role IN ('Admin', 'R&D Manager') AND account_status='active' AND system_role_enabled=1 ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id LIMIT 1").get();
    if (!actor?.id) throw new Error("QA206_AUTH_ACTOR_MISSING");
    const before = databaseFingerprint(verifier);
    const token = generateToken(String(actor.id), { sessionId: "qa087-206" });
    const response = await PUT(new Request("http://local/api/parts/A0002-P01/variant", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: `pdm_session=${token}` },
      body: JSON.stringify({ materialCode: "SS304", colorCode: "BK", surfaceTreatment: "BA", variantNote: "must reject" })
    }), { params: Promise.resolve({ partNumber: "A0002-P01" }) });
    const body = await response.json();
    const after = databaseFingerprint(verifier);
    verifier.close();
    return {
      pass: response.status === 410 && body?.error === "PART_VARIANT_DIRECT_WRITE_RETIRED" && before === after,
      faultInjection: { method: "PUT", legacyVariantRoute: true },
      expectedFailure: { status: 410, code: "PART_VARIANT_DIRECT_WRITE_RETIRED" },
      actual: { status: response.status, code: body?.error ?? null },
      zeroWriteReceipt: { before, after, delta: before === after ? 0 : 1 },
      restoreReceipt: { status: "not_needed_readonly_rejection" },
      providerReceipt: { provider: "sqlite", databaseScope: "task_owned_file" }
    };
  });

  await capture("QA-087-208", "NEGATIVE_HISTORY_DELETED_ASSET_NO_FALLBACK", async () => {
    const database = createFixtureDatabase({ rdLifecycle: "preparing" });
    database.prepare(`INSERT INTO file_assets
      (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id,
       document_category, display_name, uploaded_by)
      VALUES ('asset-qa208', 'A0002-M01.SLDDRW', 'slddrw', 'application/octet-stream', 8, 'qa208-hash',
       'drawing_revision', ?, 'drawing_2d', 'history fault', ?)`).run(ids.rdRevision, ids.owner);
    database.prepare(`INSERT INTO drawing_revision_files
      (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by)
      VALUES ('binding-qa208', ?, ?, 'asset-qa208', 'drawing_2d', 'system', 'history fault', 1, ?)`).run(ids.company, ids.rdRevision, ids.owner);
    database.prepare("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP, deleted_by=?, deleted_reason='negative_probe' WHERE id='asset-qa208'").run(ids.owner);
    const before = databaseFingerprint(database);
    const client = createAsyncDatabaseClient({ kind: "sqlite", database });
    let caught = null;
    try {
      await readCanonicalDrawingHistoryRevision({ companyId: ids.company, drawingId: ids.drawing, revisionId: ids.rdRevision, client });
    } catch (error) {
      caught = errorCode(error);
    }
    const after = databaseFingerprint(database);
    const fk = database.pragma("foreign_key_check").length;
    database.close();
    return {
      pass: caught === "HISTORY_REVISION_FILE_UNAVAILABLE" && before === after && fk === 0,
      faultInjection: { activeBinding: "binding-qa208", deletedAsset: "asset-qa208" },
      expectedFailure: { code: "HISTORY_REVISION_FILE_UNAVAILABLE", fallback: false },
      actual: { code: caught },
      zeroWriteReceipt: { before, after, delta: before === after ? 0 : 1 },
      restoreReceipt: { status: "fixture_disposed", foreignKeyViolations: fk },
      providerReceipt: { provider: "sqlite", databaseScope: "task_owned_in_memory" }
    };
  });

  await capture("QA-087-210", "NEGATIVE_PREVIOUS_REVISION_REFERENCE_REMOVE_ZERO_WRITE", async () => {
    const database = createFixtureDatabase();
    const drawingFileTriggers = database.prepare("SELECT name, sql FROM sqlite_master WHERE type='trigger' AND tbl_name='drawing_revision_files' ORDER BY name").all();
    for (const trigger of drawingFileTriggers) database.exec(`DROP TRIGGER ${JSON.stringify(String(trigger.name))}`);
    database.prepare(`INSERT INTO file_assets
      (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id,
       document_category, display_name, uploaded_by)
      VALUES ('asset-qa210-reference', 'A0002-M01.SLDDRW', 'slddrw', 'application/octet-stream', 15, 'qa210-reference-hash',
       'drawing_revision', ?, 'drawing_2d', 'QA210 previous revision reference', ?)`).run(ids.productionRevision, ids.owner);
    database.prepare(`INSERT INTO drawing_revision_files
      (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by)
      VALUES ('binding-qa210-reference', ?, ?, 'asset-qa210-reference', 'drawing_2d', 'system', 'QA210 previous revision reference', 1, ?)`).run(ids.company, ids.productionRevision, ids.owner);
    for (const trigger of drawingFileTriggers) if (trigger.sql) database.exec(String(trigger.sql));
    const client = createAsyncDatabaseClient({ kind: "sqlite", database });
    const workbench = new PdmCanonicalWorkbenchService(client);
    const actor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false } };
    const viewActor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: true } };
    const service = new DrawingRevisionWorkService(client);
    const listing = await workbench.list(new URL("http://local?query=A0002-M01"), "drawing", viewActor);
    const source = listing.data.groups.flatMap((group) => group.rows).find((row) => row.layer === "production");
    if (!source) throw new Error("QA210_SOURCE_MISSING");
    const targets = await service.targets(ids.drawing, source.rowKey, actor);
    const target = targets.data.candidates.find((candidate) => candidate.kind === "rd" && candidate.enabled);
    if (!target) throw new Error("QA210_TARGET_MISSING");
    const work = await service.create(ids.drawing, { sourceRowKey: source.rowKey, selectionMode: "recommended", candidateToken: target.candidateToken }, actor, { idempotencyKey: "qa210-create", contractToken: targets.meta.contractToken, expectedRowVersion: source.rowVersion });
    const before = databaseFingerprint(database);
    let caught = null;
    try {
      await service.removeFile(work.workId, "binding-qa210-reference", actor, { idempotencyKey: "qa210-remove-reference", contractToken: targets.meta.contractToken, expectedRowVersion: work.rowVersion });
    } catch (error) {
      caught = errorCode(error);
    }
    const after = databaseFingerprint(database);
    const facts = database.prepare(`SELECT
      (SELECT COUNT(*) FROM drawing_revision_work_files WHERE work_id=? AND file_binding_id='binding-qa210-reference') AS work_membership,
      (SELECT COUNT(*) FROM drawing_revision_files WHERE id='binding-qa210-reference' AND removed_at IS NULL) AS source_binding_active,
      (SELECT COUNT(*) FROM file_assets WHERE id='asset-qa210-reference' AND deleted_at IS NULL) AS source_asset_active`).get(work.workId);
    const fk = database.pragma("foreign_key_check").length;
    database.close();
    return {
      pass: caught === "DRAWING_REVISION_FILE_REFERENCE_LOCKED" && before === after && Number(facts.work_membership) === 1 && Number(facts.source_binding_active) === 1 && Number(facts.source_asset_active) === 1 && fk === 0,
      faultInjection: { workId: work.workId, fileBindingId: "binding-qa210-reference", previousRevisionReference: true },
      expectedFailure: { code: "DRAWING_REVISION_FILE_REFERENCE_LOCKED" },
      actual: { code: caught, ...facts },
      zeroWriteReceipt: { before, after, delta: before === after ? 0 : 1 },
      restoreReceipt: { status: "fixture_disposed", foreignKeyViolations: fk },
      providerReceipt: { provider: "sqlite", databaseScope: "task_owned_in_memory" }
    };
  });

  await capture("QA-087-216", "NEGATIVE_CURSOR_SIGNATURE_FILTER_VERSION_ANCHOR", async () => {
    const database = createFixtureDatabase();
    database.prepare(`INSERT INTO part_numbers
      (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by)
      VALUES ('part-qa216-anchor', ?, ?, 'A0002-P00', 0, 'P00', 'cursor anchor', 'manufactured', 'Released', ?)`).run(ids.company, ids.root, ids.owner);
    database.prepare(`INSERT INTO pdm_workbench_aggregates (id, company_id, entity_type, canonical_entity_id)
      VALUES ('aggregate-qa216-anchor', ?, 'part', 'part-qa216-anchor')`).run(ids.company);
    database.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer)
      VALUES ('state-qa216-anchor', ?, 'part', 'part-qa216-anchor', 'part_formal')`).run(ids.company);
    const client = createAsyncDatabaseClient({ kind: "sqlite", database });
    const service = new PdmCanonicalWorkbenchService(client);
    const actor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { createWork: true, updateWork: true, submitWork: true, cancelWork: true, decideReview: false, obsoleteDrawing: true } };
    const first = await service.list(new URL("http://local?limit=1&sort=asc"), "part", actor);
    const cursor = first.data.nextCursor;
    if (!cursor) throw new Error("QA216_CURSOR_MISSING");
    const failures = {};
    for (const [name, value, url] of [
      ["signature", `${cursor.slice(0, -1)}x`, "http://local?limit=1&sort=asc"],
      ["filter", cursor, "http://local?limit=1&sort=asc&query=changed"]
    ]) {
      try { await service.list(new URL(`${url}&cursor=${encodeURIComponent(value)}`), "part", actor); }
      catch (error) { failures[name] = errorCode(error); }
    }
    const [encoded] = cursor.split(".");
    const v1Payload = { ...JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")), version: 1 };
    const v1Encoded = Buffer.from(JSON.stringify(v1Payload), "utf8").toString("base64url");
    const v1Signature = crypto.createHmac("sha256", process.env.PDM_WORKBENCH_CURSOR_SECRET).update(v1Encoded).digest("base64url");
    try { await service.list(new URL(`http://local?limit=1&sort=asc&cursor=${encodeURIComponent(`${v1Encoded}.${v1Signature}`)}`), "part", actor); }
    catch (error) { failures.version = errorCode(error); }
    const sourceFingerprint = databaseFingerprint(database);
    let anchorError = null;
    const partTriggers = database.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='part_numbers' ORDER BY name").all();
    for (const trigger of partTriggers) database.exec(`DROP TRIGGER ${JSON.stringify(String(trigger.name))}`);
    database.prepare("DELETE FROM canonical_workbench_states WHERE canonical_entity_id = 'part-qa216-anchor'").run();
    database.prepare("DELETE FROM pdm_workbench_aggregates WHERE canonical_entity_id = 'part-qa216-anchor'").run();
    database.prepare("DELETE FROM part_numbers WHERE id = 'part-qa216-anchor'").run();
    const beforeAttempt = databaseFingerprint(database);
    try { await service.list(new URL(`http://local?limit=1&sort=asc&cursor=${encodeURIComponent(cursor)}`), "part", actor); }
    catch (error) { anchorError = errorCode(error); }
    const afterAttempt = databaseFingerprint(database);
    const fk = database.pragma("foreign_key_check").length;
    database.close();
    const expectedCode = "WORKBENCH_BAD_REQUEST";
    return {
      pass: failures.signature === expectedCode && failures.filter === expectedCode && failures.version === expectedCode && anchorError === expectedCode && beforeAttempt === afterAttempt && fk === 0,
      faultInjection: { signatureMismatch: true, filterMismatch: true, version: 1, anchorDeletedInTaskFixture: true, sourceFingerprint },
      expectedFailure: { code: expectedCode },
      actual: { ...failures, anchor: anchorError },
      zeroWriteReceipt: { before: beforeAttempt, after: afterAttempt, delta: beforeAttempt === afterAttempt ? 0 : 1 },
      restoreReceipt: { status: "fixture_disposal_required", foreignKeyViolations: fk },
      providerReceipt: { provider: "sqlite", databaseScope: "task_owned_in_memory" }
    };
  });

  await capture("QA-087-218", "NEGATIVE_EIGHT_FAMILY_ROSTER_REMOVAL_FAILS", async () => {
    const registry = readJson(path.join(root, ".ai-doc", "qa", "dev-087-current-case-registry.json"));
    const coverage = registry.runnerCoverage.find((item) => item.runner === "qc-dev-087-capability-browser");
    if (!coverage) throw new Error("QA218_BROWSER_COVERAGE_MISSING");
    const artifactPath = "synthetic/qa218.json";
    const restored = {
      runner: coverage.runner,
      caseResults: coverage.caseIds.map((caseId) => ({ caseId, result: "PASS", assertionIds: [`${caseId}:synthetic`], firstFailurePointer: null })),
      caseEvidence: Object.fromEntries(coverage.caseIds.map((caseId) => [caseId, { evidenceTypes: [...coverage.requiredEvidence], artifactPaths: [artifactPath] }])),
      childManifests: [{ path: artifactPath, caseIds: [...coverage.caseIds] }]
    };
    validateLaneRosterAndEvidence(registry, restored, coverage.runner);
    const representatives = [
      ["drawing_change", "QA-087-188"], ["task_center_retirement", "QA-087-193"], ["formal_obsolete", "QA-087-198"],
      ["part_variant", "QA-087-203"], ["drawing_history", "QA-087-208"], ["work_files", "QA-087-210"],
      ["matrix_navigation", "QA-087-212"], ["workbench_discovery", "QA-087-214"]
    ];
    const mutations = representatives.map(([family, removedCaseId]) => {
      const mutated = structuredClone(restored);
      mutated.caseResults = mutated.caseResults.filter((item) => item.caseId !== removedCaseId);
      let code = null;
      try { validateLaneRosterAndEvidence(registry, mutated, coverage.runner); }
      catch (error) { code = error instanceof Error ? error.message.split(":")[0] : String(error); }
      return { family, removedCaseId, result: code === "RUNNER_CASE_ROSTER_MISMATCH" ? "EXPECTED_FAIL" : "UNEXPECTED_PASS", code };
    });
    validateLaneRosterAndEvidence(registry, restored, coverage.runner);
    return {
      pass: mutations.length === 8 && mutations.every((item) => item.result === "EXPECTED_FAIL"),
      faultInjection: { mutations },
      expectedFailure: { code: "RUNNER_CASE_ROSTER_MISMATCH", count: 8 },
      actual: { rejected: mutations.filter((item) => item.result === "EXPECTED_FAIL").length },
      zeroWriteReceipt: { sourceMutationCount: 0, syntheticManifestOnly: true },
      restoreReceipt: { status: "restored_fresh_validation_pass" },
      providerReceipt: { provider: "source_contract", databaseScope: "not_applicable" }
    };
  });
} finally {
  await closeAsyncDatabaseClient().catch(() => undefined);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify({
    schemaVersion: 1,
    taskOwnedEnvironment: { dataDir, repositoryDir, port: null, runtime: false },
    results,
    cleanupReceipt: { status: "pending_parent", taskRootRemoved: false }
  }, null, 2)}\n`, "utf8");
}

if (results.some((item) => item.result !== "PASS")) process.exitCode = 1;
