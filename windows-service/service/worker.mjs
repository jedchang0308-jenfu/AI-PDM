import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canonicalDigest, mapNativeProperties } from "./metadata-mapper.mjs";

const installDir = path.resolve(import.meta.dirname, "..");
const extractors = path.join(installDir, "extractors");
const dataRoot = path.join(process.env.ProgramData || os.tmpdir(), "AI-PDM Windows Service");
const jobsRoot = path.join(dataRoot, "jobs");
const maxSourceBytes = 268_435_456;
const nativeExtensions = new Set(["sldprt", "sldasm", "slddrw"]);

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function safe(value) { return String(value ?? "").replace(/[^A-Za-z0-9._-]/gu, "_").slice(0, 120) || "item"; }
function hash(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function jsonDigest(value) { return hash(Buffer.from(JSON.stringify(value), "utf8")); }
function leaseHeader(protocolVersion, leaseBasis) {
  return Buffer.from(JSON.stringify({ leaseProtocolVersion: protocolVersion, leaseBasis }), "utf8").toString("base64url");
}

async function api(credentials, workerId, endpoint, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 30_000);
  try {
    const response = await fetch(`${credentials.baseUrl}${endpoint}`, {
      method: init.method ?? "GET", signal: controller.signal,
      headers: { authorization: `Bearer ${credentials.token}`, "x-pdm-worker-id": workerId,
        ...(init.headers ?? {}), ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body)
    });
    const body = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 204) {
      const error = new Error(String(body?.error ?? `WORKER_HTTP_${response.status}`));
      error.status = response.status; error.body = body; throw error;
    }
    return body;
  } finally { clearTimeout(timer); }
}

async function content(credentials, workerId, endpoint, headers, expected) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(`${credentials.baseUrl}${endpoint}`, { signal: controller.signal,
      headers: { authorization: `Bearer ${credentials.token}`, "x-pdm-worker-id": workerId, ...headers } });
    if (!response.ok) throw Object.assign(new Error(`SOURCE_HTTP_${response.status}`), { status: response.status });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxSourceBytes || (expected.bytes != null && bytes.length !== Number(expected.bytes)) ||
        hash(bytes) !== String(expected.hash).toLowerCase()) throw new Error("SOURCE_INTEGRITY_MISMATCH");
    return bytes;
  } finally { clearTimeout(timer); }
}

function terminate(child) {
  if (!child.pid) return;
  const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
  killer.once("error", () => child.kill());
}

async function runJson(executable, args, credential, timeoutMs = 120_000) {
  return await new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.PDM_WORKLOAD_AUTH_CREDENTIALS;
    delete env.PDM_WORKLOAD_CREDENTIAL;
    if (credential) env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_KEY = credential;
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"], env });
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; terminate(child); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(0, 4_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(0, 8_000); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("NATIVE_PROCESS_TIMEOUT"));
      let parsed; try { parsed = JSON.parse(stdout.trim() || "{}"); } catch { return reject(new Error("NATIVE_RESULT_INVALID")); }
      resolve({ code: Number(code ?? 1), body: parsed, stderr });
    });
  });
}

async function stage(kind, id, extension, bytes) {
  await fs.mkdir(jobsRoot, { recursive: true });
  const directory = await fs.mkdtemp(path.join(jobsRoot, `${safe(kind)}-${safe(id)}-`));
  const sourcePath = path.join(directory, `source.${safe(extension)}`);
  await fs.writeFile(sourcePath, bytes, { flag: "wx" });
  return { directory, sourcePath };
}

