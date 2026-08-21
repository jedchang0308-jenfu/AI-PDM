#!/usr/bin/env node

import Database from "better-sqlite3";
import { projectFileExists, readProjectFile, readProjectJson } from "./qc-project-file-utils.mjs";

const root = process.cwd();
const checks = [];

const readRequired = (relativePath) => readProjectFile(root, relativePath);
const existsRequired = (relativePath) => projectFileExists(root, relativePath);

function assert(condition, message, detail = "") {
  checks.push({ message, passed: Boolean(condition), detail });
  if (!condition) throw new Error(`${message}${detail ? `: ${detail}` : ""}`);
}

const sqliteSchema = readRequired("db/schema.sql");
const postgresSchema = readRequired("db/postgres/001_initial_schema.sql");
const rlsPlan = readRequired("db/postgres/002_supabase_rls_plan.sql");
const dbRuntime = readRequired("src/lib/db.ts");
const previewService = readRequired("src/lib/preview-derivatives.ts");
const masterAsync = readRequired("src/lib/master-attachments-async.ts");
const panel = readRequired("src/components/master-attachment-panel.tsx");
const detailPreview = readRequired("src/components/drawing-detail-preview.tsx");
const drawingRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts");
const partRoute = readRequired("src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts");
const drawingDownloadRoute = readRequired("src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/route.ts");
const partDownloadRoute = readRequired("src/app/api/parts/[partNumber]/attachments/[attachmentId]/route.ts");
const claimRoute = readRequired("src/app/api/preview-jobs/claim/route.ts");
const completeRoute = readRequired("src/app/api/preview-jobs/[jobId]/complete/route.ts");
const heartbeatRoute = readRequired("src/app/api/preview-jobs/[jobId]/heartbeat/route.ts");
const windowsShellWorker = readRequired("scripts/run-windows-shell-preview-worker.mjs");
const windowsShellExtractor = readRequired("scripts/windows-shell-thumbnail-extractor.ps1");
const documentManagerWorker = readRequired("scripts/run-solidworks-document-manager-preview-worker.mjs");
const documentManagerExporter = readRequired("scripts/solidworks-document-manager-preview-exporter.cs");
const startLocalhost = readRequired("scripts/start-localhost-3000.ps1");
const workerCredentialRoute = readRequired("src/app/api/preview-workers/solidworks-document-manager-key/route.ts");
const packageJson = readProjectJson(root, "package.json");

for (const schema of [
  ["SQLite", sqliteSchema],
  ["Postgres", postgresSchema]
]) {
  const [label, source] = schema;
  assert(source.includes("CREATE TABLE IF NOT EXISTS preview_jobs"), `${label} schema includes preview_jobs`);
  assert(source.includes("CREATE TABLE IF NOT EXISTS file_derivatives"), `${label} schema includes file_derivatives`);
  assert(source.includes("source_content_hash"), `${label} derivative/job schema records source hash`);
  assert(source.includes("idempotency_key"), `${label} preview job schema has idempotency key`);
  assert(source.includes("generator_profile"), `${label} preview schema records generator profile`);
  assert(source.includes("DEFAULT 'windows_solidworks_preview_worker'"), `${label} preview job default generator profile is the real Windows worker`);
  assert(source.includes("idx_preview_jobs_claim"), `${label} schema indexes worker claim path`);
  assert(source.includes("idx_file_derivatives_source_status"), `${label} schema indexes derivative lookup path`);
}

assert(rlsPlan.includes("'preview_jobs'") && rlsPlan.includes("'file_derivatives'"), "Supabase RLS deny-by-default baseline includes preview tables");
assert(dbRuntime.includes("ensureSolidWorksNativePreviewSchema") && dbRuntime.includes("CREATE TABLE IF NOT EXISTS preview_jobs"), "Runtime DB init upgrades old SQLite databases with preview tables");
assert(dbRuntime.includes("DEFAULT 'windows_solidworks_preview_worker'"), "Runtime DB init defaults preview jobs to the real Windows worker profile");

