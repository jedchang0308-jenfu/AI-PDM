import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const results = [];

function directoryHasFiles(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) return false;
  return fs.readdirSync(absolutePath, { recursive: true, withFileTypes: true }).some((entry) => entry.isFile());
}

function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
  if (!condition) throw new Error(name);
}

const runtimeSource = fs
  .readdirSync(path.join(root, "src"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:ts|tsx|css)$/u.test(entry.name))
  .map((entry) => read(path.relative(root, path.join(entry.parentPath, entry.name))))
  .join("\n");
const sqliteSchema = read("db/schema.sql");
const postgresMigration = read("db/postgres/047_remove_bom_module.sql");
const workflow = read(".github/workflows/deploy-production.yml");
const migrationManifest = JSON.parse(read("output/dev-032-cloudsql-migration-package/cloudsql-migration-manifest.json"));
const packageJson = JSON.parse(read("package.json"));

check("DEV095-001 runtime source has no retired module identifier", !/\bbom\b|bom_/iu.test(runtimeSource));
check("DEV095-002 retired route tree is absent", !directoryHasFiles("src/app/api/bom") && !directoryHasFiles("src/app/bom"));
check("DEV095-003 retired component tree is absent", !directoryHasFiles("src/components/bom-editor"));
check("DEV095-004 SQLite baseline has no retired tables", !/CREATE TABLE IF NOT EXISTS bom_/iu.test(sqliteSchema));
check("DEV095-005 SQLite baseline removed compatibility column and action", !/bom_usage_policy|confirm_bom_no_revision/iu.test(sqliteSchema));

