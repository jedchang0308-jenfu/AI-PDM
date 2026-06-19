#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8");
}

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

function contains(source, text) {
  return source.includes(text);
}

const provider = read("src/lib/db-provider.ts");
const asyncProvider = read("src/lib/db-async-provider.ts");
const db = read("src/lib/db.ts");
const contracts = read("src/lib/repositories/contracts.ts");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));

record("DB-001 DatabaseProvider contract exists", contains(provider, "export interface DatabaseProvider"), "src/lib/db-provider.ts");
record("DB-002 SQLite provider exists", contains(provider, "export class SQLiteDatabaseProvider"), "src/lib/db-provider.ts");
record("DB-003 default provider factory exists", contains(provider, "export function createDefaultDatabaseProvider"), "src/lib/db-provider.ts");
record("DB-004 provider exposes close lifecycle", contains(provider, "close()"), "src/lib/db-provider.ts");
record("DB-005 unsupported provider fails closed", contains(provider, "UNSUPPORTED_DB_PROVIDER"), "src/lib/db-provider.ts");
record("DB-005A async provider contract exists", contains(asyncProvider, "export interface AsyncDatabaseClient"), "src/lib/db-async-provider.ts");
record("DB-005B async provider supports sqlite and postgres kind", contains(asyncProvider, "\"sqlite\" | \"postgres\""), "src/lib/db-async-provider.ts");
record("DB-005C async provider exposes query/queryOne/execute/transaction", ["query<T>", "queryOne<T>", "execute(", "transaction<T>"].every((text) => contains(asyncProvider, text)), "src/lib/db-async-provider.ts");
record("DB-005D SQLite async adapter exists", contains(asyncProvider, "export class SQLiteAsyncDatabaseClient"), "src/lib/db-async-provider.ts");
record("DB-005E Postgres async adapter exists", contains(asyncProvider, "export class PostgresAsyncDatabaseClient"), "src/lib/db-async-provider.ts");
record("DB-005F SQLite async transaction rejects awaited callbacks", contains(asyncProvider, "SQLITE_ASYNC_TRANSACTION_CALLBACK_UNSUPPORTED"), "src/lib/db-async-provider.ts");
record("DB-005G Postgres async provider requires connection string", contains(asyncProvider, "POSTGRES_CONNECTION_STRING_REQUIRED"), "src/lib/db-async-provider.ts");
record(
  "DB-005H Postgres async provider uses unnamed queries",
  contains(asyncProvider, "queryable.query<T>(query.text, query.values)") &&
    !contains(asyncProvider, "name: \"") &&
    !contains(asyncProvider, "name: '"),
  "src/lib/db-async-provider.ts"
);
record("DB-005I Postgres async provider implements transaction boundaries", ["BEGIN", "COMMIT", "ROLLBACK"].every((text) => contains(asyncProvider, text)), "src/lib/db-async-provider.ts");
record("DB-005J Postgres async provider blocks nested transactions", contains(asyncProvider, "POSTGRES_NESTED_TRANSACTION_UNSUPPORTED"), "src/lib/db-async-provider.ts");
record(
  "DB-005K async runtime provider selector exists",
  contains(asyncProvider, "export function getAsyncDatabaseClient") &&
    contains(asyncProvider, "normalizeRuntimeProviderKind") &&
    contains(asyncProvider, "UNSUPPORTED_ASYNC_DB_PROVIDER"),
  "src/lib/db-async-provider.ts"
);
record(
  "DB-005L async runtime selector supports Postgres env",
  contains(asyncProvider, "process.env.PDM_DB_PROVIDER") &&
    contains(asyncProvider, "process.env.PDM_POSTGRES_URL") &&
    contains(asyncProvider, "process.env.PDM_POSTGRES_POOLER_MODE") &&
    contains(asyncProvider, "process.env.PDM_POSTGRES_MAX_CONNECTIONS"),
  "src/lib/db-async-provider.ts"
);
record(
  "DB-005M async runtime client exposes close hook",
  contains(asyncProvider, "export async function closeAsyncDatabaseClient") && contains(asyncProvider, "await runtimeClient?.close()"),
  "src/lib/db-async-provider.ts"
);

record("DB-006 db.ts imports provider boundary", contains(db, "@/lib/db-provider"), "src/lib/db.ts");
record("DB-007 db.ts uses provider factory", contains(db, "createDefaultDatabaseProvider({"), "src/lib/db.ts");
record("DB-008 db.ts returns provider connection", contains(db, "dbProvider.getConnection()"), "src/lib/db.ts");
record("DB-009 db.ts does not instantiate better-sqlite3 directly", !/new\s+Database\s*\(/u.test(db), "src/lib/db.ts");
record("DB-010 db.ts does not import better-sqlite3 directly", !contains(db, "from \"better-sqlite3\""), "src/lib/db.ts");

for (const name of [
  "SubmissionRepository",
  "ReviewRepository",
  "BomRepository",
  "ReleaseRepository",
  "SandboxRepository",
  "ItemLockRepository",
  "SystemRepository",
  "RepositorySet"
]) {
  record(`DB-011 contract exports ${name}`, contains(contracts, `export interface ${name}`), "src/lib/repositories/contracts.ts");
}

record("DB-012 db provider env documented", /^PDM_DB_PROVIDER=sqlite$/m.test(envExample), ".env.example");
record(
  "DB-012A async Postgres runtime env documented",
  ["PDM_POSTGRES_URL=", "PDM_POSTGRES_POOLER_MODE=", "PDM_POSTGRES_MAX_CONNECTIONS="].every((text) => contains(envExample, text)),
  ".env.example"
);
record(
  "DB-013 package exposes QC command",
  packageJson.scripts?.["qc:db-provider-contract"] === "node scripts/qc-db-provider-contract-test.mjs",
  "package.json"
);
record(
  "DB-014 package exposes async provider QC alias",
  packageJson.scripts?.["qc:db-provider-async-contract"] === "node scripts/qc-db-provider-contract-test.mjs",
  "package.json"
);

const failed = results.filter((result) => !result.passed);
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results
    },
    null,
    2
  )
);

process.exitCode = failed.length === 0 ? 0 : 1;
