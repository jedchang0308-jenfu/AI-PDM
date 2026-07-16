#!/usr/bin/env node

import pg from "pg";
import { readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
}

const source = readProjectFile(root, "src/lib/db-async-provider.ts");
const packageJson = readProjectJson(root, "package.json");
const postgresUrl = process.env.PDM_POSTGRES_URL?.trim() || "";

record("PG-PROVIDER-001 pg dependency installed", Boolean(packageJson.dependencies?.pg), "package.json");
record("PG-PROVIDER-002 PostgresAsyncDatabaseClient exists", source.includes("export class PostgresAsyncDatabaseClient"), "src/lib/db-async-provider.ts");
record("PG-PROVIDER-003 connection string required", source.includes("POSTGRES_CONNECTION_STRING_REQUIRED"), "src/lib/db-async-provider.ts");
record(
  "PG-PROVIDER-004 unnamed pg queries only",
  source.includes("queryable.query<T>(query.text, query.values)") && !source.includes("name: \"") && !source.includes("name: '"),
  "src/lib/db-async-provider.ts"
);
record("PG-PROVIDER-005 named parameter normalization exists", source.includes("normalizePostgresQuery") && source.includes("POSTGRES_NAMED_PARAMETER_MISSING"), "src/lib/db-async-provider.ts");
record("PG-PROVIDER-006 transaction boundaries exist", ["BEGIN", "COMMIT", "ROLLBACK"].every((text) => source.includes(text)), "src/lib/db-async-provider.ts");
record(
  "PG-PROVIDER-007 transaction client reuses active transaction",
  source.includes("class PostgresTransactionClient") && source.includes("return await fn(this);"),
  "src/lib/db-async-provider.ts"
);
record(
  "PG-PROVIDER-008 runtime selector uses Postgres env",
  source.includes("export function getAsyncDatabaseClient") &&
    source.includes("process.env.PDM_DB_PROVIDER") &&
    source.includes("process.env.PDM_POSTGRES_URL") &&
    source.includes("process.env.PDM_POSTGRES_POOLER_MODE") &&
    source.includes("process.env.PDM_POSTGRES_MAX_CONNECTIONS"),
  "src/lib/db-async-provider.ts"
);

if (postgresUrl) {
  const pool = new pg.Pool({ connectionString: postgresUrl, max: 1 });
  try {
    const result = await pool.query("select 1::int as ok");
    record("PG-PROVIDER-009 live Postgres probe", result.rows?.[0]?.ok === 1, "PDM_POSTGRES_URL");
  } catch (error) {
    record("PG-PROVIDER-009 live Postgres probe", false, error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end().catch(() => undefined);
  }
} else {
  record("PG-PROVIDER-009 live Postgres probe skipped without env", true, "PDM_POSTGRES_URL not configured");
}

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
