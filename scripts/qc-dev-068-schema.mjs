import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const root = process.cwd();
const sqliteSchema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const postgresMigration = fs.readFileSync(path.join(root, "db", "postgres", "033_drawing_recognition.sql"), "utf8");
const startMarker = "-- DEV-068 drawing/CAD recognition candidate review and atomic formalization.";
const endMarker = "-- END DEV-068 drawing recognition schema.";
const start = sqliteSchema.indexOf(startMarker);
const end = sqliteSchema.indexOf(endMarker, start);
assert.ok(start >= 0 && end > start);
const sqliteSlice = sqliteSchema.slice(start, end + endMarker.length);
const tablePattern = /CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/giu;
const tables = (sql) => [...sql.matchAll(tablePattern)].map((match) => match[1]).sort();
const sqliteTables = tables(sqliteSlice);
const postgresTables = tables(postgresMigration);
assert.equal(sqliteTables.length, 14);
assert.deepEqual(postgresTables, sqliteTables);
const destructiveStatement = /^\s*(?:DROP\s|TRUNCATE\s|DELETE\s+FROM\s)/imu;
assert.doesNotMatch(sqliteSlice, destructiveStatement);
assert.doesNotMatch(postgresMigration, destructiveStatement);
for (const permission of ["numbering.recognition.run", "numbering.recognition.review", "numbering.recognition.formalize"]) {
  assert.match(sqliteSlice, new RegExp(permission.replaceAll(".", "\\."), "u"));
  assert.match(postgresMigration, new RegExp(permission.replaceAll(".", "\\."), "u"));
}
for (const auditTable of ["drawing_recognition_sources", "drawing_recognition_adapter_results", "drawing_recognition_observations", "drawing_recognition_decisions", "drawing_recognition_formalization_events", "drawing_recognition_formalization_links", "pdm_engineering_evidence"]) {
  assert.match(sqliteSlice, new RegExp(`${auditTable}.*append`, "isu"));
  assert.match(postgresMigration, new RegExp(`${auditTable}.*append`, "isu"));
}

const stamp = new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
const runDir = path.join(root, "output", "qa", "dev-068-drawing-recognition", `schema-${stamp}-postgres-local-isolated`);
const clusterDir = path.join(runDir, "postgres-data");
fs.mkdirSync(runDir, { recursive: true });
const versionsRoot = "C:\\Program Files\\PostgreSQL";
const versions = fs.existsSync(versionsRoot) ? fs.readdirSync(versionsRoot).sort((a, b) => Number(b) - Number(a)) : [];
const binDir = process.env.PDM_DEV_068_POSTGRES_BIN?.trim() || (versions[0] ? path.join(versionsRoot, versions[0], "bin") : "");
const initdb = path.join(binDir, "initdb.exe");
const pgCtl = path.join(binDir, "pg_ctl.exe");
assert.ok(fs.existsSync(initdb) && fs.existsSync(pgCtl), "PostgreSQL initdb/pg_ctl are required");
const port = 55680 + Math.floor(Math.random() * 100);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    stdio: options.ignoreOutput ? "ignore" : ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

let started = false;
try {
  console.log("DEV-068 PostgreSQL QC: initdb");
  run(initdb, ["-D", clusterDir, "-A", "trust", "--username", "postgres", "--encoding", "UTF8", "--no-locale", "--no-sync"]);
  console.log(`DEV-068 PostgreSQL QC: start on ${port}`);
  run(pgCtl, ["start", "-w", "-D", clusterDir, "-o", `-p ${port} -h 127.0.0.1`, "-l", path.join(runDir, "postgres.log")], { ignoreOutput: true });
  started = true;
  const client = new Client({ host: "127.0.0.1", port, user: "postgres", database: "postgres", connectionTimeoutMillis: 5_000, query_timeout: 30_000 });
  await client.connect();
  try {
    await client.query("SET statement_timeout = '25s'");
    await client.query("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;");
    const migrations = ["001_initial_schema.sql", "033_drawing_recognition.sql"];
    for (const name of migrations) {
      console.log(`DEV-068 PostgreSQL QC: apply ${name}`);
      if (name === "033_drawing_recognition.sql") {
        await client.query(`
          INSERT INTO roles (id, role_code, title, system_defined)
          VALUES
            ('role-rd', 'rd', 'RD', 1),
            ('role-rd-manager', 'rd_manager', 'RD Manager', 1),
            ('role-pdm-admin', 'pdm_admin', 'PDM Admin', 1),
            ('role-system-admin', 'system_admin', 'System Admin', 1)
          ON CONFLICT (role_code) DO NOTHING;
          CREATE TABLE IF NOT EXISTS drawings (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT
          );
          CREATE TABLE IF NOT EXISTS drawing_revisions (
            id TEXT PRIMARY KEY,
            company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
            drawing_id TEXT NOT NULL REFERENCES drawings(id) ON DELETE RESTRICT
          );
        `);
      }
      await client.query(fs.readFileSync(path.join(root, "db", "postgres", name), "utf8"));
    }
    const tableRows = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`, [sqliteTables]);
    assert.deepEqual(tableRows.rows.map((row) => row.table_name), sqliteTables);
    const permissionRows = await client.query("SELECT permission_code, COUNT(*)::int AS role_count FROM role_permissions WHERE permission_code LIKE 'numbering.recognition.%' GROUP BY permission_code ORDER BY permission_code");
    assert.deepEqual(permissionRows.rows.map((row) => row.permission_code), ["numbering.recognition.formalize", "numbering.recognition.review", "numbering.recognition.run"]);
    assert.ok(permissionRows.rows.every((row) => row.role_count >= 4));
    const triggerRows = await client.query("SELECT event_object_table, COUNT(*)::int AS trigger_count FROM information_schema.triggers WHERE trigger_schema = 'public' AND trigger_name LIKE 'trg_%_append_only' GROUP BY event_object_table");
    assert.ok(triggerRows.rows.length >= 7);
    const report = { dev: "DEV-068", sqliteTableCount: sqliteTables.length, postgresTableCount: tableRows.rowCount, postgresVersion: (await client.query("SHOW server_version")).rows[0].server_version, appliedMigrations: migrations, baselineShim: "controlled roles plus unified drawings/drawing_revisions dependencies only; full-chain pre-existing 004 approval_rules.phase drift is outside DEV-068", permissionRows: permissionRows.rows, appendOnlyTriggerTableCount: triggerRows.rows.length, destructiveStatements: false, checks: "PASS", completedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(runDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(runDir, "report.md"), `# DEV-068 schema QC\n\n- Result: PASS\n- SQLite/PostgreSQL tables: ${sqliteTables.length}\n- PostgreSQL: ${report.postgresVersion}\n- Applied migrations: ${migrations.join(", ")}\n- Baseline shim: ${report.baselineShim}\n- Append-only trigger tables: ${triggerRows.rows.length}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.end();
  }
} finally {
  if (started) spawnSync(pgCtl, ["stop", "-w", "-t", "15", "-D", clusterDir, "-m", "fast"], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 20_000 });
  const resolvedCluster = path.resolve(clusterDir);
  const resolvedRun = path.resolve(runDir);
  if (resolvedCluster.startsWith(`${resolvedRun}${path.sep}`) && fs.existsSync(resolvedCluster)) fs.rmSync(resolvedCluster, { recursive: true, force: true });
}
