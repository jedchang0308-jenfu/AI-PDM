#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";

const root = process.cwd();
const argv = process.argv.slice(2);
const option = (name, fallback = null) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const sourcePath = path.resolve(option("--source", ""));
const outputDir = path.resolve(option("--output-dir", path.join("output", "qa", "production-snapshot-postgres", new Date().toISOString().replace(/[:.]/gu, "-"))));
const port = Number(option("--port", "55487"));
const expectedCommit = option("--expected-commit", spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim());
const postgresBin = path.resolve(option("--postgres-bin", process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin"));
const requiredExecutables = ["initdb.exe", "pg_ctl.exe", "psql.exe", "createdb.exe"];
const runId = `production-snapshot-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const tempBase = path.resolve(os.tmpdir());
const runtimeRoot = path.join(tempBase, `ai-pdm-production-snapshot-postgres-${crypto.randomUUID()}`);
const clusterDir = path.join(runtimeRoot, "cluster");
const dataDir = path.join(runtimeRoot, "data");
const repositoryDir = path.join(runtimeRoot, "repository");
const serverLog = path.join(runtimeRoot, "postgres.log");
const migratedSqlitePath = path.join(outputDir, "canonical-target.sqlite");
const mappingPath = path.join(outputDir, "mapping-v3.json");
const reportPath = path.join(outputDir, "manifest.json");
const migrationPackageRoot = path.join(root, "output", "dev-032-cloudsql-migration-package");
const migrationManifestPath = path.join(migrationPackageRoot, "cloudsql-migration-manifest.json");
const targetIdentityColumns = new Map([["pdm_review_traces", "review_cycle_id"]]);
const canonicalIdentityTables = new Set(["drawing_revisions", "part_roots", "part_numbers", "drawing_numbers", "drawing_part_links"]);
const targetTableOrder = [
  "part_roots", "part_numbers", "drawing_numbers", "drawing_revisions", "drawing_part_links",
  "pdm_workbench_aggregates", "drawing_rd_branches", "drawing_revision_claims", "drawing_revision_works",
  "part_change_works", "canonical_workbench_states", "pdm_work_review_requests",
  "pdm_review_traces", "pdm_workbench_migration_quarantine"
];
const legacyTables = [
  "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
  "numbering_draft_relations", "numbering_candidate_revision_drafts", "numbering_candidate_revision_files",
  "drawing_revision_package_review_approvals"
];

if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_SOURCE_REQUIRED");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_PORT_INVALID");
if (!expectedCommit) throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_EXPECTED_COMMIT_REQUIRED");
for (const executable of requiredExecutables) if (!fs.existsSync(path.join(postgresBin, executable))) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_TOOL_MISSING:${executable}`);
if (!fs.existsSync(migrationManifestPath)) throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_MIGRATION_PACKAGE_MISSING");
const migrationManifest = JSON.parse(fs.readFileSync(migrationManifestPath, "utf8"));
if (migrationManifest.orderedSchemaMigrations.length !== 50 || migrationManifest.orderedSchemaMigrations.at(-1)?.version !== "052") throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_MIGRATION_PACKAGE_STALE");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));
function stableId(namespace, ...values) {
  const hex = sha256([namespace, ...values].join("\u001f"));
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function quoteIdentifier(value) { return `"${String(value).replaceAll('"', '""')}"`; }
function assertSafeRuntimeRoot(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${tempBase}${path.sep}`) || path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith("ai-pdm-production-snapshot-postgres-")) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_UNSAFE_RUNTIME_ROOT:${resolved}`);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
async function portAvailable(value) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(value, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}
async function portReleased(value) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await portAvailable(value)) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}
async function applyCurrentMigrationPackage(client) {
  await client.query("BEGIN");
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS pdm_schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    for (const migration of migrationManifest.orderedSchemaMigrations) {
      const sql = fs.readFileSync(path.join(migrationPackageRoot, migration.output), "utf8");
      if (sha256(sql) !== migration.outputSha256) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_MIGRATION_HASH_MISMATCH:${migration.version}`);
      await client.query(sql);
      await client.query("INSERT INTO pdm_schema_migrations (version,name,checksum) VALUES ($1,$2,$3)", [migration.version, migration.name, migration.outputSha256]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
function sqliteTables(database) {
  return new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
}
function sqliteRows(database, table) {
  return database.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all();
}
function sqliteIdentityMap(database, table) {
  if (!sqliteTables(database).has(table)) return new Map();
  const identityColumn = targetIdentityColumns.get(table) || "id";
  return new Map(sqliteRows(database, table).map((row) => [String(row[identityColumn]), row]));
}
function primaryInvariant() {
  const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
  const database = new Database(primaryPath, { readonly: true, fileMustExist: true });
  try {
    const tables = sqliteTables(database);
    const tracked = ["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "drawings", "drawing_revisions", "numbering_draft_workspaces", "pdm_workbench_migration_quarantine"];
    const business = {};
    for (const table of tracked) {
      if (!tables.has(table)) { business[table] = { count: 0, hash: sha256("") }; continue; }
      const rows = sqliteRows(database, table).sort((left, right) => stableJson(left).localeCompare(stableJson(right)));
      business[table] = { count: rows.length, hash: sha256(rows.map(stableJson).join("\n")) };
    }
    const schemaRows = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    return { path: primaryPath, schemaHash: sha256(schemaRows.map(stableJson).join("\n")), business, foreignKeyViolations: database.pragma("foreign_key_check").length };
  } finally { database.close(); }
}
async function postgresColumns(client, table) {
  const result = await client.query(`SELECT column_name,data_type,udt_name,is_generated,is_identity
    FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.filter((row) => row.is_generated === "NEVER" && row.is_identity === "NO").map((row) => [row.column_name, row]));
}
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
  }
  if (column.data_type === "ARRAY" && typeof value === "string" && value.startsWith("[")) return JSON.parse(value);
  return value;
}
async function restoreSqliteContent(client, sourceDatabase) {
  const sourceTables = sqliteTables(sourceDatabase);
  const pgTableResult = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const pgTables = pgTableResult.rows.map((row) => row.tablename);
  const mutableTables = pgTables.filter((table) => table !== "pdm_schema_migrations");
  await client.query("SET session_replication_role=replica");
  await client.query(`TRUNCATE ${mutableTables.map(quoteIdentifier).join(",")} CASCADE`);
  let copiedRows = 0;
  const tableCounts = {};
  for (const table of pgTables) {
    if (!sourceTables.has(table)) continue;
    const pgColumnMap = await postgresColumns(client, table);
    const sqliteColumns = sourceDatabase.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all().map((row) => row.name);
    const columns = sqliteColumns.filter((column) => pgColumnMap.has(column));
    if (columns.length === 0) continue;
    const rows = sourceDatabase.prepare(`SELECT ${columns.map(quoteIdentifier).join(",")} FROM ${quoteIdentifier(table)}`).all();
    tableCounts[table] = rows.length;
    for (const row of rows) {
      const values = columns.map((column) => normalizeForPostgres(row[column], pgColumnMap.get(column)));
      await client.query(`INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")})`, values);
    }
    copiedRows += rows.length;
  }
  await client.query("SET session_replication_role=origin");
  return { copiedRows, tableCounts };
}
async function foreignKeyViolations(client) {
  const constraints = await client.query(`SELECT con.conname,child.relname AS child_table,parent.relname AS parent_table,
      json_agg(child_att.attname ORDER BY keys.ordinality) AS child_columns,
      json_agg(parent_att.attname ORDER BY keys.ordinality) AS parent_columns
    FROM pg_constraint con
    JOIN pg_class child ON child.oid=con.conrelid
    JOIN pg_class parent ON parent.oid=con.confrelid
    JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY AS keys(child_num,parent_num,ordinality) ON true
    JOIN pg_attribute child_att ON child_att.attrelid=child.oid AND child_att.attnum=keys.child_num
    JOIN pg_attribute parent_att ON parent_att.attrelid=parent.oid AND parent_att.attnum=keys.parent_num
    WHERE con.contype='f' AND child.relnamespace='public'::regnamespace
    GROUP BY con.conname,child.relname,parent.relname ORDER BY child.relname,con.conname`);
  const violations = [];
  for (const constraint of constraints.rows) {
    const nonNull = constraint.child_columns.map((column) => `child.${quoteIdentifier(column)} IS NOT NULL`).join(" AND ");
    const join = constraint.child_columns.map((column, index) => `parent.${quoteIdentifier(constraint.parent_columns[index])}=child.${quoteIdentifier(column)}`).join(" AND ");
    const result = await client.query(`SELECT COUNT(*)::integer AS count FROM ${quoteIdentifier(constraint.child_table)} child WHERE ${nonNull} AND NOT EXISTS (SELECT 1 FROM ${quoteIdentifier(constraint.parent_table)} parent WHERE ${join})`);
    if (result.rows[0].count > 0) violations.push({ ...constraint, count: result.rows[0].count });
  }
  return violations;
}
async function canonicalizeTargetRow(client, table, rawRow) {
  const columns = await postgresColumns(client, table);
  const typed = {};
  for (const [column, meta] of columns) if (Object.hasOwn(rawRow, column)) typed[column] = normalizeForPostgres(rawRow[column], meta);
  const result = await client.query(`SELECT to_jsonb(populated) AS row FROM jsonb_populate_record(NULL::${quoteIdentifier(table)},$1::jsonb) populated`, [JSON.stringify(typed)]);
  return result.rows[0].row;
}
function parseRunnerManifest(stdout) {
  const match = stdout.match(/"reportPath"\s*:\s*"([^"]+)"/u);
  if (!match) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_RUNNER_MANIFEST_MISSING:${stdout}`);
  return JSON.parse(fs.readFileSync(path.resolve(match[1]), "utf8"));
}
function runConverter(databaseName, args, extraEnv = {}, allowedStatuses = [0]) {
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/${databaseName}`;
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "migrate-dev-087-postgres.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "cloud_sql_postgres",
      PDM_POSTGRES_URL: connectionString,
      PDM_BUILD_COMMIT: expectedCommit,
      PDM_DEV087_ISOLATED_RESTORE: "1",
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      ...extraEnv
    }
  });
  if (!allowedStatuses.includes(result.status)) throw new Error(`migrate-dev-087-postgres failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
async function createMapping(client, sourceDatabase, targetDatabase, inventory) {
  const targetRows = [];
  const targetByKey = new Map();
  for (const table of targetTableOrder) {
    const sourceIds = canonicalIdentityTables.has(table) ? new Set(sqliteIdentityMap(sourceDatabase, table).keys()) : new Set();
    const identityColumn = targetIdentityColumns.get(table) || "id";
    for (const [identity, rawRow] of sqliteIdentityMap(targetDatabase, table)) {
      if (sourceIds.has(identity)) continue;
      const row = await canonicalizeTargetRow(client, table, rawRow);
      const operation = { table, row, targetHash: sha256(stableJson(row)) };
      targetRows.push(operation);
      targetByKey.set(`${table}:${identity}`, { ...operation, identityColumn, identity });
    }
  }
  const drawingWorkFiles = [];
  const workFileReceipts = [];
  for (const [, rawRow] of sqliteIdentityMap(targetDatabase, "drawing_revision_work_files")) {
    const row = await canonicalizeTargetRow(client, "drawing_revision_work_files", rawRow);
    const targetHash = sha256(stableJson(row));
    drawingWorkFiles.push({ row });
    workFileReceipts.push({ workId: row.work_id, fileBindingId: row.file_binding_id, ordinal: Number(row.ordinal), contentHash: row.content_hash, targetHash });
  }
  const sourceUpdates = [];
  const sourceDrawings = sqliteIdentityMap(sourceDatabase, "drawings");
  const targetDrawings = sqliteIdentityMap(targetDatabase, "drawings");
  for (const [identity, sourceDrawing] of sourceDrawings) {
    const targetDrawing = targetDrawings.get(identity);
    if (!targetDrawing || (sourceDrawing.formal_drawing_number_id === targetDrawing.formal_drawing_number_id && sourceDrawing.part_root_id === targetDrawing.part_root_id)) continue;
    const currentResult = await client.query("SELECT to_jsonb(source) AS row FROM drawings source WHERE id=$1", [identity]);
    const beforeRow = currentResult.rows[0]?.row;
    if (!beforeRow) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_DRAWING_SOURCE_MISSING:${identity}`);
    const set = { formal_drawing_number_id: targetDrawing.formal_drawing_number_id, part_root_id: targetDrawing.part_root_id };
    const hashNormalization = { updated_at: beforeRow.updated_at };
    sourceUpdates.push({
      table: "drawings",
      identity,
      set,
      hashNormalization,
      expectedBeforeHash: sha256(stableJson({ ...beforeRow, ...hashNormalization })),
      expectedAfterHash: sha256(stableJson({ ...beforeRow, ...set, ...hashNormalization }))
    });
  }
  if (inventory.before.legacyFileAssets.length > 0) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_FILE_RECEIPTS_REQUIRED:${inventory.before.legacyFileAssets.length}`);
  const receipts = [];
  const workspaceMap = sqliteIdentityMap(sourceDatabase, "numbering_draft_workspaces");
  const childWorkspace = new Map();
  for (const table of legacyTables.slice(1, 5)) for (const [identity, row] of sqliteIdentityMap(sourceDatabase, table)) childWorkspace.set(`${table}:${identity}`, row.workspace_id);
  const draftRootMap = sqliteIdentityMap(sourceDatabase, "numbering_draft_roots");
  const draftPartMap = sqliteIdentityMap(sourceDatabase, "numbering_draft_parts");
  const draftDrawingMap = sqliteIdentityMap(sourceDatabase, "numbering_draft_drawings");
  const draftRelationMap = sqliteIdentityMap(sourceDatabase, "numbering_draft_relations");
  for (const source of inventory.before.legacySources) {
    const workspaceId = source.sourceTable === "numbering_draft_workspaces" ? source.sourceIdentity : childWorkspace.get(`${source.sourceTable}:${source.sourceIdentity}`);
    const workspace = workspaceMap.get(String(workspaceId));
    if (!workspace) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_LEGACY_SOURCE_UNMAPPED:${source.sourceTable}:${source.sourceIdentity}`);
    let targetTable;
    let targetIdentity;
    if (workspace.lifecycle_status === "cancelled") {
      targetTable = "pdm_workbench_migration_quarantine";
      targetIdentity = stableId("dev087-quarantine", "numbering_draft_workspace", workspace.id);
    } else if (source.sourceTable === "numbering_draft_workspaces") {
      const part = [...draftPartMap.values()].find((row) => row.workspace_id === workspace.id);
      targetTable = "part_change_works";
      targetIdentity = stableId("dev087-part-work", workspace.company_id, `part-number-${part.candidate_reservation_id}`);
    } else if (source.sourceTable === "numbering_draft_roots") {
      targetTable = "part_roots";
      targetIdentity = `part-root-${draftRootMap.get(source.sourceIdentity).candidate_reservation_id}`;
    } else if (source.sourceTable === "numbering_draft_parts") {
      targetTable = "part_numbers";
      targetIdentity = `part-number-${draftPartMap.get(source.sourceIdentity).candidate_reservation_id}`;
    } else if (source.sourceTable === "numbering_draft_drawings") {
      targetTable = "drawing_numbers";
      targetIdentity = `drawing-number-${draftDrawingMap.get(source.sourceIdentity).candidate_reservation_id}`;
    } else if (source.sourceTable === "numbering_draft_relations") {
      targetTable = "drawing_part_links";
      targetIdentity = `drawing-part-link-${draftRelationMap.get(source.sourceIdentity).id}`;
    } else throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_LEGACY_SOURCE_UNSUPPORTED:${source.sourceTable}:${source.sourceIdentity}`);
    const target = targetByKey.get(`${targetTable}:${targetIdentity}`);
    if (!target) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_RECEIPT_TARGET_MISSING:${targetTable}:${targetIdentity}`);
    receipts.push({ sourceTable: source.sourceTable, sourceIdentity: source.sourceIdentity, sourceHash: source.sourceHash, targetTable, targetIdentityColumn: target.identityColumn, targetIdentity, targetHash: target.targetHash });
  }
  return { version: 3, sourceFingerprint: inventory.before.sourceFingerprint, receipts, fileReceipts: [], targetRows, sourceUpdates, drawingWorkFiles, workFileReceipts };
}

