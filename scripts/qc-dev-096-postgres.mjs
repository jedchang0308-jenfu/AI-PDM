import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";
import { convertLegacySharedBomPostgres } from "./dev096-postgres-converter.mjs";

const workspace = process.cwd();
const dsn = String(process.env.DEV096_POSTGRES_DSN ?? "").trim();
if (!dsn) throw new Error("DEV096_POSTGRES_DSN_REQUIRED");
const target = new URL(dsn);
if (!new Set(["127.0.0.1", "localhost"]).has(target.hostname) || !/dev096|disposable|shadow|test/iu.test(target.pathname)) {
  throw new Error("DEV096_POSTGRES_TARGET_GUARD");
}
const client = new Client({ connectionString: dsn });
await client.connect();
const checks = [];
const check = async (cases, label, fn) => {
  try {
    const detail = await fn();
    checks.push({ cases, label, pass: true, detail: detail ?? null });
    console.log(`PASS ${label}`);
  } catch (error) {
    checks.push({ cases, label, pass: false, detail: error instanceof Error ? error.message : String(error) });
    console.error(`FAIL ${label}: ${checks.at(-1).detail}`);
    throw error;
  }
};

try {
  await check([53, 60], "fresh disposable PostgreSQL current baseline applies 001/002/003/047 in order", async () => {
    await client.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    const existing = Number((await client.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).rows[0].count);
    const applied = [];
    if (existing === 0) {
      const files = [
        "001_initial_schema.sql",
        "002_supabase_rls_plan.sql",
        "003_harden_set_updated_at_search_path.sql",
        "047_retire_legacy_assembly_bom_intake.sql"
      ];
      for (const file of files) {
        try {
          await client.query(fs.readFileSync(path.join(workspace, "db", "postgres", file), "utf8"));
        } catch (error) {
          throw new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
        applied.push(file);
      }
    }
    const after = Number((await client.query("SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).rows[0].count);
    if (after === 0) throw new Error("PostgreSQL baseline created no tables");
    return { existing, after, applied };
  });

  await check([53, 56], "048 forward migration applies twice under advisory transaction lock", async () => {
    const sql = fs.readFileSync(path.join(workspace, "db", "postgres", "048_shared_assembly_bom.sql"), "utf8");
    await client.query(sql);
    const first = await schemaManifest(client);
    await client.query(sql);
    const second = await schemaManifest(client);
    if (canonicalJson(first) !== canonicalJson(second)) throw new Error("048 second apply changed schema manifest");
    return second;
  });

  await check([53, 83], "PostgreSQL shared tables, columns, FKs, checks, indexes and JSONB evidence match contract", async () => {
    const manifest = await schemaManifest(client);
    const requiredTables = [
      "bom_definitions", "bom_definition_parent_bindings", "bom_draft_parent_bindings",
      "bom_draft_component_nodes", "bom_draft_component_candidates", "bom_draft_parent_selections",
      "bom_release_parent_snapshots", "bom_release_resolved_lines", "bom_shared_structure_migration_issues"
    ];
    const requiredColumns = [
      "part_numbers.structure_type", "bom_drafts.definition_id", "bom_drafts.base_release_snapshot_id",
      "bom_review_requests.review_snapshot_json", "bom_release_snapshots.parent_snapshot_json",
      "bom_reconfirmation_flags.reference_scope"
    ];
    if (requiredTables.some((table) => !manifest.tables.includes(table))) throw new Error("missing DEV096 PostgreSQL table");
    if (requiredColumns.some((column) => !manifest.columns.includes(column))) throw new Error("missing DEV096 PostgreSQL column");
    if (manifest.foreignKeys < 14 || manifest.checks < 13 || manifest.indexes < 13) throw new Error(`constraint/index coverage low: ${JSON.stringify(manifest)}`);
    if (!manifest.jsonbColumns.includes("bom_review_requests.review_snapshot_json")
      || !manifest.jsonbColumns.includes("bom_release_snapshots.parent_snapshot_json")) throw new Error("evidence JSONB type mismatch");
    return manifest;
  });

  await check([54, 55, 56, 82, 88], "PostgreSQL legacy converter preserves exact lineage and quarantines ambiguity", async () => {
    await seedLegacyConversionFixture(client);
    const conversion = await convertLegacySharedBomPostgres(client, { createdAt: "2026-08-24T05:00:00.000Z" });
    if (conversion.plan.lineages !== 1 || conversion.plan.releases !== 1 || conversion.plan.issues !== 1 || !conversion.rerun.noOp) {
      throw new Error(`conversion summary mismatch: ${JSON.stringify(conversion)}`);
    }
    const exact = (await client.query(`
      SELECT draft.definition_id, line.logical_line_id, review.review_schema_version,
        review.review_snapshot_hash, snapshot.snapshot_schema_version, snapshot.snapshot_hash,
        snapshot.line_snapshot_json,
        (SELECT COUNT(*)::int FROM bom_release_parent_snapshots parent WHERE parent.release_snapshot_id=snapshot.id) AS parent_count,
        (SELECT COUNT(*)::int FROM bom_release_resolved_lines resolved WHERE resolved.release_snapshot_id=snapshot.id) AS resolved_count
      FROM bom_drafts draft
      JOIN bom_lines_tree line ON line.bom_draft_id=draft.id
      JOIN bom_review_requests review ON review.bom_draft_id=draft.id
      JOIN bom_release_snapshots snapshot ON snapshot.bom_draft_id=draft.id
      WHERE draft.id='dev096-pg-exact-draft'
    `)).rows[0];
    const expectedDefinition = deterministicUuid("definition", "dev096-pg-parent-red");
    const expectedLogical = deterministicUuid("logical-line", "dev096-pg-exact-line");
    const frozenLines = JSON.parse(exact.line_snapshot_json);
    const negative = (await client.query("SELECT definition_id FROM bom_drafts WHERE id='dev096-pg-negative-draft'")).rows[0];
    const issueRows = (await client.query("SELECT issue_code, detail_json FROM bom_shared_structure_migration_issues WHERE bom_draft_id='dev096-pg-negative-draft'")).rows;
    if (exact.definition_id !== expectedDefinition || exact.logical_line_id !== expectedLogical
      || Number(exact.review_schema_version) !== 2 || !exact.review_snapshot_hash
      || Number(exact.snapshot_schema_version) !== 2 || !exact.snapshot_hash
      || frozenLines[0]?.logical_line_id !== expectedLogical
      || Number(exact.parent_count) !== 1 || Number(exact.resolved_count) !== 1
      || negative.definition_id !== null || issueRows.length !== 1 || issueRows[0].issue_code !== "component_identity_ambiguous") {
      throw new Error(`conversion evidence mismatch: ${JSON.stringify({ exact, negative, issueRows })}`);
    }
    return { conversion, exact: { definitionId: exact.definition_id, logicalLineId: exact.logical_line_id, reviewHash: exact.review_snapshot_hash, snapshotHash: exact.snapshot_hash }, issueRows };
  });

  await check([56, 79, 87], "PostgreSQL immutable review/release header and child triggers exist", async () => {
    const triggers = (await client.query(`
      SELECT event_object_table || '.' || trigger_name AS name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public' AND trigger_name LIKE 'trg_bom_%immutable%'
      ORDER BY name
    `)).rows.map((row) => row.name);
    const required = [
      "bom_review_requests.trg_bom_review_shared_evidence_immutable",
      "bom_release_snapshots.trg_bom_release_shared_evidence_immutable",
      "bom_release_parent_snapshots.trg_bom_release_parent_snapshot_immutable",
      "bom_release_resolved_lines.trg_bom_release_resolved_line_immutable"
    ];
    if (required.some((name) => !triggers.includes(name))) throw new Error(`missing immutable trigger: ${JSON.stringify(triggers)}`);
    const immutable = { review: false, release: false, child: false };
    await client.query("BEGIN");
    await client.query("SAVEPOINT dev096_immutable_probe");
    try { await client.query("UPDATE bom_review_requests SET review_snapshot_hash='tampered' WHERE id='dev096-pg-exact-review'"); }
    catch { immutable.review = true; await client.query("ROLLBACK TO SAVEPOINT dev096_immutable_probe"); }
    await client.query("SAVEPOINT dev096_immutable_probe_release");
    try { await client.query("UPDATE bom_release_snapshots SET snapshot_hash='tampered' WHERE id='dev096-pg-exact-release'"); }
    catch { immutable.release = true; await client.query("ROLLBACK TO SAVEPOINT dev096_immutable_probe_release"); }
    await client.query("SAVEPOINT dev096_immutable_probe_child");
    try { await client.query("DELETE FROM bom_release_parent_snapshots WHERE release_snapshot_id='dev096-pg-exact-release'"); }
    catch { immutable.child = true; await client.query("ROLLBACK TO SAVEPOINT dev096_immutable_probe_child"); }
    await client.query("ROLLBACK");
    if (!Object.values(immutable).every(Boolean)) throw new Error(`immutable trigger probe failed: ${JSON.stringify(immutable)}`);
    return { triggers, immutable };
  });

  await check([88], "deterministic migration ID oracle is provider independent", async () => {
    const sources = ["dev096-parent-red", "dev096-parent-blue", "dev096-legacy-exact-line"];
    const ids = sources.map((source) => deterministicUuid(source.includes("line") ? "logical-line" : "definition", source));
    if (new Set(ids).size !== ids.length || ids.some((id) => !/^[0-9a-f-]{36}$/u.test(id))) throw new Error("deterministic ID oracle invalid");
    return { sources, ids };
  });
} finally {
  await client.end();
}

const result = {
  runner: "postgres",
  status: checks.every((item) => item.pass) ? "PASS" : "FAIL",
  target: { host: target.hostname, port: Number(target.port), database: target.pathname.slice(1) },
  productionWrites: false,
  checks,
  cases: [...new Set(checks.filter((item) => item.pass).flatMap((item) => item.cases))].sort((a, b) => a - b)
};
const evidenceDir = process.env.DEV096_EVIDENCE_DIR;
if (evidenceDir) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "postgres.json"), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.pass).length, total: checks.length }));
if (result.status !== "PASS") process.exitCode = 1;

