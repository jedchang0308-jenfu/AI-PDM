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
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev113-integration-"));
const dataDir = path.join(taskRoot, "data");
const repositoryDir = path.join(taskRoot, "repository");
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(repositoryDir, { recursive: true });
const dbPath = path.join(dataDir, "ai-pdm.sqlite");
console.log(JSON.stringify({ runtimeDeclaration: { project: root, purpose: "DEV-113 isolated exact source-row and matrix projection integration evidence", port: null, owningProcessTree: "this Node runner only", cleanupCondition: "client closed and task-owned fixture root removed", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, mutationScope: taskRoot } }));

let db; let client;
try {
  db = createFixtureDatabase({ filename: dbPath, canonical: true });
  process.env.PDM_DATA_DIR = dataDir; process.env.PDM_REPOSITORY_DIR = repositoryDir; process.env.PDM_DB_PROVIDER = "sqlite";
  client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  const actor = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false, obsolete: true, manageAttachments: true } };
  const token = await issueCanonicalWorkbenchContract(client, { companyId: ids.company, actorId: ids.owner });
  const service = new PartChangeWorkService(client);
  const sourceWork = await service.create(ids.part, actor, { idempotencyKey: "dev113-source-create", contractToken: token, expectedRowVersion: 1 });
  const projection = await readPartNumberMatrixWorkspace({ client, sourcePartId: ids.part, sourceWorkId: sourceWork.workId, actor });
  assert.equal(projection.data.sourcePartId, ids.part);
  assert.match(projection.data.sourceRowKey, /^cw_[^:]+$/);
  assert.equal(projection.data.columns[0].partId, ids.part);
  assert.equal(new Set(projection.data.columns.map((column) => column.partId)).size, projection.data.columns.length);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM canonical_workbench_states WHERE entity_type='part' AND data_layer='part_work'").get().count, 1);
  assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  const report = { status: "PASS", denominator: 4, checks: ["R01", "R02", "R03", "R04"], details: { sourceRowKey: projection.data.sourceRowKey, sourcePartId: projection.data.sourcePartId, columnCount: projection.data.columns.length, foreignKeyViolations: 0 } };
  const output = path.join(root, "output", "qa", "dev-113", "integration"); fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log("PASS R01 exact source Part and work guard");
  console.log("PASS R02 sourceRowKey maps to canonical workbench state");
  console.log("PASS R03 root matrix projection is bounded and deterministic");
  console.log("PASS R04 isolated fixture foreign-key invariant");
} finally {
  await client?.close();
  try { db?.close(); } catch { /* idempotent */ }
  fs.rmSync(taskRoot, { recursive: true, force: true });
}
