#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

const root = process.cwd();
const sourceCodePath = path.join(root, "scripts", "solidworks-document-manager-preview-exporter.cs");
const buildDir = path.join(root, ".tmp", "solidworks-document-manager-preview");
const exporterExePath = path.join(buildDir, "SolidWorksDocumentManagerPreviewExporter.exe");
const defaultBaseUrl = process.env.PDM_PREVIEW_WORKER_BASE_URL || "http://127.0.0.1:3000";
const defaultWorkerId = process.env.PDM_PREVIEW_WORKER_ID || "solidworks-document-manager-preview-worker";
const interopDir = process.env.PDM_SOLIDWORKS_INTEROP_DIR || "C:\\Program Files\\SOLIDWORKS Corp\\SOLIDWORKS\\api\\redist";
const sldDocumentMgrDll = path.join(interopDir, "SolidWorks.Interop.swdocumentmgr.dll");
const swConstDll = path.join(interopDir, "SolidWorks.Interop.swconst.dll");
const sldDocumentMgrBuildDll = path.join(buildDir, "SolidWorks.Interop.swdocumentmgr.dll");
const swConstBuildDll = path.join(buildDir, "SolidWorks.Interop.swconst.dll");

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

await ensureExporterBuilt();
if (args.compileOnly) {
  console.log(JSON.stringify({ compiled: true, exporterExePath }, null, 2));
  process.exit(0);
}

if (args.source) {
  try {
    const outputPath = args.out || path.join(root, "output", "preview-worker", `${path.basename(args.source)}.document-manager.png`);
    const extracted = await extractDocumentManagerPreview(args.source, outputPath);
    const bytes = fs.readFileSync(outputPath);
    assertPng(bytes, outputPath);
    const dimensions = readPngDimensions(bytes);
    const quality = await analyzePngContent(bytes);
    assertMeaningfulDrawingPreviewQuality(quality, outputPath);
    console.log(JSON.stringify({ mode: "source", ...extracted, dimensions, quality }, null, 2));
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ mode: "source", status: "failed", errorSummary: userFacingPreviewErrorSummary(message) }, null, 2));
    process.exit(1);
  }
}

const token = args.token || process.env.PDM_PREVIEW_WORKER_TOKEN || "";
if (!token.trim()) {
  throw new Error("PDM_PREVIEW_WORKER_TOKEN is required for API worker mode.");
}

const baseUrl = (args.baseUrl || defaultBaseUrl).replace(/\/+$/u, "");
const workerId = args.workerId || defaultWorkerId;
const watchMode = args.watch === true;
const pollMs = readPositiveInt(args.pollMs, 2000);
let idleReported = false;

if (watchMode) {
  console.log(JSON.stringify({ workerId, watching: true, pollMs }, null, 2));
}

while (true) {
  let claim;
  try {
    claim = await claimJob({ baseUrl, token, workerId });
  } catch (error) {
    if (!watchMode || isWorkerConfigurationError(error)) throw error;
    console.error(JSON.stringify({ workerId, watching: true, status: "claim_retry", error: "Preview API is temporarily unavailable; the worker will retry." }, null, 2));
    await delay(pollMs);
    continue;
  }

  if (!claim) {
    if (!watchMode) {
      console.log(JSON.stringify({ workerId, claimed: false, message: "No queued SLDDRW preview job." }, null, 2));
      break;
    }
    if (!idleReported) {
      console.log(JSON.stringify({ workerId, watching: true, claimed: false, message: "Waiting for SLDDRW preview jobs." }, null, 2));
      idleReported = true;
    }
    await delay(pollMs);
    continue;
  }

  idleReported = false;
  const succeeded = await processClaim({ baseUrl, token, workerId, claim });
  if (!watchMode) {
    if (!succeeded) process.exitCode = 1;
    break;
  }
}

