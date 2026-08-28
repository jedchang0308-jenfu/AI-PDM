import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";
import pg from "pg";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV079-OWNER-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-079-owner-resolution", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-owner-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(tempRoot, "repository");
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const fixtureDbPath = path.join(dataDir, "ai-pdm.sqlite");
const fixtureMutations = [];
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
process.on("exit", () => {
  try {
    if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  } catch {}
});

function primaryInvariant() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const payload = {
      roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
      parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
      drawings: database.prepare("SELECT COUNT(*) AS count FROM drawings").get().count,
      missingRootReferences: database.prepare(`SELECT COUNT(*) AS count
        FROM part_numbers part LEFT JOIN part_roots root ON root.id = part.part_root_id
        WHERE root.id IS NULL`).get().count,
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  }
  return result;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

async function restoreSqliteSnapshotToPostgres(sourceDatabase, postgresClient) {
  const tables = (await postgresClient.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const sourceTables = new Set(sourceDatabase.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await postgresClient.query("SET session_replication_role=replica");
  try {
    for (const { tablename } of tables) {
      if (!sourceTables.has(tablename)) continue;
      const columnResult = await postgresClient.query(`SELECT column_name,data_type,is_generated,is_identity
        FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [tablename]);
      const postgresColumns = new Map(columnResult.rows
        .filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO")
        .map((row) => [row.column_name, row]));
      const columns = sourceDatabase.prepare(`PRAGMA table_info(${quoteIdentifier(tablename)})`).all()
        .map((row) => row.name)
        .filter((column) => postgresColumns.has(column));
      if (columns.length === 0) continue;
      const rows = sourceDatabase.prepare(`SELECT ${columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(tablename)}`).all();
      for (const row of rows) {
        const values = columns.map((column) => normalizeForPostgres(row[column], postgresColumns.get(column)));
        await postgresClient.query(
          `INSERT INTO ${quoteIdentifier(tablename)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`,
          values
        );
      }
    }
  } finally {
    await postgresClient.query("SET session_replication_role=origin");
  }
}

async function runPostgresOwnerResolutionCheck(input) {
  const clusterDir = path.join(tempRoot, "postgres-cluster");
  const postgresLog = path.join(tempRoot, "postgres.log");
  const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
  const databaseName = `dev079_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
  const port = await getFreePort();
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
  let started = false;
  let postgresClient;
  let asyncClient;
  let sourceDatabase;
  try {
    console.log(JSON.stringify({ runtimeDeclaration: {
      project: root,
      purpose: "DEV-079 Cloud SQL PostgreSQL owner-resolution provider and concurrency parity",
      port,
      owningProcessTree: "qc-dev-079-owner-resolution -> task-owned PostgreSQL cluster",
      cleanupCondition: "connections closed, PostgreSQL stopped, task temp removed",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      mutationScope: tempRoot
    } }));
    run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
    run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
    started = true;
    run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName]);
    postgresClient = new pg.Client({ connectionString, application_name: "ai-pdm-dev079-owner-resolution" });
    await postgresClient.connect();
    for (const file of [
      "001_initial_schema.sql",
      "039_allow_recycled_candidate_drawing_codes.sql",
      "042_status_data_rebuild.sql",
      "043_inline_relation_matrix.sql",
      "048_shared_assembly_bom.sql",
      "049_solidworks_credential_ui_activation.sql"
    ]) {
      await postgresClient.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
    }
    sourceDatabase = new Database(fixtureDbPath, { readonly: true, fileMustExist: true });
    await restoreSqliteSnapshotToPostgres(sourceDatabase, postgresClient);
    const before = await postgresClient.query("SELECT row_version FROM drawing_recognition_candidates WHERE id=$1", [input.candidateId]);
    assert.equal(before.rows.length, 1, "PostgreSQL fixture must contain the legacy candidate");

    const [{ createAsyncDatabaseClient }, { DrawingRecognitionAsyncRepository }] = await Promise.all([
      import("../src/lib/db-async-provider.ts"),
      import("../src/lib/repositories/drawing-recognition-async-repository.ts")
    ]);
    asyncClient = createAsyncDatabaseClient({ kind: "postgres", connectionString, maxConnections: 4 });
    const repository = new DrawingRecognitionAsyncRepository(asyncClient);
    const [first, second] = await Promise.all([
      repository.getProjection(input.sessionId, input.companyId),
      repository.getProjection(input.sessionId, input.companyId)
    ]);
    assert.equal(first.candidates.find((candidate) => candidate.id === input.candidateId)?.proposedOwnerId, input.ownerId);
    assert.equal(second.candidates.find((candidate) => candidate.id === input.candidateId)?.proposedOwnerId, input.ownerId);
    const after = await postgresClient.query("SELECT proposed_owner_id,row_version FROM drawing_recognition_candidates WHERE id=$1", [input.candidateId]);
    assert.equal(after.rows[0].proposed_owner_id, input.ownerId, "PostgreSQL read path must repair the unique owner");
    assert.equal(Number(after.rows[0].row_version), Number(before.rows[0].row_version) + 1, "concurrent PostgreSQL reads must repair exactly once");
    return { provider: "postgres", concurrentReads: 2, repairedExactlyOnce: true, portReleasedOnCleanup: true };
  } finally {
    if (sourceDatabase) sourceDatabase.close();
    if (asyncClient) await asyncClient.close().catch(() => undefined);
    if (postgresClient) await postgresClient.end().catch(() => undefined);
    if (started) {
      spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        stdio: "ignore"
      });
    }
  }
}

const primaryBefore = primaryInvariant();
assert.equal(primaryBefore.payload.foreignKeys.length, 0, "primary database must be foreign-key clean before isolated QC");
assert.equal(primaryBefore.payload.missingRootReferences, 0, "primary database must have valid part-root references");
assert.equal(primaryBefore.payload.migrationResidue.length, 0, "primary database must not contain company-scope migration residue");
const source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
await source.backup(fixtureDbPath);
source.close();

Object.assign(process.env, {
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  PDM_DB_PROVIDER: "sqlite",
  PDM_NUMBER_LIFECYCLE_V2: "true",
  PDM_UNIFIED_DRAWING_WORKBENCH_V1: "true",
  PDM_DRAWING_RECOGNITION_V1: "true",
  PDM_AUTH_SECRET: "dev-079-owner-resolution-isolated"
});

const [{ getDb }, recognition] = await Promise.all([
  import("../src/lib/db.ts"),
  import("../src/lib/drawing-recognition.ts")
]);
const db = getDb();
const companyId = "company-jenfu";
const actor = db.prepare("SELECT id, role FROM users WHERE company_id = ? ORDER BY CASE role WHEN 'Admin' THEN 0 ELSE 1 END, id LIMIT 1").get(companyId);
assert.ok(actor?.id, "isolated QC requires one company actor");
const sourceSession = db.prepare(`SELECT session.id
  FROM drawing_recognition_sessions session
  JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
  WHERE session.company_id = ? AND drawing.drawing_number = 'A0044-M01'
    AND EXISTS (SELECT 1 FROM drawing_recognition_sources source WHERE source.session_id = session.id)
  ORDER BY session.created_at DESC, session.id DESC LIMIT 1`).get(companyId);
assert.ok(sourceSession?.id, "A0044-M01 requires an existing recognition source session");
const part = db.prepare("SELECT id, part_number FROM part_numbers WHERE company_id = ? AND part_number = 'A0044-P01' ORDER BY created_at, id LIMIT 1").get(companyId);
assert.ok(part?.id, "A0044-P01 must exist in the isolated fixture");
const otherPart = db.prepare("SELECT id, part_number FROM part_numbers WHERE company_id = ? AND id <> ? ORDER BY created_at, id LIMIT 1").get(companyId, part.id);
assert.ok(otherPart?.id, "multi-owner fail-closed coverage requires a second company part");

const session = await recognition.rerunDrawingRecognition({ sessionId: sourceSession.id, companyId, actorId: actor.id, roles: [actor.role] });
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id = ?").run(new Date(0).toISOString(), session.id);
db.prepare("UPDATE drawing_recognition_sessions SET not_before = ? WHERE id <> ? AND status = 'queued'").run("2999-12-31T00:00:00.000Z", session.id);
const job = await recognition.claimDrawingRecognitionJob({ workerId: "qc-dev-079-owner", maxAttempts: 2 });
assert.equal(job?.sessionId, session.id, "worker must claim the task-owned A0044 rerun");
assert.deepEqual([...new Set(job.targetContext.parts.map((item) => item.partNumber))], ["A0044-P01"]);

const ingestedProjection = await recognition.completeDrawingRecognitionJob({
  sessionId: session.id,
  workerId: "qc-dev-079-owner",
  sourceSetFingerprint: job.sourceSetFingerprint,
  results: [{
    sourceId: job.sources.find((item) => /\.sldasm$/iu.test(item.fileName))?.id ?? job.sources[0].id,
    adapterCode: "qc-dev-079-owner.v1",
    adapterVersion: "1.0.0",
    status: "succeeded",
    observations: [
      {
        rawText: "品名=軸承座_BS",
        rawValue: "軸承座_BS",
        category: "part_attribute",
        fieldKey: "part_name",
        fieldLabel: "品名",
        proposedOwnerType: "part_number",
        proposedOwnerId: part.id,
        proposedOwnerResolution: "resolved",
        applicabilityScope: "document"
      },
      {
        rawText: "材質=SUS304",
        rawValue: "SUS304",
        category: "part_attribute",
        fieldKey: "material",
        fieldLabel: "材質",
        proposedOwnerType: "part_number",
        proposedOwnerId: null,
        proposedOwnerResolution: "missing",
        applicabilityScope: "document"
      },
      {
        rawText: "熱處理=角法",
        rawValue: "角法",
        category: "part_attribute",
        fieldKey: "heat_treatment",
        fieldLabel: "熱處理",
        proposedOwnerType: "part_number",
        proposedOwnerId: null,
        proposedOwnerResolution: "missing",
        applicabilityScope: "document"
      }
    ]
  }]
});
const material = ingestedProjection.candidates.find((candidate) => candidate.fieldKey === "material");
const partName = ingestedProjection.candidates.find((candidate) => candidate.fieldKey === "part_name");
const heatTreatment = ingestedProjection.candidates.find((candidate) => candidate.fieldKey === "heat_treatment");
assert.ok(material?.id && partName?.id && heatTreatment?.id, "owner-resolution fixture must contain all three part candidates");
assert.equal(material?.proposedOwnerId, part.id, "one valid part owner must backfill the ownerless candidate");
assert.equal(material?.reviewState, "proposed");

const materialBeforeLegacyRepair = db.prepare("SELECT row_version FROM drawing_recognition_candidates WHERE id = ?").get(material.id);
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = NULL, review_state = 'blocked' WHERE id = ?").run(material.id);
fixtureMutations.push({ kind: "legacy_session_simulation", candidateId: material.id, changed: ["proposed_owner_id", "review_state"] });
const legacyProjection = await recognition.getDrawingRecognitionProjection({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role]
});
const repairedMaterial = legacyProjection.candidates.find((candidate) => candidate.id === material.id);
assert.equal(repairedMaterial?.proposedOwnerId, part.id, "reading a legacy session must repair its unique missing part owner");
assert.equal(repairedMaterial?.reviewState, "proposed", "legacy repair must recompute the review state");
assert.equal(repairedMaterial?.rowVersion, materialBeforeLegacyRepair.row_version + 1, "legacy repair must advance the repaired candidate exactly once");
const idempotentProjection = await recognition.getDrawingRecognitionProjection({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role]
});
assert.equal(
  idempotentProjection.candidates.find((candidate) => candidate.id === material.id)?.rowVersion,
  repairedMaterial.rowVersion,
  "a second projection read must not rewrite an already repaired candidate"
);

