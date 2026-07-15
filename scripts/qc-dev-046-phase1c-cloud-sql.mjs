#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  resolveCloudSqlRuntimeConfig,
  validateCloudSqlCapacity
} from "../src/lib/cloud-sql-contract.ts";
import {
  defineGuardedMigration,
  runSingletonMigrations,
  scanApplicationStartupDdl
} from "../src/lib/singleton-migration-runner.ts";

const root = process.cwd();
const results = [];
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function json(relativePath) { return JSON.parse(read(relativePath)); }
function record(name, passed, detail = "") { results.push({ name, passed: Boolean(passed), detail }); }
async function rejects(fn, expected) {
  try { await fn(); return false; } catch (error) { return error instanceof Error && error.message === expected; }
}

const cloudEnv = {
  PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME: "jenfu-prod:asia-east1:ai-pdm",
  PDM_CLOUD_SQL_HOST: "127.0.0.1",
  PDM_CLOUD_SQL_PORT: "5432",
  PDM_CLOUD_SQL_DATABASE: "ai_pdm",
  PDM_CLOUD_SQL_USER: "ai-pdm-runtime@jenfu-prod.iam",
  PDM_CLOUD_SQL_POOL_MAX: "5",
  PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS: "10000",
  PDM_CLOUD_SQL_IDLE_TIMEOUT_MS: "600000",
  PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS: "30000",
  PDM_CLOUD_SQL_QUERY_TIMEOUT_MS: "35000"
};
const resolved = resolveCloudSqlRuntimeConfig(cloudEnv);
record("DEV046-1C-001 Cloud SQL runtime resolves localhost IAM-proxy config", resolved.kind === "cloud_sql_postgres" && resolved.host === "127.0.0.1" && resolved.maxConnections === 5 && resolved.queryTimeoutMillis === 35_000);
record("DEV046-1C-002 static database secrets are rejected", await rejects(() => Promise.resolve(resolveCloudSqlRuntimeConfig({ ...cloudEnv, PDM_CLOUD_SQL_PASSWORD: "forbidden" })), "CLOUD_SQL_STATIC_DATABASE_SECRET_FORBIDDEN"));
record("DEV046-1C-003 service-account key files are rejected", await rejects(() => Promise.resolve(resolveCloudSqlRuntimeConfig({ ...cloudEnv, GOOGLE_APPLICATION_CREDENTIALS: "/secret/key.json" })), "CLOUD_SQL_SERVICE_ACCOUNT_KEY_FILE_FORBIDDEN"));
record("DEV046-1C-004 non-local proxy endpoints are rejected", await rejects(() => Promise.resolve(resolveCloudSqlRuntimeConfig({ ...cloudEnv, PDM_CLOUD_SQL_HOST: "10.0.0.9" })), "CLOUD_SQL_PROXY_LOCALHOST_REQUIRED"));

const capacity = json("config/platform/cloud-sql-capacity.json");
const capacityResult = validateCloudSqlCapacity(capacity);
record("DEV046-1C-005 connection budget preserves at least 30 percent", capacityResult.valid && capacityResult.requiredConnections === 52 && capacityResult.allowedApplicationConnections === 70 && capacityResult.reserveConnections === 48);
const saturated = validateCloudSqlCapacity({ ...capacity, maxInstancesPerRevision: 10, effectiveMaximumInstances: 20 });
record("DEV046-1C-006 saturated rollout budget fails closed", !saturated.valid && saturated.errors.includes("CLOUD_SQL_CAPACITY_RESERVE_BREACHED"));

const dbProvider = read("src/lib/db-async-provider.ts");
record("DEV046-1C-007 active provider supports Cloud SQL without deleting generic Postgres", dbProvider.includes('"cloud_sql_postgres"') && dbProvider.includes('kind: "postgres"') && dbProvider.includes("resolveCloudSqlRuntimeConfig"));
record("DEV046-1C-008 pg pool has bounded connection and query timeouts", ["connectionTimeoutMillis", "idleTimeoutMillis", "statement_timeout", "query_timeout"].every((fragment) => dbProvider.includes(fragment)));

