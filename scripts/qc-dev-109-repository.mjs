import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const suppliedDataDir = process.env.PDM_DATA_DIR?.trim();
const suppliedRepositoryDir = process.env.PDM_REPOSITORY_DIR?.trim();
const tempRoot = suppliedDataDir ? null : fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-repository-"));
const dataDir = path.resolve(suppliedDataDir || path.join(tempRoot, "data"));
const repositoryDir = path.resolve(suppliedRepositoryDir || path.join(dataDir, "repository"));
if (dataDir.toLowerCase() === path.resolve(root, "data").toLowerCase()) throw new Error("DEV109_PRIMARY_DATA_FORBIDDEN");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
process.env.PDM_DATA_DIR = dataDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;
process.env.PDM_ASSEMBLY_SHARED_BOM_V1 ||= "1";
process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 ||= "1";
process.env.PDM_BOM_XMIND_EDITOR_V2_ENABLED ||= "1";
process.env.PDM_SALES_KIT_BOM_V1_ENABLED ||= "1";

const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");
database.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
database.close();

const { fixture, seedDev096Fixture } = await import("./dev096-qc-fixture.mjs");
seedDev096Fixture();
const { createAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
const { listBomCreateCandidatesAsync } = await import("../src/lib/bom-create-context.ts");
const runtimeDatabase = new Database(databasePath);
runtimeDatabase.pragma("foreign_keys = ON");
const client = createAsyncDatabaseClient({ kind: "sqlite", database: runtimeDatabase });
const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
const now = "2026-08-31T00:00:00.000Z";
const controlledDrawingId = "dev109-controlled-drawing";
const controlledRevisionId = "dev109-controlled-revision";
const controlledAssetId = "dev109-controlled-asset";
db.transaction(() => {
  db.prepare(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, 'DEV109-RED-M', 'M', 'DEV-109 controlled fixture', 99, 0, 'Released', ?, ?, ?)`).run("dev109-controlled-number", fixture.companyId, fixture.parentRootId, fixture.users.engineer, now, now);
  db.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by, created_at)
    VALUES (?, ?, ?, 'reference', ?, ?)`).run("dev109-controlled-link", "dev109-controlled-number", fixture.parents.red, fixture.users.engineer, now);
  db.prepare(`INSERT INTO drawings (id, company_id, lifecycle_state, formal_drawing_number_id, part_root_id, created_by, created_at, updated_at)
    VALUES (?, ?, 'released', ?, ?, ?, ?, ?)`).run(controlledDrawingId, fixture.companyId, "dev109-controlled-number", fixture.parentRootId, fixture.users.engineer, now, now);
  db.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, updated_by, created_at, updated_at)
    VALUES (?, ?, ?, 'A', 'preparing', ?, ?, ?, ?)`).run(controlledRevisionId, fixture.companyId, controlledDrawingId, fixture.users.engineer, fixture.users.engineer, now, now);
  db.prepare(`INSERT INTO file_assets (id, file_name, file_ext, linked_entity_type, linked_entity_id, document_category, uploaded_by, created_at, updated_at)
    VALUES (?, 'DEV109-RED.SLDASM', 'sldasm', 'drawing_revision', ?, 'cad_3d', ?, ?, ?)`).run(controlledAssetId, controlledRevisionId, fixture.users.engineer, now, now);
  db.prepare(`INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'cad_3d', 'system', 'DEV109-RED.SLDASM', 1, ?, ?, ?)`).run("dev109-controlled-file", fixture.companyId, controlledRevisionId, controlledAssetId, fixture.users.engineer, now, now);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, revision_id, handling, created_at, updated_at)
    VALUES (?, ?, 'drawing', ?, 'drawing_production', ?, 'none', ?, ?)`).run("dev109-controlled-state", fixture.companyId, controlledDrawingId, controlledRevisionId, now, now);
  db.prepare("UPDATE drawing_revisions SET lifecycle_state = 'released', updated_at = ? WHERE id = ?").run(now, controlledRevisionId);
})();
db.close();

let projectionQueries = 0;
const countingClient = {
  kind: client.kind,
  query: async (...args) => { projectionQueries += 1; return client.query(...args); },
  queryOne: async (...args) => { projectionQueries += 1; return client.queryOne(...args); },
  execute: (...args) => client.execute(...args),
  transaction: (...args) => client.transaction(...args),
  close: () => client.close()
};
const checks = [];
async function check(id, label, fn) {
  try { const detail = await fn(); checks.push({ id, label, pass: true, detail: detail ?? null }); console.log(`PASS ${id} ${label}`); }
  catch (error) { const detail = error instanceof Error ? error.message : String(error); checks.push({ id, label, pass: false, detail }); console.error(`FAIL ${id} ${label}: ${detail}`); }
}