const database = new Database(":memory:");
database.exec("PRAGMA foreign_keys = ON;");
database.exec(sqliteSchema);
for (const table of ["preview_jobs", "file_derivatives"]) {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all();
  assert(rows.length > 0, `Runtime SQLite table exists: ${table}`);
}
const jobColumns = database.prepare("PRAGMA table_info(preview_jobs)").all().map((column) => column.name);
for (const column of ["source_file_asset_id", "source_content_hash", "requested_kind", "status", "idempotency_key", "generator_profile"]) {
  assert(jobColumns.includes(column), `Runtime preview_jobs column exists: ${column}`);
}
const derivativeColumns = database.prepare("PRAGMA table_info(file_derivatives)").all().map((column) => column.name);
for (const column of ["source_file_asset_id", "source_content_hash", "derivative_kind", "storage_key", "mime_type", "content_hash", "preview_job_id", "status"]) {
  assert(derivativeColumns.includes(column), `Runtime file_derivatives column exists: ${column}`);
}
database.close();

for (const name of [
  "decorateMasterAttachmentsWithPreviewState",
  "enqueuePreviewJobForAttachmentAsync",
  "getPreviewDerivativeBytesForAttachmentAsync",
  "claimPreviewJobAsync",
  "completePreviewJobAsync"
]) {
  assert(previewService.includes(`export async function ${name}`), `Preview service exports ${name}`);
}
assert(previewService.includes("fake_preview_worker") && previewService.includes("fake-local-pipeline"), "Preview service labels fake local worker evidence");
assert(previewService.includes("buildFakePreviewPng") && previewService.includes("zlib.deflateSync"), "Fake local worker generates deterministic visible PNG bytes");
assert(!previewService.includes("fakePreviewPngBase64"), "Fake local worker does not use a fixed tiny base64 PNG");
assert(previewService.includes('realPreviewGeneratorProfile = "windows_solidworks_preview_worker"'), "Preview jobs default to the real Windows worker profile");
assert(previewService.includes("input.runFakeWorker === true"), "Fake local worker only runs when explicitly enabled");
assert(previewService.includes("isDisplayablePreviewDerivativeRow") && previewService.includes("PDM_LOCAL_FAKE_PREVIEW_WORKER"), "Preview service hides fake derivatives unless local fake worker mode is explicit");
assert(previewService.includes("forceRegenerate"), "Preview service supports explicit preview regeneration");
assert(previewService.includes("source_content_hash") && previewService.includes("PREVIEW_DERIVATIVE_STALE"), "Preview service rejects stale derivative display");
assert(previewService.includes("retireReadyDerivatives") && previewService.includes("status = 'retired'"), "Preview service retires previous ready derivatives before inserting a replacement");
assert(masterAsync.includes("decorateMasterAttachmentsWithPreviewState"), "Master attachment async wrapper decorates attachments with preview state");
assert(masterAsync.includes("getMasterAttachmentPreviewDerivativeBytesAsync"), "Master attachment async wrapper exposes derivative byte reads");
assert(masterAsync.includes("enqueueMasterAttachmentPreviewJobAsync"), "Master attachment async wrapper exposes preview job enqueue");
assert(masterAsync.includes("PDM_LOCAL_FAKE_PREVIEW_WORKER") && masterAsync.includes("windows_solidworks_preview_worker"), "Master attachment wrapper queues real Windows preview jobs by default");

for (const routeFile of [
  "src/app/api/numbering/drawings/[drawingNumber]/attachments/[attachmentId]/previews/route.ts",
  "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts",
  "src/app/api/preview-jobs/claim/route.ts",
  "src/app/api/preview-jobs/[jobId]/complete/route.ts",
  "src/app/api/preview-jobs/[jobId]/heartbeat/route.ts",
  "scripts/run-windows-shell-preview-worker.mjs",
  "scripts/windows-shell-thumbnail-extractor.ps1",
  "scripts/run-solidworks-document-manager-preview-worker.mjs",
  "scripts/solidworks-document-manager-preview-exporter.cs"
]) {
  assert(existsRequired(routeFile), `Preview API route exists: ${routeFile}`);
}

