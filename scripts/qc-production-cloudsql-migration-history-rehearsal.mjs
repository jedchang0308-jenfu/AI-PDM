#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";
import { buildDev032CloudSqlMigrationPackage } from "./dev-032-cloudsql-migration-package.mjs";

const root = process.cwd();
const argv = process.argv.slice(2);
const option = (name, fallback = null) => argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1) ?? fallback;
const formalExportPath = path.resolve(option("--formal-export", ""));
const outputDir = path.resolve(option("--output-dir", path.join("output", "qa", "production-cloudsql-history", new Date().toISOString().replace(/[:.]/gu, "-"))));
const port = Number(option("--port", "55489"));
const postgresBin = path.resolve(option("--postgres-bin", process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin"));
const runId = `production-cloudsql-history-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const tempBase = path.resolve(os.tmpdir());
const runtimeRoot = path.join(tempBase, `ai-pdm-production-cloudsql-history-${crypto.randomUUID()}`);
const clusterDir = path.join(runtimeRoot, "cluster");
const dataDir = path.join(runtimeRoot, "data");
const repositoryDir = path.join(runtimeRoot, "repository");
const serverLog = path.join(runtimeRoot, "postgres.log");
const databaseName = "ai_pdm_production_history_shadow";
const reportPath = path.join(outputDir, "manifest.json");
const historicalCommit = "d9c84367";
const historicalSourcePath = "db/postgres/047_remove_bom_module.sql";
const historicalSourceSha256 = "c18c284da2a2b25adc6fc1c34501c7317d2ebbe0a44eb16d6d04075e2e53c450";
const historicalOutputSha256 = "1e3b9ab54421c3296d8f385f788b057b837e15cc6e7a7f1a8d9932a726a316f2";
const requiredExecutables = ["initdb.exe", "pg_ctl.exe", "psql.exe", "createdb.exe"];

if (!formalExportPath || !fs.existsSync(formalExportPath)) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_FORMAL_EXPORT_REQUIRED");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_PORT_INVALID");
for (const executable of requiredExecutables) if (!fs.existsSync(path.join(postgresBin, executable))) throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_TOOL_MISSING:${executable}`);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
function assertSafeRuntimeRoot(target) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(`${tempBase}${path.sep}`) || path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith("ai-pdm-production-cloudsql-history-")) {
    throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_UNSAFE_RUNTIME_ROOT:${resolved}`);
  }
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
function primaryInvariant() {
  const primaryPath = path.join(root, "data", "ai-pdm.sqlite");
  const database = new Database(primaryPath, { readonly: true, fileMustExist: true });
  try {
    const schema = database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all();
    const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name));
    const tracked = ["part_roots", "part_numbers", "drawing_numbers", "drawing_part_links", "drawings", "drawing_revisions", "numbering_draft_workspaces", "pdm_workbench_migration_quarantine"];
    const business = {};
    for (const table of tracked) {
      const rows = tables.has(table) ? database.prepare(`SELECT * FROM "${table}"`).all().sort((left, right) => stableJson(left).localeCompare(stableJson(right))) : [];
      business[table] = { count: rows.length, hash: sha256(rows.map(stableJson).join("\n")) };
    }
    return { path: primaryPath, schemaHash: sha256(schema.map(stableJson).join("\n")), business, foreignKeyViolations: database.pragma("foreign_key_check").length };
  } finally {
    database.close();
  }
}
function readFormalMigrationLedger() {
  const decoded = formalExportPath.endsWith(".gz") ? zlib.gunzipSync(fs.readFileSync(formalExportPath)) : fs.readFileSync(formalExportPath);
  const payload = JSON.parse(decoded.toString("utf8"));
  const rows = payload?.tables?.pdm_schema_migrations?.rows;
  if (!Array.isArray(rows) || rows.length === 0) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_LEDGER_MISSING");
  const version047 = rows.find((row) => row.version === "047");
  if (version047?.name !== "047_remove_bom_module" || version047?.checksum !== historicalOutputSha256) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_047_EVIDENCE_MISMATCH");
  return rows;
}
function historicalSql() {
  const result = spawnSync("git", ["show", `${historicalCommit}:${historicalSourcePath}`], { cwd: root, encoding: null, windowsHide: true });
  if (result.status !== 0) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_SOURCE_UNAVAILABLE");
  if (sha256(result.stdout) !== historicalSourceSha256) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_SOURCE_HASH_MISMATCH");
  const source = result.stdout.toString("utf8");
  const cloudSqlOutput = [
    `-- DEV-046 Cloud SQL candidate generated from ${historicalSourcePath}`,
    "-- Proposal only. Review before any live apply.",
    "-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.",
    "",
    ...source.split(/\r?\n/u)
  ].join("\n").trimEnd() + "\n";
  if (sha256(cloudSqlOutput) !== historicalOutputSha256) throw new Error("PRODUCTION_CLOUDSQL_HISTORY_OUTPUT_HASH_MISMATCH");
  return source;
}
async function applyPackage(client, manifest, packageRoot) {
  const applied = await client.query("SELECT version,checksum FROM pdm_schema_migrations ORDER BY version");
  const appliedByVersion = new Map(applied.rows.map((row) => [row.version, row.checksum]));
  const appliedVersions = [];
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(7104604601)");
    for (const migration of manifest.orderedSchemaMigrations) {
      const existingChecksum = appliedByVersion.get(migration.version);
      const accepted = new Set([migration.outputSha256, ...(migration.acceptedExistingChecksums ?? [])]);
      if (existingChecksum && !accepted.has(existingChecksum)) throw new Error(`MIGRATION_HISTORY_CHECKSUM_MISMATCH:${migration.version}`);
      if (existingChecksum) continue;
      const sqlPath = path.join(packageRoot, ...migration.output.split("/"));
      const sql = fs.readFileSync(sqlPath, "utf8");
      if (sha256(sql) !== migration.outputSha256) throw new Error(`MIGRATION_SQL_OUTPUT_HASH_MISMATCH:${migration.version}`);
      try {
        await client.query(sql);
      } catch (error) {
        const detail = error && typeof error === "object"
          ? { message: error.message, position: error.position, internalPosition: error.internalPosition, where: error.where, detail: error.detail, hint: error.hint }
          : { message: String(error) };
        throw new Error(`MIGRATION_SQL_FAILED:${migration.version}:${JSON.stringify(detail)}`, { cause: error });
      }
      await client.query("INSERT INTO pdm_schema_migrations(version,name,checksum) VALUES($1,$2,$3)", [migration.version, migration.name, migration.outputSha256]);
      appliedByVersion.set(migration.version, migration.outputSha256);
      appliedVersions.push(migration.version);
    }
    await client.query("COMMIT");
    return appliedVersions;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
async function schemaReadback(client) {
  const requiredTables = [
    "bom_headers", "bom_lines", "bom_drafts", "bom_lines_tree", "bom_draft_floating_topics", "bom_edit_events",
    "bom_review_requests", "bom_release_snapshots", "bom_create_effects", "bom_reconfirmation_flags", "bom_definitions",
    "bom_definition_parent_bindings", "bom_draft_parent_bindings", "bom_release_parent_snapshots", "settings_secret_probe_jobs",
    "worker_capability_heartbeats"
  ];
  const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map((row) => row.tablename);
  const missingTables = requiredTables.filter((table) => !tables.includes(table));
  const retiredTablesPresent = ["bom_import_jobs", "bom_import_profiles"].filter((table) => tables.includes(table));
  const requiredColumns = [
    ["part_numbers", "bom_usage_policy"], ["part_numbers", "structure_type"], ["bom_drafts", "definition_id"],
    ["bom_review_requests", "review_snapshot_json"], ["bom_release_snapshots", "snapshot_hash"],
    ["bom_reconfirmation_flags", "reference_scope"]
  ];
  const columns = new Set((await client.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public'")).rows.map((row) => `${row.table_name}.${row.column_name}`));
  const missingColumns = requiredColumns.map(([table, column]) => `${table}.${column}`).filter((column) => !columns.has(column));
  const retiredColumnsPresent = ["bom_drafts.source_revision_package_id", "bom_release_snapshots.source_revision_package_id"].filter((column) => columns.has(column));
  const ledger = (await client.query("SELECT version,name,checksum FROM pdm_schema_migrations ORDER BY version")).rows;
  const invalidConstraints = (await client.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated ORDER BY conname")).rows;
  return { tables: tables.length, missingTables, retiredTablesPresent, missingColumns, retiredColumnsPresent, ledger, invalidConstraints };
}

fs.mkdirSync(outputDir, { recursive: true });
assertSafeRuntimeRoot(runtimeRoot);
const sourceHashBefore = sha256(fs.readFileSync(formalExportPath));
const primaryBefore = primaryInvariant();
const declaration = {
  project: root,
  purpose: "formal production migration-ledger to current Cloud SQL package reconciliation rehearsal",
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
  if (!(await portAvailable(port))) throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_PORT_IN_USE:${port}`);
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", serverLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", databaseName]);
  run(path.join(postgresBin, "psql.exe"), ["-w", "-h", "127.0.0.1", "-p", String(port), "-U", "postgres", "-d", databaseName, "-v", "ON_ERROR_STOP=1", "-f", path.join(root, "db", "postgres", "001_initial_schema.sql")]);

  const ledgerRows = readFormalMigrationLedger();
  const historySql = historicalSql();
  const client = new pg.Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`, application_name: "ai-pdm-production-history-shadow" });
  await client.connect();
  let firstApplied;
  let secondApplied;
  let readback;
  try {
    await client.query(historySql);
    await client.query(`CREATE TABLE IF NOT EXISTS pdm_schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await client.query("TRUNCATE pdm_schema_migrations");
    for (const row of ledgerRows) await client.query("INSERT INTO pdm_schema_migrations(version,name,checksum,applied_at) VALUES($1,$2,$3,$4)", [row.version, row.name, row.checksum, row.applied_at]);
    const packageDir = path.join(outputDir, "production-proposal-package");
    const { outputs } = await buildDev032CloudSqlMigrationPackage(packageDir);
    const manifest = JSON.parse(fs.readFileSync(outputs.manifestPath, "utf8"));
    firstApplied = await applyPackage(client, manifest, packageDir);
    secondApplied = await applyPackage(client, manifest, packageDir);
    readback = await schemaReadback(client);
    const expectedApplied = ["040", "041", "042", "043", "044", "045", "046", "048", "049"];
    if (stableJson(firstApplied) !== stableJson(expectedApplied)) throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_APPLIED_VERSION_MISMATCH:${firstApplied.join(",")}`);
    if (secondApplied.length !== 0) throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_NOT_IDEMPOTENT:${secondApplied.join(",")}`);
    if (readback.ledger.length !== manifest.orderedSchemaMigrations.length || readback.missingTables.length || readback.retiredTablesPresent.length || readback.missingColumns.length || readback.retiredColumnsPresent.length || readback.invalidConstraints.length) {
      throw new Error(`PRODUCTION_CLOUDSQL_HISTORY_SCHEMA_READBACK_FAILED:${JSON.stringify(readback)}`);
    }
  } finally {
    await client.end();
  }

  const dev096Evidence = path.join(outputDir, "dev096-postgres");
  const dev096 = run(process.execPath, [path.join(root, "scripts", "qc-dev-096-postgres.mjs")], {
    env: {
      ...process.env,
      DEV096_POSTGRES_DSN: `postgresql://postgres@127.0.0.1:${port}/${databaseName}`,
      DEV096_EVIDENCE_DIR: dev096Evidence,
      PDM_DATA_DIR: dataDir,
      PDM_REPOSITORY_DIR: repositoryDir
    }
  });
  finalReport = {
    status: "PASS",
    runId,
    generatedAt: new Date().toISOString(),
    scope: "formal production migration ledger replayed against the current production proposal package in isolated PostgreSQL",
    productionConnected: false,
    productionMigrationExecuted: false,
    formalCloudSqlBackupRestore: false,
    formalExport: { path: formalExportPath, sha256: sourceHashBefore, migrationRows: ledgerRows.length },
    historical047: { commit: historicalCommit, sourcePath: historicalSourcePath, sourceSha256: historicalSourceSha256, outputSha256: historicalOutputSha256 },
    firstApplied,
    secondApplied,
    schemaReadback: readback,
    dev096Postgres: { status: "PASS", evidenceDir: dev096Evidence, stdoutSha256: sha256(dev096.stdout) },
    releaseDecision: "NO_GO_PRODUCTION_ACTIVATION_UNTIL_FORMAL_CLOUD_SQL_BACKUP_REHEARSAL_AND_EXACT_RELEASE_ARTIFACT",
    runtime: { declaration, cleanup: "pending" }
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
  } catch (error) {
    finalReport.cleanupError = error instanceof Error ? error.message : String(error);
  }
  const primaryAfter = primaryInvariant();
  const sourceHashAfter = sha256(fs.readFileSync(formalExportPath));
  finalReport.primaryBefore = primaryBefore;
  finalReport.primaryAfter = primaryAfter;
  finalReport.primaryInvariantStable = stableJson(primaryBefore) === stableJson(primaryAfter);
  finalReport.formalExportStable = sourceHashBefore === sourceHashAfter;
  finalReport.runtime = { ...(finalReport.runtime || {}), declaration, cleanup: !finalReport.cleanupError && released && !fs.existsSync(runtimeRoot) ? "removed" : "incomplete", portReleased: released, runtimeRootRemoved: !fs.existsSync(runtimeRoot) };
  if (!finalReport.primaryInvariantStable || !finalReport.formalExportStable || finalReport.runtime.cleanup !== "removed") finalReport.status = "FAIL";
  fs.writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ status: finalReport.status, reportPath, productionConnected: false, formalCloudSqlBackupRestore: false, firstApplied: finalReport.firstApplied, secondApplied: finalReport.secondApplied, primaryInvariantStable: finalReport.primaryInvariantStable, cleanup: finalReport.runtime.cleanup }, null, 2));
if (finalReport.status !== "PASS") process.exitCode = 1;