async function processClaim(input) {
  const { baseUrl: claimBaseUrl, token: claimToken, workerId: claimWorkerId, claim } = input;
  const heartbeat = startJobHeartbeat({ baseUrl: claimBaseUrl, token: claimToken, workerId: claimWorkerId, jobId: claim.jobId });
  try {
    const sourcePath = resolveClaimSourcePath(claim);
    const outputPath = path.join(os.tmpdir(), `ai-pdm-dm-preview-${claim.jobId}.png`);
    const extracted = await extractDocumentManagerPreview(sourcePath, outputPath);
    const bytes = fs.readFileSync(outputPath);
    assertPng(bytes, outputPath);
    const dimensions = readPngDimensions(bytes);
    const quality = await analyzePngContent(bytes);
    assertMeaningfulDrawingPreviewQuality(quality, outputPath);
    const completion = await completeJob({
      baseUrl: claimBaseUrl,
      token: claimToken,
      workerId: claimWorkerId,
      job: claim,
      derivative: {
        kind: "thumbnail_png",
        fileName: `${path.basename(sourcePath)}.preview.png`,
        mimeType: "image/png",
        contentBase64: bytes.toString("base64"),
        width: dimensions.width,
        height: dimensions.height,
        generatorProfile: claim.generatorProfile,
        generatorVersion: "solidworks-document-manager-preview-png-v1"
      }
    });
    console.log(JSON.stringify({ workerId: claimWorkerId, claimed: true, jobId: claim.jobId, sourcePath, extracted, dimensions, quality, completion }, null, 2));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorSummary = userFacingPreviewErrorSummary(message);
    await failJob({ baseUrl: claimBaseUrl, token: claimToken, workerId: claimWorkerId, jobId: claim.jobId, errorSummary });
    console.error(JSON.stringify({ workerId: claimWorkerId, claimed: true, jobId: claim.jobId, status: "failed", errorCode: "solidworks_document_manager_preview_failed", errorSummary }, null, 2));
    return false;
  } finally {
    heartbeat.stop();
  }
}

async function ensureExporterBuilt() {
  if (!fs.existsSync(sourceCodePath)) throw new Error(`Document Manager exporter source not found: ${sourceCodePath}`);
  if (!fs.existsSync(sldDocumentMgrDll)) throw new Error(`SolidWorks Document Manager interop DLL not found: ${sldDocumentMgrDll}`);
  if (!fs.existsSync(swConstDll)) throw new Error(`SolidWorks constants interop DLL not found: ${swConstDll}`);

  await fs.promises.mkdir(buildDir, { recursive: true });
  await fs.promises.copyFile(sldDocumentMgrDll, sldDocumentMgrBuildDll);
  await fs.promises.copyFile(swConstDll, swConstBuildDll);

  const shouldCompile =
    !fs.existsSync(exporterExePath) ||
    fs.statSync(exporterExePath).mtimeMs < fs.statSync(sourceCodePath).mtimeMs ||
    fs.statSync(exporterExePath).mtimeMs < fs.statSync(sldDocumentMgrDll).mtimeMs;
  if (!shouldCompile) return;

  const cscPath = resolveCscPath();
  const result = await spawnFileAsync(cscPath, [
    "/nologo",
    "/platform:x64",
    `/out:${exporterExePath}`,
    `/reference:${sldDocumentMgrBuildDll}`,
    `/reference:${swConstBuildDll}`,
    sourceCodePath
  ]);
  if (result.status !== 0) {
    throw new Error(`Document Manager exporter compile failed: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`);
  }
}

function resolveCscPath() {
  const candidates = [
    process.env.PDM_CSC_PATH,
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\Roslyn\\csc.exe"
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("C# compiler not found. Set PDM_CSC_PATH to csc.exe.");
  return found;
}

async function claimJob(input) {
  const response = await fetch(`${input.baseUrl}/api/preview-jobs/claim`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pdm-preview-worker-token": input.token
    },
    body: JSON.stringify({
      workerId: input.workerId,
      supportedKinds: ["native_thumbnail_png"],
      supportedExtensions: ["slddrw"]
    })
  });
  if (!response.ok) {
    const error = new Error(`Preview worker claim failed with HTTP ${response.status}: ${await response.text()}`);
    if (response.status === 401 || response.status === 403 || response.status === 503) error.code = "PREVIEW_WORKER_CONFIGURATION_ERROR";
    throw error;
  }
  const body = await response.json();
  return body.job ?? null;
}

function isWorkerConfigurationError(error) {
  return error?.code === "PREVIEW_WORKER_CONFIGURATION_ERROR";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function completeJob(input) {
  const response = await fetch(`${input.baseUrl}/api/preview-jobs/${encodeURIComponent(input.job.jobId)}/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pdm-preview-worker-token": input.token
    },
    body: JSON.stringify({
      workerId: input.workerId,
      status: "succeeded",
      sourceContentHash: input.job.sourceContentHash,
      derivatives: [input.derivative]
    })
  });
  if (!response.ok) throw new Error(`Preview worker complete failed with HTTP ${response.status}: ${await response.text()}`);
  return await response.json();
}

function startJobHeartbeat(input) {
  const send = async () => {
    await fetch(`${input.baseUrl}/api/preview-jobs/${encodeURIComponent(input.jobId)}/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pdm-preview-worker-token": input.token
      },
      body: JSON.stringify({ workerId: input.workerId })
    }).catch(() => undefined);
  };
  void send();
  const timer = setInterval(() => void send(), 5000);
  return { stop: () => clearInterval(timer) };
}

