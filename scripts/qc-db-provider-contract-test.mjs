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
const db = read("src/lib/db.ts");
const contracts = read("src/lib/repositories/contracts.ts");
const envExample = read(".env.example");
const packageJson = JSON.parse(read("package.json"));

record("DB-001 DatabaseProvider contract exists", contains(provider, "export interface DatabaseProvider"), "src/lib/db-provider.ts");
record("DB-002 SQLite provider exists", contains(provider, "export class SQLiteDatabaseProvider"), "src/lib/db-provider.ts");
record("DB-003 default provider factory exists", contains(provider, "export function createDefaultDatabaseProvider"), "src/lib/db-provider.ts");
record("DB-004 provider exposes close lifecycle", contains(provider, "close()"), "src/lib/db-provider.ts");
record("DB-005 unsupported provider fails closed", contains(provider, "UNSUPPORTED_DB_PROVIDER"), "src/lib/db-provider.ts");

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
  "DB-013 package exposes QC command",
  packageJson.scripts?.["qc:db-provider-contract"] === "node scripts/qc-db-provider-contract-test.mjs",
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
