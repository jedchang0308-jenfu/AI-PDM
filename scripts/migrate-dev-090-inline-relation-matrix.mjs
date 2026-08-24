import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import pg from "pg";

const argv = process.argv.slice(2);
const flags = new Set(argv);
const option = (name) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const provider = (option("--provider") ?? "sqlite").toLowerCase();
const mode = option("--mode") ?? (flags.has("--apply-local") ? "local-apply" : "inventory");
const isDryRun = flags.has("--dry-run") || mode === "inventory";
const reportDir = path.resolve(option("--output-dir") ?? path.join("output", "qa", "dev-090-migration"));
fs.mkdirSync(reportDir, { recursive: true });

const sha = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const reportFile = (prefix, report) => {
  const reportPath = path.join(reportDir, `${prefix}-${Date.now()}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return reportPath;
};
const fail = (code, detail) => {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
};

if (!(["sqlite", "postgres"].includes(provider))) fail("DEV090_PROVIDER_UNSUPPORTED", provider);

function relationPreflightSql() {
  return {
    duplicates: `SELECT drawing_number_id, part_number_id, COUNT(*) AS count
      FROM drawing_part_links GROUP BY drawing_number_id, part_number_id HAVING COUNT(*) > 1`,
    multiPrimary: `SELECT part_number_id, COUNT(*) AS count FROM drawing_part_links
      WHERE link_type = 'primary_manufacturing' GROUP BY part_number_id HAVING COUNT(*) > 1`,
    orphan: `SELECT l.id FROM drawing_part_links l
      LEFT JOIN drawing_numbers d ON d.id = l.drawing_number_id
      LEFT JOIN part_numbers p ON p.id = l.part_number_id
      WHERE d.id IS NULL OR p.id IS NULL OR d.company_id <> p.company_id OR d.part_root_id <> p.part_root_id`,
  };
}

function sqliteTableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table));
}
function sqliteRows(db, sql) { return db.prepare(sql).all(); }
function sqliteCount(db, table, where = "") {
  if (!sqliteTableExists(db, table)) return 0;
  return Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`).get().count);
}
function sqliteLinkInventory(db) {
  const rows = sqliteRows(db, `SELECT id, drawing_number_id, part_number_id, link_type, created_by, created_at
    FROM drawing_part_links ORDER BY drawing_number_id, part_number_id, link_type, id`);
  return { count: rows.length, rows, hash: sha(rows) };
}
function sqlitePreflight(db) {
  const sql = relationPreflightSql();
  const duplicates = sqliteRows(db, sql.duplicates);
  const multiPrimary = sqliteRows(db, sql.multiPrimary);
  const orphan = sqliteRows(db, sql.orphan);
  const activeRelationWork = sqliteCount(db, "relation_change_works");
  const activeRelationReview = sqliteCount(db, "pdm_work_review_requests", "request_kind = 'relation_change' OR entity_type = 'relation'");
  const relationState = sqliteCount(db, "canonical_workbench_states", "entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')");
  const relationAggregate = sqliteCount(db, "pdm_workbench_aggregates", "entity_type = 'relation'");
  const unresolvedQuarantine = sqliteCount(db, "pdm_workbench_migration_quarantine", "resolution IS NULL AND lower(source_kind) LIKE '%relation%'");
  return {
    duplicates, multiPrimary, orphan,
    activeRelationWork, activeRelationReview, relationState, relationAggregate, unresolvedQuarantine,
    unresolved: duplicates.length + multiPrimary.length + orphan.length + activeRelationWork + activeRelationReview + unresolvedQuarantine,
  };
}

