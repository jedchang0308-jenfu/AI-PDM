#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";

const root = process.cwd();
const sourcePath = path.join(root, "data", "ai-pdm.sqlite");
const tempPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dev-092-runtime-")), "ai-pdm.sqlite");
fs.copyFileSync(sourcePath, tempPath);
const db = new Database(tempPath);
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
const work = db.prepare(`SELECT id, company_id FROM drawing_revision_works WHERE drawing_id = 'drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe' ORDER BY id LIMIT 1`).get();
assert.ok(work, "A0006 migrated work exists");
const repository = new DrawingRevisionWorkAsyncRepository(client);
const readable = await repository.readWork(client, work.company_id, work.id);
assert.equal(readable?.id, work.id);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = ?").get(work.id).count, 3);
db.prepare("DELETE FROM drawing_revision_work_files WHERE work_id = ? LIMIT 1").run(work.id);
await assert.rejects(() => repository.readWork(client, work.company_id, work.id), (error) => error.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID" && error.status === 409);
client.close();
const runId = `DEV092-runtime-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-092-runtime-invariant", runId);
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify({
  devId: "DEV-092",
  status: "PASS",
  checks: 2,
  workId: work.id,
  fullSnapshotCount: 3,
  negativeCode: "DRAWING_WORK_FILE_SNAPSHOT_INVALID",
  negativeStatus: 409
}, null, 2)}\n`, "utf8");
console.log("DEV-092 runtime invariant: PASS (2 checks)");