async function failJob(input) {
  await fetch(`${input.baseUrl}/api/preview-jobs/${encodeURIComponent(input.jobId)}/complete`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-pdm-preview-worker-token": input.token
    },
    body: JSON.stringify({
      workerId: input.workerId,
      status: "failed",
      errorCode: "solidworks_document_manager_preview_failed",
      errorSummary: input.errorSummary
    })
  }).catch(() => undefined);
}

async function extractDocumentManagerPreview(sourcePath, outputPath) {
  if (process.platform !== "win32") throw new Error("SolidWorks Document Manager preview extraction requires Windows.");
  if (!hasDocumentManagerLicenseKey()) throw new Error("DOCUMENT_MANAGER_LICENSE_KEY_MISSING");
  if (!fs.existsSync(sourcePath)) throw new Error(`SOURCE_FILE_NOT_FOUND: ${sourcePath}`);

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.rm(outputPath, { force: true });
  const result = await spawnFileAsync(exporterExePath, [sourcePath, outputPath], {
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n").trim() || `Document Manager exporter failed with exit code ${result.status}`);
  }
  const bytes = fs.statSync(outputPath).size;
  return { outputPath, bytes, exporter: result.stdout.trim() };
}

function hasDocumentManagerLicenseKey() {
  return [
    "PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY",
    "PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY",
    "SOLIDWORKS_DOCUMENT_MANAGER_KEY"
  ].some((name) => String(process.env[name] ?? "").trim());
}

function spawnFileAsync(command, commandArgs, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, windowsHide: true, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.on("error", (error) => resolve({ status: 1, stdout, stderr: error.message }));
  });
}

function resolveClaimSourcePath(claim) {
  const sourcePath = String(claim.originalPath || "");
  if (!sourcePath) throw new Error("Preview job claim did not include a local source path.");
  return sourcePath;
}

function assertPng(bytes, outputPath) {
  if (bytes.byteLength < 24 || bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`DOCUMENT_MANAGER_OUTPUT_NOT_PNG: ${outputPath}`);
  }
}

function readPngDimensions(bytes) {
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20)
  };
}

async function analyzePngContent(bytes) {
  const { data, info } = await sharp(bytes)
    .resize({ width: 96, height: 96, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const background = findFirstVisiblePixel(data) ?? [255, 255, 255];
  const uniqueColorBuckets = new Set();
  let visiblePixels = 0;
  let nonBackgroundPixels = 0;
  let meanLuminance = 0;
  let luminanceM2 = 0;

  for (let offset = 0; offset < data.length; offset += 4) {
    const alpha = data[offset + 3];
    if (alpha < 16) continue;
    const red = data[offset];
    const green = data[offset + 1];
    const blue = data[offset + 2];
    visiblePixels += 1;
    uniqueColorBuckets.add(`${red >> 5},${green >> 5},${blue >> 5}`);

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const delta = luminance - meanLuminance;
    meanLuminance += delta / visiblePixels;
    luminanceM2 += delta * (luminance - meanLuminance);

    const backgroundDelta = Math.max(Math.abs(red - background[0]), Math.abs(green - background[1]), Math.abs(blue - background[2]));
    if (backgroundDelta > 18) nonBackgroundPixels += 1;
  }

  const luminanceVariance = visiblePixels > 1 ? luminanceM2 / (visiblePixels - 1) : 0;
  return {
    sampleWidth: info.width,
    sampleHeight: info.height,
    visiblePixels,
    nonBackgroundRatio: visiblePixels > 0 ? roundMetric(nonBackgroundPixels / visiblePixels) : 0,
    uniqueColorBuckets: uniqueColorBuckets.size,
    luminanceVariance: roundMetric(luminanceVariance)
  };
}

function findFirstVisiblePixel(data) {
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3] >= 16) return [data[offset], data[offset + 1], data[offset + 2]];
  }
  return null;
}