assert(drawingRoute.includes("numbering.attachments.manage") && partRoute.includes("numbering.attachments.manage"), "Preview enqueue routes require attachment manage permission");
assert(drawingRoute.includes("numbering.drawings.view") && partRoute.includes("numbering.search"), "Preview GET routes inherit source read surface permission");
assert(claimRoute.includes("PDM_PREVIEW_WORKER_TOKEN") && completeRoute.includes("PDM_PREVIEW_WORKER_TOKEN"), "Worker routes require service token");
assert(heartbeatRoute.includes("PDM_PREVIEW_WORKER_TOKEN") && heartbeatRoute.includes("heartbeatPreviewJobAsync"), "Worker heartbeat route requires service token and updates job heartbeat");
assert(drawingDownloadRoute.includes("previewDerivative") && partDownloadRoute.includes("previewDerivative"), "Attachment download routes can stream preview derivatives inline");
assert(windowsShellWorker.includes("/api/preview-jobs/claim") && windowsShellWorker.includes("/api/preview-jobs/") && windowsShellWorker.includes("/complete"), "Windows Shell worker uses claim/complete API contract");
assert(windowsShellWorker.includes("windows-shell-ishellitemimagefactory-v1") && windowsShellWorker.includes("powershell.exe"), "Windows Shell worker records generator evidence and runs Windows PowerShell");
assert(windowsShellWorker.includes('input.modelsOnly ? ["sldprt", "sldasm"] : ["sldprt", "sldasm", "slddrw"]'), "Windows Shell worker claims SLDDRW by default but supports model-only operation");
assert(windowsShellWorker.includes("--watch") && windowsShellWorker.includes("Waiting for preview jobs."), "Windows Shell worker supports a persistent local watch mode");
assert(windowsShellWorker.includes("PREVIEW_WORKER_CONFIGURATION_ERROR"), "Windows Shell worker exits on invalid local worker configuration instead of retrying forever");
assert(windowsShellWorker.includes('import sharp from "sharp"') && windowsShellWorker.includes("assertMeaningfulThumbnailQuality"), "Windows Shell worker rejects blank or non-informative PNG output");
assert(
    windowsShellWorker.includes("userFacingPreviewErrorSummary") &&
    windowsShellWorker.includes("Windows Shell 只回傳空白或低資訊縮圖") &&
    windowsShellWorker.includes("process.exitCode = 1"),
  "Windows Shell worker reports blank output without leaking local paths to the UI"
);
assert(windowsShellExtractor.includes("IShellItemImageFactory") && windowsShellExtractor.includes("THUMBNAILONLY") && windowsShellExtractor.includes("ImageFormat.Png"), "Windows Shell extractor uses the OS thumbnail provider to create PNG derivatives");
assert(documentManagerWorker.includes('supportedExtensions: ["slddrw"]'), "Document Manager worker only claims SLDDRW drawing jobs");
assert(documentManagerWorker.includes("--watch") && documentManagerWorker.includes("Waiting for SLDDRW preview jobs."), "Document Manager worker supports a persistent drawing watch mode");
assert(documentManagerWorker.includes("/api/preview-workers/solidworks-document-manager-key") && documentManagerWorker.includes("ensureWorkerDocumentManagerKey") && documentManagerWorker.includes("credentialRefreshMs"), "Document Manager worker resolves credentials through the server-side worker route with bounded refresh");
assert(documentManagerWorker.includes("SolidWorksDocumentManagerPreviewExporter.exe") && documentManagerWorker.includes("solidworks-document-manager-preview-exporter.cs"), "Document Manager worker compiles the native exporter");
assert(documentManagerWorker.includes("PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY") && documentManagerWorker.includes("PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY"), "Document Manager worker reads key only from worker environment variables");
assert(documentManagerWorker.includes("DOCUMENT_MANAGER_LICENSE_KEY_MISSING") && documentManagerWorker.includes("設定中心已啟用版本") && documentManagerWorker.includes("2D worker readiness"), "Document Manager worker reports the UI-managed credential boundary clearly");
assert(documentManagerWorker.includes("solidworks-document-manager-preview-png-v1") && documentManagerWorker.includes("assertMeaningfulDrawingPreviewQuality"), "Document Manager worker records generator evidence and rejects blank drawing output");
assert(documentManagerExporter.includes("GetPreviewPNGBitmapBytes") && documentManagerExporter.includes("ISwDMSheet2"), "Document Manager exporter reads sheet PNG preview bytes");
assert(documentManagerExporter.includes("SwDocumentMgr.SwDMClassFactory") && documentManagerExporter.includes("SwDmDocumentType.swDmDocumentDrawing"), "Document Manager exporter opens SLDDRW through Document Manager");
assert(!documentManagerExporter.includes("Console.WriteLine(licenseKey") && !documentManagerWorker.includes("--license-key"), "Document Manager worker does not pass or log the key through command-line args");