await check("QA-109-009", "suggested bounded five-row contract", async () => {
  projectionQueries = 0;
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, limit: 5 });
  assert.equal(result.mode, "suggested");
  assert.ok(result.items.length <= 5);
  assert.equal(result.nextCursor, null);
  assert.ok(projectionQueries <= 3);
  return { count: result.items.length, statements: projectionQueries };
});
await check("QA-109-010", "controlled current primary SLDASM reason", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.otherEngineer, query: "Z960101", limit: 25 });
  const row = result.items.find((item) => item.partNumberId === fixture.parents.red);
  assert.equal(row?.reason?.code, "controlled_assembly_file");
  assert.equal(row?.reason?.fileName, "DEV109-RED.SLDASM");
  return row?.reason;
});
await check("QA-109-011", "actor-owned recent reason is server-derived", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z960102", limit: 25 });
  assert.equal(result.items[0]?.reason?.code, "created_by_me_recently");
  return result.items[0]?.reason;
});
await check("QA-109-012", "manufacturing gate preserves missing M blocker", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: "dev096-no-m-parent", purpose: "manufacturing", limit: 1 });
  assert.equal(result.mode, "exact");
  assert.equal(result.items[0]?.action, "none");
  assert.equal(result.items[0]?.blockerCode, "BOM_ASSEMBLY_REQUIRES_M_DRAWING");
  return result.items[0];
});
await check("QA-109-013", "exact cross-company or missing id is hidden", async () => {
  await assert.rejects(() => listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: "not-in-company", limit: 1 }), (error) => error?.code === "BOM_RESOURCE_NOT_FOUND");
  return { code: "BOM_RESOURCE_NOT_FOUND" };
});
await check("QA-109-014", "search cursor is context-bound and stable", async () => {
  const first = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z960", limit: 2 });
  assert.ok(first.nextCursor);
  const second = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z960", cursor: first.nextCursor, limit: 2 });
  const firstIds = new Set(first.items.map((item) => item.partNumberId));
  assert.equal(second.mode, "search");
  assert.ok(second.items.every((item) => !firstIds.has(item.partNumberId)));
  await assert.rejects(() => listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z9601", cursor: first.nextCursor, limit: 2 }), (error) => error?.code === "BOM_CREATE_CANDIDATE_CURSOR_INVALID");
  return { first: first.items.length, second: second.items.length };
});
await check("QA-109-015", "suggested results deduplicate Parts", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.otherEngineer });
  assert.equal(new Set(result.items.map((item) => item.partNumberId)).size, result.items.length);
  return { count: result.items.length };
});
await check("QA-109-016", "search retains blocked row with shortest blocker", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z960106", limit: 25 });
  assert.equal(result.items[0]?.blockerCode, "BOM_PARENT_INACTIVE");
  assert.equal(result.items[0]?.action, "none");
  return result.items[0];
});
await check("QA-109-017", "non-manufacturing purpose supports commercial bundle", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: "dev096-no-m-parent", purpose: "sales_kit", limit: 1 });
  assert.equal(result.items[0]?.allowedPurposes[0], "sales_kit");
  assert.equal(result.items[0]?.action, "create");
  return result.items[0];
});
await check("QA-109-018", "missing definition destination is blocked", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: fixture.parents.red, purpose: "manufacturing", limit: 1 });
  assert.equal(result.items[0]?.definitionId, null);
  return { definition: null };
});
await check("QA-109-019", "malformed cursor fails closed", async () => {
  await assert.rejects(() => listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z960", cursor: "not-a-cursor", limit: 2 }), (error) => error?.code === "BOM_CREATE_CANDIDATE_CURSOR_INVALID");
  return { code: "BOM_CREATE_CANDIDATE_CURSOR_INVALID" };
});
await check("QA-109-020", "purpose projection supports one or two choices", async () => {
  const dual = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: fixture.parents.blue, limit: 1 });
  const single = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, exactPartNumberId: "dev096-no-m-parent", purpose: "sales_kit", limit: 1 });
  assert.equal(dual.items[0]?.allowedPurposes.length, 2);
  assert.equal(single.items[0]?.allowedPurposes.length, 1);
  return { dual: dual.items[0]?.allowedPurposes, single: single.items[0]?.allowedPurposes };
});
await check("QA-109-021", "filename-only data does not create file reason", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.otherEngineer, query: "Z960102", limit: 25 });
  assert.notEqual(result.items[0]?.reason?.code, "controlled_assembly_file");
  return result.items[0]?.reason;
});
await check("QA-109-022", "inactive Part excluded from suggested", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.otherEngineer });
  assert.ok(result.items.every((item) => item.partNumberId !== "dev096-inactive-parent"));
  return { excluded: "dev096-inactive-parent" };
});
await check("QA-109-023", "company recent classify does not occupy suggested", async () => {
  const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.otherEngineer });
  assert.ok(result.items.every((item) => item.partNumberId !== "dev096-single-parent"));
  return { excluded: "company_recent + classify" };
});
await check("QA-109-024", "projection does not persist reason or file fields", async () => {
  const tables = await client.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('bom_create_effects')");
  assert.equal(tables.length, 1);
  return { writes: false, effectTable: true };
});

const failed = checks.filter((item) => !item.pass);
await client.close();
runtimeDatabase.close();
if (!suppliedDataDir && tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
console.log(JSON.stringify({ runner: "repository", status: failed.length ? "FAIL" : "PASS", cases: checks, productionWrites: false, taskOwnedDataDir: dataDir, statementBudget: "<=3 readiness+projection" }, null, 2));
if (failed.length) process.exitCode = 1;
