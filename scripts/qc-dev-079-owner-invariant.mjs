import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { createFixtureDatabase, ids as dev087Ids } from "./qc-dev-087-fixtures.mjs";
import { sha256Canonical } from "../src/lib/drawing-recognition-hash.ts";

const root = process.cwd();
const runId = `DEV079-INVARIANT-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-079-owner-invariant", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-invariant-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(tempRoot, "repository");
const sourceDbPath = path.join(tempRoot, "source", "ai-pdm.sqlite");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-079 CAPA isolated SQLite invariant, reconciliation and zero-write verification",
  port: null,
  owningProcessTree: "qc-dev-079-owner-invariant -> task-owned Node child processes",
  cleanupCondition: "all child processes completed and task temp root removed",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: tempRoot
} }));

function seedDeterministicSourceFixture() {
  fs.mkdirSync(path.dirname(sourceDbPath), { recursive: true });
  const database = createFixtureDatabase({ filename: sourceDbPath, rdLifecycle: "preparing" });
  try {
    database.prepare("UPDATE users SET role='Admin', system_role_enabled=1 WHERE id=?").run(dev087Ids.owner);
    database.prepare(`INSERT INTO part_numbers (
      id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by
    ) VALUES (
      'part-dev079-unlinked', @company, @root, 'A0002-P02', 2, 'P02', '未連結反例', 'manufactured', 'Released', @owner
    )`).run({ company: dev087Ids.company, root: dev087Ids.root, owner: dev087Ids.owner });

    const assets = [
      { id: "asset-dev079-native", name: "A0002-M01.SLDPRT", ext: "sldprt", mime: "application/octet-stream", hash: "a".repeat(64), role: "cad_3d", order: 0, plan: ["native-cad-property.v1"] },
      { id: "asset-dev079-pdf", name: "A0002-M01.pdf", ext: "pdf", mime: "application/pdf", hash: "b".repeat(64), role: "pdf", order: 1, plan: ["browser-pdf-ocr.v1"] }
    ];
    const sourceSetFingerprint = sha256Canonical(assets
      .toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((asset) => ({
        fileAssetId: asset.id,
        contentHash: asset.hash,
        storageGeneration: "",
        role: asset.role
      })));
    const insertAsset = database.prepare(`INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
      linked_entity_type, linked_entity_id, document_category, display_name, uploaded_by
    ) VALUES (
      @id, 'external', @id, @name, @ext, @mime, 16, @hash,
      'drawing_revision', @revision, 'other', @name, @owner
    )`);
    const insertRevisionFile = database.prepare(`INSERT INTO drawing_revision_files (
      id, company_id, drawing_revision_id, source_file_asset_id, role, role_source,
      display_name, sort_order, is_primary, created_by
    ) VALUES (
      @bindingId, @company, @revision, @id, @role, 'migration',
      @name, @order, @isPrimary, @owner
    )`);
    for (const asset of assets) {
      const params = {
        ...asset,
        bindingId: `binding-${asset.id}`,
        company: dev087Ids.company,
        revision: dev087Ids.rdRevision,
        owner: dev087Ids.owner,
        isPrimary: asset.order === 0 ? 1 : 0
      };
      insertAsset.run(params);
      insertRevisionFile.run(params);
    }

    database.prepare(`INSERT INTO drawing_recognition_sessions (
      id, company_id, source_context_type, source_context_id, source_lineage_key, drawing_id,
      drawing_revision_id, source_set_fingerprint, deduplication_key, status, created_by
    ) VALUES (
      'session-dev079-source', @company, 'drawing_revision', @revision, 'dev079-source-lineage', @drawing,
      @revision, @fingerprint, 'dev079-source-dedup', 'review_ready', @owner
    )`).run({
      company: dev087Ids.company,
      revision: dev087Ids.rdRevision,
      drawing: dev087Ids.drawing,
      fingerprint: sourceSetFingerprint,
      owner: dev087Ids.owner
    });
    const insertSource = database.prepare(`INSERT INTO drawing_recognition_sources (
      id, session_id, company_id, file_asset_id, content_hash, file_name, file_ext, mime_type,
      file_size, source_role, sort_order, adapter_plan_json
    ) VALUES (
      @sourceId, 'session-dev079-source', @company, @id, @hash, @name, @ext, @mime,
      16, @role, @order, @plan
    )`);
    for (const asset of assets) insertSource.run({ ...asset, sourceId: `source-${asset.id}`, company: dev087Ids.company, plan: JSON.stringify(asset.plan) });
    database.prepare(`INSERT INTO drawing_recognition_adapter_results (
      id, session_id, source_id, company_id, adapter_code, adapter_version,
      status, observation_count, diagnostics_json, started_at, completed_at
    ) VALUES (
      'adapter-dev079-pdf', 'session-dev079-source', 'source-asset-dev079-pdf', @company,
      'browser-pdf-ocr.v1', 'fixture', 'succeeded', 0, '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )`).run({ company: dev087Ids.company });

    const insertCandidate = database.prepare(`INSERT INTO drawing_recognition_candidates (
      id, session_id, company_id, category, field_key, field_label, raw_value, proposed_value,
      normalized_value, proposed_owner_type, proposed_owner_id, group_key, sort_order, review_state
    ) VALUES (
      @id, 'session-dev079-source', @company, 'part_attribute', @fieldKey, @label, @value, @value,
      @value, 'part_number', @ownerPart, @groupKey, @sortOrder, 'accepted'
    )`);
    [
      { id: "candidate-dev079-material", fieldKey: "material", label: "材質", value: "SUS304", groupKey: "part_attribute:material", sortOrder: 1 },
      { id: "candidate-dev079-surface", fieldKey: "surface_treatment", label: "表面處理", value: "拋光", groupKey: "part_attribute:surface_treatment", sortOrder: 2 },
      { id: "candidate-dev079-heat", fieldKey: "heat_treatment", label: "熱處理", value: "無", groupKey: "part_attribute:heat_treatment", sortOrder: 3 }
    ].forEach((candidate) => insertCandidate.run({ ...candidate, company: dev087Ids.company, ownerPart: dev087Ids.part }));
    assert.equal(database.pragma("foreign_key_check").length, 0, "deterministic source fixture foreign keys");
  } finally {
    database.close();
  }
}

