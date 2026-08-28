import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { createPlatformActorContext } from "../src/lib/platform-command.ts";
import { getPartStructureClassificationAsync, classifyPartStructureAsync } from "../src/lib/part-structure-classification.ts";
import { consensusStoredPartStructureType } from "../src/lib/numbering-structure-type.ts";
import { requireTaskDatabase, seedDev096Fixture, fixture } from "./dev096-qc-fixture.mjs";

const checks = [];
async function check(id, label, fn) {
  try { const detail = await fn(); checks.push({ id, label, status: "PASS", detail: detail ?? null }); console.log(`PASS ${id} ${label}`); }
  catch (error) { checks.push({ id, label, status: "FAIL", message: error instanceof Error ? error.message : String(error) }); console.error(`FAIL ${id} ${checks.at(-1).message}`); }
}
const { databasePath } = requireTaskDatabase();
const fixtureLedger = seedDev096Fixture();
const database = new Database(databasePath);
database.pragma("foreign_keys = ON");
const client = createAsyncDatabaseClient({ kind: "sqlite", database });
const actor = createPlatformActorContext({
  pdmUserId: fixture.users.engineer,
  organizationId: fixture.companyId,
  roles: ["Engineer"],
  scopes: ["numbering.workspace.update"],
  requestId: "dev099-repository-request",
  correlationId: "dev099-repository-correlation"
});

const metadata = (idempotencyKey) => ({ actor, idempotencyKey });
const rootPartId = fixture.parents.red;

let initialView;
await check("REPO-099-001", "mixed same-root parts return unclassified consensus", async () => {
  initialView = await getPartStructureClassificationAsync({ client, companyId: fixture.companyId, partNumberId: rootPartId, canMutate: true });
  assert.ok(initialView);
  assert.equal(initialView.structureType, "assembly");
  assert.equal(consensusStoredPartStructureType(initialView.candidates.map((candidate) => candidate.structureType)), "unclassified");
  assert.ok(initialView.candidates.length >= 5);
  return { candidates: initialView.candidates.length, etag: initialView.etag };
});

