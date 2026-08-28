import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";
import { getFreePort } from "./qc-next-app-runner.mjs";

const root = process.cwd();
const runId = `DEV079-PG-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-079-owner-invariant-postgres", runId);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev079-pg-"));
const dataDir = path.join(tempRoot, "data");
const repositoryDir = path.join(tempRoot, "repository");
const clusterDir = path.join(tempRoot, "postgres-cluster");
const postgresLog = path.join(tempRoot, "postgres.log");
const sourceDbPath = path.join(root, "data", "ai-pdm.sqlite");
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });

function primaryInvariant() {
  const database = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    database.pragma("query_only = ON");
    const payload = {
      roots: database.prepare("SELECT COUNT(*) AS count FROM part_roots").get().count,
      parts: database.prepare("SELECT COUNT(*) AS count FROM part_numbers").get().count,
      drawings: database.prepare("SELECT COUNT(*) AS count FROM drawings").get().count,
      missingRootReferences: database.prepare(`SELECT COUNT(*) AS count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id WHERE root.id IS NULL`).get().count,
      migrationResidue: database.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('part_roots_company_scope_migration','part_numbers_company_scope_migration','drawing_numbers_company_scope_migration') ORDER BY name`).all(),
      identityHash: crypto.createHash("sha256").update(JSON.stringify({
        roots: database.prepare("SELECT id, company_id, root_code FROM part_roots ORDER BY id").all(),
        parts: database.prepare("SELECT id, company_id, part_root_id, part_number FROM part_numbers ORDER BY id").all(),
        drawings: database.prepare("SELECT id, company_id, drawing_number FROM drawings ORDER BY id").all()
      })).digest("hex"),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return { payload, hash: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  } finally { database.close(); }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}

function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