const requiredDrops = [
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
check(
  "DEV095-006 PostgreSQL destructive migration drops every retired table",
  requiredDrops.every((table) => postgresMigration.includes(`DROP TABLE IF EXISTS ${table};`))
);
check("DEV095-007 migration removes compatibility column", postgresMigration.includes("DROP COLUMN IF EXISTS bom_usage_policy"));
check("DEV095-008 migration relies on runner transaction", !/(?:^|\n)\s*(?:BEGIN|COMMIT)\s*;\s*(?:\n|$)/iu.test(postgresMigration));
check(
  "DEV095-009 production candidate verifies exact migration set",
  workflow.includes("schemaMigrationCount !== 50") &&
    workflow.includes("052_retired_workbench_residue_cleanup.cloudsql.sql") &&
    migrationManifest.orderedSchemaMigrations.length === 50 &&
    migrationManifest.orderedSchemaMigrations.some((entry) => entry.output === "sql/047_remove_bom_module.cloudsql.sql")
);
check(
  "DEV095-010 package scripts expose retirement QC and guarded SQLite migration",
  packageJson.scripts["qc:dev-095-bom-retirement"] === "node scripts/qc-dev-095-bom-retirement.mjs" &&
    packageJson.scripts["pdm:dev-095-bom-retirement:sqlite"] === "node scripts/migrate-dev-095-bom-retirement.mjs"
);
check(
  "DEV095-011 old dedicated QC commands are not registered",
  !Object.keys(packageJson.scripts).some((name) => /^(?:qc:)?(?:bom-workbench|dev-060-bom|dev-071|ai-risk-bom|bom-diff-productized|bom-productized)/iu.test(name))
);

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev095-qc-"));
try {
  const freshPath = path.join(tempRoot, "fresh.sqlite");
  const fresh = new Database(freshPath);
  fresh.exec(sqliteSchema);
  check("DEV095-012 fresh SQLite schema is valid", fresh.pragma("foreign_key_check").length === 0);
  check(
    "DEV095-013 fresh SQLite schema contains no retired object",
    fresh.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE lower(name) LIKE 'bom_%'").get().count === 0
  );
  fresh.close();

  const fixturePath = path.join(tempRoot, "fixture.sqlite");
  const backupPath = path.join(tempRoot, "fixture.backup.sqlite");
  const fixture = new Database(fixturePath);
  fixture.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE companies (id TEXT PRIMARY KEY);
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE items (id TEXT PRIMARY KEY, company_id TEXT, part_number TEXT);
    CREATE TABLE part_roots (id TEXT PRIMARY KEY, company_id TEXT, root_code TEXT);
    CREATE TABLE part_numbers (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      part_root_id TEXT,
      part_number TEXT,
      record_status TEXT,
      bom_usage_policy TEXT NOT NULL DEFAULT 'undecided'
    );
    CREATE TABLE drawing_numbers (id TEXT PRIMARY KEY, company_id TEXT, part_root_id TEXT, drawing_number TEXT, record_status TEXT);
    CREATE TABLE submissions (id TEXT PRIMARY KEY, company_id TEXT, item_id TEXT, drawing_number TEXT, revision TEXT, status TEXT);
    INSERT INTO companies VALUES ('company-jenfu');
    INSERT INTO users VALUES ('user-1');
    INSERT INTO items VALUES ('item-1', 'company-jenfu', 'A0001-P01');
    INSERT INTO part_roots VALUES ('root-1', 'company-jenfu', 'A0001');
    INSERT INTO part_numbers VALUES ('part-1', 'company-jenfu', 'root-1', 'A0001-P01', 'Active', 'available');
    INSERT INTO drawing_numbers VALUES ('drawing-1', 'company-jenfu', 'root-1', 'A0001-M01', 'Active');
    INSERT INTO submissions VALUES ('submission-1', 'company-jenfu', 'item-1', 'A0001-M01', 'A', 'Released');
    CREATE TABLE review_confirmation_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      review_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('confirm_bom_no_revision', 'confirm_original_part_reuse')),
      reviewer_user_id TEXT NOT NULL,
      result TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      FOREIGN KEY (company_id) REFERENCES companies(id),
      FOREIGN KEY (reviewer_user_id) REFERENCES users(id)
    );
    INSERT INTO review_confirmation_events VALUES
      ('event-old', 'company-jenfu', 'review-1', 'confirm_bom_no_revision', 'user-1', 'old', '2026-08-24T00:00:00Z', '{}'),
      ('event-keep', 'company-jenfu', 'review-2', 'confirm_original_part_reuse', 'user-1', 'keep', '2026-08-24T00:00:00Z', '{}');
  `);
  for (const table of requiredDrops) fixture.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY); INSERT INTO ${table} VALUES ('fixture-${table}');`);
  fixture.close();

  const run = spawnSync(
    process.execPath,
    [
      "scripts/migrate-dev-095-bom-retirement.mjs",
      `--database=${fixturePath}`,
      `--backup=${backupPath}`,
      "--execute",
      "--approval=DEV-095-BOM-HARD-DELETE-APPROVED"
    ],
    { cwd: root, encoding: "utf8" }
  );
  check("DEV095-014 guarded SQLite migration executes on isolated fixture", run.status === 0);
  check("DEV095-015 migration creates verified backup", fs.existsSync(backupPath) && fs.statSync(backupPath).size > 0);

  const migrated = new Database(fixturePath, { readonly: true, fileMustExist: true });
  check(
    "DEV095-016 isolated fixture contains no retired tables",
    requiredDrops.every((table) => !migrated.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table))
  );
  check(
    "DEV095-017 isolated fixture removed compatibility column",
    !migrated.prepare("PRAGMA table_info(part_numbers)").all().some((column) => column.name === "bom_usage_policy")
  );
  check(
    "DEV095-018 isolated fixture preserves non-retired confirmation evidence",
    migrated.prepare("SELECT COUNT(*) AS count FROM review_confirmation_events WHERE id = 'event-keep'").get().count === 1
  );
  check("DEV095-019 isolated fixture foreign keys remain valid", migrated.pragma("foreign_key_check").length === 0);
  check(
    "DEV095-020 canonical identities survive destructive migration",
    migrated.prepare("SELECT part_number FROM part_numbers WHERE id = 'part-1'").get()?.part_number === "A0001-P01" &&
      migrated.prepare("SELECT drawing_number FROM drawing_numbers WHERE id = 'drawing-1'").get()?.drawing_number === "A0001-M01"
  );
  migrated.close();
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log(`DEV-095 BOM retirement QC: ${results.filter((result) => result.passed).length}/${results.length} passed`);
