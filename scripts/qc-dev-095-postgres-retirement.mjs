#!/usr/bin/env node

import crypto from "node:crypto";
import pg from "pg";
import { buildDev046CloudSqlMigrationRunPlan } from "./run-dev-046-cloudsql-migrations.mjs";

const manifestPath = "output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json";
const postgresUrl = process.env.PDM_POSTGRES_URL?.trim() || "";
const retiredTables = [
  "bom_reconfirmation_flags",
  "bom_identity_migration_issues",
  "bom_create_effects",
  "bom_release_snapshots",
  "bom_review_requests",
  "bom_edit_events",
  "bom_import_jobs",
  "bom_draft_floating_topics",
  "bom_lines_tree",
  "bom_lines",
  "bom_headers",
  "bom_drafts",
  "bom_import_profiles"
];
const canonicalTables = [
  "companies",
  "users",
  "part_roots",
  "part_numbers",
  "drawing_numbers",
  "drawings",
  "drawing_revisions"
];
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed: Boolean(passed), detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function canonicalSnapshot(client) {
  const snapshot = {};
  for (const table of canonicalTables) {
    const response = await client.query(`
      SELECT COUNT(*)::int AS count,
             COALESCE(jsonb_agg(to_jsonb(source) - 'bom_usage_policy' ORDER BY source.id)::text, '[]') AS rows
      FROM (SELECT * FROM ${table} ORDER BY id) source
    `);
    snapshot[table] = response.rows[0];
  }
  return {
    digest: sha256(JSON.stringify(snapshot)),
    counts: Object.fromEntries(Object.entries(snapshot).map(([table, value]) => [table, value.count]))
  };
}

if (!postgresUrl) {
  console.error("PDM_POSTGRES_URL is required for the isolated DEV-095 PostgreSQL rehearsal");
  process.exit(1);
}

const plan = buildDev046CloudSqlMigrationRunPlan(manifestPath);
const retirement = plan.schemaMigrations.find((migration) => migration.version === "047");
const pool = new pg.Pool({ connectionString: postgresUrl, max: 1 });
const client = await pool.connect();

