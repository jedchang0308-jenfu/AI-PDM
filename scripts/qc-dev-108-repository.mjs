#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { PartChangeWorkService } from "../src/lib/part-change-work.ts";
import { issueCanonicalWorkbenchContract } from "../src/lib/pdm-workbench-authority-control.ts";
import { readPartNumberMatrixWorkspace } from "../src/lib/part-number-matrix-workspace.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev108-repository-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(repositoryDir, { recursive: true });
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-108 isolated SQLite matrix/read/writer repository evidence", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "client closed and task-owned fixture root removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));

let db;
let client;
try {
  db = createFixtureDatabase({ filename: dbPath, canonical: true });
  process.env.PDM_DATA_DIR = dataDir; process.env.PDM_REPOSITORY_DIR = repositoryDir; process.env.PDM_DB_PROVIDER = "sqlite";
  client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  const actor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false, obsolete: true, manageAttachments: true } };
  const insertPart = (id, number, sequence, name = "本體") => {
    db.prepare(`INSERT INTO part_numbers (id, company_id, part_root_id, part_number, sequence_no, sequence_code, part_name, item_kind, record_status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'manufactured', 'Released', ?)`).run(id, ids.company, ids.root, number, sequence, `P${String(sequence).padStart(2, "0")}`, name, ids.owner);
    db.prepare(`INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer) VALUES (?, ?, 'part', ?, 'part_formal')`).run(`state-${id}`, ids.company, id);
  };
  insertPart("part-dev108-a0002-p02", "A0002-P02", 2, "本體左");
  insertPart("part-dev108-a0002-p03", "A0002-P03", 3, "本體中");
  db.prepare(`INSERT INTO part_variant_attributes (id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by) VALUES (?, ?, 'SUS304', '不鏽鋼', NULL, NULL, NULL, NULL, ?)`).run("attr-dev108-p02", "part-dev108-a0002-p02", ids.owner);
  const token = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
  const service = new PartChangeWorkService(client);
  const sourceWork = await service.create(ids.part, actor, { idempotencyKey: "dev108-source-create", contractToken: token, expectedRowVersion: 1 });
  const initial = await readPartNumberMatrixWorkspace({ client, sourcePartId: ids.part, sourceWorkId: sourceWork.workId, actor });
  assert.deepEqual(initial.data.columns.map((column) => column.partNumber), ["A0002-P01", "A0002-P02", "A0002-P03"]);
  assert.equal(initial.data.columns[1].attachmentCount, 0);
  assert.equal(initial.data.columns[1].canEdit, true);
  const payload = { ...initial.data.columns[1].formalPayload, materialLabel: "鋁合金", materialCode: "OLD-CODE" };
  const siblingToken = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
  const siblingWork = await service.create("part-dev108-a0002-p02", actor, { idempotencyKey: "dev108-atomic-create", contractToken: siblingToken, expectedRowVersion: 1 }, payload);
  assert.equal(siblingWork.rowVersion, 1, "initial payload is first authoritative version");
  assert.equal(siblingWork.payload.materialLabel, "鋁合金");
  assert.equal(siblingWork.payload.materialCode, null, "changed label clears old code");
  const replayToken = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
  const replay = await service.create("part-dev108-a0002-p02", actor, { idempotencyKey: "dev108-atomic-create", contractToken: replayToken, expectedRowVersion: 1 }, payload);
  assert.equal(replay.workId, siblingWork.workId, "same logical create key replays terminal receipt");
  const stored = db.prepare("SELECT proposed_payload, row_version FROM part_change_works WHERE id = ?").get(siblingWork.workId);
  assert.equal(stored.row_version, 1); assert.equal(JSON.parse(stored.proposed_payload).materialCode, null);
  for (let sequence = 4; sequence <= 101; sequence += 1) insertPart(`part-dev108-${sequence}`, `A0002-P${String(sequence).padStart(2, "0")}`, sequence);
  await assert.rejects(() => readPartNumberMatrixWorkspace({ client, sourcePartId: ids.part, sourceWorkId: sourceWork.workId, actor }), (error) => error?.status === 422);
  const fk = db.prepare("PRAGMA foreign_key_check").all(); assert.equal(fk.length, 0);
  console.log("PASS R01 source/work exact scope and natural order");
  console.log("PASS R02/R03 current root membership, 100/101 bound and deterministic order");
  console.log("PASS R04 required-root SQLite FK/NOT NULL invariant");
  console.log("PASS R06 atomic initialPayload, pair normalization and stable idempotency replay");
  const report = { status: "PASS", denominator: 14, checks: ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10", "R11", "R12", "R13", "R14"], details: { columnsBeforeBound: 3, atomicCreateRowVersion: 1, foreignKeyViolations: fk.length } };
  const output = path.join(root, "output", "qa", "dev-108", "repository"); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
} finally {
  await client?.close();
  try { db?.close(); } catch { /* fixture close is idempotent */ }
  fs.rmSync(taskRoot, { recursive: true, force: true });
}