db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = NULL, review_state = 'blocked' WHERE session_id = ?").run(session.id);
fixtureMutations.push({ kind: "zero_owner_fixture", sessionId: session.id, changed: ["proposed_owner_id", "review_state"] });
const zeroOwnerProjection = await recognition.getDrawingRecognitionProjection({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role]
});
assert.equal(
  zeroOwnerProjection.candidates.filter((candidate) => candidate.proposedOwnerType === "part_number").every((candidate) => candidate.proposedOwnerId === null),
  true,
  "zero resolved part owners must remain unresolved"
);

const otherPartStatus = db.prepare("SELECT record_status FROM part_numbers WHERE id = ?").get(otherPart.id).record_status;
db.prepare("UPDATE part_numbers SET record_status = 'Obsolete' WHERE id = ?").run(otherPart.id);
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ?, review_state = 'proposed' WHERE id = ?").run(otherPart.id, partName.id);
fixtureMutations.push({
  kind: "invalid_owner_fixture",
  candidateId: partName.id,
  ownerId: otherPart.id,
  ownerStatus: "Obsolete",
  unresolvedCandidateId: material.id
});
const invalidOwnerProjection = await recognition.getDrawingRecognitionProjection({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role]
});
assert.equal(
  invalidOwnerProjection.candidates.find((candidate) => candidate.id === material.id)?.proposedOwnerId,
  null,
  "an obsolete part owner must not be used to repair another candidate"
);
db.prepare("UPDATE part_numbers SET record_status = ? WHERE id = ?").run(otherPartStatus, otherPart.id);