try {
  record("DEV095-PG-001 production package contains 49 ordered migrations", plan.schemaMigrationCount === 49, String(plan.schemaMigrationCount));
  record("DEV095-PG-002 retirement migration 047 is present", retirement?.output === "sql/047_remove_bom_module.cloudsql.sql", retirement?.output ?? "missing");

  await client.query("BEGIN");
  const consolidatedBaselineSql = plan.schemaMigrations[0].sql.replace(
    /\(([a-z_][a-z0-9_]*\s+IS\s+NOT\s+NULL)\)(?=\s*(?:\+|=))/giu,
    "($1)::int"
  );
  await client.query(consolidatedBaselineSql);
  record("DEV095-PG-003 consolidated production-shaped baseline applies", true, plan.schemaMigrations[0].version);

  await client.query(`
    CREATE TABLE approval_matrix_rules (
      id TEXT PRIMARY KEY,
      action_code TEXT NOT NULL
    )
  `);
  await client.query(`INSERT INTO approval_matrix_rules (id, action_code) VALUES ('dev095-matrix-bom', 'bom.release_review'), ('dev095-matrix-kept', 'drawing.release_review')`);

  const existingRetiredTables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [retiredTables]
  );
  record("DEV095-PG-004 consolidated baseline exposes the retired BOM schema", existingRetiredTables.rowCount >= 12, `${existingRetiredTables.rowCount}/${retiredTables.length}`);

  await client.query(`INSERT INTO companies (id, company_code, display_name) VALUES ('dev095-company', 'DEV095', 'DEV-095 PostgreSQL QC')`);
  await client.query(`INSERT INTO users (id, display_name, email, role, company_id) VALUES ('dev095-user', 'DEV-095 QC', 'dev095@example.invalid', 'Admin', 'dev095-company')`);
  await client.query(`INSERT INTO numbering_rule_versions (id, rule_code, title, created_by) VALUES ('numbering-rule-v3-alpha-root', 'DEV095-QC-RULE', 'DEV-095 QC rule', 'dev095-user')`);
  await client.query(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, created_by) VALUES ('dev095-root', 'dev095-company', 'Q9501', 'Retirement survivor', 'manufactured', 'Active', 'dev095-user')`);
  await client.query(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by) VALUES ('dev095-part', 'dev095-company', 'dev095-root', 'Q9501-P01', 1, 'P01', 'Retirement survivor part', 'manufactured', 'Active', 'dev095-user')`);
  await client.query(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, sequence_no, record_status, created_by) VALUES ('dev095-drawing-number', 'dev095-company', 'dev095-root', 'Q9501-M01', 'M', 1, 'Active', 'dev095-user')`);
  await client.query(`INSERT INTO drawings (id, company_id, drawing_number, lifecycle_state, formal_drawing_number_id, part_root_id, purpose_code, sequence_no, owner_id, created_by) VALUES ('dev095-drawing', 'dev095-company', 'Q9501-M01', 'released', 'dev095-drawing-number', 'dev095-root', 'M', 1, 'dev095-user', 'dev095-user')`);
  await client.query(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by) VALUES ('dev095-revision', 'dev095-company', 'dev095-drawing', 'A', 'released', 'dev095-user')`);
  await client.query(`INSERT INTO bom_import_profiles (id, profile_name, version, mapping_json) VALUES ('dev095-bom-profile', 'DEV-095 retired profile', '1', '{}')`);
  await client.query(`INSERT INTO review_confirmation_events (id, company_id, review_id, action, reviewer_user_id, result) VALUES ('dev095-confirmation', 'dev095-company', 'dev095-review', 'confirm_bom_no_revision', 'dev095-user', 'confirmed')`);
  await client.query(`INSERT INTO audit_logs (id, actor_id, action) VALUES ('dev095-audit', 'dev095-user', 'bom.retirement.fixture')`);

  const before = await canonicalSnapshot(client);
  await client.query(retirement.sql);
  const after = await canonicalSnapshot(client);
  record("DEV095-PG-005 canonical identities and rows survive migration 047", after.digest === before.digest, `${before.digest} -> ${after.digest}`);
  record("DEV095-PG-006 canonical fixture counts survive migration 047", Object.values(after.counts).every((count) => count >= 1), JSON.stringify(after.counts));

  const remainingTables = await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[]) ORDER BY table_name`,
    [retiredTables]
  );
  record("DEV095-PG-007 retired BOM tables are absent", remainingTables.rowCount === 0, remainingTables.rows.map((row) => row.table_name).join(","));

  const retiredColumn = await client.query(`
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'part_numbers' AND column_name = 'bom_usage_policy'
  `);
  record("DEV095-PG-008 part_numbers BOM compatibility column is absent", retiredColumn.rowCount === 0);

  const retiredActions = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM approval_platform_actions WHERE action_code IN ('bom.release_review', 'bom.obsolete_review') OR domain_code = 'bom') AS approval_actions,
      (SELECT COUNT(*)::int FROM review_confirmation_events WHERE action = 'confirm_bom_no_revision') AS confirmation_actions,
      (SELECT COUNT(*)::int FROM audit_logs WHERE lower(action) LIKE '%bom%') AS audit_actions
  `);
  const actionCounts = retiredActions.rows[0];
  record("DEV095-PG-009 BOM compatibility actions and audit rows are absent", Object.values(actionCounts).every((count) => count === 0), JSON.stringify(actionCounts));

  const matrixRules = await client.query(`SELECT id, action_code FROM approval_matrix_rules ORDER BY id`);
  record(
    "DEV095-PG-010 optional approval matrix cleanup is selective",
    matrixRules.rowCount === 1 && matrixRules.rows[0]?.id === "dev095-matrix-kept",
    JSON.stringify(matrixRules.rows)
  );

  const confirmationConstraint = await client.query(`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.review_confirmation_events'::regclass
      AND conname = 'review_confirmation_events_action_check'
  `);
  const confirmationDefinition = confirmationConstraint.rows[0]?.definition ?? "";
  record("DEV095-PG-011 confirmation constraint rejects retired BOM action", confirmationDefinition.length > 0 && !confirmationDefinition.includes("confirm_bom_no_revision"), confirmationDefinition);

  await client.query(retirement.sql);
  const afterSecondApply = await canonicalSnapshot(client);
  record("DEV095-PG-012 migration 047 is idempotent", afterSecondApply.digest === after.digest, `${after.digest} -> ${afterSecondApply.digest}`);

  const invalidConstraints = await client.query(`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype = 'f' AND NOT convalidated`);
  record("DEV095-PG-013 no unvalidated foreign-key constraints remain", invalidConstraints.rows[0]?.count === 0, String(invalidConstraints.rows[0]?.count));

  await client.query("ROLLBACK");
  console.log(JSON.stringify({ passed: results.length, failed: 0, canonicalCounts: after.counts, results }, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
