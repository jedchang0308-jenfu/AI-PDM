import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const root = process.cwd();
const connectionString = process.env.PDM_POSTGRES_URL?.trim();
if (!connectionString) throw new Error("DEV106_POSTGRES_URL_REQUIRED");

const manifestPath = path.join(root, "output", "dev-032-cloudsql-migration-package", "cloudsql-migration-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
assert.equal(manifest.orderedSchemaMigrations.length, 50);
assert.equal(manifest.orderedSchemaMigrations.at(-1)?.version, "052");
const migration052 = fs.readFileSync(path.join(root, "db", "postgres", "052_retired_workbench_residue_cleanup.sql"), "utf8");

const stable = (value) => JSON.stringify(value, Object.keys(value ?? {}).sort());
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const client = new pg.Client({ connectionString, application_name: "ai-pdm-dev106-postgres-qc" });
await client.connect();
const checks = [];
const record = (name, passed, detail = "") => {
  checks.push({ name, passed: Boolean(passed), detail });
  assert.ok(passed, `${name}: ${detail}`);
};

try {
  await client.query("BEGIN");
  const currentBaselineVersions = new Set(["001", "039", "042", "043", "047", "048", "049", "050", "051"]);
  for (const entry of manifest.orderedSchemaMigrations.filter((migration) => currentBaselineVersions.has(migration.version))) {
    const sql = fs.readFileSync(path.join(root, "output", "dev-032-cloudsql-migration-package", entry.output), "utf8");
    await client.query(sql);
  }
  await client.query("COMMIT");

  const replay042 = fs.readFileSync(path.join(root, "output", "dev-032-cloudsql-migration-package", "sql", "042_status_data_rebuild.cloudsql.sql"), "utf8");
  await client.query(replay042);
  record("DEV106-PG-001 historical recovery replay reproduces Relation residue", (await client.query("SELECT to_regclass('relation_change_works') IS NOT NULL AS present")).rows[0].present === true);

  await client.query("INSERT INTO companies (id,company_code,display_name) VALUES ('company-dev106','D106','DEV106')");
  await client.query("INSERT INTO users (id,display_name,email,role,company_id) VALUES ('user-dev106','DEV106','dev106@example.test','Engineer','company-dev106')");
  await client.query("INSERT INTO numbering_rule_versions (id,rule_code,title) VALUES ('numbering-rule-dev106','DEV106','DEV106')");
  await client.query("INSERT INTO part_roots (id,company_id,root_code,core_name,item_kind,rule_version_id,created_by) VALUES ('root-dev106','company-dev106','D106','DEV106','manufactured','numbering-rule-dev106','user-dev106')");
  await client.query("INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,rule_version_id,created_by,structure_type) VALUES ('part-dev106','company-dev106','root-dev106','D106-P01',1,'P01','DEV106','manufactured','numbering-rule-dev106','user-dev106','single_part')");

  await client.query("INSERT INTO relation_change_works (id,company_id,root_id,owner_user_id,proposed_tree,proposed_tree_hash,base_formal_tree_hash) VALUES ('relation-work-dev106','company-dev106','root-dev106','user-dev106','{}','tree','base')");
  await client.query("BEGIN");
  let blocked = false;
  try {
    await client.query(migration052);
  } catch (error) {
    blocked = /DEV106_ACTIVE_RELATION_WORK/u.test(String(error.message));
  } finally {
    await client.query("ROLLBACK");
  }
  record("DEV106-PG-002 migration fails closed on active Relation work", blocked);

  await client.query("DELETE FROM relation_change_works");
  await client.query("INSERT INTO part_change_works (id,company_id,part_id,owner_user_id,proposed_payload,base_hash) VALUES ('part-work-dev106','company-dev106','part-dev106','user-dev106',$1::jsonb,'base')", [JSON.stringify({ partName: "DEV106", bomUsagePolicy: "undecided" })]);
  const businessBefore = (await client.query("SELECT id,company_id,part_id,owner_user_id,base_hash,row_version FROM part_change_works WHERE id='part-work-dev106'")).rows[0];

  await client.query("BEGIN");
  await client.query(migration052);
  await client.query("COMMIT");
  await client.query("BEGIN");
  await client.query(migration052);
  await client.query("COMMIT");

  record("DEV106-PG-003 Relation compatibility table removed", (await client.query("SELECT to_regclass('relation_change_works') IS NULL AS absent")).rows[0].absent === true);
  const payload = (await client.query("SELECT proposed_payload FROM part_change_works WHERE id='part-work-dev106'")).rows[0].proposed_payload;
  record("DEV106-PG-004 retired BOM key removed", !Object.hasOwn(payload, "bomUsagePolicy") && payload.partName === "DEV106");
  const businessAfter = (await client.query("SELECT id,company_id,part_id,owner_user_id,base_hash,row_version FROM part_change_works WHERE id='part-work-dev106'")).rows[0];
  record("DEV106-PG-005 non-retired Part work identity preserved", hash(stable(businessBefore)) === hash(stable(businessAfter)));
  const guardDefinition = (await client.query("SELECT pg_get_functiondef('dev087_guard_company_reference()'::regprocedure) AS definition")).rows[0].definition;
  record("DEV106-PG-006 current guard has no Relation table dependency", !/relation_change_works/iu.test(guardDefinition));
  const foreignKeys = await client.query("SELECT COUNT(*)::int AS count FROM pg_constraint WHERE contype='f' AND NOT convalidated");
  record("DEV106-PG-007 all foreign keys remain validated", foreignKeys.rows[0].count === 0);
  let rejected = false;
  try {
    await client.query("UPDATE part_change_works SET proposed_payload=$1::jsonb WHERE id='part-work-dev106'", [JSON.stringify({ bomUsagePolicy: "undecided" })]);
  } catch (error) {
    rejected = /dev106_part_work_no_retired_bom_usage_policy/u.test(String(error.message));
  }
  record("DEV106-PG-008 future retired BOM payload is rejected", rejected);
} finally {
  await client.end();
}

console.log(`DEV-106 PostgreSQL retirement rehearsal: ${checks.filter((entry) => entry.passed).length}/${checks.length} passed`);