function assertMeaningfulDrawingPreviewQuality(quality, outputPath) {
  const hasVisiblePixels = quality.visiblePixels >= 100;
  const hasDrawingSignal = quality.nonBackgroundRatio >= 0.002 || quality.uniqueColorBuckets >= 3 || quality.luminanceVariance >= 25;
  if (hasVisiblePixels && hasDrawingSignal) return;
  throw new Error(
    `DOCUMENT_MANAGER_PREVIEW_BLANK: ${outputPath} ` +
      `(visiblePixels=${quality.visiblePixels}, nonBackgroundRatio=${quality.nonBackgroundRatio}, ` +
      `uniqueColorBuckets=${quality.uniqueColorBuckets}, luminanceVariance=${quality.luminanceVariance})`
  );
}

function userFacingPreviewErrorSummary(message) {
  if (/DOCUMENT_MANAGER_LICENSE_KEY_MISSING/iu.test(message)) {
    return "2D 圖面預覽需要 worker 可讀取的 SolidWorks Document Manager key；目前 UI 是 local test-double metadata，未提供 worker 可用的 secret。請改用 Supabase Vault live secret 或在 worker 主機設定 PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY。";
  }
  if (/DOCUMENT_MANAGER_OPEN_FAILED:swDmDocumentOpenErrorNoLicense/iu.test(message)) {
    return "SolidWorks Document Manager key 無效或授權不包含此功能，無法開啟工程圖產生預覽。";
  }
  if (/DOCUMENT_MANAGER_OPEN_FAILED:swDmDocumentOpenErrorFileNotFound|SOURCE_FILE_NOT_FOUND/iu.test(message)) {
    return "來源工程圖檔案不存在，無法產生 2D 預覽。";
  }
  if (/DOCUMENT_MANAGER_OPEN_FAILED:swDmDocumentOpenErrorFutureVersion/iu.test(message)) {
    return "工程圖版本高於目前 Document Manager 支援版本，請更新工作站 SolidWorks/Document Manager 元件。";
  }
  if (/DOCUMENT_MANAGER_PREVIEW_NOT_AVAILABLE|DOCUMENT_MANAGER_PREVIEW_BLANK/iu.test(message)) {
    return "Document Manager 未能從此 SLDDRW 取得可用工程圖預覽；請確認圖面已儲存預覽資料，或改用 eDrawings/SolidWorks PDF worker。";
  }
  if (/DOCUMENT_MANAGER_OUTPUT_NOT_PNG/iu.test(message)) {
    return "Document Manager 輸出不是有效 PNG，系統已拒絕採用。";
  }
  return "SolidWorks Document Manager 2D 預覽 worker 未完成；請確認 key、元件安裝、檔案參照與 worker 狀態後重試。";
}

function roundMetric(value) {
  return Math.round(value * 10000) / 10000;
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--source") parsed.source = values[++index];
    else if (value === "--out") parsed.out = values[++index];
    else if (value === "--base-url") parsed.baseUrl = values[++index];
    else if (value === "--token") parsed.token = values[++index];
    else if (value === "--worker-id") parsed.workerId = values[++index];
    else if (value === "--watch") parsed.watch = true;
    else if (value === "--poll-ms") parsed.pollMs = values[++index];
    else if (value === "--compile-only") parsed.compileOnly = true;
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-solidworks-document-manager-preview-worker.mjs --source <drawing.slddrw> --out <png>
  PDM_PREVIEW_WORKER_TOKEN=<token> PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY=<key> node scripts/run-solidworks-document-manager-preview-worker.mjs --watch

Environment:
  PDM_PREVIEW_WORKER_BASE_URL             Defaults to http://127.0.0.1:3000
  PDM_PREVIEW_WORKER_TOKEN                Required for API worker mode
  PDM_PREVIEW_WORKER_ID                   Defaults to solidworks-document-manager-preview-worker
  PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY     Worker-local Document Manager key
  PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY     Alternate Document Manager key env name
  PDM_SOLIDWORKS_INTEROP_DIR              Optional SolidWorks Interop DLL directory
  PDM_CSC_PATH                            Optional csc.exe path

Notes:
  This worker only claims SLDDRW native_thumbnail_png jobs. It intentionally keeps
  the Document Manager key out of browser responses, DB metadata and command-line args.
  --watch keeps the worker alive and polls for new drawing jobs.
  --poll-ms controls the watch interval and defaults to 2000.`);
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