async function runSqlite() {
  const requested = option("--database") ?? option("--db") ?? path.join(process.env.PDM_DATA_DIR?.trim() || "data", "ai-pdm.sqlite");
  const dbPath = path.resolve(requested);
  const workspaceRoot = path.resolve(process.cwd());
  const expectedSuffix = `${path.sep}ai-pdm.sqlite`;
  if (!dbPath.toLowerCase().endsWith(expectedSuffix) || !dbPath.toLowerCase().startsWith(workspaceRoot.toLowerCase())) fail("DEV090_LOCAL_SQLITE_PATH_REQUIRED");
  if (!fs.existsSync(dbPath) || fs.lstatSync(dbPath).isSymbolicLink()) fail("DEV090_LOCAL_SQLITE_PATH_REQUIRED");
  const applyLocal = mode === "local-apply" || flags.has("--apply-local");
  if (applyLocal && !flags.has("--confirm-local-dev-090")) fail("DEV090_LOCAL_APPLY_REQUIRES_CONFIRMATION");
  const db = new Database(dbPath, applyLocal ? undefined : { readonly: true, fileMustExist: true });
  db.pragma("foreign_keys=ON");
  const before = { links: sqliteLinkInventory(db), preflight: sqlitePreflight(db) };
  if (before.preflight.unresolved !== 0) {
    const reportPath = reportFile("sqlite", { devId: "DEV-090", provider, mode: applyLocal ? "local-apply" : "inventory", dbPath, before, status: "BLOCKED" });
    db.close();
    console.log(JSON.stringify({ status: "BLOCKED", reportPath, unresolved: before.preflight.unresolved }, null, 2));
    process.exitCode = 2;
    return;
  }
  if (applyLocal) {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Re-read all fail-closed checks inside the same write transaction.
      const inTx = sqlitePreflight(db);
      if (inTx.unresolved !== 0) fail("DEV090_PREFLIGHT_CHANGED", inTx.unresolved);
      if (sqliteTableExists(db, "pdm_work_review_requests")) db.exec("DELETE FROM pdm_work_review_requests WHERE request_kind = 'relation_change' OR entity_type = 'relation'");
      if (sqliteTableExists(db, "canonical_workbench_states")) db.exec("DELETE FROM canonical_workbench_states WHERE entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')");
      if (sqliteTableExists(db, "pdm_workbench_aggregates")) db.exec("DELETE FROM pdm_workbench_aggregates WHERE entity_type = 'relation'");
      if (sqliteTableExists(db, "relation_change_works")) db.exec("DROP TABLE relation_change_works");
      db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_drawing_part_links_unique_pair ON drawing_part_links(drawing_number_id, part_number_id)");
      if (sqliteTableExists(db, "pdm_workbench_state_authority_control")) db.exec("UPDATE pdm_workbench_state_authority_control SET mode = 'canonical_only', schema_hash = 'dev090-v1', row_version = row_version + 1, switched_at = datetime('now') WHERE id = 1");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      db.close();
      throw error;
    }
  }
  const after = { links: sqliteLinkInventory(db), preflight: sqlitePreflight(db) };
  const report = { devId: "DEV-090", provider, mode: applyLocal ? "local-apply" : "inventory", dbPath, before, after, sourceTargetReconciliation: before.links.hash === after.links.hash && before.links.count === after.links.count, status: "PASS" };
  const reportPath = reportFile("sqlite", report);
  db.close();
  console.log(JSON.stringify({ status: "PASS", reportPath, applied: applyLocal, linkCount: after.links.count }, null, 2));
}