async function seedLegacyConversionFixture(database) {
  const now = "2026-08-24T05:00:00.000Z";
  await database.query(`INSERT INTO companies (id,company_code,display_name,created_at,updated_at)
    VALUES ('dev096-pg-company','D96PG','DEV096 PostgreSQL',$1,$1) ON CONFLICT (id) DO NOTHING`, [now]);
  for (const [id, role] of [["dev096-pg-engineer", "Engineer"], ["dev096-pg-manager", "R&D Manager"]]) {
    await database.query(`INSERT INTO users (id,display_name,email,role,company_id,created_at,updated_at)
      VALUES ($1,$2,$3,$4,'dev096-pg-company',$5,$5) ON CONFLICT (id) DO NOTHING`, [id, id, `${id}@example.invalid`, role, now]);
  }
  await database.query(`INSERT INTO numbering_rule_versions
    (id,rule_code,title,status,effective_at,rule_json,created_by,created_at,updated_at)
    VALUES ('numbering-rule-v3-alpha-root','PDM-NUMBERING-V3','DEV096 PostgreSQL fixture rule','active',$1,'{}','dev096-pg-engineer',$1,$1)
    ON CONFLICT (id) DO NOTHING`, [now]);
  for (const [id, code, name] of [["dev096-pg-parent-root", "P9601", "PG ASSEMBLY"], ["dev096-pg-child-root", "P9602", "PG CHILD"]]) {
    await database.query(`INSERT INTO part_roots (id,company_id,root_code,core_name,item_kind,record_status,created_by,created_at,updated_at)
      VALUES ($1,'dev096-pg-company',$2,$3,'manufactured','Active','dev096-pg-engineer',$4,$4) ON CONFLICT (id) DO NOTHING`, [id, code, name, now]);
  }
  for (const row of [
    ["dev096-pg-parent-red", "dev096-pg-parent-root", "P960101", 1, "01", "PG RED ASSEMBLY", "single_part"],
    ["dev096-pg-parent-blue", "dev096-pg-parent-root", "P960102", 2, "02", "PG BLUE ASSEMBLY", "single_part"],
    ["dev096-pg-child-red", "dev096-pg-child-root", "P960201", 1, "01", "PG RED CHILD", "single_part"]
  ]) {
    await database.query(`INSERT INTO part_numbers (id,company_id,part_root_id,part_number,sequence_no,sequence_code,part_name,item_kind,structure_type,record_status,created_by,created_at,updated_at)
      VALUES ($1,'dev096-pg-company',$2,$3,$4,$5,$6,'manufactured',$7,'Active','dev096-pg-engineer',$8,$8) ON CONFLICT (id) DO NOTHING`, [...row, now]);
  }
  for (const [parentId, drawingId, drawingNumber, sequence] of [
    ["dev096-pg-parent-red", "dev096-pg-parent-red-drawing", "P960101-M", 1],
    ["dev096-pg-parent-blue", "dev096-pg-parent-blue-drawing", "P960102-M", 2]
  ]) {
    await database.query(`INSERT INTO drawing_numbers (id,company_id,part_root_id,drawing_number,purpose_code,purpose_description,sequence_no,is_primary_manufacturing,record_status,created_by,created_at,updated_at)
      VALUES ($1,'dev096-pg-company','dev096-pg-parent-root',$2,'M','Primary manufacturing',$3,1,'Active','dev096-pg-engineer',$4,$4) ON CONFLICT (id) DO NOTHING`, [drawingId, drawingNumber, sequence, now]);
    await database.query(`INSERT INTO drawing_part_links (id,drawing_number_id,part_number_id,link_type,created_by,created_at)
      VALUES ($1,$2,$3,'primary_manufacturing','dev096-pg-engineer',$4) ON CONFLICT (id) DO NOTHING`, [`${parentId}-link`, drawingId, parentId, now]);
  }
  for (const [draftId, ownerId, status, lineId, partNumber] of [
    ["dev096-pg-exact-draft", "dev096-pg-parent-red", "Released", "dev096-pg-exact-line", "P960201"],
    ["dev096-pg-negative-draft", "dev096-pg-parent-blue", "Draft", "dev096-pg-negative-line", "P960299"]
  ]) {
    await database.query(`INSERT INTO bom_drafts (id,company_id,owner_part_number_id,bom_revision,identity_authority,draft_name,status,source,is_active,line_count,review_attempt,editor_version,created_by,updated_by,created_at,updated_at)
      VALUES ($1,'dev096-pg-company',$2,'1','canonical_part_number',$1,$3,'manual',0,1,0,2,'dev096-pg-engineer','dev096-pg-engineer',$4,$4) ON CONFLICT (id) DO NOTHING`, [draftId, ownerId, status, now]);
    await database.query(`INSERT INTO bom_lines_tree (id,bom_draft_id,parent_line_id,node_type,part_number,quantity,sequence_no,source,source_priority,created_by,updated_by,created_at,updated_at)
      VALUES ($1,$2,NULL,'item',$3,2,1,'manual',30,'dev096-pg-engineer','dev096-pg-engineer',$4,$4) ON CONFLICT (id) DO NOTHING`, [lineId, draftId, partNumber, now]);
  }
  await database.query(`INSERT INTO bom_review_requests (id,bom_draft_id,status,lifecycle_action,submitted_by,reviewed_by,change_reason,decision_reason,submitted_at,reviewed_at,review_schema_version)
    VALUES ('dev096-pg-exact-review','dev096-pg-exact-draft','Approved','release','dev096-pg-engineer','dev096-pg-manager','exact release','approved',$1,$1,1) ON CONFLICT (id) DO NOTHING`, [now]);
  const lineSnapshot = [{ id: "dev096-pg-exact-line", bom_draft_id: "dev096-pg-exact-draft", parent_line_id: null, node_type: "item", item_id: null, part_number: "P960201", revision: null, group_name: null, quantity: 2, sequence_no: 1, source: "manual", source_priority: 30, source_ref_id: null, source_filename: null, created_by: "dev096-pg-engineer", updated_by: "dev096-pg-engineer", created_at: now, updated_at: now }];
  await database.query(`INSERT INTO bom_release_snapshots (id,bom_draft_id,company_id,owner_part_number_id,bom_revision,line_snapshot_json,line_count,released_by,released_at,snapshot_schema_version)
    VALUES ('dev096-pg-exact-release','dev096-pg-exact-draft','dev096-pg-company','dev096-pg-parent-red','1',$1,1,'dev096-pg-manager',$2,1) ON CONFLICT (id) DO NOTHING`, [JSON.stringify(lineSnapshot), now]);
}

