#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

const root = process.cwd();
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-capa-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const evidenceDir = path.resolve(process.env.DEV109_CAPA_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-109-capa", new Date().toISOString().replace(/[:.]/gu, "-")));
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const companyId = "company-jenfu";
const actorId = "dev096-engineer";
const otherCompanyId = "dev096-other-company";
const checks = [];

process.env.PDM_DATA_DIR = dataDir;
process.env.PDM_REPOSITORY_DIR = repositoryDir;
process.env.PDM_ASSEMBLY_SHARED_BOM_V1 = "1";
process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "1";
process.env.PDM_BOM_XMIND_EDITOR_V2_ENABLED = "1";
process.env.PDM_SALES_KIT_BOM_V1_ENABLED = "1";
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(repositoryDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

const { fixture, seedDev096Fixture } = await import("./dev096-qc-fixture.mjs");
const { reconcileSldasmAssemblyEvidenceForDrawingSync } = await import("../src/lib/sldasm-assembly-evidence.ts");
const { createAsyncDatabaseClient } = await import("../src/lib/db-async-provider.ts");
const { listBomCreateCandidatesAsync } = await import("../src/lib/bom-create-context.ts");

console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-109 CAPA L01-L08 isolated SLDASM/candidate/reconcile verification",
  port: null,
  owningProcessTree: `node ${process.pid} -> task-owned SQLite and child reconcile runner`,
  cleanupCondition: "all SQLite handles closed, child runners exited, task root removed",
  PDM_DATA_DIR: dataDir,
  PDM_REPOSITORY_DIR: repositoryDir,
  mutationScope: taskRoot,
  productionWrites: false,
  productionConnection: false
} }));

const initial = new Database(databasePath);
initial.pragma("foreign_keys = ON");
initial.exec(fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
initial.close();
seedDev096Fixture();

function uuid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
let syntheticSequence = 20;
function insertPart(db, id, number, structure = "single_part", status = "Active", company = companyId, rootId = fixture.parentRootId) {
  const sequence = syntheticSequence++;
  const sequenceCode = `C${sequence}`;
  db.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, structure_type, record_status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'purchased', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(id, company, rootId, number, sequence, sequenceCode, number, structure, status, actorId);
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, handling)
    VALUES (?, ?, 'part', ?, 'part_formal', 'none')`).run(uuid("part-state"), company, id);
}
function addDrawing(db, input) {
  const prefix = input.prefix;
  const partId = input.partId ?? uuid(`${prefix}-part`);
  if (!input.existingPart) insertPart(db, partId, input.partNumber ?? `${prefix}-P01`, input.structure ?? "single_part", input.status ?? "Active", input.partCompany ?? companyId, input.partRootId ?? fixture.parentRootId);
  const numberId = `${prefix}-drawing-number`;
  const drawingId = `${prefix}-drawing`;
  const revisionId = `${prefix}-revision`;
  const fileAssetId = `${prefix}-asset`;
  const fileId = `${prefix}-file`;
  const sequence = syntheticSequence++;
  const requestedRevisionLifecycle = input.revisionLifecycle ?? "preparing";
  const insertRevisionLifecycle = ["released", "rd_controlled", "superseded"].includes(requestedRevisionLifecycle) ? "preparing" : requestedRevisionLifecycle;
  db.prepare(`INSERT INTO drawing_numbers (id, company_id, part_root_id, drawing_number, purpose_code, purpose_description, sequence_no, is_primary_manufacturing, record_status, created_by)
    VALUES (?, ?, ?, ?, 'M', 'CAPA primary manufacturing', ?, 1, 'Active', ?)`).run(numberId, companyId, input.partRootId ?? fixture.parentRootId, input.drawingNumber ?? `${input.partNumber ?? prefix}-M01`, sequence, actorId);
  db.prepare(`INSERT INTO drawings (id, company_id, lifecycle_state, formal_drawing_number_id, part_root_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?)`).run(drawingId, companyId, input.drawingLifecycle ?? "drawing_preparation", numberId, input.partRootId ?? fixture.parentRootId, actorId);
  db.prepare(`INSERT INTO drawing_revisions (id, company_id, drawing_id, revision, lifecycle_state, created_by, updated_by)
    VALUES (?, ?, ?, '0.1', ?, ?, ?)`).run(revisionId, companyId, drawingId, insertRevisionLifecycle, actorId, actorId);
  let branchId = null;
  if (input.dataLayer === "drawing_rd") {
    branchId = `${prefix}-branch`;
    db.prepare(`INSERT INTO drawing_rd_branches (id, company_id, drawing_id, status)
      VALUES (?, ?, ?, 'open')`).run(branchId, companyId, drawingId);
  }
  db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, branch_id, revision_id, handling)
    VALUES (?, ?, 'drawing', ?, ?, ?, ?, 'none')`).run(`${prefix}-state`, companyId, drawingId, input.dataLayer ?? "drawing_production", branchId, revisionId);
  db.prepare(`INSERT INTO file_assets (id, file_name, file_ext, linked_entity_type, linked_entity_id, document_category, uploaded_by)
    VALUES (?, ?, ?, 'drawing_revision', ?, 'cad_3d', ?)`).run(fileAssetId, input.fileName ?? `${prefix}.SLDASM`, input.fileExt ?? "sldasm", revisionId, actorId);
  db.prepare(`INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, is_primary, removed_at, removed_by, created_by)
    VALUES (?, ?, ?, ?, 'cad_3d', 'system', ?, 1, ?, ?, ?)`).run(fileId, companyId, revisionId, fileAssetId, input.fileName ?? `${prefix}.SLDASM`, input.removed ? "2026-09-01T00:00:00.000Z" : null, input.removed ? actorId : null, actorId);
  if (input.linkType !== "none") {
    db.prepare(`INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by)
      VALUES (?, ?, ?, ?, ?)`).run(`${prefix}-link`, numberId, partId, input.linkType ?? "primary_manufacturing", actorId);
  }
  if (requestedRevisionLifecycle !== insertRevisionLifecycle) db.prepare("UPDATE drawing_revisions SET lifecycle_state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(requestedRevisionLifecycle, revisionId);
  return { prefix, partId, numberId, drawingId, revisionId, fileId };
}

