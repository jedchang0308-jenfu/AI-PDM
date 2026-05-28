#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir, getQualityDir } from "./pdm-paths.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const writeReport = !args.has("--no-write");
const requirePostgres = args.has("--require-postgres");
const sqliteSchemaPath = path.join(root, "db", "schema.sql");
const postgresSchemaPath = path.join(root, "db", "postgres", "001_initial_schema.sql");
const postgresRlsPath = path.join(root, "db", "postgres", "002_supabase_rls_plan.sql");
const sqlitePath = process.env.PDM_SHADOW_SQLITE_PATH?.trim() || path.join(getDataDir(root), "ai-pdm.sqlite");
const postgresUrl = process.env.PDM_POSTGRES_SHADOW_URL?.trim() || "";

function extractTableNames(sql) {
  return [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gimu)].map((match) => match[1]);
}

function quoteIdent(identifier) {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function getPrimaryKeyColumn(database, tableName) {
  const columns = database.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all();
  const primary = columns.find((column) => column.pk === 1);
  return primary?.name ?? "id";
}

function collectSqliteStats(tableNames) {
  const usingExistingDatabase = fs.existsSync(sqlitePath);
  const database = usingExistingDatabase ? new Database(sqlitePath, { readonly: true }) : new Database(":memory:");
  if (!usingExistingDatabase) {
    database.exec(fs.readFileSync(sqliteSchemaPath, "utf8"));
  }

  try {
    return tableNames.map((tableName) => {
      const tableExists = database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(tableName);
      if (!tableExists) {
        return { table: tableName, exists: false, count: 0, keyColumn: null, keyHash: sha256("") };
      }

      const keyColumn = getPrimaryKeyColumn(database, tableName);
      const count = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)}`).get().count;
      const keys = database
        .prepare(`SELECT ${quoteIdent(keyColumn)} AS key_value FROM ${quoteIdent(tableName)} ORDER BY ${quoteIdent(keyColumn)}`)
        .all()
        .map((row) => String(row.key_value));

      return {
        table: tableName,
        exists: true,
        count,
        keyColumn,
        keyHash: sha256(keys.join("\n"))
      };
    });
  } finally {
    database.close();
  }
}

function runPsql(sql) {
  const result = spawnSync("psql", [postgresUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "psql failed").trim());
  }
  return result.stdout.trim();
}

function collectPostgresStats(sqliteStats) {
  if (!postgresUrl) return null;
  return sqliteStats.map((sqliteTable) => {
    const tableName = sqliteTable.table;
    const keyColumn = sqliteTable.keyColumn ?? "id";
    const count = Number(runPsql(`select count(*) from public.${quoteIdent(tableName)};`));
    const keys = runPsql(`select ${quoteIdent(keyColumn)}::text from public.${quoteIdent(tableName)} order by ${quoteIdent(keyColumn)};`)
      .split(/\r?\n/u)
      .filter(Boolean);
    return {
      table: tableName,
      count,
      keyColumn,
      keyHash: sha256(keys.join("\n"))
    };
  });
}

const sqliteSchema = fs.readFileSync(sqliteSchemaPath, "utf8");
const postgresSchema = fs.readFileSync(postgresSchemaPath, "utf8");
const postgresRls = fs.readFileSync(postgresRlsPath, "utf8");
const sqliteTables = extractTableNames(sqliteSchema);
const postgresTables = extractTableNames(postgresSchema);
const missingInPostgres = sqliteTables.filter((tableName) => !postgresTables.includes(tableName));
const sqliteStats = collectSqliteStats(sqliteTables);
let postgresStats = null;
let postgresCompareError = null;

try {
  postgresStats = collectPostgresStats(sqliteStats);
} catch (error) {
  postgresCompareError = error instanceof Error ? error.message : String(error);
}

const mismatches = [];
if (postgresStats) {
  const byTable = new Map(postgresStats.map((stat) => [stat.table, stat]));
  for (const sqliteStat of sqliteStats) {
    const postgresStat = byTable.get(sqliteStat.table);
    if (!postgresStat || postgresStat.count !== sqliteStat.count || postgresStat.keyHash !== sqliteStat.keyHash) {
      mismatches.push({ sqlite: sqliteStat, postgres: postgresStat ?? null });
    }
  }
}

const rlsMissingTables = sqliteTables.filter((tableName) => !postgresRls.includes(`'${tableName}'`));
const report = {
  checkedAt: new Date().toISOString(),
  sqlitePath,
  postgresShadowConfigured: Boolean(postgresUrl),
  sqliteTables: sqliteTables.length,
  postgresTables: postgresTables.length,
  missingInPostgres,
  rlsMissingTables,
  sqliteStats,
  postgresStats,
  postgresCompareError,
  mismatches
};

if (writeReport) {
  const reportDir = path.join(getQualityDir(root), "postgres-shadow");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `shadow-compare-${Date.now()}.json`);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  report.reportPath = path.relative(root, reportPath).replaceAll(path.sep, "/");
}

console.log(JSON.stringify(report, null, 2));

if (missingInPostgres.length > 0 || rlsMissingTables.length > 0 || mismatches.length > 0) {
  process.exitCode = 1;
}

if (requirePostgres && (!postgresUrl || postgresCompareError)) {
  process.exitCode = 1;
}