async function pgTableExists(client, table) {
  const result = await client.query("SELECT to_regclass($1) AS reg", [table]);
  return Boolean(result.rows[0]?.reg);
}
async function pgCount(client, table, where = "") {
  if (!(await pgTableExists(client, table))) return 0;
  const result = await client.query(`SELECT COUNT(*)::bigint AS count FROM ${table}${where ? ` WHERE ${where}` : ""}`);
  return Number(result.rows[0].count);
}
async function pgRows(client, sql) { return (await client.query(sql)).rows; }
async function pgLinkInventory(client) {
  const rows = await pgRows(client, `SELECT id, drawing_number_id, part_number_id, link_type, created_by, created_at
    FROM drawing_part_links ORDER BY drawing_number_id, part_number_id, link_type, id`);
  return { count: rows.length, rows, hash: sha(rows) };
}
async function pgPreflight(client) {
  const sql = relationPreflightSql();
  const duplicates = await pgRows(client, sql.duplicates);
  const multiPrimary = await pgRows(client, sql.multiPrimary);
  const orphan = await pgRows(client, sql.orphan);
  const activeRelationWork = await pgCount(client, "relation_change_works");
  const activeRelationReview = await pgCount(client, "pdm_work_review_requests", "request_kind = 'relation_change' OR entity_type = 'relation'");
  const relationState = await pgCount(client, "canonical_workbench_states", "entity_type = 'relation' OR data_layer IN ('relation_formal', 'relation_work')");
  const relationAggregate = await pgCount(client, "pdm_workbench_aggregates", "entity_type = 'relation'");
  const unresolvedQuarantine = await pgCount(client, "pdm_workbench_migration_quarantine", "resolution IS NULL AND source_kind ILIKE '%relation%'");
  return { duplicates, multiPrimary, orphan, activeRelationWork, activeRelationReview, relationState, relationAggregate, unresolvedQuarantine, unresolved: duplicates.length + multiPrimary.length + orphan.length + activeRelationWork + activeRelationReview + unresolvedQuarantine };
}

async function runPostgres() {
  const envName = option("--connection-env") ?? "PDM_POSTGRES_URL";
  const connectionString = process.env[envName] ?? (envName === "PDM_POSTGRES_URL" ? process.env.DATABASE_URL : undefined);
  if (!connectionString) fail("DEV090_POSTGRES_CONNECTION_REQUIRED", `set ${envName}`);
  if (!["cloud_sql_postgres", "postgres", "postgresql"].includes((process.env.PDM_DB_PROVIDER ?? "").toLowerCase())) fail("DEV090_POSTGRES_PROVIDER_GUARD", "PDM_DB_PROVIDER=cloud_sql_postgres");
  const apply = flags.has("--apply");
  if (apply && mode === "rehearsal" && process.env.PDM_DEV090_ISOLATED_RESTORE !== "1") fail("DEV090_REHEARSAL_GUARD", "PDM_DEV090_ISOLATED_RESTORE=1");
  if (apply && mode === "cutover" && process.env.PDM_DEV090_PRODUCTION_CUTOVER_AUTHORIZED !== "1") fail("DEV090_PRODUCTION_AUTHORIZATION_REQUIRED");
  if (apply && !["rehearsal", "cutover"].includes(mode)) fail("DEV090_POSTGRES_APPLY_MODE_REQUIRED");
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const before = { links: await pgLinkInventory(client), preflight: await pgPreflight(client) };
    if (before.preflight.unresolved !== 0) {
      const reportPath = reportFile("postgres", { devId: "DEV-090", provider, mode, before, status: "BLOCKED" });
      console.log(JSON.stringify({ status: "BLOCKED", reportPath, unresolved: before.preflight.unresolved }, null, 2));
      process.exitCode = 2;
      return;
    }
    if (apply) {
      const migration = fs.readFileSync(path.resolve("db/postgres/043_inline_relation_matrix.sql"), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(migration);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const after = { links: await pgLinkInventory(client), preflight: await pgPreflight(client) };
    const reconciliation = before.links.hash === after.links.hash && before.links.count === after.links.count && after.preflight.unresolved === 0;
    if (!reconciliation) fail("DEV090_POSTGRES_RECONCILIATION_FAILED");
    const report = { devId: "DEV-090", provider, mode: apply ? mode : "inventory", before, after, sourceTargetReconciliation: reconciliation, productionConnected: mode === "cutover", status: "PASS" };
    const reportPath = reportFile("postgres", report);
    console.log(JSON.stringify({ status: "PASS", reportPath, applied: apply }, null, 2));
  } finally {
    await client.end();
  }
}

if (provider === "sqlite") await runSqlite();
else await runPostgres();
