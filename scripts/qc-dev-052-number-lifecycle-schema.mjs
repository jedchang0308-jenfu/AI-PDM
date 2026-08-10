#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const results = [];

function record(id, passed, detail = "") {
  results.push({ id, passed: Boolean(passed), detail });
}

function includesAll(source, values) {
  return values.every((value) => source.includes(value));
}

const sqliteSchema = read("db/schema.sql");
const postgresMigration = read("db/postgres/021_number_lifecycle_simplification.sql");
const featureSource = read("src/lib/number-state-flow-feature.ts");
const statusRoute = read("src/app/api/numbering/state-flow/status/route.ts");
const repositorySource = read("src/lib/repositories/number-state-flow-async-repository.ts");

const requiredTables = [
  "numbering_candidate_revision_drafts",
  "numbering_candidate_revision_files",
  "drawing_revision_package_review_approvals"
];

record(
  "DEV052-SCHEMA-001 SQLite defines all additive tables",
  requiredTables.every((table) => sqliteSchema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)),
  requiredTables.join(", ")
);
record(
  "DEV052-SCHEMA-002 PostgreSQL defines all additive public tables",
  requiredTables.every((table) => postgresMigration.includes(`CREATE TABLE IF NOT EXISTS public.${table}`)),
  requiredTables.join(", ")
);
record(
  "DEV052-SCHEMA-003 lifecycle and primary-file constraints are provider-parity",
  includesAll(sqliteSchema, [
    "lifecycle_status IN ('draft', 'review_locked', 'promoted', 'cancelled')",
    "idx_numbering_candidate_revision_files_active_primary_role",
    "WHERE is_primary = 1 AND removed_at IS NULL",
    "DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE"
  ]) && includesAll(postgresMigration, [
    "lifecycle_status IN ('draft', 'review_locked', 'promoted', 'cancelled')",
    "idx_numbering_candidate_revision_files_active_primary_role",
    "WHERE is_primary = 1 AND removed_at IS NULL",
    "DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE"
  ])
);
record(
  "DEV052-SCHEMA-004 PostgreSQL forces RLS and revokes direct Data API access",
  requiredTables.every((table) =>
    postgresMigration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`) &&
    postgresMigration.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY`)
  ) && includesAll(postgresMigration, ["FROM PUBLIC, anon, authenticated", "REVOKE ALL ON TABLE"])
);

const forbiddenBusinessDml = postgresMigration
  .split(/\r?\n/u)
  .filter((line) => /^\s*(UPDATE|DELETE|MERGE)\s+/iu.test(line));
const insertStatements = postgresMigration
  .split(/\r?\n/u)
  .filter((line) => /^\s*INSERT\s+INTO\s+/iu.test(line));
record(
  "DEV052-SCHEMA-005 migration is additive and only seeds the new action",
  forbiddenBusinessDml.length === 0 &&
    insertStatements.length === 1 &&
    postgresMigration.includes("INSERT INTO public.approval_platform_actions") &&
    postgresMigration.includes("ON CONFLICT (action_code) DO NOTHING") &&
    !/ALTER\s+TABLE\s+public\.(numbering_draft_workspaces|number_candidate_reservations|drawing_revision_packages)\b/iu.test(postgresMigration),
  JSON.stringify({ forbiddenBusinessDml, insertStatements })
);
record(
  "DEV052-SCHEMA-006 physical revision status is not widened",
  !/status\s+IN\s*\([^)]*ReviewApproved/isu.test(sqliteSchema) &&
    !/ALTER\s+TABLE\s+public\.drawing_revision_packages/iu.test(postgresMigration),
  "ReviewApproved must remain an effective companion projection"
);

record(
  "DEV052-SCHEMA-007 Cloud SQL migration is the only active PostgreSQL source",
  postgresMigration.includes("numbering_candidate_revision_drafts") && !postgresMigration.includes("supabase.co")
);
record(
  "DEV052-SCHEMA-008 V2 is default-off and status response is additive",
  includesAll(featureSource, [
    'NUMBER_LIFECYCLE_V2_FLAG = "PDM_NUMBER_LIFECYCLE_V2"',
    "if (!value) return false"
  ]) && /phase:\s*"1[ABCD]"/u.test(featureSource) && includesAll(statusRoute, [
    "...numberStateFlowV1ClientStatus()",
    "lifecycleV2: numberLifecycleV2ClientStatus()"
  ])
);
record(
  "DEV052-SCHEMA-009 read repository gates every new-table query behind V2 flag",
  includesAll(repositorySource, [
    "if (isNumberLifecycleV2Enabled())",
    "numbering_candidate_revision_drafts",
    "drawing_revision_package_review_approvals",
    "projectNumberLifecycleV2",
    "lifecycleV2,",
    "candidateRevisions,"
  ]) && !repositorySource.includes("INSERT INTO numbering_candidate_revision_drafts")
);

let database;
try {
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(sqliteSchema);
  const actualTables = new Set(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name)
  );
  record(
    "DEV052-SCHEMA-010 SQLite schema executes and creates the additive tables",
    requiredTables.every((table) => actualTables.has(table)),
    [...actualTables].filter((table) => requiredTables.includes(table)).join(", ")
  );

  const candidateColumns = new Set(
    database.prepare("PRAGMA table_info(numbering_candidate_revision_drafts)").all().map((row) => row.name)
  );
  record(
    "DEV052-SCHEMA-011 candidate authority columns are complete",
    [
      "workspace_id", "drawing_draft_id", "candidate_reservation_id", "revision", "policy_snapshot_json",
      "approval_request_id", "review_snapshot_hash", "legacy_baseline_request_id",
      "formal_drawing_number_id", "formal_revision_package_id", "row_version"
    ].every((column) => candidateColumns.has(column)),
    [...candidateColumns].join(", ")
  );

  database.pragma("foreign_keys = OFF");
  database.prepare(`
    INSERT INTO drawing_revision_package_review_approvals (
      package_id, company_id, candidate_revision_id, approval_request_id,
      snapshot_hash, approved_by, approved_at
    ) VALUES ('pkg-qc', 'company-qc', 'candidate-qc', 'approval-qc', 'hash-qc', 'user-qc', datetime('now'))
  `).run();
  let updateBlocked = false;
  let deleteBlocked = false;
  try {
    database.prepare("UPDATE drawing_revision_package_review_approvals SET snapshot_hash = 'changed'").run();
  } catch (error) {
    updateBlocked = String(error).includes("DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE");
  }
  try {
    database.prepare("DELETE FROM drawing_revision_package_review_approvals").run();
  } catch (error) {
    deleteBlocked = String(error).includes("DRAWING_REVISION_PACKAGE_REVIEW_APPROVAL_IMMUTABLE");
  }
  record(
    "DEV052-SCHEMA-012 immutable companion rejects update and delete",
    updateBlocked && deleteBlocked,
    JSON.stringify({ updateBlocked, deleteBlocked })
  );
} catch (error) {
  record("DEV052-SCHEMA-runtime", false, error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  database?.close();
}

const failed = results.filter((result) => !result.passed);
console.log(JSON.stringify({ passed: results.length - failed.length, failed: failed.length, results }, null, 2));
if (failed.length > 0) process.exit(1);
