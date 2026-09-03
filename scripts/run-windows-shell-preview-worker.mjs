#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = process.cwd();
const extractorPath = path.join(root, "scripts", "windows-shell-thumbnail-extractor.ps1");
const defaultBaseUrl = process.env.PDM_PREVIEW_WORKER_BASE_URL || "http://127.0.0.1:3000";
const defaultWorkerId = process.env.PDM_PREVIEW_WORKER_ID || "windows-shell-thumbnail-worker";
const modelPreviewCapability = "solidworks_3d_preview_png";
const modelPreviewRendererVersion = "windows-shell-ishellitemimagefactory-v2";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  printHelp();
  process.exit(0);
}

if (args.source) {
  const outputPath = args.out || path.join(root, "output", "preview-worker", `${path.basename(args.source)}.thumbnail.png`);
  const result = await extractWindowsShellThumbnail(args.source, outputPath, readPositiveInt(args.size, 512));
  const bytes = fs.readFileSync(outputPath);
  assertPng(bytes, outputPath);
  const quality = await analyzePngContent(bytes);
  assertMeaningfulThumbnailQuality(quality, outputPath);
  console.log(JSON.stringify({ mode: "source", ...result, quality }, null, 2));
  process.exit(0);
}

const token = args.token || process.env.PDM_PREVIEW_WORKER_TOKEN || "";
if (!token.trim()) {
  throw new Error("PDM_PREVIEW_WORKER_TOKEN is required for API worker mode.");
}

const baseUrl = (args.baseUrl || defaultBaseUrl).replace(/\/+$/u, "");
const workerId = args.workerId || defaultWorkerId;
const watchMode = args.watch === true;
const pollMs = readPositiveInt(args.pollMs, 2000);
const capabilityReporter = createCapabilityReporter({ baseUrl, token, workerId, watchMode });
await capabilityReporter.update(await evaluateCapabilityCanary({
  sourcePath: args.canarySource || process.env.PDM_3D_PREVIEW_CANARY_SOURCE || "",
  size: readPositiveInt(args.size, 512)
}));
capabilityReporter.start();
let idleReported = false;

if (watchMode) {
  console.log(JSON.stringify({ workerId, watching: true, modelsOnly: args.modelsOnly === true, pollMs }, null, 2));
}

while (true) {
  let claim;
  try {
    claim = await claimJob({ baseUrl, token, workerId, modelsOnly: args.modelsOnly === true });
  } catch (error) {
    if (!watchMode || isWorkerConfigurationError(error)) throw error;
    console.error(
      JSON.stringify(
        {
          workerId,
          watching: true,
          status: "claim_retry",
          error: "Preview API is temporarily unavailable; the worker will retry."
        },
        null,
        2
      )
    );
    await delay(pollMs);
    continue;
  }

  if (!claim) {
    if (!watchMode) {
      console.log(JSON.stringify({ workerId, claimed: false, message: "No queued preview job." }, null, 2));
      break;
    }
    if (!idleReported) {
      console.log(JSON.stringify({ workerId, watching: true, claimed: false, message: "Waiting for preview jobs." }, null, 2));
      idleReported = true;
    }
    await delay(pollMs);
    continue;
  }

  idleReported = false;
  const heartbeat = startJobHeartbeat({ baseUrl, token, workerId, jobId: claim.jobId });
  let succeeded;
  try {
    succeeded = await processClaim({ baseUrl, token, workerId, claim, size: readPositiveInt(args.size, 512), capabilityReporter });
  } finally {
    heartbeat.stop();
  }
  if (!watchMode) {
    if (!succeeded) process.exitCode = 1;
    break;
  }
}