async function cleanupStaleJobs() {
  await fs.mkdir(jobsRoot, { recursive: true });
  const now = Date.now();
  for (const entry of await fs.readdir(jobsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(jobsRoot, entry.name);
    const stat = await fs.stat(target).catch(() => null);
    if (stat && now - stat.mtimeMs > 24 * 60 * 60 * 1_000) await fs.rm(target, { recursive: true, force: true });
  }
}

async function documentManagerCredential(credentials, workerId, job, isStopping) {
  const query = new URLSearchParams({ kind: job.kind, jobId: job.id,
    ...(job.sourceId ? { sourceId: job.sourceId } : {}) });
  const preview = job.kind === "preview";
  while (!isStopping()) {
    try {
      const body = await api(credentials, workerId, `/api/preview-workers/solidworks-document-manager-key?${query}`, {
        headers: { [preview ? "x-pdm-preview-lease" : "x-pdm-recognition-lease"]:
          leaseHeader(preview ? 2 : 1, job.leaseBasis) }
      });
      if (!body?.key) throw new Error("DOCUMENT_MANAGER_LICENSE_KEY_MISSING");
      return { value: String(body.key), version: body.version ?? null, fingerprint: body.fingerprint ?? null };
    } catch (error) {
      if ([401, 403, 409, 426].includes(Number(error?.status))) throw error;
      // A missing/temporarily unavailable provider must not complete or reclaim
      // this job. Its existing pulse keeps the same lease and attempt alive.
      await sendCapabilityHeartbeats(credentials, workerId, null, "document_manager_credential_waiting").catch(error => {
        if ([401, 403, 426].includes(Number(error?.status))) throw error;
      });
      // No business CAD has been downloaded or executed yet. Keep its pulse
      // alive while giving an authorized management probe a serial recovery
      // turn, so this computer can repair the key it is waiting for.
      await processProbe(credentials, workerId).catch(error => {
        if ([401, 403, 426].includes(Number(error?.status))) throw error;
      });
      await delay(5_000);
    }
  }
  throw new Error("WORKER_STOPPING");
}

async function sendCapabilityHeartbeats(credentials, workerId, credential, issueCode = null) {
  const shared = { workerId, status: credential ? "ready" : "blocked", readerVersion: "solidworks-document-manager.v1",
    appliedSecretKind: credential ? "solidworks_document_manager" : null, appliedSecretVersion: credential?.version ?? null,
    appliedSecretFingerprint: credential?.fingerprint ?? null, issueCode, lastAppliedAt: credential ? new Date().toISOString() : null };
  await Promise.all([
    api(credentials, workerId, "/api/preview-workers/heartbeat", { method: "POST", body: { ...shared, capability: "solidworks_2d_preview_png" } }),
    api(credentials, workerId, "/api/preview-workers/heartbeat", { method: "POST", body: { ...shared, capability: "solidworks_3d_preview_png" } }),
    api(credentials, workerId, "/api/recognition-workers/heartbeat", { method: "POST", body: { ...shared, capability: "solidworks_document_manager" } })
  ]);
}

async function readbackCompletion(credentials, workerId, kind, jobId, expectation) {
  const readback = await api(credentials, workerId, `/api/windows-service/jobs/${kind}/${encodeURIComponent(jobId)}`);
  return readback?.completion?.resultDigest === expectation.digest &&
    readback.completion.workerId === workerId &&
    (!expectation.status || readback.status === expectation.status);
}

async function completeWithReadback(credentials, workerId, kind, jobId, endpoint, body, expectation) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await api(credentials, workerId, endpoint, { method: "POST", body, timeoutMs: 30_000 }); }
    catch (error) {
      if (await readbackCompletion(credentials, workerId, kind, jobId, expectation).catch(() => false)) return { readback: true };
      if (error?.status && error.status < 500) throw error;
      if (attempt === 2) throw error;
      await delay(1_000 * (attempt + 1));
    }
  }
}

