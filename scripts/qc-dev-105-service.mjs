#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import Database from "better-sqlite3";

import { createAsyncDatabaseClient } from "../src/lib/db-async-provider.ts";
import {
  ensureAutomaticPreviewJobsForSourceAssetsAsync,
  getPreviewDerivativeBytesForSourceAssetAsync
} from "../src/lib/preview-derivatives.ts";
import { resolveCanonicalDrawingPreview } from "../src/lib/pdm-canonical-preview.ts";

const root = process.cwd();
const runId = process.env.DEV105_RUN_ID?.trim() || `DEV105-service-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
const evidenceDir = path.resolve(process.env.DEV105_EVIDENCE_DIR || path.join(root, "output", "qa", "dev-105-3d-preview", runId));
const canaryDir = path.join(evidenceDir, "canaries");
const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pdm-dev105-service-"));
const serviceDataDir = path.join(taskRoot, "service-data");
const serviceRepositoryDir = path.join(taskRoot, "service-repository");
const backfillDataDir = path.join(taskRoot, "backfill-data");
const backfillRepositoryDir = path.join(taskRoot, "backfill-repository");
const primaryDbPath = path.join(root, "data", "ai-pdm.sqlite");
const checks = [];
const fixtureMutationLedger = [];
const originalEnv = new Map([
  ["PDM_DATA_DIR", process.env.PDM_DATA_DIR],
  ["PDM_REPOSITORY_DIR", process.env.PDM_REPOSITORY_DIR],
  ["PDM_DB_PROVIDER", process.env.PDM_DB_PROVIDER],
  ["PDM_LOCAL_FAKE_PREVIEW_WORKER", process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER]
]);
let primaryBefore = null;
let primaryAfter = null;
let cleanup = { taskRootRemoved: false };
let fatalError = null;

fs.mkdirSync(evidenceDir, { recursive: true });
fs.mkdirSync(canaryDir, { recursive: true });
fs.mkdirSync(serviceDataDir, { recursive: true });
fs.mkdirSync(serviceRepositoryDir, { recursive: true });
fs.mkdirSync(backfillDataDir, { recursive: true });
fs.mkdirSync(backfillRepositoryDir, { recursive: true });

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function invariant(databasePath) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  database.pragma("query_only = ON");
  try {
    const payload = {
      schema: database.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
        WHERE type IN ('table','index','trigger')
          AND tbl_name IN ('part_roots','part_numbers','drawing_numbers','drawings','drawing_revisions','drawing_revision_files','drawing_revision_works','drawing_revision_work_files','canonical_workbench_states')
        ORDER BY type,name`).all(),
      roots: database.prepare("SELECT id,company_id,root_code FROM part_roots ORDER BY id").all(),
      parts: database.prepare("SELECT id,company_id,part_root_id,part_number FROM part_numbers ORDER BY id").all(),
      drawings: database.prepare("SELECT id,company_id,part_root_id,drawing_number FROM drawings ORDER BY id").all(),
      rootReferenceOrphans: {
        parts: database.prepare("SELECT COUNT(*) count FROM part_numbers part LEFT JOIN part_roots root ON root.id=part.part_root_id AND root.company_id=part.company_id WHERE part.part_root_id IS NOT NULL AND root.id IS NULL").get().count,
        drawings: database.prepare("SELECT COUNT(*) count FROM drawings drawing LEFT JOIN part_roots root ON root.id=drawing.part_root_id AND root.company_id=drawing.company_id WHERE drawing.part_root_id IS NOT NULL AND root.id IS NULL").get().count
      },
      migrationResidue: database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%' ORDER BY name").all(),
      foreignKeys: database.pragma("foreign_key_check")
    };
    return {
      hash: sha256(JSON.stringify(payload)),
      counts: { roots: payload.roots.length, parts: payload.parts.length, drawings: payload.drawings.length },
      rootReferenceOrphans: payload.rootReferenceOrphans,
      migrationResidue: payload.migrationResidue,
      foreignKeys: payload.foreignKeys
    };
  } finally {
    database.close();
  }
}

