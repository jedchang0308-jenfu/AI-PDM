import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";
import { ensureDev106RetiredWorkbenchResidueCleanupSchema } from "../src/lib/db.ts";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const checks = [];
const check = (name, condition) => {
  checks.push({ name, passed: Boolean(condition) });
  assert.ok(condition, name);
};

const migration = read("db/postgres/052_retired_workbench_residue_cleanup.sql");
const sqliteSchema = read("db/schema.sql");
const sqliteRuntime = read("src/lib/db.ts");
const mapper = read("scripts/migrate-dev-087-canonical-workbench.mjs");
const postgresMapper = read("scripts/migrate-dev-087-postgres.mjs");
const coverage = read("scripts/qc-production-snapshot-canonical-coverage.mjs");
const workflow = read(".github/workflows/deploy-production.yml");
const tableDdl = (table, nextTable) => sqliteSchema.slice(
  sqliteSchema.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`),
  sqliteSchema.indexOf(`CREATE TABLE IF NOT EXISTS ${nextTable}`)
);

check("DEV106-001 migration fails closed on active Relation work", migration.includes("DEV106_ACTIVE_RELATION_WORK"));
check("DEV106-002 migration drops retired Relation work table", migration.includes("DROP TABLE IF EXISTS relation_change_works"));
check("DEV106-003 migration strips inert BOM payload key", migration.includes("proposed_payload - 'bomUsagePolicy'"));
check("DEV106-004 migration blocks future BOM payload residue", migration.includes("dev106_part_work_no_retired_bom_usage_policy"));
check("DEV106-005 migration reinstalls Relation-free reference guard", migration.includes("CREATE OR REPLACE FUNCTION dev087_guard_company_reference") && migration.includes("DEV106_RETIRED_RELATION_GUARD_REMAINS"));
check("DEV106-006 current SQLite baseline does not create Relation work", !/CREATE TABLE IF NOT EXISTS relation_change_works/iu.test(sqliteSchema));
const currentProjectionDdl = [
  tableDdl("pdm_workbench_aggregates", "drawing_rd_branches"),
  tableDdl("canonical_workbench_states", "pdm_work_review_requests"),
  tableDdl("pdm_work_review_requests", "pdm_review_traces")
].join("\n");
check("DEV106-007 current SQLite baseline does not admit Relation projections", !/entity_type IN \('drawing', 'part', 'relation'\)|relation_formal|relation_work/iu.test(currentProjectionDdl));
check("DEV106-008 SQLite runtime executes forward cleanup", sqliteRuntime.includes("ensureDev106RetiredWorkbenchResidueCleanupSchema(database)"));
check("DEV106-008A SQLite compatibility cleanup fails closed on Relation state", sqliteRuntime.includes("DEV090_ACTIVE_RELATION_STATE"));
check("DEV106-008B SQLite compatibility cleanup fails closed on Relation aggregate", sqliteRuntime.includes("DEV090_ACTIVE_RELATION_AGGREGATE"));
check("DEV106-009 canonical mapper emits no retired BOM payload", !mapper.includes("bomUsagePolicy"));
check("DEV106-010 canonical mapper no longer inventories Relation work", !mapper.includes('"relation_change_works"'));
check("DEV106-011 PostgreSQL mapper never replays migration 042", !postgresMapper.includes('fs.readFileSync(path.resolve("db/postgres/042_status_data_rebuild.sql")'));
check("DEV106-012 PostgreSQL mapper requires ordered migration 052", postgresMapper.includes("DEV106_POSTGRES_RETIREMENT_MIGRATION_REQUIRED"));
check("DEV106-013 PostgreSQL mapper rejects retired BOM payload mapping", postgresMapper.includes("DEV106_POSTGRES_RETIRED_BOM_PAYLOAD_FORBIDDEN"));
const allowedTargets = postgresMapper.slice(postgresMapper.indexOf("const allowedTargetTables"), postgresMapper.indexOf("const canonicalIdentityBackfillTables"));
check("DEV106-014 PostgreSQL mapper cannot target Relation work table", !allowedTargets.includes('"relation_change_works"'));
check("DEV106-015 coverage oracle no longer expects retired BOM payload", !coverage.includes("bomUsagePolicy"));
check("DEV106-016 release pipeline pins 50 migrations", workflow.includes("schemaMigrationCount !== 50"));
check("DEV106-017 release pipeline pins migration 052 as last", workflow.includes("052_retired_workbench_residue_cleanup.cloudsql.sql"));

const db = createFixtureDatabase({ canonical: false });
try {
  db.exec(`
    CREATE TABLE relation_change_works (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      root_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      proposed_tree TEXT NOT NULL,
      proposed_tree_hash TEXT NOT NULL,
      base_formal_tree_hash TEXT NOT NULL,
      row_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.prepare(`INSERT INTO part_change_works
    (id, company_id, part_id, owner_user_id, proposed_payload, base_hash)
    VALUES ('work-dev106', ?, ?, ?, ?, 'base-dev106')`)
    .run(ids.company, ids.part, ids.owner, JSON.stringify({ partName: "本體", bomUsagePolicy: "undecided" }));
  const linkBefore = db.prepare("SELECT COUNT(*) AS count FROM drawing_part_links").get().count;
  ensureDev106RetiredWorkbenchResidueCleanupSchema(db);
  ensureDev106RetiredWorkbenchResidueCleanupSchema(db);
  check("DEV106-018 SQLite cleanup drops empty Relation compatibility table", !db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='relation_change_works'").get());
  const payload = JSON.parse(db.prepare("SELECT proposed_payload FROM part_change_works WHERE id='work-dev106'").get().proposed_payload);
  check("DEV106-019 SQLite cleanup removes inert BOM key", !Object.hasOwn(payload, "bomUsagePolicy") && payload.partName === "本體");
  check("DEV106-020 SQLite cleanup preserves formal drawing-part links", db.prepare("SELECT COUNT(*) AS count FROM drawing_part_links").get().count === linkBefore);
  assert.throws(
    () => db.prepare("UPDATE part_change_works SET proposed_payload=? WHERE id='work-dev106'").run(JSON.stringify({ bomUsagePolicy: "undecided" })),
    /DEV106_RETIRED_PART_PAYLOAD_KEY_FORBIDDEN/u
  );
  check("DEV106-021 SQLite guard rejects future BOM key", true);
  check("DEV106-022 SQLite foreign keys remain valid", db.pragma("foreign_key_check").length === 0);
} finally {
  db.close();
}

const failClosed = createFixtureDatabase({ canonical: false });
try {
  failClosed.exec(`CREATE TABLE relation_change_works (
    id TEXT PRIMARY KEY, company_id TEXT NOT NULL, root_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
    proposed_tree TEXT NOT NULL, proposed_tree_hash TEXT NOT NULL, base_formal_tree_hash TEXT NOT NULL,
    row_version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  failClosed.prepare("INSERT INTO relation_change_works (id,company_id,root_id,owner_user_id,proposed_tree,proposed_tree_hash,base_formal_tree_hash) VALUES ('relation-work-dev106',?,?,?,?,?,?)")
    .run(ids.company, ids.root, ids.owner, "{}", "tree", "base");
  assert.throws(() => ensureDev106RetiredWorkbenchResidueCleanupSchema(failClosed), /DEV106_ACTIVE_RELATION_WORK/u);
  check("DEV106-023 SQLite cleanup fails closed on active Relation work", true);
} finally {
  failClosed.close();
}

console.log(`DEV-106 retired residue cleanup QC: ${checks.filter((entry) => entry.passed).length}/${checks.length} passed`);