async function processClaim(input) {
  try {
    const sourcePath = resolveClaimSourcePath(input.claim);
    const outputPath = path.join(os.tmpdir(), `ai-pdm-preview-${input.claim.jobId}.png`);
    const extracted = await extractWindowsShellThumbnail(sourcePath, outputPath, input.size);
    const bytes = fs.readFileSync(outputPath);
    assertPng(bytes, outputPath);
    const quality = await analyzePngContent(bytes);
    assertMeaningfulThumbnailQuality(quality, outputPath);
    const dimensions = readPngDimensions(bytes);
    const completion = await completeJob({
      baseUrl: input.baseUrl,
      token: input.token,
      workerId: input.workerId,
      job: input.claim,
      derivative: {
        kind: "thumbnail_png",
        fileName: `${path.basename(sourcePath)}.preview.png`,
        mimeType: "image/png",
        contentBase64: bytes.toString("base64"),
        width: dimensions.width,
        height: dimensions.height,
        generatorProfile: input.claim.generatorProfile,
        generatorVersion: modelPreviewRendererVersion
      }
    });
    console.log(
      JSON.stringify(
        { workerId: input.workerId, claimed: true, jobId: input.claim.jobId, sourcePath, extracted, quality, completion },
        null,
        2
      )
    );
    await input.capabilityReporter.update({ status: "ready", issueCode: null });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorSummary = userFacingPreviewErrorSummary(error, message);
    await input.capabilityReporter.update(capabilityStateForError(error, message));
    await failJob({ baseUrl: input.baseUrl, token: input.token, workerId: input.workerId, jobId: input.claim.jobId, errorSummary });
    console.error(
      JSON.stringify(
        {
          workerId: input.workerId,
          claimed: true,
          jobId: input.claim.jobId,
          status: "failed",
          errorCode: "windows_shell_thumbnail_failed",
          errorSummary
        },
        null,
        2
      )
    );
    return false;
  }
}