function primaryInvariant() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const payload = {
      roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
      parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
      drawings: database.prepare("SELECT COUNT(*) AS count FROM drawings").get().count,
      missingRootReferences: database.prepare(`SELECT COUNT(*) AS count FROM part_numbers part
        LEFT JOIN part_roots root ON root.id = part.part_root_id WHERE root.id IS NULL`).get().count,
      migrationResidue: database.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'
        AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all(),
      identityHash: crypto.createHash("sha256").update(JSON.stringify({
        roots: database.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY id").all(),
        parts: database.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY id").all(),
        drawings: database.prepare("SELECT id, company_id, drawing_number FROM drawings ORDER BY id").all()
      })).digest("hex"),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally {
    database.close();
  }
}

function runNode(script, args, env = process.env) {
  const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${script} failed (${result.status}): ${(result.stderr || result.stdout).trim()}`);
  return result.stdout.trim();
}

function runReconciliation(mode, extra = {}) {
  const runOutput = path.join(outputDir, `reconciliation-${mode}-${extra.label ?? "run"}`);
  const argumentsList = [
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs",
    `--mode=${mode}`,
    `--database=${fixtureDbPath}`,
    `--output-dir=${runOutput}`
  ];
  if (extra.expectedFingerprint) argumentsList.push(`--expected-fingerprint=${extra.expectedFingerprint}`);
  if (extra.expectedReviewFingerprint) argumentsList.push(`--expected-review-fingerprint=${extra.expectedReviewFingerprint}`);
  if (extra.expectedPlanHash) argumentsList.push(`--expected-plan-hash=${extra.expectedPlanHash}`);
  if (extra.idempotencyKey) argumentsList.push(`--idempotency-key=${extra.idempotencyKey}`);
  if (extra.confirm) argumentsList.push(`--confirm=${extra.confirm}`);
  runNode("reconcile-dev-079-recognition-owner.mjs", argumentsList);
  return JSON.parse(fs.readFileSync(path.join(runOutput, "manifest.json"), "utf8"));
}

function businessHash(database) {
  const payload = {
    candidates: database.prepare(`SELECT id, proposed_owner_id, review_state, group_key, row_version, updated_at
      FROM drawing_recognition_candidates ORDER BY id`).all(),
    decisions: database.prepare("SELECT id, candidate_id, action, before_json, after_json, decided_at FROM drawing_recognition_decisions ORDER BY id").all(),
    events: database.prepare("SELECT id, session_id, impact_fingerprint, result_json, created_at FROM drawing_recognition_formalization_events ORDER BY id").all()
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

let fixtureDb;
try {
  seedDeterministicSourceFixture();
  const primaryBefore = primaryInvariant();
  assert.equal(primaryBefore.payload.foreignKeys.length, 0, "primary foreign keys must be clean before fixture creation");
  assert.equal(primaryBefore.payload.missingRootReferences, 0, "primary root references must be clean before fixture creation");
  assert.equal(primaryBefore.payload.migrationResidue.length, 0, "primary migration residue must be empty before fixture creation");

  const source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  await source.backup(fixtureDbPath);
  source.close();
  const legacySeed = new Database(fixtureDbPath, { fileMustExist: true });
  legacySeed.pragma("foreign_keys = ON");
  legacySeed.exec("DROP TRIGGER IF EXISTS trg_drawing_recognition_part_owner_insert");
  legacySeed.exec("DROP TRIGGER IF EXISTS trg_drawing_recognition_part_owner_update");
  const ownerRows = legacySeed.prepare(`SELECT candidate.id
    FROM drawing_recognition_candidates candidate
    JOIN drawing_recognition_sessions session ON session.id=candidate.session_id
    JOIN drawings drawing ON drawing.id=session.drawing_id AND drawing.company_id=session.company_id
    WHERE drawing.drawing_number='A0002-M01' AND candidate.proposed_owner_type='part_number'
      AND candidate.review_state IN ('accepted','corrected','mapped')
      AND TRIM(COALESCE(candidate.proposed_value,''))<>''
      AND TRIM(COALESCE(candidate.proposed_owner_id,''))<>''
      AND session.id=(SELECT latest.id FROM drawing_recognition_sessions latest
        WHERE latest.drawing_id=drawing.id AND latest.status='review_ready' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)
    ORDER BY candidate.sort_order,candidate.id`).all();
  assert.ok(ownerRows.length >= 3, "canonical A0002 fixture must expose at least three accepted Part-owned candidates");
  const clearOwner = legacySeed.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id=NULL, updated_at=? WHERE id=?");
  const seededAt = new Date().toISOString();
  legacySeed.transaction(() => { for (const row of ownerRows) clearOwner.run(seededAt, row.id); })();
  assert.equal(legacySeed.pragma("foreign_key_check").length, 0, "task-owned legacy ownerless fixture must preserve foreign keys");
  legacySeed.close();
  const schemaPreflight = runReconciliation("inventory", { label: "schema-preflight" });
  assert.throws(() => runNode("apply-dev-079-recognition-owner-schema.mjs", [
    "scripts/apply-dev-079-recognition-owner-schema.mjs",
    `--database=${fixtureDbPath}`,
    "--confirm=APPLY_DEV079_OWNER_SCHEMA",
    "--expected-candidate-fingerprint=wrong-fingerprint",
    `--expected-review-fingerprint=${schemaPreflight.reviewRequestFingerprintBefore}`
  ]), /DEV079_SCHEMA_TARGET_FINGERPRINT_MISMATCH/);
  runNode("apply-dev-079-recognition-owner-schema.mjs", [
    "scripts/apply-dev-079-recognition-owner-schema.mjs",
    `--database=${fixtureDbPath}`,
    "--confirm=APPLY_DEV079_OWNER_SCHEMA",
    `--expected-candidate-fingerprint=${schemaPreflight.targetFingerprintBefore}`,
    `--expected-review-fingerprint=${schemaPreflight.reviewRequestFingerprintBefore}`
  ]);

  fixtureDb = new Database(fixtureDbPath, { fileMustExist: true });
  fixtureDb.pragma("foreign_keys = ON");
  const acceptedOwnerless = fixtureDb.prepare(`SELECT candidate.id, candidate.session_id, candidate.row_version,
      session.company_id, session.row_version AS session_row_version
    FROM drawing_recognition_candidates candidate
    JOIN drawing_recognition_sessions session ON session.id = candidate.session_id
    JOIN drawings drawing ON drawing.id = session.drawing_id
    WHERE drawing.drawing_number = 'A0002-M01' AND candidate.proposed_owner_type = 'part_number'
      AND candidate.review_state IN ('accepted','corrected','mapped')
      AND candidate.field_key IN ('material','surface_finish','heat_treatment')
      AND TRIM(COALESCE(candidate.proposed_value,'')) <> ''
      AND TRIM(COALESCE(candidate.proposed_owner_id,'')) = ''
    ORDER BY candidate.id LIMIT 1`).get();
  assert.ok(acceptedOwnerless?.id, "fixture must retain one A0002 ownerless accepted legacy row before reconciliation");
  const validOwner = fixtureDb.prepare(`SELECT part.id FROM drawing_recognition_sessions session
    JOIN drawings drawing ON drawing.id = session.drawing_id
    JOIN drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
    JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = session.company_id
    WHERE session.id = ? ORDER BY part.part_number, part.id LIMIT 1`).get(acceptedOwnerless.session_id);
  const invalidOwner = fixtureDb.prepare(`SELECT id FROM part_numbers WHERE company_id = ? AND id <> ? ORDER BY id LIMIT 1`).get(acceptedOwnerless.company_id, validOwner.id);
  assert.ok(validOwner?.id && invalidOwner?.id);

  assert.throws(() => fixtureDb.prepare("UPDATE drawing_recognition_candidates SET updated_at = updated_at WHERE id = ?").run(acceptedOwnerless.id), /RECOGNITION_PART_OWNER_INVARIANT/);
  assert.throws(() => fixtureDb.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ? WHERE id = ?").run(invalidOwner.id, acceptedOwnerless.id), /RECOGNITION_PART_OWNER_INVARIANT/);
  fixtureDb.exec("BEGIN IMMEDIATE");
  try {
    fixtureDb.exec("DROP TRIGGER trg_drawing_recognition_part_owner_update");
    const mutantChange = fixtureDb.prepare("UPDATE drawing_recognition_candidates SET updated_at = updated_at WHERE id = ?").run(acceptedOwnerless.id);
    assert.equal(mutantChange.changes, 1, "removing the DB guard mutant must allow the illegal legacy update and make the case fail");
  } finally {
    fixtureDb.exec("ROLLBACK");
  }
  assert.ok(fixtureDb.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_drawing_recognition_part_owner_update'").get(), "rollback must restore the invariant trigger after mutant proof");

  Object.assign(process.env, {
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    PDM_DB_PROVIDER: "sqlite",
    PDM_NUMBER_LIFECYCLE_V2: "true",
    PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
    PDM_DRAWING_RECOGNITION_V1: "true",
    PDM_AUTH_SECRET: "dev-079-invariant-isolated"
  });
  const [{ createAsyncDatabaseClient }, { DrawingRecognitionAsyncRepository }, recognition] = await Promise.all([
    import("../src/lib/db-async-provider.ts"),
    import("../src/lib/repositories/drawing-recognition-async-repository.ts"),
    import("../src/lib/drawing-recognition.ts")
  ]);
  const asyncClient = createAsyncDatabaseClient({ kind: "sqlite", database: fixtureDb });
  const repository = new DrawingRecognitionAsyncRepository(asyncClient);
  const legacyImpact = await repository.calculateImpact({
    sessionId: acceptedOwnerless.session_id,
    companyId: acceptedOwnerless.company_id,
    expectedRowVersion: Number(acceptedOwnerless.session_row_version)
  });
  assert.ok(legacyImpact.blockers.some((blocker) => blocker.candidateId === acceptedOwnerless.id && blocker.reason === "part_owner_required"), `impact must fail closed on legacy accepted ownerless candidate:${JSON.stringify(legacyImpact.blockers)}`);

  const dryRun = runReconciliation("dry-run", { label: "sqlite" });
  assert.equal(dryRun.status, "READ_ONLY_COMPLETE");
  assert.ok(dryRun.plan.length >= 3, "primary-derived fixture must expose repairable ownerless candidates");
  assert.equal(dryRun.targetFingerprintAfter, dryRun.targetFingerprintBefore, "dry-run must be zero-write");
  const idempotencyKey = `qc-${runId}`;
  const applied = runReconciliation("apply", {
    label: "sqlite",
    expectedFingerprint: dryRun.targetFingerprintBefore,
    expectedReviewFingerprint: dryRun.reviewRequestFingerprintBefore,
    expectedPlanHash: dryRun.planHash,
    idempotencyKey,
    confirm: "APPLY_DEV079_RECONCILIATION"
  });
  assert.equal(applied.status, "APPLIED");
  assert.equal(applied.appliedCount, dryRun.plan.length);
  assert.equal(applied.reviewRequestFingerprintAfter, applied.reviewRequestFingerprintBefore, "legacy review snapshots/hashes must remain immutable");
  const replay = runReconciliation("apply", {
    label: "sqlite-replay",
    expectedFingerprint: dryRun.targetFingerprintBefore,
    expectedReviewFingerprint: dryRun.reviewRequestFingerprintBefore,
    expectedPlanHash: dryRun.planHash,
    idempotencyKey,
    confirm: "APPLY_DEV079_RECONCILIATION"
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.appliedCount, 0);
  assert.equal(fixtureDb.prepare(`SELECT COUNT(*) AS count FROM drawing_recognition_candidates
    WHERE proposed_owner_type='part_number' AND review_state IN ('accepted','corrected','mapped')
      AND TRIM(COALESCE(proposed_value,''))<>'' AND TRIM(COALESCE(proposed_owner_id,''))=''`).get().count, 0);

  const actor = fixtureDb.prepare("SELECT id, role FROM users WHERE company_id = ? ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id LIMIT 1").get(acceptedOwnerless.company_id);
  const sourceSession = fixtureDb.prepare(`SELECT session.id FROM drawing_recognition_sessions session
    JOIN drawings drawing ON drawing.id = session.drawing_id
    WHERE session.company_id = ? AND drawing.drawing_number = 'A0002-M01'
      AND EXISTS (SELECT 1 FROM drawing_recognition_sources source WHERE source.session_id = session.id)
    ORDER BY session.created_at DESC, session.id DESC LIMIT 1`).get(acceptedOwnerless.company_id);
  const rerun = await recognition.rerunDrawingRecognition({ sessionId: sourceSession.id, companyId: acceptedOwnerless.company_id, actorId: actor.id, roles: [actor.role], client: asyncClient });
  fixtureDb.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), rerun.id);
  fixtureDb.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id <> ? AND status = 'queued'").run("2999-12-31T00:00:00.000Z", rerun.id);
  const job = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev079-invariant", maxAttempts: 2, allowNativeSources: true, client: asyncClient });
  assert.equal(job.sessionId, rerun.id);
  const owner = job.targetContext.parts.find((part) => part.partNumber === "A0002-P01");
  assert.ok(owner?.id);
  let projection = await recognition.completeDrawingRecognitionJob({
    sessionId: rerun.id,
    workerId: "qc-dev079-invariant",
    sourceSetFingerprint: job.sourceSetFingerprint,
    client: asyncClient,
    results: [{
      sourceId: job.sources.find((source) => /\.sld(?:prt|asm)$/i.test(source.fileName))?.id ?? job.sources[0].id,
      adapterCode: "qc-dev079-native.v1",
      adapterVersion: "1.0.0",
      status: "succeeded",
      observations: [{
        rawText: "材質=CAPA-SUS304",
        rawValue: "CAPA-SUS304",
        normalizedValue: "CAPA-SUS304",
        category: "part_attribute",
        fieldKey: "material",
        fieldLabel: "材質",
        proposedOwnerType: "part_number",
        proposedOwnerId: owner.id,
        proposedOwnerResolution: "resolved",
        applicabilityScope: "overall"
      }]
    }]
  });
  const nativeCandidate = projection.candidates.find((candidate) => candidate.fieldKey === "material" && candidate.proposedValue === "CAPA-SUS304");
  assert.equal(nativeCandidate?.proposedOwnerId, validOwner.id, "repository must canonicalize formal/draft logical owner to formal master");
  const pendingPdf = projection.pendingClientAdapters[0];
  assert.ok(pendingPdf, "fixture must contain one browser PDF adapter source");
  const candidateCountBeforePdf = fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_candidates WHERE session_id=? AND field_key='material' AND proposed_value='CAPA-SUS304'").get(rerun.id).count;
  projection = await recognition.appendDrawingRecognitionClientAdapterResult({
    sessionId: rerun.id,
    companyId: acceptedOwnerless.company_id,
    actorId: actor.id,
    roles: [actor.role],
    client: asyncClient,
    result: {
      sourceId: pendingPdf.sourceId,
      adapterCode: "browser-pdf-ocr.v1",
      adapterVersion: "1.0.0",
      status: "succeeded",
      expectedRowVersion: projection.rowVersion,
      contentHash: pendingPdf.contentHash,
      observations: [{
        rawText: "材質=CAPA-SUS304",
        rawValue: "CAPA-SUS304",
        normalizedValue: "CAPA-SUS304",
        category: "part_attribute",
        fieldKey: "material",
        fieldLabel: "材質",
        proposedOwnerType: "part_number",
        proposedOwnerId: null,
        proposedOwnerResolution: "missing",
        applicabilityScope: "overall"
      }]
    }
  });
  const candidateCountAfterPdf = fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_candidates WHERE session_id=? AND field_key='material' AND proposed_value='CAPA-SUS304'").get(rerun.id).count;
  assert.equal(candidateCountAfterPdf, candidateCountBeforePdf, "native and PDF observations must share one canonical candidate");
  assert.equal(fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_candidate_observations WHERE candidate_id=?").get(nativeCandidate.id).count, 2);

  assert.throws(() => fixtureDb.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id=NULL, review_state='accepted' WHERE id=?").run(nativeCandidate.id), /RECOGNITION_PART_OWNER_INVARIANT/);
  assert.throws(() => fixtureDb.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id=?, review_state='accepted' WHERE id=?").run(invalidOwner.id, nativeCandidate.id), /RECOGNITION_PART_OWNER_INVARIANT/);
  fixtureDb.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id=NULL, review_state='blocked' WHERE id=?").run(nativeCandidate.id);
  const decisionsBefore = fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_decisions WHERE session_id=?").get(rerun.id).count;
  await assert.rejects(() => repository.saveDecisions({
    sessionId: rerun.id, companyId: acceptedOwnerless.company_id, actorId: actor.id,
    expectedRowVersion: projection.rowVersion + 99,
    decisions: [{ candidateId: nativeCandidate.id, action: "defer" }]
  }), (error) => error?.status === 409);
  assert.equal(fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_decisions WHERE session_id=?").get(rerun.id).count, decisionsBefore, "controlled stale fixture must return 409 with zero decision write");
  await assert.rejects(() => repository.saveDecisions({
    sessionId: rerun.id, companyId: acceptedOwnerless.company_id, actorId: actor.id,
    expectedRowVersion: projection.rowVersion,
    decisions: [{ candidateId: nativeCandidate.id, action: "accept" }]
  }), (error) => error?.code === "RECOGNITION_PART_OWNER_REQUIRED" && error?.status === 422);
  await assert.rejects(() => repository.saveDecisions({
    sessionId: rerun.id, companyId: acceptedOwnerless.company_id, actorId: actor.id,
    expectedRowVersion: projection.rowVersion,
    decisions: [{ candidateId: nativeCandidate.id, action: "accept", ownerType: "part_number", ownerId: invalidOwner.id }]
  }), (error) => error?.code === "RECOGNITION_PART_OWNER_INVALID" && error?.status === 422);
  const formalDrawing = fixtureDb.prepare(`SELECT drawing.formal_drawing_number_id AS id
    FROM drawing_recognition_sessions session JOIN drawings drawing ON drawing.id=session.drawing_id
    WHERE session.id=?`).get(rerun.id);
  fixtureDb.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
    VALUES (?, ?, ?, 'reference', ?, ?)`).run(`qc-dev079-ambiguous-${crypto.randomUUID()}`, formalDrawing.id, invalidOwner.id, actor.id, new Date().toISOString());
  await assert.rejects(() => repository.saveDecisions({
    sessionId: rerun.id, companyId: acceptedOwnerless.company_id, actorId: actor.id,
    expectedRowVersion: projection.rowVersion,
    decisions: [{ candidateId: nativeCandidate.id, action: "accept" }]
  }), (error) => error?.code === "RECOGNITION_PART_OWNER_AMBIGUOUS" && error?.status === 422);
  assert.equal(fixtureDb.prepare("SELECT COUNT(*) AS count FROM drawing_recognition_decisions WHERE session_id=?").get(rerun.id).count, decisionsBefore, "rejected commands must not pollute decision audit");

  const beforeGetHash = businessHash(fixtureDb);
  await repository.getProjection(rerun.id, acceptedOwnerless.company_id);
  await repository.getProjection(rerun.id, acceptedOwnerless.company_id);
  const afterGetHash = businessHash(fixtureDb);
  assert.equal(afterGetHash, beforeGetHash, "repeated GET projection must be zero-write");
  assert.equal(fixtureDb.pragma("foreign_key_check").length, 0);

  const primaryAfter = primaryInvariant();
  assert.equal(primaryAfter.hash, primaryBefore.hash, "isolated QA must not mutate primary schema/master identities/FKs");
  const report = {
    schemaVersion: "dev079-owner-invariant-qc-v1",
    runId,
    status: "PASS",
    provider: "sqlite",
    primaryInvariantBefore: primaryBefore,
    primaryInvariantAfter: primaryAfter,
    reconciliation: {
      schemaPreflightCandidateFingerprint: schemaPreflight.targetFingerprintBefore,
      schemaPreflightReviewFingerprint: schemaPreflight.reviewRequestFingerprintBefore,
      inventorySummary: dryRun.inventorySummary,
      planCount: dryRun.plan.length,
      appliedCount: applied.appliedCount,
      idempotentReplayZeroDelta: replay.appliedCount === 0,
      requestSnapshotHashUnchanged: applied.reviewRequestFingerprintBefore === applied.reviewRequestFingerprintAfter
    },
    assertions: {
      legacyImpactFailsClosed: true,
      schemaFingerprintGateMutantDetected: true,
      insertUpdateTrigger: true,
      triggerRemovalMutantDetected: true,
      commandMissingOwner422: true,
      commandAmbiguousOwner422: true,
      commandInvalidOwner422: true,
      controlledStale409ZeroWrite: true,
      crossAdapterCanonicalCandidate: true,
      repeatedGetZeroWrite: beforeGetHash === afterGetHash,
      foreignKeyCheck: 0
    },
    cleanup: { tempRoot, condition: "removed in finally" }
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", outputDir, report: path.join(outputDir, "report.json") }, null, 2));
} finally {
  try { fixtureDb?.close(); } catch {}
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  assert.equal(fs.existsSync(tempRoot), false, "task-owned temp root must be removed");
}