let changed;
let classificationIfMatch = "";
await check("REPO-099-002", "decided Part classification updates exact target atomically", async () => {
  assert.ok(initialView);
  const targetView = await getPartStructureClassificationAsync({ client, companyId: fixture.companyId, partNumberId: "dev096-single-parent", canMutate: true });
  assert.ok(targetView);
  classificationIfMatch = targetView.etag;
  changed = await classifyPartStructureAsync({
    client,
    companyId: fixture.companyId,
    actorId: fixture.users.engineer,
    metadata: metadata("dev099-classify-001"),
    partNumberId: "dev096-single-parent",
    targetPartNumberIds: ["dev096-single-parent"],
    structureType: "assembly",
    reason: "DEV-099 repository verification",
    ifMatch: classificationIfMatch
  });
  assert.deepEqual(changed.result.updatedPartIds, ["dev096-single-parent"]);
  assert.equal(database.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").pluck().get("dev096-single-parent"), "assembly");
  return changed.result;
});

await check("REPO-099-003", "same idempotency key replays receipt without duplicate update", async () => {
  assert.ok(changed);
  const replay = await classifyPartStructureAsync({
    client,
    companyId: fixture.companyId,
    actorId: fixture.users.engineer,
    metadata: metadata("dev099-classify-001"),
    partNumberId: "dev096-single-parent",
    targetPartNumberIds: ["dev096-single-parent"],
    structureType: "assembly",
    reason: "DEV-099 repository verification",
    ifMatch: classificationIfMatch
  });
  assert.equal(replay.reusedFromCommandReceipt, true);
  return replay.result;
});

await check("REPO-099-004", "stale ETag is rejected with zero write", async () => {
  assert.ok(initialView);
  await assert.rejects(() => classifyPartStructureAsync({
    client,
    companyId: fixture.companyId,
    actorId: fixture.users.engineer,
    metadata: metadata("dev099-stale-001"),
    partNumberId: rootPartId,
    targetPartNumberIds: [rootPartId],
    structureType: "single_part",
    reason: "stale verification",
    ifMatch: initialView.etag
  }), /PART_STRUCTURE_STALE_ETAG/);
  assert.equal(database.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").pluck().get(rootPartId), "assembly");
});

await check("REPO-099-005", "cross-root batch is rejected before mutation", async () => {
  const view = await getPartStructureClassificationAsync({ client, companyId: fixture.companyId, partNumberId: rootPartId, canMutate: true });
  assert.ok(view);
  await assert.rejects(() => classifyPartStructureAsync({
    client,
    companyId: fixture.companyId,
    actorId: fixture.users.engineer,
    metadata: metadata("dev099-cross-root-001"),
    partNumberId: rootPartId,
    targetPartNumberIds: [rootPartId, fixture.children.red],
    structureType: "assembly",
    reason: "cross-root verification",
    ifMatch: view.etag
  }), /PART_STRUCTURE_TARGET_ROOT_MISMATCH/);
});

await check("REPO-099-006", "BOM binding blocks assembly to single-part downgrade", async () => {
  const now = "2026-08-26T07:00:00.000Z";
  database.prepare("INSERT INTO bom_definitions (id, company_id, part_root_id, row_version, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)")
    .run("dev099-bom-definition", fixture.companyId, fixture.parentRootId, fixture.users.engineer, fixture.users.engineer, now, now);
  database.prepare("INSERT INTO bom_definition_parent_bindings (id, company_id, definition_id, part_number_id, bound_from_bom_revision, created_by, created_at) VALUES (?, ?, ?, ?, '1', ?, ?)")
    .run("dev099-bom-binding", fixture.companyId, "dev099-bom-definition", "dev096-single-parent", fixture.users.engineer, now);
  const view = await getPartStructureClassificationAsync({ client, companyId: fixture.companyId, partNumberId: "dev096-single-parent", canMutate: true });
  assert.ok(view);
  await assert.rejects(() => classifyPartStructureAsync({
    client,
    companyId: fixture.companyId,
    actorId: fixture.users.engineer,
    metadata: metadata("dev099-bom-conflict-001"),
    partNumberId: "dev096-single-parent",
    targetPartNumberIds: ["dev096-single-parent"],
    structureType: "single_part",
    reason: "BOM conflict verification",
    ifMatch: view.etag
  }), /PART_STRUCTURE_BOM_CONFLICT/);
  assert.equal(database.prepare("SELECT structure_type FROM part_numbers WHERE id = ?").pluck().get("dev096-single-parent"), "assembly");
});

await check("REPO-099-007", "classification audit and receipt are present without outbox event", () => {
  const audit = database.prepare("SELECT COUNT(*) FROM audit_logs WHERE action = 'part.structure_type.classify'").pluck().get();
  const receipt = database.prepare("SELECT COUNT(*) FROM platform_command_receipts WHERE command_name = 'part.structure_type.classify' AND command_status = 'completed'").pluck().get();
  const outbox = database.prepare("SELECT COUNT(*) FROM platform_outbox_events WHERE idempotency_key LIKE 'dev099-%'").pluck().get();
  assert.equal(Number(audit), 1);
  assert.equal(Number(receipt), 1);
  assert.equal(Number(outbox), 0);
  return { audit: Number(audit), receipt: Number(receipt), outbox: Number(outbox) };
});

const foreignKeys = database.pragma("foreign_key_check");
const result = { runner: "repository", status: checks.some((item) => item.status === "FAIL") ? "FAIL" : "PASS", fixtureLedger, checks, foreignKeyViolations: foreignKeys.length };
const evidenceDir = process.env.DEV099_EVIDENCE_DIR?.trim();
if (evidenceDir) { fs.mkdirSync(evidenceDir, { recursive: true }); fs.writeFileSync(path.join(evidenceDir, "repository.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8"); }
await client.close();
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((item) => item.status === "PASS").length, total: checks.length, foreignKeyViolations: foreignKeys.length }));
if (result.status !== "PASS" || foreignKeys.length) process.exitCode = 1;
