#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import { DrawingRevisionWorkService } from "../src/lib/drawing-revision-work.ts";
import { uploadDrawingRevisionWorkFile } from "../src/lib/drawing-revision-work-file.ts";
import { collectDrawingWorkFileSnapshotAnomalies } from "../src/lib/drawing-work-file-snapshot-invariant.ts";
import { DrawingRevisionWorkAsyncRepository } from "../src/lib/repositories/drawing-revision-work-async-repository.ts";
import { createFixtureDatabase, ids } from "./qc-dev-087-fixtures.mjs";

const root = process.cwd();
const runId = `DEV100-repository-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV100_EVIDENCE_DIR ?? path.join(root, "output", "qa", "dev-100", runId));
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev100-repository-"));
const baseDataDir = path.join(taskRoot, "base-data");
const baseRepositoryDir = path.join(taskRoot, "base-repository");
const baseDbPath = path.join(baseDataDir, "ai-pdm.sqlite");
const checks = [];
let firstFailure = null;

fs.mkdirSync(baseDataDir, { recursive: true });
fs.mkdirSync(baseRepositoryDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });
console.log(JSON.stringify({ runtimeDeclaration: {
  project: root,
  purpose: "DEV-100 SQLite repository transition, fault, retry, negative and mutant evidence",
  port: null,
  owningProcessTree: "this Node runner only",
  cleanupCondition: "all clients closed and task-owned fixture root removed",
  PDM_DATA_DIR: baseDataDir,
  PDM_REPOSITORY_DIR: baseRepositoryDir,
  mutationScope: taskRoot
} }));

function sha256(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} failed`);
  return result;
}
async function check(id, label, fn) {
  try {
    const detail = await fn();
    checks.push({ id, label, status: "PASS", detail: detail ?? null });
    console.log(`PASS ${id} ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    checks.push({ id, label, status: "FAIL", message });
    throw error;
  }
}

function repositoryFiles(repositoryDir) {
  if (!fs.existsSync(repositoryDir)) return [];
  return fs.readdirSync(repositoryDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = path.join(entry.parentPath, entry.name);
      return { path: path.relative(repositoryDir, fullPath).replaceAll("\\", "/"), sha256: sha256(fs.readFileSync(fullPath)) };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function snapshot(db, workId, repositoryDir) {
  return {
    work: db.prepare("SELECT id,row_version FROM drawing_revision_works WHERE id=?").get(workId),
    bindings: db.prepare("SELECT * FROM drawing_revision_work_files WHERE work_id=? ORDER BY ordinal,file_binding_id").all(workId),
    files: db.prepare(`SELECT file.* FROM drawing_revision_files file JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id WHERE state.work_id=? ORDER BY file.created_at,file.id`).all(workId),
    assets: db.prepare(`SELECT asset.* FROM file_assets asset JOIN drawing_revision_files file ON file.source_file_asset_id=asset.id JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id WHERE state.work_id=? ORDER BY asset.created_at,asset.id`).all(workId),
    receipts: db.prepare("SELECT command_name,idempotency_key,command_status,response_json FROM platform_command_receipts WHERE effect_key LIKE ? ORDER BY idempotency_key").all(`drawing-work:${workId}:%`),
    repositoryFiles: repositoryFiles(repositoryDir)
  };
}

function activeRows(db, workId) {
  return db.prepare(`SELECT binding.ordinal,file.id,asset.file_name,file.role,file.is_primary,asset.content_hash,asset.storage_key
    FROM drawing_revision_work_files binding
    JOIN drawing_revision_files file ON file.id=binding.file_binding_id
    JOIN file_assets asset ON asset.id=file.source_file_asset_id
    WHERE binding.work_id=? AND file.removed_at IS NULL AND asset.deleted_at IS NULL
    ORDER BY binding.ordinal,file.id`).all(workId);
}

function tombstones(db, workId) {
  return db.prepare(`SELECT file.id,asset.file_name,file.role,file.removed_at,file.removed_by,asset.deleted_at,asset.deleted_by,asset.deleted_reason,asset.storage_key,asset.content_hash
    FROM drawing_revision_files file
    JOIN file_assets asset ON asset.id=file.source_file_asset_id
    JOIN canonical_workbench_states state ON state.revision_id=file.drawing_revision_id
    WHERE state.work_id=? AND file.removed_at IS NOT NULL ORDER BY file.created_at,file.id`).all(workId);
}

function assertPhysicalRows(rows, repositoryDir) {
  for (const row of rows) {
    assert.ok(row.storage_key, `${row.file_name} storage key exists`);
    const filePath = path.join(repositoryDir, ...String(row.storage_key).split("/"));
    assert.equal(fs.existsSync(filePath), true, `${row.file_name} bytes exist`);
    assert.equal(sha256(fs.readFileSync(filePath)), row.content_hash, `${row.file_name} bytes hash matches`);
  }
}

const owner = { id: ids.owner, companyId: ids.company, canEditNonOwned: false, permissions: { create: true, update: true, submit: true, cancel: true, decide: false, obsolete: true } };
let baseWorkId = "";

function createBase() {
  process.env.PDM_DATA_DIR = baseDataDir;
  process.env.PDM_REPOSITORY_DIR = baseRepositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  const fixture = createFixtureDatabase({ filename: baseDbPath, canonical: false, rdLifecycle: "preparing" });
  fixture.close();
  run(process.execPath, [
    "scripts/migrate-dev-087-canonical-workbench.mjs",
    `--db=${baseDbPath}`,
    `--output-dir=${path.join(evidenceDir, "migration")}`,
    "--apply",
    "--confirm-disposable-dev-087",
    "--switch-canonical-only",
    "--expected-commit=local-dev"
  ]);
  const db = new Database(baseDbPath, { readonly: true });
  baseWorkId = db.prepare("SELECT id FROM drawing_revision_works WHERE drawing_id=? ORDER BY id LIMIT 1").get(ids.drawing)?.id ?? "";
  db.close();
  assert.ok(baseWorkId, "migrated zero-file work exists");
}

async function withScenario(name, fn) {
  const scenarioRoot = path.join(taskRoot, name);
  const dataDir = path.join(scenarioRoot, "data");
  const repositoryDir = path.join(scenarioRoot, "repository");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.cpSync(baseDbPath, path.join(dataDir, "ai-pdm.sqlite"));
  fs.cpSync(baseRepositoryDir, repositoryDir, { recursive: true });
  process.env.PDM_DATA_DIR = dataDir;
  process.env.PDM_REPOSITORY_DIR = repositoryDir;
  process.env.PDM_DB_PROVIDER = "sqlite";
  const db = new Database(path.join(dataDir, "ai-pdm.sqlite"));
  const client = createAsyncDatabaseClient({ kind: "sqlite", database: db });
  const service = new DrawingRevisionWorkService(client);
  const repository = new DrawingRevisionWorkAsyncRepository(client);
  try {
    const initial = await service.read(baseWorkId, owner);
    return await fn({ db, client, service, repository, workId: baseWorkId, token: initial.meta.contractToken, repositoryDir, initial });
  } finally {
    await client.close();
    try { db.close(); } catch { /* async adapter may own the SQLite close. */ }
  }
}

async function upload(ctx, fileName, body, key, rowVersion) {
  return ctx.service.uploadFile(ctx.workId, { file: new File([body], fileName, { type: "application/octet-stream" }) }, owner, {
    idempotencyKey: key,
    contractToken: ctx.token,
    expectedRowVersion: rowVersion
  });
}

async function assertSnapshot409(ctx) {
  const before = snapshot(ctx.db, ctx.workId, ctx.repositoryDir);
  await assert.rejects(() => ctx.repository.readWork(ctx.client, ids.company, ctx.workId), (error) => error?.code === "DRAWING_WORK_FILE_SNAPSHOT_INVALID" && error?.status === 409);
  const after = snapshot(ctx.db, ctx.workId, ctx.repositoryDir);
  assert.deepEqual(after, before, "read failure is mutation-free");
}

async function main() {
  createBase();

  await check("QA-100-002", "migrated SLDASM to SLDASM replacement is immediately readable", () => withScenario("case-002", async (ctx) => {
    const first = await upload(ctx, "A.SLDASM", "ASSEMBLY-A", "002-a", ctx.initial.data.rowVersion);
    const second = await upload(ctx, "B.SLDASM", "ASSEMBLY-B", "002-b", first.rowVersion);
    const readback = await ctx.service.read(ctx.workId, owner);
    assert.deepEqual(readback.data.files.map((file) => file.file_name), ["B.SLDASM"]);
    const active = activeRows(ctx.db, ctx.workId);
    const retired = tombstones(ctx.db, ctx.workId);
    assert.deepEqual(active.map((row) => row.file_name), ["B.SLDASM"]);
    assert.equal(retired.find((row) => row.file_name === "A.SLDASM")?.deleted_reason, "drawing_revision_work_file_replaced");
    assertPhysicalRows([...active, ...retired], ctx.repositoryDir);
    return { rowVersion: second.rowVersion, active: active.map((row) => row.file_name), tombstones: retired.map((row) => row.file_name) };
  }));

  await check("QA-100-003", "migrated SLDPRT to SLDASM shares cad_3d last-wins authority", () => withScenario("case-003", async (ctx) => {
    const first = await upload(ctx, "A.SLDPRT", "PART-A", "003-a", ctx.initial.data.rowVersion);
    await upload(ctx, "B.SLDASM", "ASSEMBLY-B", "003-b", first.rowVersion);
    const active = activeRows(ctx.db, ctx.workId);
    assert.deepEqual(active.map((row) => [row.file_name, row.role]), [["B.SLDASM", "cad_3d"]]);
    assert.equal(tombstones(ctx.db, ctx.workId)[0]?.deleted_reason, "drawing_revision_work_file_replaced");
    await ctx.service.read(ctx.workId, owner);
    return { active: active.map((row) => row.file_name) };
  }));

  await check("QA-100-004", "SLDDRW replacement leaves 3D and PDF bindings intact", () => withScenario("case-004", async (ctx) => {
    let version = ctx.initial.data.rowVersion;
    for (const [name, body, key] of [["A.SLDPRT", "3D", "004-3d"], ["A.pdf", "PDF", "004-pdf"], ["A.SLDDRW", "2D-A", "004-a"]]) {
      version = (await upload(ctx, name, body, key, version)).rowVersion;
    }
    await upload(ctx, "B.SLDDRW", "2D-B", "004-b", version);
    const active = activeRows(ctx.db, ctx.workId);
    assert.deepEqual(active.map((row) => row.file_name).sort(), ["A.SLDPRT", "A.pdf", "B.SLDDRW"].sort());
    assert.equal(tombstones(ctx.db, ctx.workId).find((row) => row.file_name === "A.SLDDRW")?.deleted_reason, "drawing_revision_work_file_replaced");
    await ctx.service.read(ctx.workId, owner);
    return { active: active.map((row) => row.file_name) };
  }));

  await check("QA-100-005", "different-role uploads coexist with correct ordered hashes", () => withScenario("case-005", async (ctx) => {
    let version = ctx.initial.data.rowVersion;
    for (const [name, body, key] of [["A.SLDDRW", "2D", "005-2d"], ["A.SLDPRT", "3D", "005-3d"], ["A.pdf", "PDF", "005-pdf"]]) {
      version = (await upload(ctx, name, body, key, version)).rowVersion;
    }
    const active = activeRows(ctx.db, ctx.workId);
    assert.deepEqual(active.map((row) => row.role), ["drawing_2d", "cad_3d", "pdf"]);
    assert.equal(tombstones(ctx.db, ctx.workId).length, 0);
    assertPhysicalRows(active, ctx.repositoryDir);
    return { roles: active.map((row) => row.role) };
  }));

  await check("QA-100-006", "zero, one, non-primary remove and primary lock remain legal", () => withScenario("case-006", async (ctx) => {
    assert.equal(ctx.initial.data.files.length, 0);
    const pdf = await upload(ctx, "A.pdf", "PDF", "006-pdf", ctx.initial.data.rowVersion);
    assert.equal((await ctx.service.read(ctx.workId, owner)).data.files.length, 1);
    await ctx.service.removeFile(ctx.workId, pdf.file.id, owner, { idempotencyKey: "006-remove", contractToken: ctx.token, expectedRowVersion: pdf.rowVersion });
    const afterRemove = await ctx.service.read(ctx.workId, owner);
    assert.equal(afterRemove.data.files.length, 0);
    assert.equal(tombstones(ctx.db, ctx.workId).find((row) => row.file_name === "A.pdf")?.deleted_reason, "drawing_revision_work_file_removed");
    const primary = await upload(ctx, "A.SLDASM", "3D", "006-primary", afterRemove.data.rowVersion);
    await assert.rejects(() => ctx.service.removeFile(ctx.workId, primary.file.id, owner, { idempotencyKey: "006-primary-remove", contractToken: ctx.token, expectedRowVersion: primary.rowVersion }), (error) => error?.code === "DRAWING_REVISION_FILE_PRIMARY_LOCKED" && error?.status === 409);
    return { legalStates: [0, 1, 0, 1], primaryRemove: 409 };
  }));

  await check("QA-100-007", "active missing and active deleted assets fail closed without mutation", async () => {
    for (const kind of ["missing", "deleted"]) await withScenario(`case-007-${kind}`, async (ctx) => {
      await upload(ctx, "A.SLDASM", "3D", `007-${kind}`, ctx.initial.data.rowVersion);
      const active = activeRows(ctx.db, ctx.workId)[0];
      if (kind === "deleted") ctx.db.prepare("UPDATE file_assets SET deleted_at=CURRENT_TIMESTAMP,deleted_by=?,deleted_reason='injected' WHERE storage_key=?").run(ids.owner, active.storage_key);
      else {
        ctx.db.pragma("foreign_keys = OFF");
        ctx.db.prepare("UPDATE drawing_revision_files SET source_file_asset_id='missing-dev100-asset' WHERE id=?").run(active.id);
      }
      await assertSnapshot409(ctx);
    });
    return { injected: ["active_asset_missing", "active_asset_deleted"], status: 409 };
  });

  await check("QA-100-008", "missing and extra work bindings fail closed", async () => {
    await withScenario("case-008-missing", async (ctx) => {
      await upload(ctx, "A.SLDASM", "3D", "008-missing", ctx.initial.data.rowVersion);
      ctx.db.prepare("DELETE FROM drawing_revision_work_files WHERE work_id=?").run(ctx.workId);
      await assertSnapshot409(ctx);
    });
    await withScenario("case-008-extra", async (ctx) => {
      await upload(ctx, "A.SLDASM", "3D", "008-extra", ctx.initial.data.rowVersion);
      const work = ctx.db.prepare("SELECT revision_id FROM canonical_workbench_states WHERE work_id=?").get(ctx.workId);
      const assetId = "FA-dev100-extra"; const fileId = "file-dev100-extra";
      ctx.db.prepare("INSERT INTO file_assets(id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id,document_category,display_name,uploaded_by,deleted_at,deleted_by,deleted_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,'drawing_revision_work_file_removed')")
        .run(assetId, "extra.pdf", "pdf", "application/pdf", 5, "extra-hash", "drawing_revision", work.revision_id, "pdf", "extra.pdf", ids.owner, ids.owner);
      ctx.db.prepare("INSERT INTO drawing_revision_files(id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,display_name,sort_order,is_primary,created_by,removed_at,removed_by) VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)")
        .run(fileId, ids.company, work.revision_id, assetId, "pdf", "extension", "extra.pdf", 1, 0, ids.owner, ids.owner);
      ctx.db.prepare("INSERT INTO drawing_revision_work_files(work_id,file_binding_id,ordinal,content_hash) VALUES(?,?,?,?)").run(ctx.workId, fileId, 1, "extra-hash");
      await assertSnapshot409(ctx);
    });
    return { injected: ["missing_binding", "extra_binding"], status: 409 };
  });

  await check("QA-100-009", "hash, scope, revision and ordinal drifts are independently detected", async () => {
    for (const kind of ["hash", "ordinal"]) await withScenario(`case-009-${kind}`, async (ctx) => {
      await upload(ctx, "A.SLDASM", "3D", `009-${kind}`, ctx.initial.data.rowVersion);
      const active = activeRows(ctx.db, ctx.workId)[0];
      if (kind === "hash") ctx.db.prepare("UPDATE drawing_revision_work_files SET content_hash='drift' WHERE work_id=? AND file_binding_id=?").run(ctx.workId, active.id);
      if (kind === "ordinal") ctx.db.prepare("UPDATE drawing_revision_work_files SET ordinal=7 WHERE work_id=? AND file_binding_id=?").run(ctx.workId, active.id);
      await assertSnapshot409(ctx);
    });
    const source = { id: "file", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset", sort_order: 0, removed_at: null, removed_by: null, asset_id: "asset", content_hash: "hash", deleted_at: null, deleted_by: null, deleted_reason: null };
    const actual = { work_id: "work", file_binding_id: "file", ordinal: 0, content_hash: "hash", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset", removed_at: null, asset_id: "asset", asset_content_hash: "hash", deleted_at: null };
    for (const [kind, patch] of [["company", { company_id: "other" }], ["drawing", { drawing_id: "other" }], ["revision", { drawing_revision_id: "other" }]]) {
      const anomalies = collectDrawingWorkFileSnapshotAnomalies({ scope: { id: "work", companyId: "company", drawingId: "drawing", revisionId: "revision", migrated: true }, sourceRows: [source], actualRows: [{ ...actual, ...patch }] });
      assert.ok(anomalies.includes(kind === "revision" ? "revision_scope_mismatch" : "scope_mismatch"), `${kind} drift detected`);
    }
    return { injected: ["hash", "ordinal", "revision", "company", "drawing"], status: 409 };
  });

  await check("QA-100-010", "all named upload checkpoints rollback atomically", async () => {
    const points = ["before_tombstone", "after_binding_switch", "before_row_version", "before_readback"];
    for (const point of points) await withScenario(`case-010-${point}`, async (ctx) => {
      const first = await upload(ctx, "A.SLDASM", "3D-A", `010-${point}-a`, ctx.initial.data.rowVersion);
      const before = snapshot(ctx.db, ctx.workId, ctx.repositoryDir);
      await assert.rejects(() => uploadDrawingRevisionWorkFile({
        client: ctx.client,
        workId: ctx.workId,
        file: new File(["3D-B"], "B.SLDASM", { type: "application/octet-stream" }),
        actor: owner,
        context: { idempotencyKey: `010-${point}-b`, contractToken: ctx.token, expectedRowVersion: first.rowVersion },
        checkpoint: (current) => { if (current === point) throw new Error(`DEV100_FAILPOINT_${point}`); }
      }), new RegExp(`DEV100_FAILPOINT_${point}`));
      assert.deepEqual(snapshot(ctx.db, ctx.workId, ctx.repositoryDir), before, `${point} rollback includes DB, receipt and bytes`);
      assert.deepEqual((await ctx.service.read(ctx.workId, owner)).data.files.map((file) => file.file_name), ["A.SLDASM"]);
    });
    return { points, result: "full rollback" };
  });

  await check("QA-100-011", "response-loss replay is exactly-once and stale controls reject", () => withScenario("case-011", async (ctx) => {
    const first = await upload(ctx, "A.SLDASM", "3D-A", "011-a", ctx.initial.data.rowVersion);
    const request = { file: new File(["3D-B"], "B.SLDASM", { type: "application/octet-stream" }) };
    const context = { idempotencyKey: "011-b", contractToken: ctx.token, expectedRowVersion: first.rowVersion };
    const second = await ctx.service.uploadFile(ctx.workId, request, owner, context);
    const replay = await ctx.service.uploadFile(ctx.workId, { file: new File(["3D-B"], "B.SLDASM", { type: "application/octet-stream" }) }, owner, context);
    assert.deepEqual(replay, second);
    await assert.rejects(() => upload(ctx, "C.SLDASM", "3D-C", "011-stale", first.rowVersion), (error) => error?.code === "WORKBENCH_ROW_VERSION_CONFLICT");
    await assert.rejects(() => ctx.service.uploadFile(ctx.workId, { file: new File(["DIFFERENT"], "C.SLDASM") }, owner, context), (error) => error?.code === "IDEMPOTENCY_KEY_REUSED");
    assert.deepEqual(activeRows(ctx.db, ctx.workId).map((row) => row.file_name), ["B.SLDASM"]);
    assert.equal(tombstones(ctx.db, ctx.workId).filter((row) => row.file_name === "A.SLDASM").length, 1);
    return { replayRowVersion: replay.rowVersion, active: "B.SLDASM", duplicateReplacement: 0 };
  }));

  await check("QA-100-012", "SQLite full matrix, new-work behavior, FK and identity gates pass", async () => {
    await withScenario("case-012-new", async (ctx) => {
      const work = ctx.db.prepare("SELECT proposed_payload FROM drawing_revision_works WHERE id=?").get(ctx.workId);
      const payload = JSON.parse(work.proposed_payload);
      payload.migrated = false;
      ctx.db.prepare("UPDATE drawing_revision_works SET proposed_payload=? WHERE id=?").run(JSON.stringify(payload), ctx.workId);
      const first = await upload(ctx, "A.SLDPRT", "NEW-A", "012-a", ctx.initial.data.rowVersion);
      await upload(ctx, "B.SLDASM", "NEW-B", "012-b", first.rowVersion);
      assert.deepEqual((await ctx.service.read(ctx.workId, owner)).data.files.map((file) => file.file_name), ["B.SLDASM"]);
      assert.equal(ctx.db.pragma("foreign_key_check").length, 0);
      assert.equal(ctx.db.prepare("SELECT COUNT(*) count FROM companies WHERE id=?").get(ids.company).count, 1);
      assert.equal(ctx.db.prepare("SELECT COUNT(*) count FROM drawings WHERE id=?").get(ids.drawing).count, 1);
    });
    return { provider: "sqlite", previousCases: checks.filter((entry) => entry.status === "PASS").length, foreignKeys: 0, canonicalIdentity: "unchanged" };
  });

  await check("QA-100-016", "old-validator and skip-all-deleted mutants are killed", async () => {
    const scope = { id: "work", companyId: "company", drawingId: "drawing", revisionId: "revision", migrated: true };
    const old = { id: "old", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset-old", sort_order: 0, removed_at: "2026-01-01", removed_by: "actor", asset_id: "asset-old", content_hash: "old-hash", deleted_at: "2026-01-01", deleted_by: "actor", deleted_reason: "drawing_revision_work_file_replaced" };
    const current = { ...old, id: "current", source_file_asset_id: "asset-current", asset_id: "asset-current", content_hash: "current-hash", removed_at: null, removed_by: null, deleted_at: null, deleted_by: null, deleted_reason: null };
    const actual = { work_id: "work", file_binding_id: "current", ordinal: 0, content_hash: "current-hash", company_id: "company", drawing_id: "drawing", drawing_revision_id: "revision", source_file_asset_id: "asset-current", removed_at: null, asset_id: "asset-current", asset_content_hash: "current-hash", deleted_at: null };
    assert.deepEqual(collectDrawingWorkFileSnapshotAnomalies({ scope, sourceRows: [old, current], actualRows: [actual] }), []);
    const oldValidatorMutant = [old, current].some((row) => row.removed_at !== null || row.deleted_at !== null);
    assert.equal(oldValidatorMutant, true, "same-role legal replacement kills old reject-all-tombstones mutant");
    const activeDeleted = { ...current, deleted_at: "2026-01-01", deleted_by: "actor", deleted_reason: "injected" };
    const actualDeleted = { ...actual, deleted_at: "2026-01-01" };
    assert.ok(collectDrawingWorkFileSnapshotAnomalies({ scope, sourceRows: [activeDeleted], actualRows: [actualDeleted] }).length > 0);
    const skipAllDeletedMutant = collectDrawingWorkFileSnapshotAnomalies({ scope, sourceRows: [activeDeleted].filter((row) => !row.deleted_at), actualRows: [actualDeleted].filter((row) => !row.deleted_at) });
    assert.deepEqual(skipAllDeletedMutant, [], "active-deleted negative kills skip-all-deleted mutant");
    return { oldValidatorMutant: "KILLED", skipAllDeletedMutant: "KILLED" };
  });
}

try { await main(); } catch (error) { firstFailure = error instanceof Error ? error.stack ?? error.message : String(error); }
finally {
  try { fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 }); } catch { /* manifest records cleanup verification below */ }
}

const result = {
  runner: "repository",
  provider: "sqlite",
  runId,
  status: !firstFailure && checks.every((entry) => entry.status === "PASS") ? "PASS" : "FAIL",
  checks,
  firstFailure,
  productionWrites: false,
  cleanup: { taskRoot, removed: !fs.existsSync(taskRoot), ports: [] }
};
fs.writeFileSync(path.join(evidenceDir, "repository.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ runner: result.runner, status: result.status, passed: checks.filter((entry) => entry.status === "PASS").length, total: checks.length, cleanup: result.cleanup }));
if (result.status !== "PASS") process.exitCode = 1;