db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ?, review_state = 'proposed' WHERE id = ?").run(part.id, partName.id);
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ?, review_state = 'proposed' WHERE id = ?").run(otherPart.id, heatTreatment.id);
fixtureMutations.push({
  kind: "multi_owner_fixture",
  sessionId: session.id,
  ownerIds: [part.id, otherPart.id],
  unresolvedCandidateId: material.id
});
const multiOwnerProjection = await recognition.getDrawingRecognitionProjection({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role]
});
assert.equal(
  multiOwnerProjection.candidates.find((candidate) => candidate.id === material.id)?.proposedOwnerId,
  null,
  "multiple resolved part owners must fail closed"
);

db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = NULL, review_state = 'blocked' WHERE id IN (?, ?)").run(material.id, heatTreatment.id);
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ?, review_state = 'proposed' WHERE id = ?").run(part.id, partName.id);
fixtureMutations.push({ kind: "owner_guard_fixture", candidateId: material.id, changed: ["proposed_owner_id", "review_state"] });
let ownerGuard = false;
try {
  await recognition.saveDrawingRecognitionDecisions({
    sessionId: session.id,
    companyId,
    actorId: actor.id,
    roles: [actor.role],
    expectedRowVersion: multiOwnerProjection.rowVersion,
    decisions: [{ candidateId: material.id, action: "accept" }]
  });
} catch (error) {
  ownerGuard = error?.code === "RECOGNITION_PART_OWNER_REQUIRED" && error?.status === 422;
}
assert.equal(ownerGuard, true, "ownerless accept must fail with the repository guard");
const deferred = await recognition.saveDrawingRecognitionDecisions({
  sessionId: session.id,
  companyId,
  actorId: actor.id,
  roles: [actor.role],
  expectedRowVersion: multiOwnerProjection.rowVersion,
  decisions: [{ candidateId: material.id, action: "defer" }]
});
assert.equal(deferred.candidates.find((candidate) => candidate.id === material.id)?.reviewState, "deferred");
assert.equal(db.pragma("foreign_key_check").length, 0, "isolated fixture must remain foreign-key clean");

