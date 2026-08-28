#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { createDrawingRecognitionSession } from "../src/lib/drawing-recognition.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

process.env.PDM_DRAWING_RECOGNITION_V1 = "1";
process.env.PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "1";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "1";

const root = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dev-092-recognition-"));
const tempPath = path.join(tempRoot, "ai-pdm.sqlite");
const evidenceDir = path.join(root, "output", "qa", "dev-092-recognition-context");
fs.mkdirSync(evidenceDir, { recursive: true });
const runId = `DEV092-recognition-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const runDir = path.join(evidenceDir, runId);
fs.mkdirSync(runDir, { recursive: true });
const repositoryDir = path.join(tempRoot, "repository");
fs.mkdirSync(repositoryDir, { recursive: true });
console.log(`DEV-092 recognition context: project=${root}; purpose=isolated exact drawing_revision source context; PDM_DATA_DIR=${tempRoot}; PDM_REPOSITORY_DIR=${repositoryDir}; mutation=task-owned fixture only; cleanup=after assertions`);

const fixture = createFixtureDatabase({ filename: tempPath, canonical: false, rdLifecycle: "preparing" });
const sourceFiles = [
  { binding: "binding-dev092-recognition-1", asset: "asset-dev092-recognition-1", name: "A0002-M01.pdf", ext: "pdf", mime: "application/pdf", hash: "hash-dev092-recognition-1", role: "pdf", ordinal: 0 },
  { binding: "binding-dev092-recognition-2", asset: "asset-dev092-recognition-2", name: "A0002-M01.SLDDRW", ext: "slddrw", mime: "application/octet-stream", hash: "hash-dev092-recognition-2", role: "drawing_2d", ordinal: 1 },
  { binding: "binding-dev092-recognition-3", asset: "asset-dev092-recognition-3", name: "A0002-M01.SLDPRT", ext: "sldprt", mime: "application/octet-stream", hash: "hash-dev092-recognition-3", role: "cad_3d", ordinal: 2 }
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

const work = db.prepare(`
  SELECT work.id, work.company_id, state.revision_id
  FROM drawing_revision_works work
  JOIN canonical_workbench_states state ON state.work_id = work.id
  WHERE work.drawing_id = ?
  ORDER BY work.id
  LIMIT 1
`).get(ids.drawing);
assert.ok(work, "file-bearing canonical work exists");

const sourceRows = db.prepare(`
  SELECT source_file_asset_id
  FROM drawing_revision_files
  WHERE drawing_revision_id = ? AND removed_at IS NULL
  ORDER BY id
`).all(work.revision_id);
const sourceAssetIds = sourceRows.map((row) => row.source_file_asset_id);
assert.equal(sourceAssetIds.length, sourceFiles.length, "fixture has three revision source assets");

const session = await createDrawingRecognitionSession({
  companyId: work.company_id,
  actorId: ids.owner,
  sourceContextType: "drawing_revision",
  sourceContextId: work.revision_id,
  sourceAssetIds,
  client
});
assert.ok(session?.id, "exact drawing_revision recognition session is created or reused");
assert.equal(session.sourceContextType, "drawing_revision");
assert.equal(session.sourceContextId, work.revision_id);

const repository = new DrawingRecognitionAsyncRepository(client);
const projection = await repository.getProjection(session.id, work.company_id);
assert.equal(projection.sources.length, sourceAssetIds.length);
assert.deepEqual(
  projection.sources.map((source) => source.fileAssetId).sort(),
  [...sourceAssetIds].sort(),
  "recognition session source set is exactly the repaired revision source set"
);

client.close();
db.close();
fs.writeFileSync(path.join(runDir, "manifest.json"), `${JSON.stringify({
  devId: "DEV-092",
  status: "PASS",
  checks: 6,
  fixture: "isolated-canonical-work-file-snapshot",
  sourceContextType: session.sourceContextType,
  sourceContextId: session.sourceContextId,
  sourceAssetIds,
  projectionSourceAssetIds: projection.sources.map((source) => source.fileAssetId),
  primaryDataMutation: false,
  cleanup: { tempRoot, repositoryDir, status: "removed" }
}, null, 2)}\n`, "utf8");
fs.rmSync(tempRoot, { recursive: true, force: true });
console.log("DEV-092 recognition context: PASS (6 checks)");
