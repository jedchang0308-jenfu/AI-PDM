import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  buildA0005FixtureResult,
  buildFilenameAdapterResult,
  buildUnsupportedAdapterResult,
  validateExternalAdapterResult
} from "../src/lib/drawing-recognition-adapters.ts";

const baseUrl = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/u, "");
const token = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_TOKEN ?? "").trim();
const previewToken = String(process.env.PDM_PREVIEW_WORKER_TOKEN ?? "").trim();
const workerIdFlagIndex = process.argv.indexOf("--worker-id");
const workerIdFromArgs = workerIdFlagIndex >= 0 ? String(process.argv[workerIdFlagIndex + 1] ?? "").trim() : "";
const workerId = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_ID || workerIdFromArgs || `local-${crypto.randomUUID()}`).trim();
const once = process.argv.includes("--once");
const fixtureMode = process.env.PDM_DRAWING_RECOGNITION_FIXTURE_MODE === "true" && process.env.NODE_ENV !== "production";
const pollIntervalMs = Math.max(250, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_POLL_MS ?? 2_000), 30_000));
const reconnectDelayMs = Math.max(250, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_RECONNECT_MS ?? 2_000), 30_000));
if (!token) throw new Error("PDM_DRAWING_RECOGNITION_WORKER_TOKEN_REQUIRED");

function delay(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function errorSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  const causeCode = error instanceof Error && error.cause && typeof error.cause === "object" && "code" in error.cause
    ? String(error.cause.code)
    : "";
  return `${causeCode ? `${causeCode}: ` : ""}${message}`.replace(/[\r\n]+/gu, " ").slice(0, 500);
}

async function request(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function requestWorker(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${previewToken}`, "x-pdm-preview-worker-token": previewToken, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

async function requestSourceContent(job, source) {
  const response = await fetch(`${baseUrl}/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/sources/${encodeURIComponent(source.id)}/content`, {
    headers: { authorization: `Bearer ${token}`, "x-pdm-recognition-worker-id": workerId }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(String(body?.error?.code ?? `source content HTTP ${response.status}`));
    error.code = String(body?.error?.code ?? "RECOGNITION_SOURCE_CONTENT_UNAVAILABLE");
    throw error;
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const maxBytes = Math.max(1_024, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_SOURCE_MAX_BYTES ?? 268_435_456), 268_435_456));
  if (bytes.byteLength > maxBytes || bytes.byteLength !== source.fileSize) {
    const error = new Error("RECOGNITION_SOURCE_SIZE_MISMATCH");
    error.code = "RECOGNITION_SOURCE_SIZE_MISMATCH";
    throw error;
  }
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== source.contentHash.toLowerCase()) {
    const error = new Error("RECOGNITION_SOURCE_HASH_MISMATCH");
    error.code = "RECOGNITION_SOURCE_HASH_MISMATCH";
    throw error;
  }
  return bytes;
}

async function ensureNativeReaderCredential() {
  const names = ["PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY", "PDM_SW_DOCUMENT_MANAGER_LICENSE_KEY", "SOLIDWORKS_DOCUMENT_MANAGER_KEY"];
  const environmentName = names.find((name) => String(process.env[name] ?? "").trim());
  const envFallbackAllowed = process.env.PDM_ALLOW_WORKER_ENV_SECRET_FALLBACK === "true" && String(process.env.PDM_BREAK_GLASS_CHANGE_ID ?? "").trim();
  if (environmentName && envFallbackAllowed) {
    return { value: String(process.env[environmentName]).trim(), version: null, fingerprint: null, source: "worker_environment" };
  }
  if (!previewToken) {
    const error = new Error("native_metadata_license_missing");
    error.code = "native_metadata_license_missing";
    throw error;
  }
  const response = await fetch(`${baseUrl}/api/preview-workers/solidworks-document-manager-key`, {
    headers: { authorization: `Bearer ${previewToken}`, "x-pdm-preview-worker-token": previewToken }
  });
  if (!response.ok) {
    const error = new Error(response.status === 404 ? "native_metadata_license_missing" : "native_metadata_credential_unavailable");
    error.code = response.status === 404 ? "native_metadata_license_missing" : "native_metadata_credential_unavailable";
    throw error;
  }
  const body = await response.json().catch(() => ({}));
  const key = String(body?.key ?? "").trim();
  if (!key) {
    const error = new Error("native_metadata_license_missing");
    error.code = "native_metadata_license_missing";
    throw error;
  }
  return {
    value: key,
    version: Number.isInteger(body?.version) ? body.version : null,
    fingerprint: body?.fingerprint ? String(body.fingerprint) : null,
    source: String(body?.source ?? "broker")
  };
}

async function stageSourceContent(job, source) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ai-pdm-recognition-"));
  try {
    const bytes = await requestSourceContent(job, source);
    const extension = source.fileExt.replace(/[^A-Za-z0-9]/gu, "").toLowerCase().slice(0, 12) || "bin";
    const filePath = path.join(directory, `${source.id.replace(/[^A-Za-z0-9._-]/gu, "_")}.${extension}`);
    await fs.writeFile(filePath, bytes, { flag: "wx" });
    return { directory, filePath };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

function commandArgs(name) {
  const value = String(process.env[name] ?? "[]").trim();
  const parsed = JSON.parse(value || "[]");
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${name}_INVALID`);
  return parsed;
}