const db = new Database(databasePath);
db.pragma("foreign_keys = ON");
const fixtureIds = {};
db.transaction(() => {
  fixtureIds.a0044 = addDrawing(db, { prefix: "capa-a0044", partNumber: "A0044-P01", drawingNumber: "A0044-M01", fileName: "A0044.SLDASM", dataLayer: "drawing_production", revisionLifecycle: "preparing" });
  fixtureIds.rd = addDrawing(db, { prefix: "capa-rd", partNumber: "CAPA-RD-P01", fileName: "CAPA-RD.SLDASM", dataLayer: "drawing_rd", revisionLifecycle: "preparing" });
  fixtureIds.released = addDrawing(db, { prefix: "capa-released", partNumber: "CAPA-REL-P01", fileName: "CAPA-REL.SLDASM", dataLayer: "drawing_production", revisionLifecycle: "released" });
  fixtureIds.runner = addDrawing(db, { prefix: "capa-runner", partNumber: "CAPA-RUN-P01", fileName: "CAPA-RUN.SLDASM", dataLayer: "drawing_rd", revisionLifecycle: "preparing" });
  fixtureIds.sldprt = addDrawing(db, { prefix: "capa-sldprt", partNumber: "CAPA-PRT-P01", fileName: "CAPA-PRT.SLDASM", fileExt: "sldprt", linkType: "primary_manufacturing" });
  fixtureIds.removed = addDrawing(db, { prefix: "capa-removed", partNumber: "CAPA-REM-P01", fileName: "CAPA-REM.SLDASM", removed: true });
  fixtureIds.terminal = addDrawing(db, { prefix: "capa-terminal", partNumber: "CAPA-TERM-P01", fileName: "CAPA-TERM.SLDASM", status: "Obsolete" });
  fixtureIds.reference = addDrawing(db, { prefix: "capa-reference", partNumber: "CAPA-REF-P01", fileName: "CAPA-REF.SLDASM", linkType: "reference" });
  fixtureIds.oldRevision = addDrawing(db, { prefix: "capa-old", partNumber: "CAPA-OLD-P01", fileName: "CAPA-OLD.SLDASM", linkType: "primary_manufacturing" });
  db.prepare("DELETE FROM canonical_workbench_states WHERE id = ?").run(`${fixtureIds.oldRevision.prefix}-state`);
  const crossPart = "capa-cross-company-part";
  insertPart(db, crossPart, "CAPA-CROSS-P01", "single_part", "Active", otherCompanyId, "dev096-cross-company-root");
  const cross = addDrawing(db, { prefix: "capa-cross", partNumber: "CAPA-CROSS-DRAWING-P01", fileName: "CAPA-CROSS.SLDASM", linkType: "none" });
  db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES (?, ?, ?, 'primary_manufacturing', ?)").run("capa-cross-link", cross.numberId, crossPart, actorId);
  const ambiguous = addDrawing(db, { prefix: "capa-ambiguous", partNumber: "CAPA-AMB-P01", fileName: "CAPA-AMB.SLDASM", linkType: "primary_manufacturing" });
  const secondPart = "capa-ambiguous-second-part";
  insertPart(db, secondPart, "CAPA-AMB-P02");
  db.prepare("INSERT INTO drawing_part_links (id, drawing_number_id, part_number_id, link_type, created_by) VALUES (?, ?, ?, 'primary_manufacturing', ?)").run("capa-ambiguous-second-link", ambiguous.numberId, secondPart, actorId);
  fixtureIds.ambiguous = ambiguous;
  fixtureIds.cross = cross;
})();