async function restoreSnapshot(sourceDatabase, client) {
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const sourceTables = new Set(sourceDatabase.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
  await client.query("SET session_replication_role=replica");
  try {
    for (const { tablename } of tables) {
      if (!sourceTables.has(tablename)) continue;
      const columnResult = await client.query(`SELECT column_name,data_type,is_generated,is_identity
        FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [tablename]);
      const postgresColumns = new Map(columnResult.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
      const columns = sourceDatabase.prepare(`PRAGMA table_info(${quoteIdentifier(tablename)})`).all().map((row) => row.name).filter((column) => postgresColumns.has(column));
      if (columns.length === 0) continue;
      const rows = sourceDatabase.prepare(`SELECT ${columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(tablename)}`).all();
      for (const row of rows) {
        const values = columns.map((column) => normalizeForPostgres(row[column], postgresColumns.get(column)));
        await client.query(`INSERT INTO ${quoteIdentifier(tablename)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) ON CONFLICT DO NOTHING`, values);
      }
    }
  } finally { await client.query("SET session_replication_role=origin"); }
}

function runReconciliation(mode, connectionString, extra = {}) {
  const runOutput = path.join(outputDir, `reconciliation-${mode}-${extra.label ?? "run"}`);
  const env = { ...process.env, DEV079_QA_POSTGRES: connectionString };
  const args = [
    "--experimental-transform-types", "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/reconcile-dev-079-recognition-owner.mjs", "--provider=postgres", `--mode=${mode}`,
    "--connection-string-env=DEV079_QA_POSTGRES", `--output-dir=${runOutput}`
  ];
  if (extra.expectedFingerprint) args.push(`--expected-fingerprint=${extra.expectedFingerprint}`);
  if (extra.expectedReviewFingerprint) args.push(`--expected-review-fingerprint=${extra.expectedReviewFingerprint}`);
  if (extra.expectedPlanHash) args.push(`--expected-plan-hash=${extra.expectedPlanHash}`);
  if (extra.idempotencyKey) args.push(`--idempotency-key=${extra.idempotencyKey}`);
  if (extra.confirm) args.push(`--confirm=${extra.confirm}`);
  run(process.execPath, args, { env });
  return JSON.parse(fs.readFileSync(path.join(runOutput, "manifest.json"), "utf8"));
}

async function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value) => { socket.destroy(); resolve(value); };
    socket.setTimeout(750, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

const primaryBefore = primaryInvariant();
assert.equal(primaryBefore.payload.foreignKeys.length, 0);
assert.equal(primaryBefore.payload.missingRootReferences, 0);
assert.equal(primaryBefore.payload.migrationResidue.length, 0);
const port = await getFreePort();
const databaseName = `dev079_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
const connectionString = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
let started = false;
let client;
let asyncClient;
let sourceDatabase;
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-079 Cloud SQL PostgreSQL invariant, reconciliation and GET-purity parity",
  port,
  owningProcessTree: "qc-dev-079-owner-invariant-postgres -> task-owned PostgreSQL 18 cluster",
  cleanupCondition: "clients closed, cluster stopped, port released, task temp removed",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: tempRoot
} }));

try {
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName]);
  client = new pg.Client({ connectionString, application_name: "ai-pdm-dev079-owner-invariant" });
  await client.connect();
  for (const file of [
    "001_initial_schema.sql",
    "039_allow_recycled_candidate_drawing_codes.sql",
    "042_status_data_rebuild.sql",
    "043_inline_relation_matrix.sql",
    "047_remove_bom_module.sql",
    "048_solidworks_credential_ui_activation.sql",
    "049_retire_standalone_manufacturing_impact.sql",
    "051_part_structure_type_authority.sql"
  ]) await client.query(fs.readFileSync(path.join(root, "db", "postgres", file), "utf8"));
  sourceDatabase = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  await restoreSnapshot(sourceDatabase, client);
  const legacySeed = await client.query(`UPDATE drawing_recognition_candidates candidate
    SET proposed_owner_id=NULL, updated_at=CURRENT_TIMESTAMP
    FROM drawing_recognition_sessions session, drawings drawing
    WHERE session.id=candidate.session_id AND drawing.id=session.drawing_id
      AND drawing.drawing_number='A0002-M01' AND candidate.proposed_owner_type='part_number'
      AND candidate.review_state IN ('accepted','corrected','mapped')
      AND TRIM(COALESCE(candidate.proposed_value,''))<>'' AND TRIM(COALESCE(candidate.proposed_owner_id,''))<>''
      AND session.id=(SELECT latest.id FROM drawing_recognition_sessions latest
        WHERE latest.drawing_id=drawing.id AND latest.status='review_ready' ORDER BY latest.created_at DESC,latest.id DESC LIMIT 1)`);
  assert.ok((legacySeed.rowCount ?? 0) >= 3, "canonical PostgreSQL fixture must expose at least three accepted Part-owned candidates");
  await client.query(fs.readFileSync(path.join(root, "db", "postgres", "050_drawing_recognition_part_owner_invariant.sql"), "utf8"));
  await client.query(fs.readFileSync(path.join(root, "db", "postgres", "050_drawing_recognition_part_owner_invariant.sql"), "utf8"));

  const dryRun = runReconciliation("dry-run", connectionString, { label: "postgres" });
  assert.equal(dryRun.status, "READ_ONLY_COMPLETE");
  assert.ok(dryRun.plan.length >= 3);
  const idempotencyKey = `qc-${runId}`;
  const applied = runReconciliation("apply", connectionString, {
    label: "postgres", expectedFingerprint: dryRun.targetFingerprintBefore, expectedReviewFingerprint: dryRun.reviewRequestFingerprintBefore, expectedPlanHash: dryRun.planHash, idempotencyKey, confirm: "APPLY_DEV079_RECONCILIATION"
  });
  assert.equal(applied.status, "APPLIED");
  assert.equal(applied.reviewRequestFingerprintBefore, applied.reviewRequestFingerprintAfter);
  const replay = runReconciliation("apply", connectionString, {
    label: "postgres-replay", expectedFingerprint: dryRun.targetFingerprintBefore, expectedReviewFingerprint: dryRun.reviewRequestFingerprintBefore, expectedPlanHash: dryRun.planHash, idempotencyKey, confirm: "APPLY_DEV079_RECONCILIATION"
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.appliedCount, 0);

  const candidate = (await client.query(`SELECT candidate.id, candidate.session_id, candidate.company_id
    FROM drawing_recognition_candidates candidate
    JOIN drawing_recognition_sessions session ON session.id=candidate.session_id
    JOIN drawings drawing ON drawing.id=session.drawing_id
    WHERE drawing.drawing_number='A0002-M01' AND candidate.proposed_owner_type='part_number'
      AND candidate.proposed_owner_id IS NOT NULL AND TRIM(COALESCE(candidate.proposed_value,''))<>''
    ORDER BY candidate.id LIMIT 1`)).rows[0];
  assert.ok(candidate?.id);
  await client.query("BEGIN");
  await assert.rejects(() => client.query("UPDATE drawing_recognition_candidates SET proposed_owner_id=NULL, review_state='accepted' WHERE id=$1", [candidate.id]), /RECOGNITION_PART_OWNER_INVARIANT/);
  await client.query("ROLLBACK");

  const [{ createAsyncDatabaseClient }, { DrawingRecognitionAsyncRepository }] = await Promise.all([
    import("../src/lib/db-async-provider.ts"),
    import("../src/lib/repositories/drawing-recognition-async-repository.ts")
  ]);
  asyncClient = createAsyncDatabaseClient({ kind: "postgres", connectionString, maxConnections: 4 });
  const repository = new DrawingRecognitionAsyncRepository(asyncClient);
  const businessState = async () => (await client.query(`SELECT jsonb_build_object(
    'candidates', (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM (SELECT id,proposed_owner_id,review_state,group_key,row_version,updated_at FROM drawing_recognition_candidates) row_value),
    'decisions', (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM (SELECT id,candidate_id,action,before_json,after_json,decided_at FROM drawing_recognition_decisions) row_value),
    'events', (SELECT jsonb_agg(to_jsonb(row_value) ORDER BY row_value.id) FROM (SELECT id,session_id,impact_fingerprint,result_json,created_at FROM drawing_recognition_formalization_events) row_value)
  ) AS payload`)).rows[0].payload;
  const beforeGet = crypto.createHash("sha256").update(JSON.stringify(await businessState())).digest("hex");
  await Promise.all([
    repository.getProjection(candidate.session_id, candidate.company_id),
    repository.getProjection(candidate.session_id, candidate.company_id)
  ]);
  const afterGet = crypto.createHash("sha256").update(JSON.stringify(await businessState())).digest("hex");
  assert.equal(afterGet, beforeGet, "concurrent PostgreSQL GET projections must be zero-write");
  assert.equal(Number((await client.query(`SELECT COUNT(*) AS count FROM drawing_recognition_candidates
    WHERE proposed_owner_type='part_number' AND review_state IN ('accepted','corrected','mapped')
      AND TRIM(COALESCE(proposed_value,''))<>'' AND TRIM(COALESCE(proposed_owner_id,''))=''`)).rows[0].count), 0);

  const primaryAfter = primaryInvariant();
  assert.equal(primaryAfter.hash, primaryBefore.hash);
  const report = {
    schemaVersion: "dev079-owner-invariant-postgres-qc-v1",
    runId,
    status: "PASS",
    provider: "postgres",
    migrationAppliedTwice: true,
    reconciliation: { planCount: dryRun.plan.length, appliedCount: applied.appliedCount, idempotentReplayZeroDelta: replay.appliedCount === 0 },
    assertions: { triggerRejectsOwnerlessAccepted: true, concurrentGetZeroWrite: beforeGet === afterGet, ownerlessAcceptedAfter: 0 },
    primaryInvariantBefore: primaryBefore,
    primaryInvariantAfter: primaryAfter,
    cleanup: { port, tempRoot, condition: "verified in finally" }
  };
  fs.writeFileSync(path.join(outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ status: "PASS", outputDir, report: path.join(outputDir, "report.json") }, null, 2));
} finally {
  if (asyncClient) await asyncClient.close().catch(() => undefined);
  if (sourceDatabase) sourceDatabase.close();
  if (client) await client.end().catch(() => undefined);
  if (started) spawnSync(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { cwd: root, encoding: "utf8", windowsHide: true, stdio: "ignore" });
  assert.equal(await isPortListening(port), false, "task-owned PostgreSQL port must be released");
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  assert.equal(fs.existsSync(tempRoot), false, "task-owned PostgreSQL temp root must be removed");
}
