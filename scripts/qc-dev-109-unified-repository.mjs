#!/usr/bin/env node

/* DEV-109 repository gate: task-owned SQLite integration plus narrow source
 * contract probes for rules that are deliberately owned by another boundary
 * (HTTP/error and diff projection). */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev109-repository-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
const databasePath = path.join(dataDir, "ai-pdm.sqlite");
const now = "2026-09-01T00:00:00.000Z";
const fixtureModule = path.join(root, "scripts", "dev096-qc-fixture.mjs");
const checks = [];
let runtimeDatabase = null;
let client = null;

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const errorText = (error) => error instanceof Error ? error.message : String(error);
function check(id, label, fn) {
  try {
    const detail = fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
    return detail;
  } catch (error) {
    checks.push({ id, label, status: "FAIL", message: errorText(error) });
    console.error(`FAIL ${id} ${errorText(error)}`);
    throw error;
  }
}
async function checkAsync(id, label, fn) {
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

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(repositoryDir, { recursive: true });
  if (path.resolve(dataDir).toLowerCase() === path.resolve(root, "data").toLowerCase()) throw new Error("DEV109_PRIMARY_DATA_FORBIDDEN");
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_ASSEMBLY_SHARED_BOM_V1 = "1";
  process.env.PDM_UNIFIED_PART_RELATION_WORKBENCH_V1 = "1";
  process.env.PDM_BOM_XMIND_EDITOR_V2_ENABLED = "1";
  process.env.PDM_SALES_KIT_BOM_V1_ENABLED = "1";
  console.log(JSON.stringify({ runtimeDeclaration: {
    project: root,
    purpose: "DEV-109 actual repository UOM/idempotency/drift/release integration",
    port: null,
    owningProcessTree: `runner ${process.pid} -> task-owned SQLite handle`,
    cleanupCondition: "SQLite handle closed and task root removed",
    PDM_DATA_DIR: dataDir,
    PDM_REPOSITORY_DIR: repositoryDir,
    mutationScope: taskRoot,
    productionWrites: false,
    productionConnection: false
  } }));

  const bootstrap = new Database(databasePath);
  bootstrap.pragma("foreign_keys = ON");
  bootstrap.exec(read("db/schema.sql"));
  bootstrap.close();
  const { fixture, seedDev096Fixture } = await import(pathToFileURL(fixtureModule).href);
  seedDev096Fixture();
  runtimeDatabase = new Database(databasePath);
  runtimeDatabase.pragma("foreign_keys = ON");
  client = (await import(pathToFileURL(path.join(root, "src/lib/db-async-provider.ts")).href)).createAsyncDatabaseClient({ kind: "sqlite", database: runtimeDatabase });
  const { AsyncBomWorkbenchRepository } = await import(pathToFileURL(path.join(root, "src/lib/repositories/bom-workbench-async-repository.ts")).href);
  const { getBomApplicabilityCandidateContractAsync, listBomCreateCandidatesAsync } = await import(pathToFileURL(path.join(root, "src/lib/bom-create-context.ts")).href);
  const units = await import(pathToFileURL(path.join(root, "src/lib/bom-unit-of-measure.ts")).href);
  const repo = new AsyncBomWorkbenchRepository(client, () => now, () => crypto.randomUUID());
  const countingClient = {
    kind: client.kind,
    query: (...args) => client.query(...args),
    queryOne: (...args) => client.queryOne(...args),
    execute: (...args) => client.execute(...args),
    transaction: (...args) => client.transaction(...args),
    close: () => client.close()
  };

  // The parent is an assembly without an M drawing. Unified eligibility is
  // structure-only; the old manufacturing-purpose gate must not leak back in.
  await checkAsync("R01", "assembly eligibility is structure-only in the live repository", async () => {
    const result = await getBomApplicabilityCandidateContractAsync({ client: countingClient, companyId: fixture.companyId, contextPartNumberId: "dev096-no-m-parent" });
    assert.equal(result.mode, "initial");
    assert.equal(result.candidates.find((row) => row.partNumberId === "dev096-no-m-parent")?.selectable, true);
    return { mode: result.mode, selected: result.candidates.find((row) => row.partNumberId === "dev096-no-m-parent")?.selected };
  });
  await checkAsync("R02", "candidate projection is bounded and deduplicated by Part", async () => {
    const result = await listBomCreateCandidatesAsync({ client: countingClient, companyId: fixture.companyId, actorId: fixture.users.engineer, query: "Z9601", limit: 5 });
    assert.ok(result.items.length <= 5);
    assert.equal(new Set(result.items.map((row) => row.partNumberId)).size, result.items.length);
    assert.equal(result.mode, "search");
    return { mode: result.mode, count: result.items.length, nextCursor: Boolean(result.nextCursor) };
  });

  const context = await getBomApplicabilityCandidateContractAsync({ client: countingClient, companyId: fixture.companyId, contextPartNumberId: fixture.parents.red });
  assert.equal(context.mode, "initial");
  const createInput = {
    companyId: fixture.companyId,
    contextPartNumberId: fixture.parents.red,
    applicableParentPartNumberIds: [fixture.parents.red],
    bomRevision: context.suggestedBomRevision,
    source: "manual",
    baseReleaseSnapshotId: null,
    actorId: fixture.users.engineer,
    idempotencyKey: "dev109-unified-repository-create-001",
    requestFingerprint: crypto.createHash("sha256").update("dev109-unified-repository-create-001").digest("hex"),
    selectionEtag: context.selectionEtag
  };
  let createdResult = null;
  await checkAsync("R04", "create is idempotent and new unified Definition has no purpose", async () => {
    const first = await repo.createSharedDraft(createInput);
    createdResult = first;
    const replay = await repo.createSharedDraft(createInput);
    assert.equal(replay.replayed, true);
    assert.equal(replay.draft.id, first.draft.id);
    const definition = await client.queryOne("SELECT legacy_purpose FROM bom_definitions WHERE id = :id", { id: first.definitionId });
    assert.equal(definition?.legacy_purpose ?? null, null);
    return { draftId: first.draft.id, definitionId: first.definitionId, replayed: replay.replayed };
  });
  const created = createdResult;
  assert.ok(created?.draft?.id, "repository create result missing draft");

  // Assign a base UOM to the child after the fixture was seeded.  This is the
  // real master lookup that locks the line's UOM during save.
  await client.execute("UPDATE part_numbers SET base_uom_code = :uom WHERE id = :id", { id: fixture.children.red, uom: "EA" });
  const lineId = "dev109-unified-line-001";
  const logicalLineId = "550e8400-e29b-41d4-a716-446655440000";
  const saved = await checkAsync("R05", "save/reload persists locked child UOM and scale-6 quantity", async () => {
    const draft = await repo.getDraftById(created.draft.id);
    assert.ok(draft);
    const result = await repo.saveDraftTree({
      draftId: created.draft.id,
      actorId: fixture.users.engineer,
      expectedEditorVersion: draft.editor_version,
      reason: "DEV-109 repository UOM integration",
      lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "Z960201", revision: null, quantity: "0.125", quantityUomCode: "EA", sequenceNo: 1 }],
      floatingTopics: [],
      components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "fixed", childPartNumberIds: [fixture.children.red], parentSelections: [] }]
    });
    assert.equal(result?.lines[0]?.quantity_uom_code, "EA");
    const row = await client.queryOne("SELECT quantity, quantity_uom_code, quantity_scaled_6 FROM bom_lines_tree WHERE id = :id", { id: lineId });
    assert.equal(row?.quantity_uom_code, "EA");
    assert.equal(Number(row?.quantity_scaled_6), 125000);
    return { quantity: row?.quantity, quantityUomCode: row?.quantity_uom_code, quantityScaled6: row?.quantity_scaled_6 };
  });
  await checkAsync("R08", "decimal parser and repository readback remain exact", async () => {
    const parsed = units.parseBomQuantity("999999999.999999");
    assert.equal(parsed.canonical, "999999999.999999");
    assert.equal(String(parsed.scaled6), "999999999999999");
    const row = await client.queryOne("SELECT quantity_scaled_6 FROM bom_lines_tree WHERE id = :id", { id: lineId });
    assert.equal(Number(row?.quantity_scaled_6), 125000);
    assert.throws(() => units.parseBomQuantity("0.0000001"));
    return { canonical: parsed.canonical, scaled6: String(parsed.scaled6) };
  });
  await checkAsync("R09", "base UOM drift is blocked until the line is re-confirmed", async () => {
    await client.execute("UPDATE part_numbers SET base_uom_code = :uom WHERE id = :id", { id: fixture.children.red, uom: "SET" });
    let driftError = "";
    try {
      await repo.submitReview({ draftId: created.draft.id, actorId: fixture.users.engineer, changeReason: "DEV-109 drift probe" });
    } catch (error) { driftError = errorText(error); }
    assert.match(driftError, /BOM_LINE_UOM_STALE/u);
    await client.execute("UPDATE part_numbers SET base_uom_code = :uom WHERE id = :id", { id: fixture.children.red, uom: "EA" });
    const unchanged = await client.queryOne("SELECT quantity_uom_code, quantity_scaled_6 FROM bom_lines_tree WHERE id = :id", { id: lineId });
    assert.deepEqual(unchanged, { quantity_uom_code: "EA", quantity_scaled_6: 125000 });
    return { error: driftError, unchanged: { ...unchanged, quantity_scaled_6: Number(unchanged.quantity_scaled_6) } };
  });
  await checkAsync("R07", "alternate child UOM mismatch is rejected before any draft mutation", async () => {
    await client.execute("UPDATE part_numbers SET base_uom_code = :uom WHERE id = :id", { id: fixture.children.blue, uom: "SET" });
    const current = await repo.getDraftById(created.draft.id);
    let mismatchError = "";
    try {
      await repo.saveDraftTree({
        draftId: created.draft.id,
        actorId: fixture.users.engineer,
        expectedEditorVersion: current.editor_version,
        reason: "DEV-109 UOM mismatch probe",
        lines: [{ id: lineId, logicalLineId, parentLineId: null, nodeType: "item", partNumber: "Z960201", revision: null, quantity: "0.125", quantityUomCode: "EA", sequenceNo: 1 }],
        floatingTopics: [],
        components: [{ nodeId: lineId, logicalLineId, nodeLocation: "tree", componentMode: "by_parent", childPartNumberIds: [fixture.children.red, fixture.children.blue], parentSelections: [{ parentPartNumberId: fixture.parents.red, childPartNumberId: fixture.children.red }] }]
      });
    } catch (error) { mismatchError = errorText(error); }
    assert.match(mismatchError, /BOM_COMPONENT_UOM_MISMATCH/u);
    const unchanged = await client.queryOne("SELECT quantity_uom_code, quantity_scaled_6 FROM bom_lines_tree WHERE id = :id", { id: lineId });
    assert.deepEqual(unchanged, { quantity_uom_code: "EA", quantity_scaled_6: 125000 });
    await client.execute("UPDATE part_numbers SET base_uom_code = NULL WHERE id = :id", { id: fixture.children.blue });
    return { error: mismatchError, unchanged };
  });
  let reviewResult = null;
  await checkAsync("R10", "submit emits unified review schema v3", async () => {
    const value = await repo.submitReview({ draftId: created.draft.id, actorId: fixture.users.engineer, changeReason: "DEV-109 repository v3 review" });
    reviewResult = value;
    assert.equal(value?.review_schema_version, 3);
    const snapshot = JSON.parse(value?.review_snapshot_json ?? "{}");
    assert.equal(Object.hasOwn(snapshot, "bomPurpose"), false);
    assert.ok(snapshot.sharedLines?.[0]?.quantityUomCode);
    return { reviewId: value?.id, reviewSchemaVersion: value?.review_schema_version };
  });
  const review = reviewResult;
  assert.ok(review?.id, "repository review result missing id");
  await checkAsync("R11", "approval releases v3 snapshot with exact quantity authority", async () => {
    const value = await repo.approveReview({ reviewId: review.id, actorId: fixture.users.manager, decisionReason: "DEV-109 repository v3 approved" });
    assert.equal(value?.draft?.status, "Released");
    const snapshot = await repo.getReleaseSnapshotById(value.snapshotId);
    assert.equal(snapshot?.snapshot_schema_version, 3);
    assert.equal(snapshot?.resolved_lines?.[0]?.quantity_uom_code, "EA");
    assert.equal(Number(snapshot?.resolved_lines?.[0]?.quantity_scaled_6), 125000);
    return { snapshotId: value.snapshotId, snapshotSchemaVersion: snapshot?.snapshot_schema_version };
  });

  const repoSource = read("src/lib/repositories/bom-workbench-async-repository.ts");
  const partSource = read("src/lib/repositories/part-change-work-async-repository.ts");
  const diffSource = read("src/lib/bom-workbench-diff.ts");
  check("R03", "retired purpose remains a flat API error contract", () => {
    assert.match(read("src/app/api/bom/drafts/route.ts"), /BOM_PURPOSE_RETIRED/u);
    return { retired: true };
  });
  check("R06", "null base UOM remains guarded at selection boundary", () => { assert.match(repoSource, /BOM_ITEM_UOM_REQUIRED/u); return { guard: true }; });
  check("R12", "Part work exposes controlled base UOM", () => { assert.match(partSource, /baseUomCode/u); assert.match(partSource, /base_uom_code/u); return { guard: true }; });
  check("R13", "Part base UOM cannot be cleared after set", () => { assert.match(partSource, /基本單位一旦設定不可清空/u); return { guard: true }; });
  check("R14", "diff exposes UOM changes", () => { assert.match(diffSource, /uom_changed/u); return { guard: true }; });
}

let exitCode = 1;
try {
  await main();
  exitCode = checks.length === 14 && checks.every((item) => item.status === "PASS") ? 0 : 1;
} catch (error) {
  console.error(`DEV109_REPOSITORY_RUNNER_ERROR: ${errorText(error)}`);
}
try { await client?.close(); } catch { /* cleanup continues */ }
try { runtimeDatabase?.close(); } catch { /* cleanup continues */ }
let taskRootRemoved = false;
try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 }); taskRootRemoved = !fs.existsSync(taskRoot); } catch { /* result records false */ }
const result = {
  schemaVersion: 1,
  devId: "DEV-109",
  runner: "unified-repository",
  provider: "sqlite",
  status: exitCode === 0 ? "PASS" : "FAIL",
  cases: checks,
  productionWrites: false,
  productionConnection: false,
  taskOwnedDataDir: dataDir,
  taskOwnedRepositoryDir: repositoryDir,
  primaryWrites: false,
  cleanup: { taskRootRemoved }
};
console.log(JSON.stringify(result, null, 2));
if (exitCode !== 0) process.exitCode = 1;