fs.mkdirSync(outputDir, { recursive: true });
assertSafeRuntimeRoot(runtimeRoot);
const sourceHashBefore = fileHash(sourcePath);
const primaryBefore = primaryInvariant();
const declaration = {
  project: root,
  purpose: "masked production snapshot full-content PostgreSQL provider rehearsal",
  port,
  owningProcessTree: `Codex task process ${process.pid} -> pg_ctl -> isolated postgres`,
  cleanupCondition: "stop isolated cluster, release port, remove validated task-owned runtime root",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: [runtimeRoot, outputDir],
  productionConnectionAllowed: false,
  productionMutationAllowed: false
};
fs.writeFileSync(path.join(outputDir, "runtime-declaration.json"), `${JSON.stringify(declaration, null, 2)}\n`, "utf8");

let started = false;
let finalReport;
try {
  if (!(await portAvailable(port))) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_PORT_IN_USE:${port}`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  const sourceDatabase = new Database(sourcePath, { readonly: true, fileMustExist: true });
  fs.copyFileSync(sourcePath, migratedSqlitePath);
  const sqliteMigrationDir = path.join(outputDir, "sqlite-canonical-plan");
  run(process.execPath, [
    path.join(root, "scripts", "migrate-dev-087-canonical-workbench.mjs"), `--db=${migratedSqlitePath}`, "--apply", "--switch-canonical-only",
    "--confirm-disposable-dev-087", "--initialize-missing-drawing-revisions-0.1", "--preserve-cancelled-legacy-history",
    "--backfill-active-numbering-identities", `--expected-commit=${expectedCommit}`, `--output-dir=${sqliteMigrationDir}`
  ], { env: { ...process.env, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir } });
  const targetDatabase = new Database(migratedSqlitePath, { readonly: true, fileMustExist: true });
  const databaseNames = ["rehearsal_one", "rehearsal_two"];
  const restoreEvidence = [];
  for (const databaseName of databaseNames) {
    run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName]);
    const client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`, application_name: "ai-pdm-production-snapshot-restore" });
    await client.connect();
    try {
      await applyCurrentMigrationPackage(client);
      const restore = await restoreSqliteContent(client, sourceDatabase);
      const fkViolations = await foreignKeyViolations(client);
      if (fkViolations.length) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_RESTORE_FK_VIOLATIONS:${databaseName}:${fkViolations.length}`);
      restoreEvidence.push({ databaseName, ...restore, foreignKeyViolations: fkViolations });
    } finally { await client.end(); }
  }
  const inventoryOutputDir = path.join(outputDir, "inventory");
  const inventoryRun = runConverter("rehearsal_one", ["--mode=inventory", `--output-dir=${inventoryOutputDir}`], {}, [0, 2]);
  const inventory = parseRunnerManifest(inventoryRun.stdout);
  const mappingClient = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/rehearsal_one`, application_name: "ai-pdm-production-snapshot-mapping" });
  await mappingClient.connect();
  let mapping;
  try { mapping = await createMapping(mappingClient, sourceDatabase, targetDatabase, inventory); }
  finally { await mappingClient.end(); }
  fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");
  const rehearsalReports = [];
  for (const [index, databaseName] of databaseNames.entries()) {
    const result = runConverter(databaseName, ["--apply", "--mode=rehearsal", `--mapping=${mappingPath}`, `--expected-commit=${expectedCommit}`, "--expected-schema-hash=dev090-v1", `--output-dir=${path.join(outputDir, `rehearsal-${index + 1}`)}`]);
    const manifest = parseRunnerManifest(result.stdout);
    const verifyClient = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`, application_name: "ai-pdm-production-snapshot-verify" });
    await verifyClient.connect();
    try {
      const fkViolations = await foreignKeyViolations(verifyClient);
      if (!manifest.pass || manifest.unresolved.length || fkViolations.length) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_REHEARSAL_BLOCKED:${databaseName}`);
      rehearsalReports.push({ databaseName, manifestPath: path.join(outputDir, `rehearsal-${index + 1}`, "manifest.json"), sourceFingerprint: manifest.before.sourceFingerprint, afterFingerprint: manifest.after.sourceFingerprint, targetTables: manifest.after.tables, sourceMutationReconciliation: manifest.sourceMutationReconciliation, foreignKeyViolations: fkViolations });
    } finally { await verifyClient.end(); }
  }
  const legacyRegressionDatabase = "legacy_v2_regression";
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", legacyRegressionDatabase]);
  const legacySchemaClient = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${legacyRegressionDatabase}`, application_name: "ai-pdm-production-snapshot-legacy-schema" });
  await legacySchemaClient.connect();
  try { await applyCurrentMigrationPackage(legacySchemaClient); }
  finally { await legacySchemaClient.end(); }
  const legacyRegressionRun = run(process.execPath, [path.join(root, "scripts", "qc-dev-092-postgres.mjs")], {
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      PDM_POSTGRES_URL: `postgresql://postgres@127.0.0.1:${port}/${legacyRegressionDatabase}`,
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir,
      DEV092_SQLITE_SOURCE: path.join(root, "data", "ai-pdm.sqlite")
    }
  });
  const legacyRunId = legacyRegressionRun.stdout.match(/"runId"\s*:\s*"([^"]+)"/u)?.[1];
  if (!legacyRunId) throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_LEGACY_V2_MANIFEST_MISSING");
  const legacyV2ManifestPath = path.join(root, "output", "qa", "dev-092-postgres", legacyRunId, "manifest.json");
  const legacyV2Manifest = JSON.parse(fs.readFileSync(legacyV2ManifestPath, "utf8"));
  if (legacyV2Manifest.status !== "PASS") throw new Error("PRODUCTION_SNAPSHOT_POSTGRES_LEGACY_V2_REGRESSION_FAILED");
  sourceDatabase.close();
  targetDatabase.close();
  const allTargetTableNames = [...new Set(rehearsalReports.flatMap((report) => Object.keys(report.targetTables)))].sort();
  const targetTableDrift = allTargetTableNames.filter((table) => JSON.stringify(rehearsalReports[0].targetTables[table]) !== JSON.stringify(rehearsalReports[1].targetTables[table]));
  const normalizedSourceUpdateTables = new Set(mapping.sourceUpdates.map((operation) => operation.table));
  const unexpectedTargetTableDrift = targetTableDrift.filter((table) => !normalizedSourceUpdateTables.has(table));
  const normalizedSourceUpdatesStable = rehearsalReports.every((report) => report.sourceMutationReconciliation?.pass === true);
  const targetHashesStable = unexpectedTargetTableDrift.length === 0 && normalizedSourceUpdatesStable;
  if (!targetHashesStable) throw new Error(`PRODUCTION_SNAPSHOT_POSTGRES_REHEARSAL_TARGET_HASH_DRIFT:${unexpectedTargetTableDrift.join(",")}`);
  finalReport = {
    status: "PASS",
    runId,
    generatedAt: new Date().toISOString(),
    scope: "masked production content reconstructed into two isolated PostgreSQL databases",
    productionConnected: false,
    productionMigrationExecuted: false,
    formalCloudSqlBackupRestore: false,
    source: { path: sourcePath, sha256: sourceHashBefore },
    expectedCommit,
    mapping: { path: mappingPath, sha256: fileHash(mappingPath), version: mapping.version, receipts: mapping.receipts.length, targetRows: mapping.targetRows.length, sourceUpdates: mapping.sourceUpdates.length, drawingWorkFiles: mapping.drawingWorkFiles.length },
    restoreEvidence,
    rehearsals: rehearsalReports,
    legacyV2Regression: { status: legacyV2Manifest.status, runId: legacyRunId, manifestPath: legacyV2ManifestPath, checks: legacyV2Manifest.checks.length },
    targetHashesStable,
    targetTableDrift: { observed: targetTableDrift, normalizedSourceUpdateTables: [...normalizedSourceUpdateTables], unexpected: unexpectedTargetTableDrift },
    primaryInvariantStable: null,
    runtime: { declaration, cleanup: "pending" },
    releaseDecision: "NO_GO_PRODUCTION_ACTIVATION_UNTIL_FORMAL_CLOUD_SQL_BACKUP_REHEARSAL_AND_EXACT_RELEASE_ARTIFACT"
  };
} catch (error) {
  finalReport = { status: "FAIL", runId, generatedAt: new Date().toISOString(), productionConnected: false, productionMigrationExecuted: false, formalCloudSqlBackupRestore: false, error: error instanceof Error ? error.message : String(error), runtime: { declaration, cleanup: "pending" } };
} finally {
  if (started) {
    try { run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); }
    catch (error) { finalReport.cleanupError = error instanceof Error ? error.message : String(error); }
  }
  if (fs.existsSync(serverLog)) fs.copyFileSync(serverLog, path.join(outputDir, "postgres.log"));
  const released = await portReleased(port);
  try {
    assertSafeRuntimeRoot(runtimeRoot);
    if (fs.existsSync(runtimeRoot)) fs.rmSync(runtimeRoot, { recursive: true, force: true });
  } catch (error) { finalReport.cleanupError = error instanceof Error ? error.message : String(error); }
  const primaryAfter = primaryInvariant();
  const sourceHashAfter = fileHash(sourcePath);
  const primaryInvariantStable = stableJson(primaryBefore) === stableJson(primaryAfter);
  const sourceStable = sourceHashBefore === sourceHashAfter;
  finalReport.sourceSha256After = sourceHashAfter;
  finalReport.sourceStable = sourceStable;
  finalReport.primaryBefore = primaryBefore;
  finalReport.primaryAfter = primaryAfter;
  finalReport.primaryInvariantStable = primaryInvariantStable;
  finalReport.runtime = { ...(finalReport.runtime || {}), declaration, cleanup: !finalReport.cleanupError && released && !fs.existsSync(runtimeRoot) ? "removed" : "incomplete", portReleased: released, runtimeRootRemoved: !fs.existsSync(runtimeRoot) };
  if (!sourceStable || !primaryInvariantStable || finalReport.runtime.cleanup !== "removed") finalReport.status = "FAIL";
  fs.writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ status: finalReport.status, reportPath, productionConnected: false, formalCloudSqlBackupRestore: false, targetHashesStable: finalReport.targetHashesStable, primaryInvariantStable: finalReport.primaryInvariantStable, cleanup: finalReport.runtime.cleanup }, null, 2));
if (finalReport.status !== "PASS") process.exitCode = 1;
