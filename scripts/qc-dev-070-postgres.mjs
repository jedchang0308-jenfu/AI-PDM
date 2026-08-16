#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const repositorySource = fs.readFileSync(path.join(root, "src/lib/repositories/approval-platform-async-repository.ts"), "utf8");
const postgresSchema = fs.readFileSync(path.join(root, "db/postgres/001_initial_schema.sql"), "utf8");

for (const table of [
  "approval_platform_requests",
  "approval_platform_targets",
  "approval_platform_impact_snapshots",
  "approval_platform_actions"
]) {
  assert.match(postgresSchema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `PostgreSQL schema contains ${table}`);
}
assert.match(repositorySource, /requested_at/);
assert.match(repositorySource, /ORDER BY r\.requested_at DESC, r\.id DESC/);
assert.match(repositorySource, /ORDER BY request_id ASC, sort_order ASC, id ASC/);

const postgresUrl = process.env.PDM_POSTGRES_URL?.trim();
const cloudSqlConfigured = process.env.PDM_DB_PROVIDER === "cloud_sql_postgres";
if (!postgresUrl && !cloudSqlConfigured) {
  console.log("QC DEV-070 PostgreSQL: SKIP (PDM_POSTGRES_URL/cloud_sql runtime is not configured; static parity guard passed)");
  process.exit(0);
}

const { getAsyncDatabaseClient, closeAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
const client = getAsyncDatabaseClient();
try {
  assert.equal(client.kind, "postgres", "configured DEV-070 database must be PostgreSQL");
  const rows = await client.query("SELECT CURRENT_TIMESTAMP AS current_timestamp");
  assert.equal(rows.length, 1, "PostgreSQL connectivity probe returns one row");
  console.log("QC DEV-070 PostgreSQL: PASS (configured PostgreSQL connectivity and timestamp probe)");
} finally {
  await closeAsyncDatabaseClient();
}