const grants = read("db/cloud-sql/pdm_runtime_grants.sql");
record("DEV046-1C-009 runtime grant is least privilege and cannot bypass RLS", grants.includes("NOBYPASSRLS") && grants.includes("REVOKE CREATE ON SCHEMA public FROM pdm_runtime") && grants.includes("REVOKE TRUNCATE, REFERENCES, TRIGGER") && !/GRANT\s+(?:ALL|CREATE).*TO\s+pdm_runtime/iu.test(grants));
const access = json("config/platform/cloud-sql-access.json");
record("DEV046-1C-010 connector IAM and browser denial are explicit", access.databaseAuthentication === "cloud-sql-auth-proxy-automatic-iam" && access.runtimeServiceIdentityIamRoles.includes("roles/cloudsql.client") && access.runtimeServiceIdentityIamRoles.includes("roles/cloudsql.instanceUser") && access.browserDatabaseAccessAllowed === false && access.staticDatabasePasswordsAllowed === false);

class FakeMigrationClient {
  kind = "postgres";
  lockAvailable = true;
  history = new Map();
  executed = [];
  async query(sql) {
    if (sql.includes("FROM pdm_schema_migrations")) return [...this.history].map(([version, checksum]) => ({ version, checksum }));
    return [];
  }
  async queryOne(sql) {
    if (sql.includes("pg_try_advisory_xact_lock")) return { acquired: this.lockAvailable };
    return null;
  }
  async execute(sql, params) {
    this.executed.push(sql.trim());
    if (sql.includes("INSERT INTO pdm_schema_migrations")) this.history.set(params.version, params.checksum);
  }
  async transaction(fn) { return fn(this); }
  async close() {}
}

const migration = defineGuardedMigration({ version: "011", name: "qc_contract", sql: "CREATE TABLE qc_contract (id TEXT PRIMARY KEY)" });
const fake = new FakeMigrationClient();
const first = await runSingletonMigrations(fake, [migration]);
const second = await runSingletonMigrations(fake, [migration]);
record("DEV046-1C-011 migration applies once and reuses checksum history", first.appliedVersions.join(",") === "011" && second.appliedVersions.length === 0 && fake.history.get("011") === migration.checksum);
fake.lockAvailable = false;
record("DEV046-1C-012 concurrent migration runner is rejected", await rejects(() => runSingletonMigrations(fake, [migration]), "MIGRATION_RUNNER_ALREADY_ACTIVE"));
fake.lockAvailable = true;
fake.history.set("011", "bad-checksum");
record("DEV046-1C-013 migration history checksum drift is rejected", await rejects(() => runSingletonMigrations(fake, [migration]), "MIGRATION_HISTORY_CHECKSUM_MISMATCH:011"));

const startupDdl = scanApplicationStartupDdl([
  { path: "src/app/api/unsafe/route.ts", source: "await db.execute('CREATE TABLE unsafe (id text)')" },
  { path: "scripts/migrate.mjs", source: "CREATE TABLE allowed_runner (id text)" }
]);
record("DEV046-1C-014 app-start DDL scanner rejects transport DDL only", startupDdl.length === 1 && startupDdl[0] === "src/app/api/unsafe/route.ts");

const clientDbImports = [];
for (const absolute of fs.readdirSync(path.join(root, "src/app"), { recursive: true }).filter((entry) => /\.(?:ts|tsx)$/u.test(String(entry)))) {
  const relative = path.join("src/app", String(absolute));
  const source = read(relative);
  if (/^\s*["']use client["'];/mu.test(source) && /@\/lib\/(?:db|db-async-provider|cloud-sql-contract)/u.test(source)) clientDbImports.push(relative);
}
record("DEV046-1C-015 browser source has no database authority", clientDbImports.length === 0, clientDbImports.join(","));
const commandService = read("src/lib/platform-command-service.ts");
record("DEV046-1C-016 business audit receipt and outbox remain one transaction", commandService.includes("client.transaction") && commandService.includes("enqueue") && commandService.includes("completeCommand"));
const generatedPostgresSchema = read("db/postgres/001_initial_schema.sql");
record("DEV046-1C-017 session revocation cutoff remains a database timestamp", /session_invalid_before\s+TIMESTAMPTZ/iu.test(generatedPostgresSchema));

for (const result of results) console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
const failures = results.filter((result) => !result.passed);
console.log(`\nDEV-046 Phase 1C QC: ${results.length - failures.length}/${results.length} passed`);
if (failures.length > 0) process.exitCode = 1;