assert(panel.includes("previewDerivatives") && panel.includes("previewJob"), "Attachment panel consumes preview state");
assert(panel.includes("findReadyPreviewDerivative") && panel.includes("sourceContentHash === attachment.contentHash"), "Attachment panel shows only current-hash ready derivatives");
assert(panel.includes("isDisplayablePreviewDerivative") && panel.includes('derivative.generatorProfile !== "fake_preview_worker"'), "Attachment panel does not display fake local worker derivatives as real previews");
assert(panel.includes("generatePreview") && panel.includes("/previews"), "Attachment panel can enqueue preview generation");
assert(panel.includes("forceRegenerate: true"), "Attachment panel sends explicit preview regeneration requests");
assert(panel.includes("previewPollingNeeded") && panel.includes("setInterval") && panel.includes("background: true"), "Attachment panel polls preview state automatically without manual refresh");
assert(!panel.includes("master-attachment-refresh") && !panel.includes("重新整理附件"), "Attachment panel removes manual refresh dependency");
assert(detailPreview.includes("Clock3") && detailPreview.includes("AlertTriangle") && detailPreview.includes("WifiOff"), "Drawing preview uses non-verbal preview state icons");
assert(panel.includes("完成後自動更新") && panel.includes("等待預覽服務") && panel.includes("處理較久") && panel.includes("系統仍在運作"), "Attachment panel communicates queue, wait and delayed states concisely");
assert(panel.includes("tone: \"failed\"") && panel.includes("title: \"無法預覽\"") && panel.includes("text: \"請下載原檔\""), "Attachment panel renders failure and unavailable fallback states");
assert(panel.includes("previewDerivative="), "Attachment panel opens derivative stream URLs");
assert(previewService.includes("previewHeartbeatStaleAfterMs") && previewService.includes("previewQueuedUnclaimedAfterMs") && previewService.includes("recoverStalePreviewJobsAsync"), "Preview service has heartbeat and unclaimed-queue timeout recovery");
assert(previewService.includes("preview_worker_unavailable") && previewService.includes("status = 'queued'"), "Preview service fails queued jobs that no worker claims");
assert(previewService.includes("locked_by = :workerId") && previewService.includes("locked_at = :now"), "Preview service binds heartbeat and completion to worker ownership");
assert(masterAsync.includes("actorUserId") && masterAsync.includes("recoverStalePreviewJobsAsync"), "Attachment list path auto-enqueues and recovers preview jobs");
assert(windowsShellWorker.includes("startJobHeartbeat") && documentManagerWorker.includes("startJobHeartbeat"), "Native preview workers send heartbeats while processing");
assert(
  startLocalhost.includes("run-solidworks-document-manager-preview-worker.mjs") &&
  startLocalhost.includes("Start-DocumentManagerPreviewWorker") &&
  startLocalhost.includes("solidworks-document-manager-preview-worker") &&
  startLocalhost.includes("windows-shell-thumbnail-worker"),
  "Local launcher manages dedicated 2D and 3D preview workers with distinct identities"
);
assert(workerCredentialRoute.includes("PDM_PREVIEW_WORKER_TOKEN") && workerCredentialRoute.includes("resolveActiveSolidWorksDocumentManagerKey") && workerCredentialRoute.includes("no-store"), "Worker credential route is token-gated and never cacheable");
assert(existsRequired("src/app/api/preview-workers/heartbeat/route.ts") && documentManagerWorker.includes("/api/preview-workers/heartbeat") && documentManagerWorker.includes("solidworks_2d_preview_png"), "2D preview worker reports a dedicated capability heartbeat");
assert(previewService.includes("requestedPreviewKindForSource") && masterAsync.includes("requestedPreviewKindForSource"), "Automatic SolidWorks preview producers resolve native PNG kind centrally");
assert(startLocalhost.includes("Test-DocumentManagerInteropConfigured") && !startLocalhost.includes('if (-not (Test-DocumentManagerPreviewKeyConfigured))'), "Local launcher starts the 2D worker without requiring a plaintext key in launcher environment");

assert(packageJson.scripts["qc:pdm-sw-native-preview-worker"] === "node scripts/qc-pdm-sw-native-preview-worker.mjs", "package script qc:pdm-sw-native-preview-worker is registered");
assert(packageJson.scripts["preview:worker:windows-shell"] === "node scripts/run-windows-shell-preview-worker.mjs", "package script preview:worker:windows-shell is registered");
assert(packageJson.scripts["preview:worker:solidworks-document-manager"] === "node scripts/run-solidworks-document-manager-preview-worker.mjs", "package script preview:worker:solidworks-document-manager is registered");

console.log(`qc:pdm-sw-native-preview-worker passed ${checks.length}/${checks.length} checks`);
