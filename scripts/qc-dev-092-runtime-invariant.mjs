#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-092-runtime-"));
const tempPath = path.join(tempRoot, "ai-pdm.sqlite");
const evidenceDir = path.join(root, "output", "qa", "dev-092-runtime-invariant");
fs.mkdirSync(evidenceDir, { recursive: true });
const runId = `DEV092-runtime-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const runDir = path.join(evidenceDir, runId);
fs.mkdirSync(runDir, { recursive: true });
const repositoryDir = path.join(tempRoot, "repository");
fs.mkdirSync(repositoryDir, { recursive: true });
console.log(`DEV-092 runtime invariant: project=${root}; purpose=isolated canonical work-file read invariant; PDM_DATA_DIR=${tempRoot}; PDM_REPOSITORY_DIR=${repositoryDir}; mutation=task-owned fixture only; cleanup=after assertions`);

// Build the file-bearing fixture in the task-owned database.  The primary
// SQLite snapshot is intentionally not used as a mutable test fixture: its
// current A0006 row is a historical zero-file state, while this invariant is
// specifically the post-migration read/negative contract.
const fixture = createFixtureDatabase({ filename: tempPath, canonical: false, rdLifecycle: "preparing" });
const sourceFiles = [
  { binding: "binding-dev092-runtime-1", asset: "asset-dev092-runtime-1", name: "A0002-M01.pdf", ext: "pdf", mime: "application/pdf", hash: "hash-dev092-runtime-1", role: "pdf", ordinal: 0 },
  { binding: "binding-dev092-runtime-2", asset: "asset-dev092-runtime-2", name: "A0002-M01.SLDDRW", ext: "slddrw", mime: "application/octet-stream", hash: "hash-dev092-runtime-2", role: "drawing_2d", ordinal: 1 },
  { binding: "binding-dev092-runtime-3", asset: "asset-dev092-runtime-3", name: "A0002-M01.SLDPRT", ext: "sldprt", mime: "application/octet-stream", hash: "hash-dev092-runtime-3", role: "cad_3d", ordinal: 2 }
];
const insertAsset = fixture.prepare(`INSERT INTO file_assets (id, file_name, file_ext, mime_type, file_size, content_hash, linked_entity_type, linked_entity_id, document_category, display_name, uploaded_by)
  VALUES (@asset, @name, @ext, @mime, 128, @hash, 'drawing_revision', @revision, 'drawing', @name, @owner)`);
const insertBinding = fixture.prepare(`INSERT INTO drawing_revision_files (id, company_id, drawing_revision_id, source_file_asset_id, role, role_source, display_name, sort_order, is_primary, created_by)
  VALUES (@binding, @company, @revision, @asset, @role, 'migration', @name, @ordinal, @primary, @owner)`);
for (const row of sourceFiles) {
  insertAsset.run({ ...row, revision: ids.rdRevision, owner: ids.owner });
  insertBinding.run({ ...row, company: ids.company, revision: ids.rdRevision, owner: ids.owner, primary: row.ordinal === 0 ? 1 : 0 });
}
fixture.close();

const migration = spawnSync(process.execPath, [
  "scripts/migrate-dev-087-canonical-workbench.mjs",
  `--db=${tempPath}`,
  `--output-dir=${path.join(runDir, "migration")}`,
  "--apply",
  "--confirm-disposable-dev-087",
  "--switch-canonical-only",
  "--expected-commit=local-dev"
], { cwd: root, encoding: "utf8" });
assert.equal(migration.status, 0, migration.stderr || migration.stdout);

const db = new Database(tempPath);
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
const work = db.prepare("SELECT id, company_id FROM drawing_revision_works WHERE drawing_id = ? ORDER BY id LIMIT 1").get(ids.drawing);
assert.ok(work, "file-bearing migrated work exists");
const repository = new DrawingRevisionWorkAsyncRepository(client);
const readable = await repository.readWork(client, work.company_id, work.id);
assert.equal(readable?.id, work.id);
const fullSnapshotCount = db.prepare("SELECT COUNT(*) AS count FROM drawing_revision_work_files WHERE work_id = ?").get(work.id).count;
assert.equal(fullSnapshotCount, sourceFiles.length);
db.prepare("DELETE FROM drawing_revision_work_files WHERE work_id = ? LIMIT 1").run(work.id);
await assert.rejects(() => repository.readWork(client, work.company_id, work.id), (error) => error.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID" && error.status === 409);
client.close();
db.close();
fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify({
  devId: "DEV-092",
  status: "PASS",
  checks: 2,
  workId: work.id,
  fixture: "isolated-canonical-work-file-snapshot",
  fullSnapshotCount,
  negativeCode: "DRAWING_WORK_FILE_SNAPSHOT_INVALID",
  negativeStatus: 409,
  primaryDataMutation: false,
  cleanup: { tempRoot, repositoryDir, status: "removed" }
}, null, 2)}\n`, "utf8");
fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("DEV-092 runtime invariant: PASS (2 checks)");