async function backupDatabase(targetPath) {
  const source = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(targetPath);
  } finally {
    source.close();
  }
}

function record(id, name, condition, detail = null) {
  const passed = Boolean(condition);
  checks.push({ id, name, passed, detail });
  if (!passed) throw new Error(`${id} ${name}${detail ? `: ${JSON.stringify(detail)}` : ""}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: options.env || process.env,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${options.label || path.basename(command)} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
  }
  return result;
}

function nativeSources(database) {
  return database.prepare(`SELECT drawing.drawing_number,revision.revision,asset.id,asset.file_name,asset.file_ext,
      asset.original_path,asset.storage_key,asset.content_hash
    FROM drawing_revision_files binding
    JOIN drawing_revisions revision ON revision.id=binding.drawing_revision_id
    JOIN drawings drawing ON drawing.id=revision.drawing_id
    JOIN file_assets asset ON asset.id=binding.source_file_asset_id
    WHERE binding.removed_at IS NULL AND asset.deleted_at IS NULL
      AND lower(asset.file_ext) IN ('sldprt','sldasm')
    ORDER BY drawing.drawing_number`).all();
}

function previewJobs(database, sourceFileAssetId) {
  return database.prepare("SELECT * FROM preview_jobs WHERE source_file_asset_id=? ORDER BY created_at,id").all(sourceFileAssetId);
}

function readyDerivatives(database, sourceFileAssetId) {
  return database.prepare("SELECT * FROM file_derivatives WHERE source_file_asset_id=? AND status='ready' ORDER BY created_at,id").all(sourceFileAssetId);
}

function insertDerivative(database, input) {
  database.prepare(`INSERT INTO file_derivatives (
      id,company_id,source_file_asset_id,source_content_hash,derivative_kind,storage_provider,storage_key,original_path,
      file_name,mime_type,file_size,content_hash,width,height,generator_profile,generator_version,preview_job_id,status,created_by_worker,metadata_json
    ) VALUES (
      @id,'company-jenfu',@sourceFileAssetId,@sourceContentHash,'thumbnail_png','local_repository',@storageKey,@originalPath,
      @fileName,'image/png',@fileSize,@contentHash,1,1,@generatorProfile,@generatorVersion,@previewJobId,'ready','dev105-qc','{}'
    )`).run(input);
}

function runBackfill(databasePath, repositoryDir, args, outputName) {
  const outputPath = path.join(evidenceDir, outputName);
  const result = run(process.execPath, [
    "--conditions=react-server",
    "--experimental-transform-types",
    "--experimental-loader", "./scripts/qc-ts-path-loader.mjs",
    "scripts/backfill-dev-105-preview-jobs.mjs",
    "--database", databasePath,
    "--output", outputPath,
    ...args
  ], {
    label: outputName,
    env: {
      ...process.env,
      PDM_DB_PROVIDER: "sqlite",
      PDM_DATA_DIR: path.dirname(databasePath),
      PDM_REPOSITORY_DIR: repositoryDir,
      PDM_LOCAL_FAKE_PREVIEW_WORKER: ""
    }
  });
  return { report: JSON.parse(fs.readFileSync(outputPath, "utf8")), stdout: result.stdout };
}

try {
  primaryBefore = invariant(primaryDbPath);
  record("QA-105-018", "primary preflight has clean roots and foreign keys",
    primaryBefore.foreignKeys.length === 0 && Object.values(primaryBefore.rootReferenceOrphans).every((value) => value === 0),
    primaryBefore);

  const primary = new Database(primaryDbPath, { readonly: true, fileMustExist: true });
  primary.pragma("query_only = ON");
  const sourceRows = nativeSources(primary);
  primary.close();
  for (const drawingNumber of ["A0002-M01", "A0006-M01", "A0044-M01"]) {
    const source = sourceRows.find((row) => row.drawing_number === drawingNumber);
    record(`QA-105-00${drawingNumber === "A0002-M01" ? 7 : drawingNumber === "A0006-M01" ? 8 : 9}`,
      `${drawingNumber} current native source is physically readable`, Boolean(source?.original_path && fs.existsSync(source.original_path)),
      source ? { drawingNumber, fileName: source.file_name, sourceSha256: source.content_hash } : null);
    const outputPath = path.join(canaryDir, `${drawingNumber}.png`);
    const result = run(process.execPath, ["scripts/run-windows-shell-preview-worker.mjs", "--source", source.original_path, "--out", outputPath, "--size", "512"], { label: `${drawingNumber} canary` });
    const payload = JSON.parse(result.stdout);
    const pngBytes = fs.readFileSync(outputPath);
    const qualityPass = pngBytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a"
      && payload.quality?.visiblePixels >= 100
      && (payload.quality?.uniqueColorBuckets >= 8 || payload.quality?.luminanceVariance >= 180);
    const id = drawingNumber === "A0002-M01" ? "QA-105-007" : drawingNumber === "A0006-M01" ? "QA-105-008" : "QA-105-009";
    record(id, `${drawingNumber} real Windows source-mode PNG passes quality gate`, qualityPass, {
      drawingNumber,
      fileName: source.file_name,
      sourceSha256: source.content_hash,
      pngSha256: sha256(pngBytes),
      pngBytes: pngBytes.byteLength,
      quality: payload.quality
    });
  }

  const extractorParser = run("powershell.exe", ["-NoProfile", "-Command", "$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/windows-shell-thumbnail-extractor.ps1'),[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{$_.Message};exit 1}"], { label: "extractor parser" });
  const launcherParser = run("powershell.exe", ["-NoProfile", "-Command", "$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'scripts/start-localhost-3000.ps1'),[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|ForEach-Object{$_.Message};exit 1}"], { label: "launcher parser" });
  const launcherSource = fs.readFileSync(path.join(root, "scripts", "start-localhost-3000.ps1"), "utf8");
  record("QA-105-011", "launcher separates process health from fresh renderer capability",
    extractorParser.status === 0 && launcherParser.status === 0
      && launcherSource.includes("Test-PreviewWorkerCapabilityReady")
      && launcherSource.includes("previewWorkerCapabilityFresh")
      && launcherSource.includes("renderer capability is not ready"));

  const serviceDbPath = path.join(serviceDataDir, "ai-pdm.sqlite");
  await backupDatabase(serviceDbPath);
  record("QA-105-018", "service fixture starts from an unmodified authoritative snapshot", invariant(serviceDbPath).hash === primaryBefore.hash);
  Object.assign(process.env, {
    PDM_DB_PROVIDER: "sqlite",
    PDM_DATA_DIR: serviceDataDir,
    PDM_REPOSITORY_DIR: serviceRepositoryDir,
    PDM_LOCAL_FAKE_PREVIEW_WORKER: ""
  });
  const serviceDatabase = new Database(serviceDbPath);
  serviceDatabase.pragma("foreign_keys = ON");
  const client = createAsyncDatabaseClient({ kind: "sqlite", database: serviceDatabase });
  const actorUserId = serviceDatabase.prepare("SELECT id FROM users WHERE company_id='company-jenfu' AND account_status='active' ORDER BY CASE WHEN role='Admin' THEN 0 ELSE 1 END,created_at LIMIT 1").get().id;
  const a0002 = nativeSources(serviceDatabase).find((row) => row.drawing_number === "A0002-M01");
  const a0044 = nativeSources(serviceDatabase).find((row) => row.drawing_number === "A0044-M01" && previewJobs(serviceDatabase, row.id).some((job) => job.status === "succeeded") && readyDerivatives(serviceDatabase, row.id).length > 0);
  if (!a0002 || !a0044) throw new Error("DEV105_NATIVE_FIXTURE_ROWS_MISSING");
  serviceDatabase.prepare("DELETE FROM file_derivatives WHERE source_file_asset_id=?").run(a0002.id);
  serviceDatabase.prepare("DELETE FROM preview_jobs WHERE source_file_asset_id=?").run(a0002.id);
  fixtureMutationLedger.push({ mutation: "clear A0002 preview artifacts in isolated service fixture to model a silent gap", sourceFileAssetId: a0002.id });
  const noSourceProjection = resolveCanonicalDrawingPreview({
    source: null,
    derivativeJobs: [],
    identity: { drawingNumber: "A0099-M01", revision: "A", sourceLabel: "3D 模型" }
  });
  record("QA-105-024", "no-source projection remains explicit and never masquerades as primary manufacturing drawing",
    noSourceProjection.state === "missing"
      && noSourceProjection.sourceType === "none"
      && noSourceProjection.sourceLabel === "無預覽來源"
      && noSourceProjection.sourceDrawingNumber === "A0099-M01",
    noSourceProjection);
  record("QA-105-003", "A0002 fixture begins as a true silent gap", previewJobs(serviceDatabase, a0002.id).length === 0);
  const first = await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0002.id], actorUserId });
  let jobs = previewJobs(serviceDatabase, a0002.id);
  record("QA-105-003", "detail recovery creates exactly one current-hash queued job",
    first[0]?.disposition === "queued" && jobs.length === 1 && jobs[0].status === "queued" && jobs[0].source_content_hash === a0002.content_hash,
    { preparation: first, jobId: jobs[0]?.id });
  const firstJobId = jobs[0].id;
  for (let index = 0; index < 3; index += 1) {
    await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0002.id], actorUserId });
  }
  jobs = previewJobs(serviceDatabase, a0002.id);
  record("QA-105-002", "three repeated detail preparations keep one idempotent job", jobs.length === 1 && jobs[0].id === firstJobId);

  serviceDatabase.prepare("UPDATE preview_jobs SET status='succeeded',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(firstJobId);
  serviceDatabase.prepare("DELETE FROM file_derivatives WHERE source_file_asset_id=?").run(a0002.id);
  await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0002.id], actorUserId });
  jobs = previewJobs(serviceDatabase, a0002.id);
  record("QA-105-005", "succeeded job with missing derivative is requeued on the same key", jobs.length === 1 && jobs[0].id === firstJobId && jobs[0].status === "queued");

  serviceDatabase.prepare(`INSERT INTO preview_jobs (
      id,company_id,source_file_asset_id,source_content_hash,requested_kind,source_extension,status,priority,attempt_count,
      idempotency_key,generator_profile,created_by,created_at,updated_at,metadata_json
    ) VALUES (
      'DEV105-historical-newer','company-jenfu',?,?,'native_thumbnail_png','sldprt','failed',100,1,
      'DEV105-historical-newer-key','windows_solidworks_preview_worker',?,datetime('now','+1 minute'),datetime('now','+1 minute'),'{}'
    )`).run(a0002.id, "1".repeat(64), actorUserId);
  serviceDatabase.prepare("UPDATE preview_jobs SET status='succeeded',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(firstJobId);
  await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0002.id], actorUserId });
  const exactAfterHistorical = serviceDatabase.prepare("SELECT id,status FROM preview_jobs WHERE id=?").get(firstJobId);
  record("QA-105-005", "newer obsolete-hash history cannot hide current succeeded-without-derivative recovery", exactAfterHistorical?.status === "queued", exactAfterHistorical);
  serviceDatabase.prepare("DELETE FROM preview_jobs WHERE id='DEV105-historical-newer'").run();

  for (const terminalStatus of ["failed", "skipped"]) {
    serviceDatabase.prepare("UPDATE preview_jobs SET status=?,error_code='sensitive_test',error_summary='C:\\secret\\source.SLDPRT token=do-not-leak',completed_at=CURRENT_TIMESTAMP WHERE id=?").run(terminalStatus, firstJobId);
    await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0002.id], actorUserId });
    jobs = previewJobs(serviceDatabase, a0002.id);
    record("QA-105-006", `${terminalStatus} terminal job is reset without a duplicate`, jobs.length === 1 && jobs[0].id === firstJobId && jobs[0].status === "queued" && jobs[0].error_code === null && jobs[0].error_summary === null);
  }

  const a0044Before = previewJobs(serviceDatabase, a0044.id).length;
  const ready = await ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-jenfu", sourceFileAssetIds: [a0044.id], actorUserId });
  record("QA-105-004", "current ready derivative remains authoritative and creates no new job",
    ready[0]?.disposition === "ready" && previewJobs(serviceDatabase, a0044.id).length === a0044Before,
    ready);

  const negativeBytes = Buffer.from("DEV105-negative-derivative-bytes", "utf8");
  const negativeStorageKey = "dev105-negative/preview.png";
  const negativePath = path.join(serviceRepositoryDir, ...negativeStorageKey.split("/"));
  fs.mkdirSync(path.dirname(negativePath), { recursive: true });
  fs.writeFileSync(negativePath, negativeBytes);
  const derivativeBase = {
    sourceFileAssetId: a0002.id,
    fileName: "negative.png",
    fileSize: negativeBytes.byteLength,
    storageKey: negativeStorageKey,
    originalPath: negativePath,
    previewJobId: firstJobId
  };
  insertDerivative(serviceDatabase, { ...derivativeBase, id: "DEV105-fake", sourceContentHash: a0002.content_hash, contentHash: sha256(negativeBytes), generatorProfile: "fake_preview_worker", generatorVersion: "fake-local-pipeline" });
  insertDerivative(serviceDatabase, { ...derivativeBase, id: "DEV105-stale", sourceContentHash: "0".repeat(64), contentHash: sha256(negativeBytes), generatorProfile: "windows_solidworks_preview_worker", generatorVersion: "dev105" });
  insertDerivative(serviceDatabase, { ...derivativeBase, id: "DEV105-mismatch", sourceContentHash: a0002.content_hash, contentHash: "f".repeat(64), generatorProfile: "windows_solidworks_preview_worker", generatorVersion: "dev105" });
  const fakeRead = await getPreviewDerivativeBytesForSourceAssetAsync(client, { sourceFileAssetId: a0002.id, sourceContentHash: a0002.content_hash, derivativeId: "DEV105-fake" });
  const staleRead = await getPreviewDerivativeBytesForSourceAssetAsync(client, { sourceFileAssetId: a0002.id, sourceContentHash: a0002.content_hash, derivativeId: "DEV105-stale" });
  const mismatchRead = await getPreviewDerivativeBytesForSourceAssetAsync(client, { sourceFileAssetId: a0002.id, sourceContentHash: a0002.content_hash, derivativeId: "DEV105-mismatch" });
  record("QA-105-014", "fake, stale and hash-mismatch derivatives all fail closed", fakeRead === null && staleRead === null && mismatchRead === null);
  record("QA-105-018", "service fixture foreign keys remain clean", serviceDatabase.pragma("foreign_key_check").length === 0);
  serviceDatabase.close();

  const backfillDbPath = path.join(backfillDataDir, "ai-pdm.sqlite");
  await backupDatabase(backfillDbPath);
  record("QA-105-018", "backfill fixture starts from an unmodified authoritative snapshot", invariant(backfillDbPath).hash === primaryBefore.hash);
  const backfillFixture = new Database(backfillDbPath);
  backfillFixture.pragma("foreign_keys = ON");
  const backfillTargets = backfillFixture.prepare(`SELECT DISTINCT asset.id
    FROM drawing_revision_files binding
    JOIN file_assets asset ON asset.id=binding.source_file_asset_id
    WHERE binding.removed_at IS NULL AND asset.deleted_at IS NULL
      AND lower(asset.file_ext) IN ('sldprt','sldasm')
    ORDER BY asset.id LIMIT 2`).all().map((row) => row.id);
  for (const sourceFileAssetId of backfillTargets) {
    backfillFixture.prepare("DELETE FROM file_derivatives WHERE source_file_asset_id=?").run(sourceFileAssetId);
    backfillFixture.prepare("DELETE FROM preview_jobs WHERE source_file_asset_id=?").run(sourceFileAssetId);
  }
  backfillFixture.close();
  fixtureMutationLedger.push({ mutation: "clear two native preview artifacts in isolated backfill fixture to model historical silent gaps", sourceFileAssetIds: backfillTargets });
  const dryShaBefore = sha256(fs.readFileSync(backfillDbPath));
  const dryRun = runBackfill(backfillDbPath, backfillRepositoryDir, [], "backfill-dry-run.json").report;
  const dryShaAfter = sha256(fs.readFileSync(backfillDbPath));
  record("QA-105-012", "backfill defaults to read-only inventory and reports both silent gaps",
    dryRun.mode === "dry-run" && dryRun.before.silentGapCount === 2 && dryRun.after.silentGapCount === 2 && dryShaBefore === dryShaAfter && dryRun.sourceAuthorityUnchanged,
    { silentGaps: dryRun.before.silentGaps.map((row) => row.drawingNumber) });
  const firstApply = runBackfill(backfillDbPath, backfillRepositoryDir, ["--apply", "--confirm-isolated-preview-backfill", "--actor-user-id", actorUserId], "backfill-apply-1.json").report;
  const firstApplyRead = new Database(backfillDbPath, { readonly: true });
  const countAfterFirst = firstApplyRead.prepare("SELECT COUNT(*) count FROM preview_jobs").get().count;
  firstApplyRead.close();
  const secondApply = runBackfill(backfillDbPath, backfillRepositoryDir, ["--apply", "--confirm-isolated-preview-backfill", "--actor-user-id", actorUserId], "backfill-apply-2.json").report;
  const backfillRead = new Database(backfillDbPath, { readonly: true });
  const countAfterSecond = backfillRead.prepare("SELECT COUNT(*) count FROM preview_jobs").get().count;
  const backfillFk = backfillRead.pragma("foreign_key_check");
  backfillRead.close();
  record("QA-105-013", "isolated apply fills gaps once and rerun has zero delta without source mutation",
    firstApply.before.silentGapCount === 2 && firstApply.after.silentGapCount === 0 && firstApply.preparations.length === 2
      && secondApply.before.silentGapCount === 0 && secondApply.after.silentGapCount === 0 && secondApply.preparations.length === 0
      && countAfterFirst === countAfterSecond && firstApply.sourceAuthorityUnchanged && secondApply.sourceAuthorityUnchanged && backfillFk.length === 0,
    { countAfterFirst, countAfterSecond });
} catch (error) {
  fatalError = error instanceof Error ? error.stack || error.message : String(error);
  process.exitCode = 1;
} finally {
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  primaryAfter = invariant(primaryDbPath);
  const primaryStable = primaryBefore?.hash === primaryAfter.hash
    && primaryAfter.foreignKeys.length === 0
    && Object.values(primaryAfter.rootReferenceOrphans).every((value) => value === 0);
  checks.push({ id: "QA-105-018", name: "primary schema and canonical identities are unchanged after service QC", passed: primaryStable, detail: { before: primaryBefore?.hash, after: primaryAfter.hash } });
  try {
    fs.rmSync(taskRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 });
    cleanup.taskRootRemoved = !fs.existsSync(taskRoot);
  } catch (error) {
    cleanup = { taskRootRemoved: false, error: error instanceof Error ? error.message : String(error) };
  }
  checks.push({ id: "QA-105-018", name: "service QC task-owned fixtures are removed", passed: cleanup.taskRootRemoved, detail: cleanup });
  const manifest = {
    devId: "DEV-105",
    capaId: "CAPA-2026-3DP-001",
    runId,
    runtime: { project: "AI_PDM", port: null, mutationScope: "task-owned isolated data/repository and evidence PNG/JSON only", primaryWrites: false },
    fixtureMutationLedger,
    checks,
    primaryBefore,
    primaryAfter,
    cleanup,
    fatalError,
    passed: !fatalError && checks.every((item) => item.passed)
  };
  fs.writeFileSync(path.join(evidenceDir, "service-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  for (const item of checks) console.log(`${item.passed ? "PASS" : "FAIL"} ${item.id} ${item.name}`);
  if (fatalError) console.error(fatalError);
  if (!manifest.passed) process.exitCode = 1;
  else console.log(`DEV-105 service QC passed ${checks.length}/${checks.length} checks; evidence=${evidenceDir}`);
}
