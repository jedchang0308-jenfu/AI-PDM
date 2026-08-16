import crypto from "node:crypto";
import { spawn } from "node:child_process";
import {
  buildA0005FixtureResult,
  buildFilenameAdapterResult,
  buildUnsupportedAdapterResult,
  validateExternalAdapterResult
} from "../src/lib/drawing-recognition-adapters.ts";

const baseUrl = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/u, "");
const token = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_TOKEN ?? "").trim();
const workerId = String(process.env.PDM_DRAWING_RECOGNITION_WORKER_ID ?? `local-${crypto.randomUUID()}`).trim();
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

function commandArgs(name) {
  const value = String(process.env[name] ?? "[]").trim();
  const parsed = JSON.parse(value || "[]");
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) throw new Error(`${name}_INVALID`);
  return parsed;
}

async function runExternal(source, job, adapterCode, commandName, argsName) {
  const command = String(process.env[commandName] ?? "").trim();
  if (!command) return buildUnsupportedAdapterResult(source.id, adapterCode, `${commandName} is not configured.`);
  const args = commandArgs(argsName);
  const timeoutMs = Math.max(1_000, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_ADAPTER_TIMEOUT_MS ?? 30_000), 120_000));
  const maxAttempts = Math.max(1, Math.min(Number(process.env.PDM_DRAWING_RECOGNITION_ADAPTER_ATTEMPTS ?? 2), 3));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await runExternalAttempt(source, job, adapterCode, command, args, timeoutMs);
    const validationFailure = result.diagnostics?.some((diagnostic) => diagnostic.startsWith("validation:"));
    if (!["failed", "timeout"].includes(result.status) || validationFailure || attempt === maxAttempts) return result;
    await delay(250 * (2 ** (attempt - 1)));
  }
  return { sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: ["adapter retry state invalid"] };
}

async function runExternalAttempt(source, job, adapterCode, command, args, timeoutMs) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(0, 2_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 8_000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [String(error.message).slice(0, 300)] });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (signal) return resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "timeout", diagnostics: [`timeout after ${timeoutMs}ms`] });
      if (code !== 0) return resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [`exit ${code}: ${stderr}`.slice(0, 300)] });
      try { resolve(validateExternalAdapterResult(source.id, adapterCode, JSON.parse(stdout))); }
      catch (error) { resolve({ sourceId: source.id, adapterCode, adapterVersion: "external", status: "failed", diagnostics: [`validation: ${String(error)}`.slice(0, 300)] }); }
    });
    child.stdin.end(JSON.stringify({
      schemaVersion: "drawing-recognition-extractor.v1",
      adapter: adapterCode,
      sessionId: job.sessionId,
      sourceId: source.id,
      sourcePath: source.storageProvider === "local_repository" ? source.originalPath ?? null : null,
      contentHash: source.contentHash,
      mimeType: source.mimeType,
      languageHints: ["zh-TW", "en"],
      requestedCapabilities: adapterCode.startsWith("native-metadata") ? ["cad_metadata"] : ["ocr_text", "layout"]
    }));
  });
}

async function recognize(job) {
  const results = [];
  for (const source of job.sources) {
    results.push(buildFilenameAdapterResult(source));
    const fixture = fixtureMode ? buildA0005FixtureResult(job, source) : null;
    if (fixture) {
      results.push(fixture);
      continue;
    }
    results.push(await runExternal(source, job, "native-metadata-bridge.v1", "PDM_DRAWING_RECOGNITION_METADATA_CMD", "PDM_DRAWING_RECOGNITION_METADATA_ARGS"));
    results.push(await runExternal(source, job, "external-json-ocr.v1", "PDM_DRAWING_RECOGNITION_OCR_CMD", "PDM_DRAWING_RECOGNITION_OCR_ARGS"));
  }
  return results;
}

while (true) {
  try {
    const job = await request("/api/recognition-jobs/claim", { workerId, maxAttempts: Number(process.env.PDM_DRAWING_RECOGNITION_MAX_ATTEMPTS ?? 2) });
    if (!job) {
      if (once) break;
      await delay(pollIntervalMs);
      continue;
    }
    await request(`/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/heartbeat`, { workerId });
    const results = await recognize(job);
    await request(`/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/complete`, {
      workerId,
      sourceSetFingerprint: job.sourceSetFingerprint,
      results
    });
    if (once) break;
  } catch (error) {
    if (once) throw error;
    console.error(`[drawing-recognition-worker] request cycle failed (${errorSummary(error)}); retrying in ${reconnectDelayMs}ms.`);
    await delay(reconnectDelayMs);
  }
}
