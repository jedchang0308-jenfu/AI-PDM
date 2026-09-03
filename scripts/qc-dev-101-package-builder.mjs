import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createFixtureDatabase, ids as dev087Ids } from "./qc-dev-087-fixtures.mjs";
import { sha256Canonical } from "../src/lib/drawing-recognition-contract.ts";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev101-package-"));
const sourceDataDir = path.join(tempRoot, "source");
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(dataDir, "repository");
const sourceDbPath = path.join(sourceDataDir, "ai-pdm.sqlite");
const taskDbPath = path.join(dataDir, "ai-pdm.sqlite");
fs.mkdirSync(sourceDataDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });

function seedDeterministicSourceFixture() {
  const database = createFixtureDatabase({ filename: sourceDbPath, rdLifecycle: "preparing" });
  try {
    const createdAt = "2098-08-27T00:00:00.000Z";
    const sourceBytes = Buffer.from("DEV-101 deterministic package fixture\n", "utf8");
    const contentHash = crypto.createHash("sha256").update(sourceBytes).digest("hex");
    const snapshot = { payload: {}, revisionId: dev087Ids.rdRevision, claimId: "claim-dev087-1-1" };
    const snapshotPayload = JSON.stringify(snapshot);
    const snapshotHash = sha256Canonical(snapshot);
    const common = {
      company: dev087Ids.company,
      drawing: dev087Ids.drawing,
      revision: dev087Ids.rdRevision,
      branch: dev087Ids.branch,
      owner: dev087Ids.owner,
      reviewer: dev087Ids.reviewer,
      part: dev087Ids.part,
      createdAt,
      contentHash,
      sourceSize: sourceBytes.byteLength,
      snapshotPayload,
      snapshotHash
    };

    database.prepare("UPDATE users SET role='Admin', system_role_enabled=1 WHERE id=@owner").run(common);
    database.prepare(`INSERT INTO drawing_revision_works (
      id, company_id, drawing_id, branch_id, target_claim_id, owner_user_id,
      proposed_payload, base_hash, row_version, created_at, updated_at
    ) VALUES (
      'work-dev101-package', @company, @drawing, @branch, 'claim-dev087-1-1', @owner,
      '{}', @snapshotHash, 1, @createdAt, @createdAt
    )`).run(common);
    database.prepare(`UPDATE canonical_workbench_states
      SET work_id='work-dev101-package', handling='owner', row_version=row_version+1, updated_at=@createdAt
      WHERE id=@state`).run({ ...common, state: dev087Ids.stateRd });
    database.prepare(`INSERT INTO pdm_work_review_requests (
      id, company_id, request_kind, entity_type, canonical_entity_id, work_id, branch_id,
      reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash, request_status, row_version
    ) VALUES (
      'request-dev101-package', @company, 'drawing_revision', 'drawing', @drawing,
      'work-dev101-package', @branch, @reviewer, 'cycle-dev101-package',
      @snapshotPayload, @snapshotHash, 'pending', 1
    )`).run(common);
    database.prepare(`INSERT INTO file_assets (
      id, storage_provider, storage_key, file_name, file_ext, mime_type, file_size, content_hash,
      linked_entity_type, linked_entity_id, document_category, display_name, uploaded_by
    ) VALUES (
      'asset-dev101-package', 'external', 'asset-dev101-package', 'A0002-M01.txt', 'txt',
      'text/plain', @sourceSize, @contentHash, 'drawing_revision', @revision, 'other',
      'DEV-101 fixture', @owner
    )`).run(common);
    database.prepare(`INSERT INTO drawing_recognition_sessions (
      id, company_id, source_context_type, source_context_id, source_lineage_key, drawing_id,
      drawing_revision_id, source_set_fingerprint, deduplication_key, status, created_by, formalized_at, created_at, updated_at
    ) VALUES (
      'session-dev101-package', @company, 'drawing_revision', @revision,
      'drawing_revision:' || @revision, @drawing, @revision, 'fixture:' || @contentHash,
      'session-dev101-package', 'formalized', @owner, @createdAt, @createdAt, @createdAt
    )`).run(common);
    database.prepare(`INSERT INTO drawing_recognition_sources (
      id, session_id, company_id, file_asset_id, content_hash, file_name, file_ext, mime_type,
      file_size, source_role, sort_order, adapter_plan_json, created_at
    ) VALUES (
      'source-dev101-package', 'session-dev101-package', @company, 'asset-dev101-package',
      @contentHash, 'A0002-M01.txt', 'txt', 'text/plain', @sourceSize, 'drawing_2d', 0,
      '["dev101.fixture.v1"]', @createdAt
    )`).run(common);
    database.prepare(`INSERT INTO drawing_recognition_adapter_results (
      id, session_id, source_id, company_id, adapter_code, adapter_version, status,
      observation_count, diagnostics_json, started_at, completed_at
    ) VALUES (
      'adapter-dev101-package', 'session-dev101-package', 'source-dev101-package', @company,
      'dev101.fixture.v1', '1', 'succeeded', 2, '[]', @createdAt, @createdAt
    )`).run(common);
    const insertObservation = database.prepare(`INSERT INTO drawing_recognition_observations (
      id, session_id, source_id, adapter_result_id, company_id, raw_text, raw_value,
      normalized_value, location_kind, page_number, geometry_json, confidence_band,
      extractor_code, extractor_version, captured_at
    ) VALUES (
      @id, 'session-dev101-package', 'source-dev101-package', 'adapter-dev101-package',
      @company, @text, @value, @value, 'page_region', 1,
      '{"coordinateSpace":"normalized_page","origin":"top_left","x":0.1,"y":0.1,"width":0.2,"height":0.08}',
      'high', 'dev101.fixture.v1', '1', @createdAt
    )`);
    insertObservation.run({ ...common, id: "observation-dev101-package-drawing", text: "製圖者：DEV101", value: "DEV101" });
    insertObservation.run({ ...common, id: "observation-dev101-package-part", text: "自訂規格：QA-SPEC", value: "QA-SPEC" });
    const insertCandidate = database.prepare(`INSERT INTO drawing_recognition_candidates (
      id, session_id, company_id, category, field_key, field_label, raw_value, proposed_value,
      normalized_value, proposed_owner_type, proposed_owner_id, applicability_scope, variant_status,
      confidence_band, review_state, current_formal_value, group_key, sort_order, row_version, created_at, updated_at
    ) VALUES (
      @id, 'session-dev101-package', @company, @category, @fieldKey, @label, @value, @value,
      @value, @ownerType, @ownerId, 'overall', 'added', 'high', 'accepted', NULL,
      @groupKey, @sortOrder, 1, @createdAt, @createdAt
    )`);
    insertCandidate.run({ ...common, id: "candidate-dev101-package-drawing", category: "drawing_revision", fieldKey: "drawn_by_name", label: "製圖者", value: "DEV101", ownerType: null, ownerId: null, groupKey: "dev101:drawn_by_name", sortOrder: 0 });
    insertCandidate.run({ ...common, id: "candidate-dev101-package-part", category: "part_attribute", fieldKey: "custom_specification", label: "自訂規格", value: "QA-SPEC", ownerType: "part_number", ownerId: dev087Ids.part, groupKey: "dev101:part_custom_specification", sortOrder: 1 });
    database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (?, ?, ?, ?)").run("candidate-dev101-package-drawing", "observation-dev101-package-drawing", dev087Ids.company, createdAt);
    database.prepare("INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (?, ?, ?, ?)").run("candidate-dev101-package-part", "observation-dev101-package-part", dev087Ids.company, createdAt);
    if (database.pragma("foreign_key_check").length) throw new Error("DEV101_DETERMINISTIC_FIXTURE_FOREIGN_KEYS");
  } finally {
    database.close();
  }
}