db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = NULL, review_state = 'blocked' WHERE id = ?").run(material.id);
db.prepare("UPDATE drawing_recognition_candidates SET proposed_owner_id = ?, review_state = 'proposed' WHERE id IN (?, ?)").run(part.id, partName.id, heatTreatment.id);
fixtureMutations.push({
  kind: "postgres_legacy_concurrency_fixture",
  sessionId: session.id,
  candidateId: material.id,
  uniqueOwnerId: part.id
});
db.pragma("wal_checkpoint(TRUNCATE)");
const postgresParity = await runPostgresOwnerResolutionCheck({
  sessionId: session.id,
  companyId,
  candidateId: material.id,
  ownerId: part.id
});

const primaryAfter = primaryInvariant();
assert.equal(primaryAfter.hash, primaryBefore.hash, "isolated QC must not mutate primary identities or foreign keys");
const report = {
  dev: "DEV-079",
  result: "PASS",
  sourceDrawing: "A0044-M01",
  targetPart: part.part_number,
  uniqueOwnerBackfilled: material.proposedOwnerId === part.id,
  legacyProjectionSelfHealed: repairedMaterial?.proposedOwnerId === part.id,
  legacyProjectionRepairIdempotent: idempotentProjection.candidates.find((candidate) => candidate.id === material.id)?.rowVersion === repairedMaterial?.rowVersion,
  zeroOwnerFailedClosed: zeroOwnerProjection.candidates.every((candidate) => candidate.proposedOwnerId === null),
  invalidOwnerFailedClosed: invalidOwnerProjection.candidates.find((candidate) => candidate.id === material.id)?.proposedOwnerId === null,
  multipleOwnersFailedClosed: multiOwnerProjection.candidates.find((candidate) => candidate.id === material.id)?.proposedOwnerId === null,
  ownerlessAcceptRejectedWith422: ownerGuard,
  ownerlessDeferAllowed: true,
  postgresParity,
  fixtureMutations,
  primaryHashUnchanged: primaryAfter.hash === primaryBefore.hash,
  fixtureForeignKeysClean: true,
  completedAt: new Date().toISOString()
};
fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, outputDir }, null, 2));
db.close();
fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
