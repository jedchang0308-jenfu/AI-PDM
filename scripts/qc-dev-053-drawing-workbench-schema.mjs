#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const results = [];
const record = (id, passed, detail = "") => results.push({ id, passed: Boolean(passed), detail });
const has = (source, fragments) => fragments.every((fragment) => source.includes(fragment));

const sqlite = read("db/schema.sql");
const postgres = read("db/postgres/022_unified_drawing_workbench.sql");
const mirror = read("supabase/migrations/20260804020000_unified_drawing_workbench.sql");
const manifest = JSON.parse(read("supabase/migrations/manifest.json"));
const sync = read("scripts/sync-supabase-runtime-migrations.mjs");
const feature = read("src/lib/number-state-flow-feature.ts");
const dbSource = read("src/lib/db.ts");
const columns = ["source_drawing_number_id", "source_part_number_id", "source_link_type"];

record("DEV053-SCHEMA-001 SQLite source-context columns are nullable and indexed",
  columns.every((column) => sqlite.includes(`${column} TEXT`)) &&
  has(sqlite, ["idx_numbering_draft_workspaces_source_drawing", "idx_numbering_draft_workspaces_source_part"]));
record("DEV053-SCHEMA-002 PostgreSQL migration is additive and idempotent",
  columns.every((column) => postgres.includes(`ADD COLUMN IF NOT EXISTS ${column}`)) &&
  (postgres.match(/CREATE INDEX IF NOT EXISTS/gu)?.length ?? 0) >= 2);

const forbidden = postgres.split(/\r?\n/u).filter((line) => /^\s*(INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\s+/iu.test(line));
record("DEV053-SCHEMA-003 migration contains no business DML or backfill", forbidden.length === 0, JSON.stringify(forbidden));
record("DEV053-SCHEMA-004 provider-parity source constraints are present",
  has(sqlite, ["draft_mode = 'append_part'", "draft_mode = 'append_drawing'", "source_link_type IS NOT NULL"]) &&
  has(postgres, ["numbering_draft_workspaces_source_context_check", "draft_mode = 'append_part'", "draft_mode = 'append_drawing'"]));

const hash = crypto.createHash("sha256").update(postgres).digest("hex");
const manifestEntry = manifest.migrations?.find((entry) => entry.source === "db/postgres/022_unified_drawing_workbench.sql");
record("DEV053-SCHEMA-005 Supabase mirror registry and source hash match",
  mirror.includes(`-- Source SHA-256: ${hash}`) &&
  sync.includes('source: "db/postgres/022_unified_drawing_workbench.sql"') &&
  manifestEntry?.target === "supabase/migrations/20260804020000_unified_drawing_workbench.sql" &&
  manifestEntry?.sourceSha256 === hash,
  hash);
record("DEV053-SCHEMA-006 workbench flag is default-off and depends on lifecycle V2",
  has(feature, [
    'UNIFIED_DRAWING_WORKBENCH_V1_FLAG = "PDM_UNIFIED_DRAWING_WORKBENCH_V1"',
    'String(env[UNIFIED_DRAWING_WORKBENCH_V1_FLAG] ?? "")',
    "isNumberLifecycleV2Enabled(env)",
    "requested"
  ]));
record("DEV053-SCHEMA-007 existing SQLite compatibility runs before schema indexes",
  dbSource.indexOf("ensurePreSchemaCompatibility(database)") < dbSource.indexOf("database.exec(schema)") &&
  columns.every((column) => dbSource.slice(dbSource.indexOf("function ensurePreSchemaCompatibility")).includes(`\"${column}\"`)));

let database;
try {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(sqlite);
  const actual = new Set(database.prepare("PRAGMA table_info(numbering_draft_workspaces)").all().map((row) => row.name));
  record("DEV053-SCHEMA-008 clean SQLite schema executes", columns.every((column) => actual.has(column)), [...actual].join(","));

  database.exec(`
    INSERT INTO users (id, display_name, email, role) VALUES ('dev053-schema-user', 'DEV-053', 'dev053-schema@example.invalid', 'Engineer');
    INSERT INTO numbering_draft_workspaces (
      id, company_id, draft_mode, owner_id, created_by, source_root_id,
      source_drawing_number_id, source_link_type
    ) VALUES (
      'invalid-source', 'company-jenfu', 'append_part', 'dev053-schema-user', 'dev053-schema-user',
      'missing-root', 'missing-drawing', 'reference'
    );
  `);
  record("DEV053-SCHEMA-009 source foreign keys remain fail-closed", false, "invalid source unexpectedly inserted");
} catch (error) {
  record("DEV053-SCHEMA-009 source foreign keys remain fail-closed", String(error).includes("FOREIGN KEY"), String(error));
} finally {
  database?.close();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