seedDeterministicSourceFixture();
fs.copyFileSync(sourceDbPath, taskDbPath);

process.env.PDM_DB_PROVIDER = "sqlite";
process.env.PDM_DATA_DIR = dataDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;

const checks = [];
function check(id, description, pass, detail = "") { checks.push({ id, description, pass: Boolean(pass), detail }); }
function clone(value) { return structuredClone(value); }
function throwsCode(fn, code) {
  try { fn(); return false; }
  catch (error) { return error && typeof error === "object" && "code" in error && error.code === code; }
}
function primaryFingerprint() {
  const database = new Database(path.join(sourceDataDir, "ai-pdm.sqlite"), { readonly: true, fileMustExist: true });
  try {
    const value = {
      schema: database.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all(),
      roots: database.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY company_id, id").all(),
      parts: database.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY company_id, id").all(),
      drawings: database.prepare("SELECT id, company_id, drawing_number, formal_drawing_number_id FROM drawings ORDER BY company_id, id").all(),
      residue: database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE '%migration%' OR name LIKE '%backup%' OR name LIKE '%_old') ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  } finally { database.close(); }
}
const primaryBefore = primaryFingerprint();
let client = null;
let taskDatabase = null;
let primaryAfter = null;
try {
  const database = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const request = database.prepare("SELECT id, request_kind, entity_type, canonical_entity_id, work_id, branch_id, snapshot_hash, snapshot_payload FROM pdm_work_review_requests WHERE request_status = 'pending' ORDER BY created_at LIMIT 1").get();
  database.close();
  if (!request) throw new Error("No pending PDM review request in source fixture");
  const { createAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
  const { assertReviewPackageRecognitionReady, buildReviewPackage, reviewPackageHash, reviewPackageWorkspaceEvidenceHash, verifyReviewPackageIntegrity } = await import("../src/lib/pdm-review-package.ts");
  const { parseReviewPackageSnapshot } = await import("../src/lib/pdm-review-package-contract.ts");
  taskDatabase = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  client = createAsyncDatabaseClient({ kind: "sqlite", database: taskDatabase });
  const raw = JSON.parse(request.snapshot_payload);
  const basis = request.request_kind === "drawing_revision"
    ? { payload: raw.payload ?? {}, revisionId: raw.revisionId ?? null, claimId: raw.claimId ?? null }
    : { payload: raw };
  const packageValue = await buildReviewPackage(client, {
    companyId: dev087Ids.company,
    requestKind: request.request_kind,
    entityType: request.entity_type,
    canonicalEntityId: request.canonical_entity_id,
    workId: request.work_id,
    branchId: request.branch_id,
    decisionBasis: { hash: request.snapshot_hash, ...basis }
  });
  check("DEV101-PACKAGE-001", "builder captures matrix and same-root target snapshots", packageValue.matrix && packageValue.targets.length > 0 && packageValue.targets.some((target) => target.workspace.entityId === request.canonical_entity_id && target.scope === "submitted"));
  check("DEV101-PACKAGE-002", "builder persists no runtime download URL", !JSON.stringify(packageValue).match(/downloadHref|signedUrl|signed_url/iu));
  const { packageHash, ...body } = packageValue;
  check("DEV101-PACKAGE-003", "package hash verifies against immutable body", packageHash === reviewPackageHash(body));
  check("DEV101-PACKAGE-004", "package limits are respected", packageValue.targets.length <= 200 && packageValue.matrix.cells.length <= 2500 && Buffer.byteLength(JSON.stringify(packageValue), "utf8") <= 8_000_000);
  check("DEV101-PACKAGE-005", "strict parser discriminates valid v2, legacy and malformed envelopes", parseReviewPackageSnapshot(packageValue).kind === "v2" && parseReviewPackageSnapshot({ payload: {} }).kind === "legacy" && parseReviewPackageSnapshot({ ...packageValue, schemaVersion: "unknown" }).kind === "invalid" && parseReviewPackageSnapshot({ ...packageValue, extra: true }).kind === "invalid");
  const duplicate = clone(packageValue); duplicate.targets.push(clone(duplicate.targets[0]));
  const badAxis = clone(packageValue); badAxis.targets[0].axisId = "foreign-axis";
  check("DEV101-PACKAGE-006", "duplicate target and target-axis mismatch fail closed", parseReviewPackageSnapshot(duplicate).kind === "invalid" && parseReviewPackageSnapshot(badAxis).kind === "invalid");
  const targetHashMutant = clone(packageValue); targetHashMutant.targets[0].evidenceHash = "0".repeat(64); delete targetHashMutant.packageHash; targetHashMutant.packageHash = reviewPackageHash(targetHashMutant);
  const matrixHashMutant = clone(packageValue); matrixHashMutant.matrix.evidenceHash = "0".repeat(64); delete matrixHashMutant.packageHash; matrixHashMutant.packageHash = reviewPackageHash(matrixHashMutant);
  const basisHashMutant = clone(packageValue); basisHashMutant.decisionBasis.hash = "0".repeat(64); delete basisHashMutant.packageHash; basisHashMutant.packageHash = reviewPackageHash(basisHashMutant);
  check("DEV101-PACKAGE-007", "inner target, matrix and decision hashes reject mutants even after the outer hash is recomputed", [targetHashMutant, matrixHashMutant, basisHashMutant].every((mutant) => throwsCode(() => verifyReviewPackageIntegrity(mutant, mutant.packageHash), "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED")));
  check("DEV101-PACKAGE-008", "database snapshot hash mismatch is rejected independently of the valid package hash", throwsCode(() => verifyReviewPackageIntegrity(packageValue, "0".repeat(64)), "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED"));
  const oversized = clone(packageValue); oversized.targets[0].workspace.payload.__oversized = "x".repeat(8_000_000);
  const oversizedResult = parseReviewPackageSnapshot(oversized);
  check("DEV101-PACKAGE-009", "existing oversized package is rejected rather than truncated or live-filled", oversizedResult.kind === "invalid" && oversizedResult.reason === "limit");
  const submittedDrawing = packageValue.targets.find((target) => target.scope === "submitted" && target.workspace.kind === "drawing");
  const recognition = submittedDrawing?.workspace.recognition;
  check("DEV101-PACKAGE-010", "submitted Drawing freezes a full versioned recognition projection for the exact revision", recognition?.schemaVersion === "pdm-recognition-review-projection-v1"
    && recognition.session?.drawingId === submittedDrawing.workspace.entityId
    && recognition.session?.drawingRevisionId === submittedDrawing.workspace.revisionId
    && recognition.session?.sourceContextType === "drawing_revision"
    && recognition.session?.sourceContextId === submittedDrawing.workspace.revisionId
    && Array.isArray(recognition.sources) && Array.isArray(recognition.candidateDecisions) && Array.isArray(recognition.fields));
  if (recognition?.schemaVersion === "pdm-recognition-review-projection-v1") {
    const projectionMutant = clone(packageValue);
    const projectionTarget = projectionMutant.targets.find((target) => target.targetKey === submittedDrawing.targetKey);
    projectionTarget.workspace.recognition.session.status = "tampered-after-submit";
    projectionTarget.evidenceHash = reviewPackageWorkspaceEvidenceHash(projectionTarget.workspace);
    delete projectionMutant.packageHash;
    projectionMutant.packageHash = reviewPackageHash(projectionMutant);
    check("DEV101-PACKAGE-011", "recognition projection hash rejects a mutant even after target and package hashes are recomputed", throwsCode(() => verifyReviewPackageIntegrity(projectionMutant, projectionMutant.packageHash), "WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED"));

    const unresolved = clone(packageValue);
    const unresolvedTarget = unresolved.targets.find((target) => target.targetKey === submittedDrawing.targetKey);
    unresolvedTarget.workspace.recognition.fields = [{ ...(unresolvedTarget.workspace.recognition.fields[0] ?? {}), blockingReason: "part_owner_required" }];
    check("DEV101-PACKAGE-012", "approval fails closed when the immutable projection has unresolved Part ownership", throwsCode(() => assertReviewPackageRecognitionReady(unresolved), "WORKBENCH_RECOGNITION_OWNER_UNRESOLVED"));

    const latestLeakId = `dev101-latest-leak-${crypto.randomUUID()}`;
    await client.execute(`INSERT INTO drawing_recognition_sessions (
      id, company_id, source_context_type, source_context_id, source_lineage_key, drawing_id, drawing_revision_id,
      source_set_fingerprint, deduplication_key, status, created_by, created_at, updated_at
    ) VALUES (
      :id, :companyId, 'drawing_number', :sourceContextId, :sourceLineageKey, :drawingId, NULL,
      :sourceSetFingerprint, :deduplicationKey, 'review_ready', (SELECT created_by FROM drawing_recognition_sessions WHERE id = :basisSessionId),
      '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z'
    )`, {
      id: latestLeakId, companyId: "company-jenfu", sourceContextId: submittedDrawing.workspace.identity.code,
      sourceLineageKey: `drawing_number:${submittedDrawing.workspace.identity.code}`, drawingId: submittedDrawing.workspace.entityId,
      sourceSetFingerprint: "latest-session-must-not-leak", deduplicationKey: latestLeakId, basisSessionId: recognition.session.id
    });
    const rebuilt = await buildReviewPackage(client, {
      companyId: dev087Ids.company, requestKind: request.request_kind, entityType: request.entity_type,
      canonicalEntityId: request.canonical_entity_id, workId: request.work_id, branchId: request.branch_id,
      decisionBasis: { hash: request.snapshot_hash, ...basis }
    });
    const rebuiltRecognition = rebuilt.targets.find((target) => target.targetKey === submittedDrawing.targetKey)?.workspace.recognition;
    check("DEV101-PACKAGE-013", "newer recognition from another lineage cannot leak into the exact submitted revision", rebuiltRecognition?.session?.id === recognition.session.id && rebuiltRecognition?.session?.id !== latestLeakId);

    const legacyMeta = clone(packageValue);
    legacyMeta.targets.find((target) => target.targetKey === submittedDrawing.targetKey).workspace.recognition = { sessionId: recognition.session.id, status: recognition.session.status };
    check("DEV101-PACKAGE-014", "legacy recognition metadata stays readable but cannot be approved as a complete decision basis", throwsCode(() => assertReviewPackageRecognitionReady(legacyMeta), "WORKBENCH_RECOGNITION_BASIS_INCOMPLETE"));
  } else {
    for (const [id, description] of [
      ["DEV101-PACKAGE-011", "recognition projection hash rejects a mutant even after target and package hashes are recomputed"],
      ["DEV101-PACKAGE-012", "approval fails closed when the immutable projection has unresolved Part ownership"],
      ["DEV101-PACKAGE-013", "newer recognition from another lineage cannot leak into the exact submitted revision"],
      ["DEV101-PACKAGE-014", "legacy recognition metadata stays readable but cannot be approved as a complete decision basis"]
    ]) check(id, description, false, "fixture has no exact recognition projection");
  }
  await client.close();
  client = null;
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  if (client) await client.close().catch(() => {});
  if (taskDatabase) taskDatabase.close();
  primaryAfter = primaryFingerprint();
  try { fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 }); }
  catch (error) { console.warn(`task-owned cleanup deferred: ${error instanceof Error ? error.message : String(error)}`); }
}
check("DEV101-PACKAGE-PRIMARY", "source fixture schema, canonical identities, migration residue and foreign keys remain unchanged", primaryAfter === primaryBefore);
for (const item of checks) console.log(`${item.pass ? "PASS" : "FAIL"} ${item.id} ${item.description}${item.detail ? ` — ${item.detail}` : ""}`);
const failed = checks.filter((item) => !item.pass);
console.log(`DEV-101 package builder summary: ${checks.length - failed.length}/${checks.length} PASS`);
if (failed.length) process.exitCode = 1;
