#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRecognitionAsyncRepository } from "../src/lib/repositories/drawing-recognition-async-repository.ts";
import { createDrawingRecognitionSession } from "../src/lib/drawing-recognition.ts";

process.env.PDM_DRAWING_RECOGNITION_V1 = "1";
process.env.PDM_UNIFIED_DRAWING_WORKBENCH_V1 = "1";
process.env.PDM_NUMBER_LIFECYCLE_V2 = "1";

const root = process.cwd();
const sourcePath = path.join(root, "data", "ai-pdm.sqlite");
const tempPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dev-092-recognition-")), "ai-pdm.sqlite");
fs.copyFileSync(sourcePath, tempPath);
const db = new Database(tempPath);
const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });

const work = db.prepare(`
  SELECT work.id, work.company_id, state.revision_id
  FROM drawing_revision_works work
  JOIN canonical_workbench_states state ON state.work_id = work.id
  WHERE work.drawing_id = 'drawing-draft-drawing-58f3b735-a3fe-4c3b-87be-f2e23a15bebe'
  ORDER BY work.id
  LIMIT 1
`).get();
assert.ok(work, "A0006 canonical work exists");

const sourceRows = db.prepare(`
  SELECT source_file_asset_id
  FROM drawing_revision_files
  WHERE drawing_revision_id = ? AND removed_at IS NULL
  ORDER BY id
`).all(work.revision_id);
const sourceAssetIds = sourceRows.map((row) => row.source_file_asset_id);
assert.equal(sourceAssetIds.length, 3, "A0006 has three revision source assets");

const session = await createDrawingRecognitionSession({
  companyId: work.company_id,
  actorId: "qc-dev-092-recognition-context",
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
const runId = `DEV092-recognition-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.join(root, "output", "qa", "dev-092-recognition-context", runId);
fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(path.join(evidenceDir, "manifest.json"), `${JSON.stringify({
  devId: "DEV-092",
  status: "PASS",
  checks: 6,
  sourceContextType: session.sourceContextType,
  sourceContextId: session.sourceContextId,
  sourceAssetIds,
  projectionSourceAssetIds: projection.sources.map((source) => source.fileAssetId)
}, null, 2)}\n`, "utf8");
console.log("DEV-092 recognition context: PASS (6 checks)");