async function check(id, label, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    checks.push({ id, label, status: "FAIL", detail });
    console.error(`FAIL ${id} ${label}: ${detail}`);
  }
}

const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });

function runReconcile(mode) {
  const result = spawnSync(process.execPath, ["scripts/reconcile-dev-109-sldasm-assembly.mjs", `--mode=${mode}`, `--database=${databasePath}`, `--evidence-dir=${path.join(dataDir, `reconcile-${mode}`)}`], {
    cwd: root, env: { ...process.env, PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir }, encoding: "utf8", windowsHide: true
  });
  if (result.status !== 0) throw new Error(`${mode} failed: ${(result.stderr || result.stdout || "").trim()}`);
  return JSON.parse(result.stdout.slice(result.stdout.indexOf("{ ".trim())));
}

await check("CAPA-L04", "candidate reason/action is read-only and independent of lifecycle", async () => {
  const before = db.prepare("SELECT structure_type, updated_at FROM part_numbers WHERE id = ?").get(fixtureIds.a0044.partId);
  const result = await listBomCreateCandidatesAsync({ client, companyId, actorId, exactPartNumberId: fixtureIds.a0044.partId, limit: 1 });
  assert.equal(result.items[0].reason?.code, "assembly_file");
  assert.equal(result.items[0].reason?.fileName, "A0044.SLDASM");
  assert.equal(result.items[0].action, "classify");
  assert.deepEqual(db.prepare("SELECT structure_type, updated_at FROM part_numbers WHERE id = ?").get(fixtureIds.a0044.partId), before);
  return { reason: result.items[0].reason, action: result.items[0].action, zeroWrite: true };
});

await check("CAPA-L01", "preparation current primary SLDASM promotes exact Part", () => {
  const before = db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(fixtureIds.a0044.partId).structure_type;
  const result = reconcileSldasmAssemblyEvidenceForDrawingSync(db, { companyId, drawingNumberId: fixtureIds.a0044.numberId, actorId });
  assert.equal(before, "single_part");
  assert.equal(result.status, "promoted");
  assert.equal(db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(fixtureIds.a0044.partId).structure_type, "assembly");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'bom.sldasm.assembly_promoted' AND json_extract(detail_json, '$.targetPartNumberId') = ?").get(fixtureIds.a0044.partId).count, 1);
  return result;
});

await check("CAPA-L02", "RD/preparing and production/released current states both promote and replay is no-op", () => {
  for (const key of ["rd", "released"]) {
    const first = reconcileSldasmAssemblyEvidenceForDrawingSync(db, { companyId, drawingNumberId: fixtureIds[key].numberId, actorId });
    assert.equal(first.status, "promoted");
    const auditBefore = db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'bom.sldasm.assembly_promoted' AND json_extract(detail_json, '$.targetPartNumberId') = ?").get(fixtureIds[key].partId).count;
    const replay = reconcileSldasmAssemblyEvidenceForDrawingSync(db, { companyId, drawingNumberId: fixtureIds[key].numberId, actorId });
    assert.equal(replay.status, "already_assembly");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'bom.sldasm.assembly_promoted' AND json_extract(detail_json, '$.targetPartNumberId') = ?").get(fixtureIds[key].partId).count, auditBefore);
  }
  return { layers: ["drawing_rd/preparing", "drawing_production/released"] };
});