async function discoverNativeReaderCommands() {
  const metadataScript = path.join(process.cwd(), "scripts", "run-solidworks-document-manager-metadata-extractor.mjs");
  const probeScript = path.join(process.cwd(), "scripts", "run-solidworks-document-manager-credential-probe.mjs");
  const [metadataExists, probeExists] = await Promise.all([
    fs.access(metadataScript).then(() => true).catch(() => false),
    fs.access(probeScript).then(() => true).catch(() => false)
  ]);
  if (metadataExists && !String(process.env.PDM_DRAWING_RECOGNITION_METADATA_CMD ?? "").trim()) {
    process.env.PDM_DRAWING_RECOGNITION_METADATA_CMD = process.execPath;
    process.env.PDM_DRAWING_RECOGNITION_METADATA_ARGS = JSON.stringify(["--experimental-transform-types", metadataScript]);
  }
  if (probeExists && !String(process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD ?? "").trim()) {
    process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD = process.execPath;
    process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_ARGS = JSON.stringify([probeScript]);
  }
  return Boolean(String(process.env.PDM_DRAWING_RECOGNITION_METADATA_CMD ?? "").trim());
}

async function runExternal(source, job, adapterCode, commandName, argsName, sourcePathOverride = null, envOverrides = {}) {
  const command = String(process.env[commandName] ?? "").trim();
  if (!command) return buildUnsupportedAdapterResult(source.id, adapterCode, `${commandName} is not configured.`);
  const args = commandArgs(argsName);
  const timeoutMs = Math.max(1_000, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_ADAPTER_TIMEOUT_MS ?? 30_000), 120_000));
  const maxAttempts = Math.max(1, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_ADAPTER_ATTEMPTS ?? 2), 3));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runExternalAttempt(source, job, adapterCode, command, args, timeoutMs, sourcePathOverride, envOverrides);
    const validationFailure = result.diagnostics?.some((diagnostic) => diagnostic.startsWith("validation:"));
    if (!["failed", "timeout"].includes(result.status) || validationFailure || attempt === maxAttempts) return result;
    await delay(250 * (2 ** (attempt - 1)));
  }
  return { sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: ["adapter retry state invalid"] };
}

async function runExternalAttempt(source, job, adapterCode, command, args, timeoutMs, sourcePathOverride, envOverrides = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, ...envOverrides } });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; terminateProcessTree(child); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(0, 2_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 8_000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [String(error.message).slice(0, 300)] });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal || timedOut) return resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "timeout", diagnostics: [`timeout after ${timeoutMs}ms`] });
      if (code !== 0) return resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [`exit ${code}: ${stderr}`.slice(0, 300)] });
      try { resolve(validateExternalAdapterResult(source.id, adapterCode, JSON.parse(stdout))); }
      catch (error) { resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [`validation: ${String(error)}`.slice(0, 300)] }); }
    });
    child.stdin.end(JSON.stringify({
      schemaVersion: "drawing-recognition-extractor.v1",
      adapter: adapterCode,
      sessionId: job.sessionId,
      sourceId: source.id,
      companyId: job.companyId,
      fileName: source.fileName,
      fileExt: source.fileExt,
      fileSize: source.fileSize,
      sourcePath: sourcePathOverride ?? (source.storageProvider === "local_repository" ? source.originalPath ?? null : null),
      contentHash: source.contentHash,
      mimeType: source.mimeType,
      targetContext: job.targetContext,
      languageHints: ["zh-TW", "en"],
      requestedCapabilities: adapterCode.startsWith("native-metadata") ? ["cad_metadata"] : ["ocr_text", "layout"]
    }));
  });
}

