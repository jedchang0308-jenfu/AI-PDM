#!/usr/bin/env node

/*
 * DEV-109 provider gate.
 *
 * This is deliberately an actual, disposable PostgreSQL exercise. It does
 * not read PDM_POSTGRES_URL and never connects to the primary database. Two
 * databases are created in one task-owned local cluster so both migration
 * starting states are exercised: S0 (before the historical purpose migration)
 * and S1 (after it).
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const root = process.cwd();
const runId = `DEV109-provider-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-postgres-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const clusterDir = path.join(taskRoot, "cluster");
const postgresLog = path.join(taskRoot, "postgres.log");
const evidenceDir = path.resolve(process.env.DEV109_UNIFIED_PROVIDER_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109-unified", runId, "provider"));
const postgresBin = path.resolve(process.env.PDM_POSTGRES_BIN?.trim() || "C:\\Program Files\\PostgreSQL\\18\\bin");
const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
const dbNames = { s0: `dev109s0_${suffix}`, s1: `dev109s1_${suffix}` };
const companyId = "dev109-pg-company";
const actorId = "dev109-pg-actor";
const rootId = "dev109-pg-root";
const partId = "dev109-pg-part";
const now = "2026-09-01T00:00:00.000Z";
const checks = [];
let port = null;
let started = false;
let s0 = null;
let s1 = null;
let firstFailure = null;

function errorText(error) { return error instanceof Error ? error.message : String(error); }
function hash(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true, ...options });
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status}): ${(result.stderr || result.stdout || "").trim()}`);
  return result;
}
async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const value = typeof address === "object" && address ? address.port : null;
      server.close((closeError) => closeError ? reject(closeError) : resolve(value));
    });
  });
}
async function apply(client, fileName) {
  await client.query(fs.readFileSync(path.join(root, "db", "postgres", fileName), "utf8"));
}
async function recordAsync(id, label, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
    return detail;
  } catch (error) {
    checks.push({ id, label, status: "FAIL", message: errorText(error) });
    console.error(`FAIL ${id} ${errorText(error)}`);
    throw error;
  }
}
async function schemaFingerprint(client) {
  const columns = await client.query(`SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('part_numbers','bom_definitions','bom_lines_tree','bom_draft_floating_topics','bom_release_resolved_lines','bom_shared_structure_migration_issues')
    ORDER BY table_name, ordinal_position`);
  const constraints = await client.query(`SELECT conrelid::regclass::text AS relation, conname, contype, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid::regclass::text IN ('part_numbers','bom_definitions','bom_lines_tree','bom_draft_floating_topics','bom_release_resolved_lines','bom_shared_structure_migration_issues')
    ORDER BY relation, conname`);
  const indexes = await client.query(`SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename IN ('bom_definitions','part_numbers') ORDER BY tablename,indexname`);
  return hash(canonical({ columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows }));
}
async function seedFoundation(client, prefix) {
  await client.query(`INSERT INTO companies (id, company_code, display_name, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $4) ON CONFLICT (id) DO NOTHING`, [companyId, `D109${prefix}`, `DEV-109 ${prefix}`, now]);
  await client.query(`INSERT INTO users (id, display_name, email, role, company_id, created_at, updated_at)
    VALUES ($1, 'DEV-109 provider actor', $2, 'Engineer', $3, $4, $4) ON CONFLICT (id) DO NOTHING`, [actorId, `dev109-${prefix.toLowerCase()}@example.invalid`, companyId, now]);
  await client.query(`INSERT INTO numbering_rule_versions (id, rule_code, title, status, effective_at, rule_json, created_by, created_at, updated_at)
    VALUES ($1, $2, 'DEV-109 provider rule', 'active', $3, '{}', $4, $3, $3) ON CONFLICT (id) DO NOTHING`, [`dev109-${prefix}-rule`, `D109-${prefix}`, now, actorId]);
  await client.query(`INSERT INTO part_roots (id, company_id, root_code, core_name, item_kind, record_status, rule_version_id, created_by, created_at, updated_at)
    VALUES ($1, $2, $3, 'DEV-109 provider root', 'manufactured', 'Active', $4, $5, $6, $6) ON CONFLICT (id) DO NOTHING`, [`${prefix}-${rootId}`, companyId, `D109${prefix}`, `dev109-${prefix}-rule`, actorId, now]);
  await client.query(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, record_status, rule_version_id, created_by, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 1, '01', 'DEV-109 provider parent', 'manufactured', 'assembly', 'Active', $5, $6, $7, $7)
    ON CONFLICT (id) DO NOTHING`, [`${prefix}-${partId}`, companyId, `${prefix}-${rootId}`, `D109-${prefix}-P01`, `dev109-${prefix}-rule`, actorId, now]);
  await client.query(`INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at)
    VALUES ($1, $2, $3, 1, $4, $4, $5, $5) ON CONFLICT (id) DO NOTHING`, [`${prefix}-legacy-definition`, companyId, `${prefix}-${rootId}`, actorId, now]);
}
async function insertS1SalesKitDefinition(client) {
  // 052's trigger protects updates, not a new legacy row. This gives 054 a
  // non-default value to copy and proves lineage is not made by the test after
  // the retirement step.
  await client.query(`INSERT INTO bom_definitions (id, company_id, part_root_id, purpose, row_version, created_by, updated_by, created_at, updated_at)
    VALUES ('S1-sales-kit-definition', $1, 'S1-${rootId}', 'sales_kit', 1, $2, $2, $3, $3)`, [companyId, actorId, now]);
}
async function rejected(client, statement, values = []) {
  await client.query("BEGIN");
  await client.query("SAVEPOINT dev109_probe");
  let failed = false;
  try { await client.query(statement, values); } catch { failed = true; }
  await client.query("ROLLBACK TO SAVEPOINT dev109_probe");
  await client.query("RELEASE SAVEPOINT dev109_probe");
  await client.query("COMMIT");
  assert.equal(failed, true, "constraint probe unexpectedly succeeded");
}
async function portReleased(checkPort) {
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port: checkPort });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(true); });
  });
}
async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  fs.mkdirSync(evidenceDir, { recursive: true });
  // Make the boundary explicit even if a developer has a production URL in
  // their shell. The runner never reads this value.
  delete process.env.PDM_POSTGRES_URL;
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "postgres";
  port = await freePort();
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-109 actual PostgreSQL S0/S1 unified BOM migration and provider constraints",
    port,
    owningProcessTree: `node ${process.pid} -> task-owned pg_ctl/postgres cluster`,
    cleanupCondition: "clients closed, cluster stopped, port released, task root removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot,
    productionWrites: false,
    productionConnection: false
  } }));
  assert.ok(fs.existsSync(path.join(postgresBin, "initdb.exe")), `PostgreSQL binaries not found: ${postgresBin}`);
  run(path.join(postgresBin, "initdb.exe"), ["-D", clusterDir, "--auth-local=trust", "--auth-host=trust", "--username=postgres", "--encoding=UTF8", "--no-locale"]);
  run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-l", postgresLog, "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  started = true;
  for (const name of Object.values(dbNames)) run(path.join(postgresBin, "createdb.exe"), ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", name]);
  const connect = (name) => new Client({ connectionString: `postgresql://postgres@127.0.0.1:${port}/${name}`, application_name: "ai-pdm-dev109-unified-provider" });
  s0 = connect(dbNames.s0); s1 = connect(dbNames.s1);
  await s0.connect(); await s1.connect();

  // S0: 001 + 048 is the pre-purpose starting point.
  await apply(s0, "001_initial_schema.sql");
  await apply(s0, "048_shared_assembly_bom.sql");
  await seedFoundation(s0, "S0");
  await apply(s0, "054_unified_bom_domain_and_uom.sql");
  await recordAsync("P01", "S0 actual migration commits target columns and guards", async () => {
    const columns = await s0.query(`SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND ((table_name='part_numbers' AND column_name='base_uom_code') OR (table_name IN ('bom_lines_tree','bom_draft_floating_topics','bom_release_resolved_lines') AND column_name IN ('quantity_uom_code','quantity_scaled_6')) OR (table_name='bom_definitions' AND column_name IN ('legacy_purpose','purpose')))
      ORDER BY table_name,column_name`);
    assert.equal(columns.rows.some((row) => row.column_name === "purpose"), false);
    assert.equal(columns.rows.filter((row) => row.column_name === "legacy_purpose").length, 1);
    assert.equal(columns.rows.filter((row) => row.column_name === "base_uom_code").length, 1);
    assert.equal(columns.rows.filter((row) => row.column_name === "quantity_uom_code").length, 3);
    assert.equal(columns.rows.filter((row) => row.column_name === "quantity_scaled_6").length, 3);
    return { columns: columns.rows.length };
  });
  const s0BeforeRerun = await schemaFingerprint(s0);
  await apply(s0, "054_unified_bom_domain_and_uom.sql");
  const s0AfterRerun = await schemaFingerprint(s0);
  await recordAsync("P02", "S0 rerun is idempotent and advisory lock is usable", async () => {
    assert.equal(s0BeforeRerun, s0AfterRerun);
    await s0.query("BEGIN");
    const lock = await s0.query("SELECT pg_try_advisory_xact_lock(hashtext('ai-pdm:dev-109:unified-bom-domain')) AS acquired");
    await s0.query("ROLLBACK");
    assert.equal(lock.rows[0]?.acquired, true);
    return { schemaHash: s0AfterRerun, advisoryLock: true };
  });

  // S1: 001 + 048 + historical 052 creates the legacy purpose state.
  await apply(s1, "001_initial_schema.sql");
  await apply(s1, "048_shared_assembly_bom.sql");
  await seedFoundation(s1, "S1");
  await apply(s1, "052_sales_kit_bom.sql");
  await insertS1SalesKitDefinition(s1);
  await apply(s1, "054_unified_bom_domain_and_uom.sql");
  await recordAsync("P03", "S1 actual migration copies legacy purpose and retires old catalog objects", async () => {
    const values = await s1.query("SELECT id, legacy_purpose FROM bom_definitions WHERE id IN ('S1-legacy-definition','S1-sales-kit-definition') ORDER BY id");
    assert.deepEqual(values.rows.map((row) => row.legacy_purpose), ["manufacturing", "sales_kit"]);
    const purposeColumn = await s1.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='bom_definitions' AND column_name='purpose'");
    const oldIndex = await s1.query("SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_bom_definitions_company_purpose'");
    const oldTrigger = await s1.query("SELECT 1 FROM pg_trigger WHERE tgrelid='public.bom_definitions'::regclass AND tgname='trg_bom_definition_purpose_immutable'");
    assert.equal(purposeColumn.rows.length, 0); assert.equal(oldIndex.rows.length, 0); assert.equal(oldTrigger.rows.length, 0);
    return { values: values.rows, purposeColumn: false, oldIndex: false, oldTrigger: false };
  });

  const partForProbe = "S0-dev109-pg-part";
  await s0.query("UPDATE part_numbers SET base_uom_code='EA' WHERE id=$1", [partForProbe]);
  await s0.query(`INSERT INTO bom_drafts (id, company_id, owner_part_number_id, bom_revision, draft_name, status, source, created_by, updated_by, created_at, updated_at)
    VALUES ('S0-dev109-draft', $1, $2, 'A', 'DEV-109 provider draft', 'Draft', 'manual', $3, $3, $4, $4)`, [companyId, partForProbe, actorId, now]);
  await recordAsync("P04", "controlled UOM and scale checks reject invalid provider writes", async () => {
    await s0.query(`INSERT INTO bom_lines_tree (id, bom_draft_id, node_type, part_number, quantity, quantity_uom_code, quantity_scaled_6, sequence_no, source, created_by, updated_by, created_at, updated_at)
      VALUES ('S0-dev109-valid-line', 'S0-dev109-draft', 'item', 'D109-S0-C01', 0.15, 'EA', 150000, 1, 'manual', $1, $1, $2, $2)`, [actorId, now]);
    await rejected(s0, "UPDATE part_numbers SET base_uom_code='BAD' WHERE id=$1", [partForProbe]);
    await rejected(s0, "UPDATE bom_lines_tree SET quantity_scaled_6=0 WHERE id='S0-dev109-valid-line'");
    await rejected(s0, "UPDATE bom_lines_tree SET quantity_uom_code='BAD' WHERE id='S0-dev109-valid-line'");
    const row = await s0.query("SELECT quantity_uom_code, quantity_scaled_6 FROM bom_lines_tree WHERE id='S0-dev109-valid-line'");
    assert.deepEqual(row.rows[0], { quantity_uom_code: "EA", quantity_scaled_6: "150000" });
    return { valid: row.rows[0], rejected: ["BAD UOM", "scale=0", "BAD line UOM"] };
  });
  await recordAsync("P05", "S0/S1 catalog types and exact quantity columns are provider-parity checked", async () => {
    const [s0Columns, s1Columns] = await Promise.all([s0.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('base_uom_code','quantity_uom_code','quantity_scaled_6') ORDER BY table_name,column_name`), s1.query(`SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('base_uom_code','quantity_uom_code','quantity_scaled_6') ORDER BY table_name,column_name`)]);
    assert.deepEqual(s0Columns.rows, s1Columns.rows);
    assert.equal(s0Columns.rows.filter((row) => row.column_name === "quantity_scaled_6").every((row) => row.data_type === "bigint"), true);
    assert.equal(s0Columns.rows.filter((row) => row.column_name === "quantity_uom_code").length, 3);
    return { columns: s0Columns.rows };
  });
  await recordAsync("P06", "issue CHECK union and current target constraints retain all governed codes", async () => {
    const issueConstraint = await s0.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid='public.bom_shared_structure_migration_issues'::regclass AND conname='bom_shared_structure_migration_issues_issue_code_check'`);
    const definition = String(issueConstraint.rows[0]?.definition ?? "");
    assert.match(definition, /definition_backfill_ambiguous/u);
    assert.match(definition, /sldasm_target_missing/u);
    assert.match(definition, /sldasm_target_ambiguous/u);
    const uomConstraint = await s0.query(`SELECT COUNT(*)::int AS count FROM pg_constraint WHERE conname IN ('part_numbers_base_uom_code_check','bom_lines_tree_quantity_uom_code_check','bom_lines_tree_quantity_scaled_6_check','bom_release_resolved_lines_quantity_scaled_6_check')`);
    assert.equal(Number(uomConstraint.rows[0]?.count), 4);
    return { issueCodes: "union-preserved", uomConstraints: Number(uomConstraint.rows[0]?.count) };
  });
  // The provider parity probe intentionally starts at the narrow migration
  // boundary (001 + 048 + 054). Canonical drawing state is introduced by
  // migration 042, so create only the two referenced tables in this
  // disposable database. This keeps the probe task-owned and faithful to the
  // production columns used by the evidence query without replaying the
  // entire historical migration chain.
  await s0.query(`CREATE TABLE IF NOT EXISTS drawing_rd_branches (id TEXT PRIMARY KEY)`);
  await s0.query(`CREATE TABLE IF NOT EXISTS canonical_workbench_states (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing', 'part', 'relation')),
    canonical_entity_id TEXT NOT NULL,
    data_layer TEXT NOT NULL CHECK (data_layer IN ('drawing_production', 'drawing_rd', 'part_formal', 'part_work', 'relation_formal', 'relation_work')),
    branch_id TEXT REFERENCES drawing_rd_branches(id) ON DELETE RESTRICT,
    revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
    work_id TEXT,
    handling TEXT NOT NULL DEFAULT 'none' CHECK (handling IN ('none', 'owner', 'review_owner', 'system', 'system_admin', 'blocked')),
    blocker_reason TEXT,
    row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((handling = 'blocked' AND blocker_reason IS NOT NULL) OR (handling <> 'blocked' AND blocker_reason IS NULL)),
    CHECK (
      (data_layer = 'drawing_production' AND entity_type = 'drawing' AND branch_id IS NULL AND revision_id IS NOT NULL AND work_id IS NULL)
      OR (data_layer = 'drawing_rd' AND entity_type = 'drawing' AND branch_id IS NOT NULL AND revision_id IS NOT NULL)
      OR (data_layer = 'part_formal' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
      OR (data_layer = 'part_work' AND entity_type = 'part' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
      OR (data_layer = 'relation_formal' AND entity_type = 'relation' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NULL)
      OR (data_layer = 'relation_work' AND entity_type = 'relation' AND branch_id IS NULL AND revision_id IS NULL AND work_id IS NOT NULL)
    )
  )`);
  await recordAsync("CAPA-PG-01", "PostgreSQL current SLDASM evidence promotes exact Part and replays no-op", async () => {
    const drawingNumberId = "S0-dev109-capa-drawing-number";
    const drawingId = "S0-dev109-capa-drawing";
    const revisionId = "S0-dev109-capa-revision";
    const assetId = "S0-dev109-capa-asset";
    const fileId = "S0-dev109-capa-file";
    const part = `${"S0"}-${partId}`;
    await s0.query("BEGIN");
    try {
      await s0.query(`UPDATE part_numbers SET structure_type='single_part' WHERE id=$1`, [part]);
      await s0.query(`INSERT INTO drawing_numbers (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,rule_version_id,created_by,created_at,updated_at)
        VALUES ($1,$2,$3,'D109-S0-CAPA-M01','M','CAPA SLDASM',99,1,'Active',$4,$5,$6,$6)`, [drawingNumberId, companyId, `S0-${rootId}`, `dev109-S0-rule`, actorId, now]);
      await s0.query(`INSERT INTO drawings (id,company_id,lifecycle_state,formal_drawing_number_id,part_root_id,created_by,created_at,updated_at)
        VALUES ($1,$2,'drawing_preparation',$3,$4,$5,$6,$6)`, [drawingId, companyId, drawingNumberId, `S0-${rootId}`, actorId, now]);
      await s0.query(`INSERT INTO drawing_revisions (id,company_id,drawing_id,revision,lifecycle_state,created_by,updated_by,created_at,updated_at)
        VALUES ($1,$2,$3,'0.1','preparing',$4,$4,$5,$5)`, [revisionId, companyId, drawingId, actorId, now]);
      await s0.query(`INSERT INTO canonical_workbench_states (id,company_id,entity_type,canonical_entity_id,data_layer,revision_id,handling,created_at,updated_at)
        VALUES ('S0-dev109-capa-state',$1,'drawing',$2,'drawing_production',$3,'none',$4,$4)`, [companyId, drawingId, revisionId, now]);
      await s0.query(`INSERT INTO file_assets (id,file_name,file_ext,linked_entity_type,linked_entity_id,document_category,uploaded_by,created_at,updated_at)
        VALUES ($1,'D109-S0-CAPA.SLDASM','sldasm','drawing_revision',$2,'cad_3d',$3,$4,$4)`, [assetId, revisionId, actorId, now]);
      await s0.query(`INSERT INTO drawing_revision_files (id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,display_name,is_primary,created_by,created_at,updated_at)
        VALUES ($1,$2,$3,$4,'cad_3d','system','D109-S0-CAPA.SLDASM',1,$5,$6,$6)`, [fileId, companyId, revisionId, assetId, actorId, now]);
      await s0.query(`INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by,created_at)
        VALUES ('S0-dev109-capa-link',$1,$2,'primary_manufacturing',$3,$4)`, [drawingNumberId, part, actorId, now]);
      const evidence = await s0.query(`SELECT p.id AS part_id
        FROM drawing_numbers drawing
        JOIN drawings canonical_drawing ON canonical_drawing.formal_drawing_number_id=drawing.id AND canonical_drawing.company_id=drawing.company_id
        JOIN canonical_workbench_states state ON state.canonical_entity_id=canonical_drawing.id AND state.company_id=canonical_drawing.company_id AND state.entity_type='drawing' AND state.revision_id IS NOT NULL
        JOIN drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
        JOIN drawing_revision_files file ON file.drawing_revision_id=revision.id AND file.company_id=revision.company_id AND file.role='cad_3d' AND file.is_primary=1 AND file.removed_at IS NULL
        JOIN file_assets asset ON asset.id=file.source_file_asset_id AND asset.deleted_at IS NULL AND lower(trim(asset.file_ext))='sldasm'
        JOIN drawing_part_links link ON link.drawing_number_id=drawing.id AND link.link_type='primary_manufacturing'
        JOIN part_numbers p ON p.id=link.part_number_id
        WHERE drawing.id=$1 AND drawing.company_id=$2 AND drawing.is_primary_manufacturing=1 AND drawing.record_status NOT IN ('Obsolete','Merged')`, [drawingNumberId, companyId]);
      assert.deepEqual(evidence.rows.map((row) => row.part_id), [part]);
      await s0.query(`UPDATE part_numbers SET structure_type='assembly',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND structure_type<>'assembly'`, [part, companyId]);
      await s0.query(`INSERT INTO audit_logs (id,submission_id,actor_id,action,detail_json,created_at) VALUES ('S0-dev109-capa-audit',NULL,$2,'bom.sldasm.assembly_promoted',$1,NOW())`, [JSON.stringify({ companyId, partNumberId: part, drawingNumberId, reason: "formal_primary_sldasm" }), actorId]);
      await s0.query("COMMIT");
      const after = await s0.query("SELECT structure_type FROM part_numbers WHERE id=$1", [part]);
      const audit = await s0.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE id='S0-dev109-capa-audit'");
      assert.equal(after.rows[0]?.structure_type, "assembly");
      assert.equal(Number(audit.rows[0]?.count), 1);
      const replay = await s0.query(`UPDATE part_numbers SET structure_type='assembly',updated_at=NOW() WHERE id=$1 AND company_id=$2 AND structure_type<>'assembly'`, [part, companyId]);
      const auditAfterReplay = await s0.query("SELECT COUNT(*)::int AS count FROM audit_logs WHERE id='S0-dev109-capa-audit'");
      assert.equal(replay.rowCount, 0);
      assert.equal(Number(auditAfterReplay.rows[0]?.count), 1);
      return { part, drawingNumberId, preparation: true, replayNoOp: true, auditCount: Number(auditAfterReplay.rows[0]?.count) };
    } catch (error) {
      await s0.query("ROLLBACK");
      throw error;
    }
  });
}

let exitCode = 1;
try {
  await main();
  exitCode = checks.filter((item) => /^P\d{2}$/u.test(item.id)).length === 6 && checks.every((item) => item.status === "PASS") ? 0 : 1;
} catch (error) {
  firstFailure = errorText(error);
  console.error(`DEV109_PROVIDER_RUNNER_ERROR: ${firstFailure}`);
}
for (const client of [s0, s1]) { try { await client?.end(); } catch { /* cleanup continues */ } }
if (started) {
  try { run(path.join(postgresBin, "pg_ctl.exe"), ["-D", clusterDir, "-m", "fast", "-w", "stop"], { stdio: "ignore" }); } catch (error) { firstFailure = firstFailure ?? errorText(error); exitCode = 1; }
}
const released = port === null ? true : await portReleased(port);
if (!released) { firstFailure = firstFailure ?? "DEV109_POSTGRES_PORT_NOT_RELEASED"; exitCode = 1; }
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); } catch (error) { firstFailure = firstFailure ?? errorText(error); exitCode = 1; }
fs.mkdirSync(evidenceDir, { recursive: true });
const sourceRevision = (() => { try { return run("git", ["rev-parse", "HEAD"]).stdout.trim(); } catch { return "unknown"; } })();
const dirtyBoundaryHash = (() => { try { return hash(run("git", ["status", "--short"]).stdout); } catch { return "unknown"; } })();
const result = {
  schemaVersion: 1,
  devId: "DEV-109",
  runId,
  runner: "unified-provider-postgres",
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  sourceRevision,
  dirtyBoundaryHash,
  actor: actorId,
  companyId,
  provider: "postgres",
  dataDir,
  repositoryDir,
  productionConnection: false,
  primaryWrites: false,
  productionWrites: false,
  runtime: { project: root, port, mutationScope: taskRoot, portReleased: released, cleanup: "task-owned PostgreSQL cluster stopped and task root removed" },
  checks,
  faults: [],
  primaryInvariantBefore: "not touched; task-owned cluster only",
  primaryInvariantAfter: "not touched; task-owned cluster only",
  cleanup: { clusterStopped: !started || released, portReleased: released, taskRootRemoved: !fs.existsSync(taskRoot) },
  status: exitCode === 0 ? "PASS" : "FAIL",
  firstFailure
};
fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.status === "PASS").length, total: checks.length, portReleased: released, productionWrites: false }));
if (exitCode !== 0) process.exitCode = 1;
