#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import pg from "pg";

const root = process.cwd();
const connectionString = process.env.PDM_POSTGRES_URL?.trim() || process.env.PDM_POSTGRES_SHADOW_URL?.trim() || process.env.DATABASE_URL?.trim() || "";
if (!connectionString) throw new Error("DEV092_POSTGRES_CONNECTION_REQUIRED");
const sourceDbPath = path.resolve(process.env.DEV092_SQLITE_SOURCE ?? path.join(root, "data", "ai-pdm.sqlite"));
const runId = `DEV092-postgres-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const outputDir = path.join(root, "output", "qa", "dev-092-postgres", runId);
const mappingPath = path.join(outputDir, "mapping.json");
const checks = [];

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function check(name, condition, detail = "") {
  checks.push({ name, pass: Boolean(condition), detail });
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}
function runConverter(args, extraEnv = {}) {
  return spawnSync(process.execPath, ["scripts/migrate-dev-087-postgres.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PDM_DB_PROVIDER: "cloud_sql_postgres", PDM_POSTGRES_URL: connectionString, PDM_BUILD_COMMIT: "local-dev", ...extraEnv }
  });
}
function parseManifest(stdout) {
  const pathMatch = stdout.match(/"reportPath"\s*:\s*"([^"]+)"/u);
  if (!pathMatch) throw new Error(`DEV092_POSTGRES_REPORT_PATH_MISSING:${stdout}`);
  return JSON.parse(fs.readFileSync(path.resolve(pathMatch[1]), "utf8"));
}
function normalizeForPostgres(value, column) {
  if (value === undefined || value === null) return null;
  if (column.data_type === "boolean") return Boolean(Number(value));
  if (column.data_type === "json" || column.data_type === "jsonb") return typeof value === "string" ? value : JSON.stringify(value);
  if (column.data_type === "bytea" && Buffer.isBuffer(value)) return value;
  if (column.data_type === "ARRAY" && typeof value === "string" && value.startsWith("[")) return JSON.parse(value);
  return value;
}
async function pgColumns(client, table) {
  const result = await client.query(`SELECT column_name,data_type,udt_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
  return new Map(result.rows.map((row) => [row.column_name, row]));
}
async function copySqliteTable(client, sqlite, table, where = "", params = []) {
  const columns = await pgColumns(client, table);
  if (columns.size === 0) return 0;
  const sqliteColumns = sqlite.prepare(`PRAGMA table_info("${table.replaceAll('"', '""')}")`).all().map((column) => column.name);
  const selectedColumns = sqliteColumns.filter((column) => columns.has(column));
  if (selectedColumns.length === 0) return 0;
  const rows = sqlite.prepare(`SELECT ${selectedColumns.map((column) => `"${column.replaceAll('"', '""')}"`).join(",")} FROM "${table.replaceAll('"', '""')}"${where ? ` WHERE ${where}` : ""}`).all(...params);
  const quoted = selectedColumns.map((column) => `"${column.replaceAll('"', '""')}"`);
  const valuesSql = selectedColumns.map((_, index) => `$${index + 1}`).join(",");
  for (const row of rows) {
    const values = selectedColumns.map((column) => normalizeForPostgres(row[column], columns.get(column)));
    await client.query(`INSERT INTO "${table}" (${quoted.join(",")}) VALUES (${valuesSql}) ON CONFLICT DO NOTHING`, values);
  }
  return rows.length;
}

fs.mkdirSync(outputDir, { recursive: true });
const sqlite = new Database(sourceDbPath, { readonly: true });
const client = new pg.Client({ connectionString, application_name: "ai-pdm-dev092-postgres-qc" });
await client.connect();
let report;
try {
  const sourceTables = [
    "companies", "users", "drawings", "drawing_revisions", "drawing_revision_files", "file_assets", "drawing_numbers",
    "part_numbers", "part_roots", "drawing_part_links", "drawing_rd_branches", "drawing_revision_claims",
    "numbering_draft_workspaces", "numbering_draft_roots", "numbering_draft_parts", "numbering_draft_drawings",
    "numbering_draft_relations", "numbering_candidate_revision_drafts", "numbering_candidate_revision_files",
    "drawing_revision_package_review_approvals"
  ];
  await client.query("SET session_replication_role=replica");
  let copied = 0;
  for (const table of sourceTables) copied += await copySqliteTable(client, sqlite, table);
  await client.query("SET session_replication_role=origin");
  check("PostgreSQL mirror copied source fixture rows", copied > 0, String(copied));
  await client.query(fs.readFileSync(path.join(root, "db/postgres/042_status_data_rebuild.sql"), "utf8"));

  const sqliteWork = sqlite.prepare(`
    SELECT work.*
    FROM drawing_revision_works work
    JOIN canonical_workbench_states state ON state.work_id = work.id AND state.entity_type = 'drawing'
    JOIN drawings drawing ON drawing.id = work.drawing_id
    WHERE drawing.drawing_number='A0006-M01'
    ORDER BY work.created_at DESC LIMIT 1
  `).get();
  check("PostgreSQL mapping source has A0006 work", Boolean(sqliteWork?.id), "data/ai-pdm.sqlite");
  const sqliteState = sqlite.prepare("SELECT * FROM canonical_workbench_states WHERE work_id = ? AND data_layer='drawing_rd' LIMIT 1").get(sqliteWork.id);
  const sqliteWorkFiles = sqlite.prepare("SELECT work_id,file_binding_id,ordinal,content_hash FROM drawing_revision_work_files WHERE work_id=? ORDER BY ordinal,file_binding_id").all(sqliteWork.id);
  check("PostgreSQL mapping source has exact three A0006 work-file rows", sqliteWorkFiles.length === 3, String(sqliteWorkFiles.length));

  const sqliteBranch = sqlite.prepare("SELECT * FROM drawing_rd_branches WHERE id = (SELECT branch_id FROM drawing_revision_works WHERE id = ?)").get(sqliteWork.id);
  const sqliteClaim = sqlite.prepare("SELECT * FROM drawing_revision_claims WHERE id = (SELECT target_claim_id FROM drawing_revision_works WHERE id = ?)").get(sqliteWork.id);
  const fixtureWorkIds = { zero: `dev092-postgres-work-0-${sqliteWork.id}`, one: `dev092-postgres-work-1-${sqliteWork.id}`, three: sqliteWork.id };
  const fixtureBranch0 = { ...sqliteBranch, id: `dev092-postgres-branch-0-${sqliteBranch.id}` };
  const fixtureBranch1 = { ...sqliteBranch, id: `dev092-postgres-branch-1-${sqliteBranch.id}` };
  const fixtureClaim0 = { ...sqliteClaim, id: `dev092-postgres-claim-0-${sqliteClaim.id}`, branch_id: fixtureBranch0.id, target_major: 90, target_minor: 0, target_label: "90", predecessor_revision_id: null };
  const fixtureClaim1 = { ...sqliteClaim, id: `dev092-postgres-claim-1-${sqliteClaim.id}`, branch_id: fixtureBranch1.id, target_major: 91, target_minor: 0, target_label: "91", predecessor_revision_id: null };
  const fixtureWork0 = { ...sqliteWork, id: fixtureWorkIds.zero, branch_id: fixtureBranch0.id, target_claim_id: fixtureClaim0.id };
  const fixtureWork1 = { ...sqliteWork, id: fixtureWorkIds.one, branch_id: fixtureBranch1.id, target_claim_id: fixtureClaim1.id };
  const fixtureState0 = { ...sqliteState, id: `dev092-postgres-state-0-${sqliteState.id}`, branch_id: fixtureBranch0.id, work_id: fixtureWork0.id };
  const fixtureState1 = { ...sqliteState, id: `dev092-postgres-state-1-${sqliteState.id}`, branch_id: fixtureBranch1.id, work_id: fixtureWork1.id };
  const oneFile = sqliteWorkFiles[0];
  const providerFixtureRows = [
    { workId: fixtureWorkIds.zero, expected: 0, rows: [] },
    { workId: fixtureWorkIds.one, expected: 1, rows: [{ ...oneFile, work_id: fixtureWorkIds.one }] },
    { workId: fixtureWorkIds.three, expected: 3, rows: sqliteWorkFiles }
  ];

  const inventoryRun = runConverter(["--mode=inventory", `--output-dir=${path.join(outputDir, "inventory")}`]);
  check("PostgreSQL inventory exits successfully", inventoryRun.status === 0, inventoryRun.stderr || inventoryRun.stdout);
  const inventory = parseManifest(inventoryRun.stdout);
  const targetRows = [
    { table: "drawing_rd_branches", row: fixtureBranch0 },
    { table: "drawing_rd_branches", row: fixtureBranch1 },
    { table: "drawing_revision_claims", row: fixtureClaim0 },
    { table: "drawing_revision_claims", row: fixtureClaim1 },
    { table: "drawing_revision_works", row: fixtureWork0 },
    { table: "drawing_revision_works", row: fixtureWork1 },
    { table: "drawing_revision_works", row: sqliteWork },
    { table: "canonical_workbench_states", row: fixtureState0 },
    { table: "canonical_workbench_states", row: fixtureState1 },
    { table: "canonical_workbench_states", row: sqliteState }
  ];
  const drawingWorkFiles = providerFixtureRows.flatMap((fixture) => fixture.rows.map((row) => ({ row })));
  const workFileReceipts = providerFixtureRows.flatMap((fixture) => fixture.rows.map((row) => ({
    workId: row.work_id,
    fileBindingId: row.file_binding_id,
    ordinal: Number(row.ordinal),
    contentHash: row.content_hash,
    targetHash: sha256(stableJson(row))
  })));
  const mapping = {
    version: 2,
    sourceFingerprint: inventory.before.sourceFingerprint,
    receipts: [],
    fileReceipts: [],
    targetRows,
    drawingWorkFiles,
    workFileReceipts
  };
  fs.writeFileSync(mappingPath, `${JSON.stringify(mapping, null, 2)}\n`, "utf8");

  const applyArgs = ["--apply", "--mode=rehearsal", `--mapping=${mappingPath}`, "--expected-commit=local-dev", `--output-dir=${path.join(outputDir, "rehearsal-1")}`];
  const firstRun = runConverter(applyArgs, { PDM_DEV087_ISOLATED_RESTORE: "1" });
  check("PostgreSQL 0/1/3-file rehearsal apply exits successfully", firstRun.status === 0, firstRun.stderr || firstRun.stdout);
  const firstReport = parseManifest(firstRun.stdout);
  check("PostgreSQL 0/1/3-file rehearsal has zero unresolved", firstReport.unresolved.length === 0, JSON.stringify(firstReport.unresolved));
  check("PostgreSQL 0/1/3 rehearsal has four composite receipts", firstReport.workFileReceipts.length === 4, String(firstReport.workFileReceipts.length));
  const countClient = new pg.Client({ connectionString, application_name: "ai-pdm-dev092-postgres-fixture-check" });
  await countClient.connect();
  for (const fixture of providerFixtureRows) {
    const result = await countClient.query("SELECT COUNT(*)::integer AS count FROM drawing_revision_work_files WHERE work_id=$1", [fixture.workId]);
    check(`PostgreSQL fixture ${fixture.expected}-file work has exact target count`, result.rows[0].count === fixture.expected, `${fixture.workId}:${result.rows[0].count}`);
  }
  await countClient.end();

  const secondRun = runConverter(["--apply", "--mode=rehearsal", `--mapping=${mappingPath}`, "--expected-commit=local-dev", `--output-dir=${path.join(outputDir, "rehearsal-2")}`], { PDM_DEV087_ISOLATED_RESTORE: "1" });
  check("PostgreSQL 0/1/3-file rehearsal re-run exits successfully", secondRun.status === 0, secondRun.stderr || secondRun.stdout);
  const secondReport = parseManifest(secondRun.stdout);
  check("PostgreSQL re-run source fingerprint is stable", firstReport.before.sourceFingerprint === secondReport.before.sourceFingerprint && secondReport.before.sourceFingerprint === secondReport.after.sourceFingerprint);
  check("PostgreSQL re-run target hashes are stable", JSON.stringify(firstReport.after.tables) === JSON.stringify(secondReport.after.tables));

  const negativeMapping = { ...mapping, drawingWorkFiles: mapping.drawingWorkFiles.map((operation, index) => index === 1 ? ({ row: { ...operation.row, ordinal: Number(operation.row.ordinal) + 10 } }) : operation) };
  const negativePath = path.join(outputDir, "negative-target-drift.json");
  fs.writeFileSync(negativePath, `${JSON.stringify(negativeMapping, null, 2)}\n`, "utf8");
  const negativeRun = runConverter(["--apply", "--mode=rehearsal", `--mapping=${negativePath}`, "--expected-commit=local-dev", `--output-dir=${path.join(outputDir, "negative")}`], { PDM_DEV087_ISOLATED_RESTORE: "1" });
  check("PostgreSQL target drift fails closed before mutation", negativeRun.status !== 0 && /DEV092_POSTGRES_WORK_FILE_TARGET_ROW_MISSING/u.test(`${negativeRun.stdout}\n${negativeRun.stderr}`), `${negativeRun.stdout}\n${negativeRun.stderr}`);

  report = { devId: "DEV-092", provider: "cloud_sql_postgres", runId, status: "PASS", mappingPath, inventoryPath: inventoryRun.stdout, firstReportPath: path.join(outputDir, "rehearsal-1", "manifest.json"), secondReportPath: path.join(outputDir, "rehearsal-2", "manifest.json"), checks };
} finally {
  sqlite.close();
  await client.end();
}
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