async function recognize(job, capability) {
  const results = [];
  for (const source of job.sources) {
    results.push(buildFilenameAdapterResult(source));
    const fixture = fixtureMode ? buildA0005FixtureResult(job, source) : null;
    if (fixture) {
      results.push(fixture);
      continue;
    }
    if (isSolidWorksNativeSource(source)) {
      let staged = null;
      try {
        if (!capability.nativeMetadataConfigured) {
          results.push(buildUnsupportedAdapterResult(source.id, "native-metadata-bridge.v1", "native_metadata_not_configured"));
        } else if (!capability.credential?.value) {
          results.push(buildUnsupportedAdapterResult(source.id, "native-metadata-bridge.v1", "native_metadata_license_missing"));
        } else {
          staged = await stageSourceContent(job, source);
          results.push(await runExternal(source, job, "native-metadata-bridge.v1", "PDM_DRAWING_RECOGNITION_METADATA_CMD", "PDM_DRAWING_RECOGNITION_METADATA_ARGS", staged.filePath, {
            PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY: capability.credential.value
          }));
        }
      } catch (error) {
        const code = String(error?.code ?? "RECOGNITION_SOURCE_CONTENT_UNAVAILABLE");
        const diagnostic = ["native_metadata_license_missing", "native_metadata_credential_unavailable"].includes(code)
          ? "native_metadata_license_missing"
          : code === "RECOGNITION_SOURCE_HASH_MISMATCH" ? "native_metadata_hash_mismatch" : "native_metadata_source_content_unavailable";
        results.push({ sourceId: source.id, adapterCode: "native-metadata-bridge.v1", adapterVersion: "worker", status: "failed", diagnostics: [diagnostic] });
      } finally {
        if (staged) await fs.rm(staged.directory, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
  return results;
}

function isSolidWorksNativeSource(source) {
  return ["sldprt", "sldasm", "slddrw"].includes(String(source.fileExt ?? "").trim().toLowerCase().replace(/^\./u, ""));
}

async function sendCapabilityHeartbeat(input = {}) {
  const credential = input.credential ?? null;
  await requestWorker("/api/recognition-workers/heartbeat", {
    workerId,
    capability: "solidworks_document_manager",
    status: credential?.value ? "ready" : "blocked",
    appliedSecretKind: credential?.value ? "solidworks_document_manager" : null,
    appliedSecretVersion: credential?.version ?? null,
    appliedSecretFingerprint: credential?.fingerprint ?? null,
    readerVersion: "solidworks-document-manager-reader.v1",
    issueCode: credential?.value ? null : "native_metadata_license_missing",
    lastAppliedAt: credential?.value ? new Date().toISOString() : null
  });
}

async function processProbeJob(job) {
  let credential = null;
  try {
    const credentialResponse = await fetch(`${baseUrl}/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/credential`, {
      headers: { authorization: `Bearer ${previewToken}`, "x-pdm-preview-worker-token": previewToken, "x-pdm-worker-id": workerId }
    });
    const credentialBody = await credentialResponse.json().catch(() => ({}));
    if (!credentialResponse.ok || !credentialBody?.value) {
      const error = new Error(String(credentialBody?.error ?? "native_metadata_license_missing"));
      error.code = String(credentialBody?.error ?? "native_metadata_license_missing");
      throw error;
    }
    credential = credentialBody;
    const probeHeartbeat = setInterval(() => void requestWorker(`/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/heartbeat`, { workerId }).catch(() => undefined), 5_000);
    let result;
    try {
      result = await runExternal(
        { id: job.id },
        { sessionId: `settings-probe:${job.id}`, companyId: "system", targetContext: {}, sourceSetFingerprint: "settings-probe" },
        "solidworks-credential-probe.v1",
        "PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_CMD",
        "PDM_SOLIDWORKS_DOCUMENT_MANAGER_PROBE_ARGS",
        null,
        { PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY: credential.value }
      );
    } finally {
      clearInterval(probeHeartbeat);
    }
    const passed = result.status === "succeeded" || result.status === "success";
    await requestWorker(`/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/complete`, {
      workerId,
      status: passed ? "passed" : "failed",
      resultCode: passed ? null : "native_metadata_credential_probe_failed",
      readerVersion: result.adapterVersion ?? "solidworks-document-manager-reader.v1",
      summary: passed ? "SolidWorks Document Manager application probe 通過。" : "SolidWorks Document Manager application probe 未通過。"
    });
    await sendCapabilityHeartbeat({ credential: passed ? credential : null });
  } catch (error) {
    await requestWorker(`/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/complete`, {
      workerId,
      status: "blocked",
      resultCode: String(error?.code ?? "native_metadata_credential_probe_failed").slice(0, 120),
      readerVersion: "solidworks-document-manager-reader.v1"
    }).catch(() => undefined);
    await sendCapabilityHeartbeat().catch(() => undefined);
  }
}

while (true) {
  try {
    const nativeMetadataConfigured = await discoverNativeReaderCommands();
    const credential = await ensureNativeReaderCredential().catch(() => null);
    await sendCapabilityHeartbeat({ credential }).catch(() => undefined);
    const probeJob = await requestWorker("/api/settings-secret-probe-jobs/claim", { workerId });
    if (probeJob) {
      await processProbeJob(probeJob);
      if (once) break;
      continue;
    }
    const job = await request("/api/recognition-jobs/claim", {
      workerId,
      maxAttempts: Number(process.env.PDM_DRAWING_RECOGNITION_MAX_ATTEMPTS ?? 2),
      allowNativeSources: true
    });
    if (!job) {
      if (once) break;
      await delay(pollIntervalMs);
      continue;
    }
    await request(`/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/heartbeat`, { workerId });
    const heartbeatTimer = setInterval(() => void request(`/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/heartbeat`, { workerId }).catch(() => undefined), 5_000);
    try {
      const results = await recognize(job, { nativeMetadataConfigured, credential });
      await request(`/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/complete`, {
        workerId,
        sourceSetFingerprint: job.sourceSetFingerprint,
        results
      });
    } finally {
      clearInterval(heartbeatTimer);
    }
    if (once) break;
  } catch (error) {
    if (once) throw error;
    console.error(`[drawing-recognition-worker] request cycle failed (${errorSummary(error)}); retrying in ${reconnectDelayMs}ms.`);
    await delay(reconnectDelayMs);
  }
}

function terminateProcessTree(child) {
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    killer.on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
}