function createCapabilityReporter(input) {
  let state = { status: "degraded", issueCode: "preview_canary_pending" };
  let timer = null;
  const send = async () => {
    const response = await fetch(`${input.baseUrl}/api/preview-workers/heartbeat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pdm-preview-worker-token": input.token
      },
      body: JSON.stringify({
        workerId: input.workerId,
        capability: modelPreviewCapability,
        status: state.status,
        readerVersion: modelPreviewRendererVersion,
        issueCode: state.issueCode
      })
    });
    if (!response.ok) throw new Error(`3D preview capability heartbeat failed with HTTP ${response.status}.`);
  };
  return {
    async update(next) {
      state = { ...state, ...next };
      try {
        await send();
      } catch (error) {
        if (!input.watchMode) throw error;
      }
    },
    start() {
      if (!input.watchMode || timer) return;
      timer = setInterval(() => { void send().catch(() => undefined); }, 15_000);
      timer.unref?.();
    }
  };
}

async function evaluateCapabilityCanary(input) {
  const sourcePath = String(input.sourcePath || "").trim();
  if (!sourcePath) return { status: "degraded", issueCode: "preview_canary_pending" };
  const outputPath = path.join(os.tmpdir(), `ai-pdm-3d-preview-canary-${process.pid}.png`);
  try {
    await extractWindowsShellThumbnail(sourcePath, outputPath, input.size);
    const bytes = fs.readFileSync(outputPath);
    assertPng(bytes, outputPath);
    const quality = await analyzePngContent(bytes);
    assertMeaningfulThumbnailQuality(quality, outputPath);
    return { status: "ready", issueCode: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return capabilityStateForError(error, message);
  } finally {
    await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
  }
}

function capabilityStateForError(error, message) {
  if (error && typeof error === "object" && error.code === "WINDOWS_SHELL_THUMBNAIL_BLANK") {
    return { status: "degraded", issueCode: "preview_source_not_renderable" };
  }
  if (/HBITMAP|Shell GetImage|PNG encoding|thumbnail extractor failed/iu.test(message)) {
    return { status: "blocked", issueCode: "preview_renderer_failed" };
  }
  return { status: "degraded", issueCode: "preview_canary_failed" };
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
      supportedExtensions: input.modelsOnly ? ["sldprt", "sldasm"] : ["sldprt", "sldasm", "slddrw"]
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
      errorCode: "windows_shell_thumbnail_failed",
      errorSummary: input.errorSummary
    })
  }).catch(() => undefined);
}

async function extractWindowsShellThumbnail(sourcePath, outputPath, size) {
  if (process.platform !== "win32") throw new Error("Windows Shell thumbnail extraction requires Windows.");
  if (!fs.existsSync(extractorPath)) throw new Error(`Extractor script not found: ${extractorPath}`);
  const absoluteSourcePath = path.resolve(sourcePath);
  if (!fs.existsSync(absoluteSourcePath)) throw new Error(`Source file not found: ${sourcePath}`);

  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  const powershell = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
  const result = await spawnFileAsync(powershell, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    extractorPath,
    "-SourcePath",
    absoluteSourcePath,
    "-OutputPath",
    outputPath,
    "-Size",
    String(size)
  ]);
  if (result.status !== 0) {
    throw new Error(`Windows Shell thumbnail extractor failed: ${[result.stdout, result.stderr].filter(Boolean).join("\n").trim()}`);
  }
  const bytes = fs.statSync(outputPath).size;
  return { outputPath, outputUrl: pathToFileURL(outputPath).href, bytes };
}

function spawnFileAsync(command, commandArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: root, windowsHide: true });
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
    throw new Error(`Extractor output is not a PNG: ${outputPath}`);
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
    .resize({ width: 64, height: 64, fit: "inside", withoutEnlargement: true })
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
    uniqueColorBuckets.add(`${red >> 4},${green >> 4},${blue >> 4}`);

    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const delta = luminance - meanLuminance;
    meanLuminance += delta / visiblePixels;
    luminanceM2 += delta * (luminance - meanLuminance);

    const backgroundDelta = Math.max(Math.abs(red - background[0]), Math.abs(green - background[1]), Math.abs(blue - background[2]));
    if (backgroundDelta > 24) nonBackgroundPixels += 1;
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

function assertMeaningfulThumbnailQuality(quality, outputPath) {
  const hasVisiblePixels = quality.visiblePixels >= 100;
  const hasMeaningfulDetail = quality.uniqueColorBuckets >= 8 || quality.luminanceVariance >= 180;
  if (hasVisiblePixels && hasMeaningfulDetail) return;
  const error = new Error(
    `Windows Shell thumbnail output appears blank or non-informative: ${outputPath} ` +
      `(visiblePixels=${quality.visiblePixels}, uniqueColorBuckets=${quality.uniqueColorBuckets}, luminanceVariance=${quality.luminanceVariance})`
  );
  error.code = "WINDOWS_SHELL_THUMBNAIL_BLANK";
  throw error;
}

function userFacingPreviewErrorSummary(error, fallback) {
  if (error && typeof error === "object" && error.code === "WINDOWS_SHELL_THUMBNAIL_BLANK") {
    return "Windows Shell 只回傳空白或低資訊縮圖；此工作站的檔案預覽器不足以產生可採用預覽，請改用 SolidWorks/eDrawings/Document Manager worker。";
  }
  if (/Source file not found/iu.test(fallback)) return "來源檔案不存在，無法產生預覽。";
  if (/Extractor output is not a PNG/iu.test(fallback)) return "預覽轉檔結果不是有效 PNG，系統已拒絕採用。";
  return "Windows preview worker 未完成；請確認工作站的 SolidWorks/eDrawings 預覽器、檔案權限與 worker 狀態後重試。";
}

function roundMetric(value) {
  return Math.round(value * 10000) / 10000;
}

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isWorkerConfigurationError(error) {
  return error && typeof error === "object" && error.code === "PREVIEW_WORKER_CONFIGURATION_ERROR";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--help" || value === "-h") parsed.help = true;
    else if (value === "--source") parsed.source = values[++index];
    else if (value === "--out") parsed.out = values[++index];
    else if (value === "--size") parsed.size = values[++index];
    else if (value === "--base-url") parsed.baseUrl = values[++index];
    else if (value === "--token") parsed.token = values[++index];
    else if (value === "--worker-id") parsed.workerId = values[++index];
    else if (value === "--models-only") parsed.modelsOnly = true;
    else if (value === "--watch") parsed.watch = true;
    else if (value === "--poll-ms") parsed.pollMs = values[++index];
    else if (value === "--canary-source") parsed.canarySource = values[++index];
  }
  return parsed;
}

function printHelp() {
  console.log(`Usage:
  node scripts/run-windows-shell-preview-worker.mjs --source <file> --out <png>
  PDM_PREVIEW_WORKER_TOKEN=<token> node scripts/run-windows-shell-preview-worker.mjs
  PDM_PREVIEW_WORKER_TOKEN=<token> node scripts/run-windows-shell-preview-worker.mjs --watch --models-only

Environment:
  PDM_PREVIEW_WORKER_BASE_URL  Defaults to http://127.0.0.1:3000
  PDM_PREVIEW_WORKER_TOKEN     Required for API worker mode
  PDM_PREVIEW_WORKER_ID        Defaults to windows-shell-thumbnail-worker
  PDM_3D_PREVIEW_CANARY_SOURCE Optional real SLDPRT/SLDASM used before reporting ready

Notes:
  API worker mode claims SLDPRT/SLDASM/SLDDRW by default. Use --models-only when
  the workstation should leave SLDDRW jobs for a dedicated drawing renderer. Use
  --watch to keep the worker running and --poll-ms to control the idle interval.
  The worker rejects PNGs that appear blank or non-informative before completing a job.`);
}