async function processPreview(credentials, workerId, isStopping) {
  const claim = await api(credentials, workerId, "/api/preview-jobs/claim", { method: "POST", body: {
    workerId, leaseProtocolVersion: 2, supportedKinds: ["native_thumbnail_png"],
    supportedExtensions: ["sldprt", "sldasm", "slddrw"] } });
  const job = claim?.job;
  if (!job) return false;
  const pulse = () => api(credentials, workerId, `/api/preview-jobs/${encodeURIComponent(job.jobId)}/heartbeat`, {
    method: "POST", body: { workerId, leaseProtocolVersion: 2, leaseBasis: job.leaseBasis } });
  await pulse();
  const heartbeat = setInterval(() => void pulse().catch(() => undefined), 5_000);
  let staged;
  let credential = null;
  let completionStarted = false;
  try {
    credential = await documentManagerCredential(credentials, workerId,
      { kind: "preview", id: job.jobId, leaseBasis: job.leaseBasis }, isStopping);
    await sendCapabilityHeartbeats(credentials, workerId, credential);
    const bytes = await content(credentials, workerId, `/api/preview-jobs/${encodeURIComponent(job.jobId)}/content`,
      { "x-pdm-preview-lease": leaseHeader(2, job.leaseBasis) }, { hash: job.sourceContentHash });
    staged = await stage("preview", job.jobId, job.sourceExtension, bytes);
    const outputPath = path.join(staged.directory, "preview.png");
    const result = await runJson(path.join(extractors, "SolidWorksDocumentManagerPreviewExporter.exe"),
      [staged.sourcePath, outputPath], credential.value);
    if (result.code !== 0) throw new Error("DOCUMENT_MANAGER_PREVIEW_FAILED");
    const output = await fs.readFile(outputPath);
    const kind = job.sourceExtension === "slddrw" ? "sheet_png" : "model_preview_png";
    const complete = { workerId, jobId: job.jobId, leaseProtocolVersion: 2, leaseBasis: job.leaseBasis,
      status: "succeeded", sourceContentHash: job.sourceContentHash, derivatives: [{ kind,
        fileName: `${safe(job.sourceFileAssetId)}.png`, mimeType: "image/png", contentBase64: output.toString("base64"),
        generatorProfile: "solidworks_document_manager", generatorVersion: "1" }] };
    completionStarted = true;
    await completeWithReadback(credentials, workerId, "preview", job.jobId,
      `/api/preview-jobs/${encodeURIComponent(job.jobId)}/complete`, complete,
      { digest: canonicalDigest({ workerId, jobId: job.jobId, leaseBasis: job.leaseBasis, status: "succeeded",
        sourceContentHash: job.sourceContentHash, derivatives: complete.derivatives }), status: "succeeded" });
  } catch (error) {
    if (credential && !completionStarted) {
      const failed = { workerId, leaseProtocolVersion: 2, leaseBasis: job.leaseBasis, status: "failed",
        errorCode: "document_manager_preview_failed", errorSummary: "Document Manager 未提供可用的已儲存預覽。" };
      await completeWithReadback(credentials, workerId, "preview", job.jobId,
        `/api/preview-jobs/${encodeURIComponent(job.jobId)}/complete`, failed,
        { digest: canonicalDigest({ workerId, jobId: job.jobId, leaseBasis: job.leaseBasis, status: "failed",
          errorCode: failed.errorCode, errorSummary: failed.errorSummary }), status: "failed" }).catch(() => undefined);
    }
    throw error;
  } finally { credential = null; clearInterval(heartbeat); if (staged) await fs.rm(staged.directory, { recursive: true, force: true }); }
  return true;
}

function filenameResult(source) {
  const stem = String(source.fileName).replace(/\.[^.]+$/u, "");
  return { sourceId: source.id, adapterCode: "filename.v1", adapterVersion: "1.0.0", status: "succeeded",
    observations: [{ rawText: source.fileName, rawValue: stem, normalizedValue: stem, locationKind: "filename",
      confidenceBand: "high", category: "identity_relation", fieldKey: "source_file_stem", fieldLabel: "來源檔名",
      applicabilityScope: source.sourceRole }] };
}

async function processRecognition(credentials, workerId, isStopping) {
  const job = await api(credentials, workerId, "/api/recognition-jobs/claim", { method: "POST", body: {
    workerId, maxAttempts: 2, allowNativeSources: true } });
  if (!job) return false;
  const pulse = () => api(credentials, workerId, `/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/heartbeat`, {
    method: "POST", body: { workerId, leaseProtocolVersion: 1, leaseBasis: job.leaseBasis } });
  await pulse();
  const heartbeat = setInterval(() => void pulse().catch(() => undefined), 5_000);
  const results = [];
  let credential = null;
  try {
    const nativeSource = job.sources.find(source => nativeExtensions.has(String(source.fileExt ?? "").toLowerCase().replace(/^\./u, "")));
    if (nativeSource) {
      credential = await documentManagerCredential(credentials, workerId,
        { kind: "recognition", id: job.sessionId, sourceId: nativeSource.id, leaseBasis: job.leaseBasis }, isStopping);
      await sendCapabilityHeartbeats(credentials, workerId, credential);
    }
    for (const source of job.sources) {
      results.push(filenameResult(source));
      const extension = String(source.fileExt ?? "").toLowerCase().replace(/^\./u, "");
      if (!nativeExtensions.has(extension)) continue;
      let staged;
      try {
        const bytes = await content(credentials, workerId,
          `/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/sources/${encodeURIComponent(source.id)}/content`,
          { "x-pdm-recognition-lease": leaseHeader(1, job.leaseBasis) }, { bytes: source.fileSize, hash: source.contentHash });
        staged = await stage("recognition", job.sessionId, extension, bytes);
        const extracted = await runJson(path.join(extractors, "SolidWorksDocumentManagerMetadataExporter.exe"), [staged.sourcePath], credential.value);
        results.push(mapNativeProperties(job, source, extracted.body));
      } catch {
        results.push({ sourceId: source.id, adapterCode: "native-metadata-bridge.v1", adapterVersion: "solidworks-document-manager.v1",
          status: "failed", diagnostics: ["native_metadata_failed"], observations: [] });
      } finally { if (staged) await fs.rm(staged.directory, { recursive: true, force: true }); }
    }
    const complete = { workerId, leaseProtocolVersion: 1, leaseBasis: job.leaseBasis, results };
    await completeWithReadback(credentials, workerId, "recognition", job.sessionId,
      `/api/recognition-jobs/${encodeURIComponent(job.sessionId)}/complete`, complete,
      { digest: canonicalDigest({ results }) });
  } finally { credential = null; clearInterval(heartbeat); }
  return true;
}