await check("CAPA-L03", "negative file/relation/target cases fail closed", () => {
  for (const key of ["sldprt", "removed", "reference", "oldRevision", "ambiguous", "cross"]) {
    const id = fixtureIds[key].partId;
    const before = db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(id)?.structure_type;
    const result = reconcileSldasmAssemblyEvidenceForDrawingSync(db, { companyId, drawingNumberId: fixtureIds[key].numberId, actorId });
    assert.notEqual(result.status, "promoted");
    assert.equal(db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(id)?.structure_type, before);
  }
  const terminalBefore = db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(fixtureIds.terminal.partId).structure_type;
  const terminal = reconcileSldasmAssemblyEvidenceForDrawingSync(db, { companyId, drawingNumberId: fixtureIds.terminal.numberId, actorId });
  assert.equal(terminal.status, "blocked_relation");
  assert.equal(terminal.reason, "terminal_part");
  assert.equal(db.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").get(fixtureIds.terminal.partId).structure_type, terminalBefore);
  return { zeroWrite: true, cases: 7 };
});

await check("CAPA-L05", "A0044-shaped post reconcile action and bounded ordering", async () => {
  const result = await listBomCreateCandidatesAsync({ client, companyId, actorId, exactPartNumberId: fixtureIds.a0044.partId, limit: 1 });
  assert.equal(result.items[0].reason?.code, "assembly_file");
  assert.equal(result.items[0].action, "create");
  const first = await listBomCreateCandidatesAsync({ client, companyId, actorId, limit: 5 });
  const second = await listBomCreateCandidatesAsync({ client, companyId, actorId, limit: 5 });
  assert.ok(first.items.length <= 5);
  assert.deepEqual(first.items.map((item) => item.partNumberId), second.items.map((item) => item.partNumberId));
  assert.equal(new Set(first.items.map((item) => item.partNumberId)).size, first.items.length);
  return { action: result.items[0].action, reason: result.items[0].reason, count: first.items.length };
});

await check("CAPA-L06", "reconcile dry-run/apply/rerun is bounded and idempotent", () => {
  const before = db.prepare("SELECT id, structure_type, updated_at FROM part_numbers ORDER BY id").all();
  const dry = runReconcile("dry-run");
  assert.equal(dry.productionWrites, false);
  assert.ok(dry.before.scopeFingerprint && dry.before.planHash);
  assert.deepEqual(db.prepare("SELECT id, structure_type, updated_at FROM part_numbers ORDER BY id").all(), before);
  const apply = runReconcile("apply");
  assert.equal(apply.productionWrites, false);
  assert.equal(apply.applied, apply.before.exactTargetCount);
  assert.ok(apply.after.scopeFingerprint && apply.after.planHash);
  const rerun = runReconcile("apply");
  assert.equal(rerun.applied, 0);
  assert.equal(rerun.before.exactTargetCount, 0);
  return { dryRunTargets: dry.before.exactTargetCount, applied: apply.applied, rerun: rerun.applied };
});

await check("CAPA-L07", "SQLite readback and provider gate preserve semantic contract", async () => {
  const result = await listBomCreateCandidatesAsync({ client, companyId, actorId, exactPartNumberId: fixtureIds.runner.partId, limit: 1 });
  assert.equal(result.items[0].structureType, "assembly");
  assert.equal(result.items[0].action, "create");
  assert.equal(result.items[0].reason?.code, "assembly_file");
  const provider = spawnSync(process.execPath, ["scripts/qc-dev-109-unified-provider.mjs"], { cwd: root, env: (() => { const value = { ...process.env }; delete value.PDM_DATA_DIR; delete value.PDM_REPOSITORY_DIR; delete value.PDM_DB_PROVIDER; return value; })(), encoding: "utf8", windowsHide: true });
  assert.equal(provider.status, 0, `${provider.error ? String(provider.error) : ""}\n${(provider.stderr || provider.stdout || "").slice(-4000)}`);
  assert.match(provider.stdout || "", /PASS CAPA-PG-01/u);
  return { sqlite: { action: result.items[0].action, reason: result.items[0].reason }, postgresSldasm: "PASS" };
});

await check("CAPA-L08", "historical DEV-109 54-case regression remains 54/54", () => {
  const evidence = path.join(evidenceDir, "historical-54");
  const env = { ...process.env, DEV109_UNIFIED_EVIDENCE_DIR: evidence };
  delete env.PDM_DATA_DIR; delete env.PDM_REPOSITORY_DIR; delete env.PDM_DB_PROVIDER;
  const regression = spawnSync(process.execPath, ["scripts/qc-dev-109-unified-aggregate.mjs"], { cwd: root, env, encoding: "utf8", windowsHide: true });
  assert.equal(regression.status, 0, `${regression.error ? String(regression.error) : ""}\n${(regression.stderr || regression.stdout || "").slice(-6000)}`);
  const aggregatePath = path.join(evidence, "aggregate.json");
  const aggregate = JSON.parse(fs.readFileSync(aggregatePath, "utf8"));
  assert.equal(aggregate.registry.observedCount, 54);
  assert.deepEqual(aggregate.registry.missing, []);
  return { observedCount: aggregate.registry.observedCount, evidence: aggregatePath };
});

const fk = db.pragma("foreign_key_check");
assert.equal(fk.length, 0, JSON.stringify(fk));
await client.close();
db.close();
const failed = checks.filter((item) => item.status !== "PASS");
const result = { runner: "dev-109-capa", status: failed.length ? "FAIL" : "PASS", cases: checks, productionWrites: false, productionConnection: false, evidenceDir, taskOwnedDataDir: dataDir, taskOwnedRepositoryDir: repositoryDir, foreignKeyViolations: fk };
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); } catch (error) { result.cleanupError = String(error); }
result.cleanup = { taskRootRemoved: !fs.existsSync(taskRoot) };
fs.writeFileSync(path.join(evidenceDir, "capa.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (failed.length || !result.cleanup.taskRootRemoved) process.exitCode = 1;