async function schemaManifest(database) {
  const tables = (await database.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).rows.map((row) => row.table_name);
  const columnRows = (await database.query("SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position")).rows;
  const devTables = new Set(["part_numbers", "bom_drafts", "bom_lines_tree", "bom_draft_floating_topics", "bom_review_requests", "bom_release_snapshots", "bom_reconfirmation_flags"]);
  const columns = columnRows.filter((row) => devTables.has(row.table_name)).map((row) => `${row.table_name}.${row.column_name}`);
  const jsonbColumns = columnRows.filter((row) => row.data_type === "jsonb").map((row) => `${row.table_name}.${row.column_name}`);
  const constraintRows = (await database.query(`
    SELECT contype, COUNT(*)::int AS count
    FROM pg_constraint constraint_row
    JOIN pg_namespace namespace ON namespace.oid = constraint_row.connamespace
    WHERE namespace.nspname = 'public'
      AND (constraint_row.conname LIKE 'bom_%' OR constraint_row.conname = 'part_numbers_structure_type_check')
    GROUP BY contype
  `)).rows;
  const byType = Object.fromEntries(constraintRows.map((row) => [row.contype, Number(row.count)]));
  const indexes = Number((await database.query("SELECT COUNT(*)::int AS count FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE '%bom%'")).rows[0].count);
  return { tables, columns, jsonbColumns, foreignKeys: byType.f ?? 0, checks: byType.c ?? 0, uniqueConstraints: byType.u ?? 0, indexes };
}

function deterministicUuid(entityKind, stableSourceId) {
  const bytes = crypto.createHash("sha256").update(`ai-pdm/dev096/v1|${entityKind}|${stableSourceId}`, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