async function processProbe(credentials, workerId) {
  const job = await api(credentials, workerId, "/api/settings-secret-probe-jobs/claim", { method: "POST",
    body: { workerId, protocolVersion: 2 } });
  if (!job) return false;
  const pulse = () => api(credentials, workerId, `/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/heartbeat`, {
    method: "POST", body: { workerId, leaseAttempt: job.leaseAttempt } });
  await pulse();
  const heartbeat = setInterval(() => void pulse().catch(() => undefined), 5_000);
  try {
    const credential = await api(credentials, workerId,
      `/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/credential?leaseAttempt=${job.leaseAttempt}`);
    const result = await runJson(path.join(extractors, "SolidWorksDocumentManagerCredentialProbe.exe"), [], credential.value);
    await sendCapabilityHeartbeats(credentials, workerId, result.code === 0 ? credential : null,
      result.code === 0 ? null : "document_manager_probe_failed");
    const completion = { workerId, leaseAttempt: job.leaseAttempt, status: result.code === 0 ? "passed" : "failed",
      resultCode: result.code === 0 ? null : "native_metadata_credential_probe_failed",
      readerVersion: "solidworks-document-manager.v1",
      summary: result.code === 0 ? "SolidWorks Document Manager application probe 通過。" : "SolidWorks Document Manager application probe 未通過。" };
    const digest = jsonDigest({ workerId, referenceId: job.secretReferenceId, attempt: job.leaseAttempt,
      status: completion.status, resultCode: completion.resultCode, readerVersion: completion.readerVersion,
      summary: completion.summary });
    await completeWithReadback(credentials, workerId, "probe", job.id,
      `/api/settings-secret-probe-jobs/${encodeURIComponent(job.id)}/complete`, completion,
      { digest, status: completion.status });
  } finally { clearInterval(heartbeat); }
  return true;
}

export async function runWindowsWorker({ credentials, workerId, isStopping, log }) {
  await cleanupStaleJobs();
  let next = "preview";
  while (!isStopping()) {
    try {
      if (await processProbe(credentials, workerId)) continue;
      const readiness = await api(credentials, workerId, "/api/preview-workers/solidworks-document-manager-key?readiness=1");
      if (readiness?.available !== true) {
        await sendCapabilityHeartbeats(credentials, workerId, null, "document_manager_credential_waiting");
        await delay(5_000);
        continue;
      }
      const worked = next === "preview"
        ? await processPreview(credentials, workerId, isStopping)
        : await processRecognition(credentials, workerId, isStopping);
      next = next === "preview" ? "recognition" : "preview";
      if (!worked) {
        const alternate = next === "preview"
          ? await processPreview(credentials, workerId, isStopping)
          : await processRecognition(credentials, workerId, isStopping);
        next = next === "preview" ? "recognition" : "preview";
        if (!alternate) await delay(5_000);
      }
    } catch (error) {
      if ([401, 403, 426].includes(Number(error?.status))) throw error;
      log("worker_cycle_retry", { reason: String(error?.message ?? error).slice(0, 180) });
      await sendCapabilityHeartbeats(credentials, workerId, null, "document_manager_worker_degraded").catch(() => undefined);
      await delay(5_000);
    }
  }
}
