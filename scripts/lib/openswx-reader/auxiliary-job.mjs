import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { boundedProcess } from "./process.mjs";
import { normalizeAuxiliary, READER_COMMIT, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES } from "./normalize.mjs";
export const APP_ORIGIN = "https://ai-pdm-prod-9536592944.asia-east1.run.app";
const JOB = "projects/9536592944/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata";
const READER = "/usr/local/bin/aipdm-openswx-reader";
const parserEnv = Object.freeze({ LANG: "C.UTF-8", LC_ALL: "C.UTF-8" });
const sha = b => crypto.createHash("sha256").update(b).digest("hex");
const safeId = value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(value);
export function executionFromEnvironment(env) {
  if (env.CLOUD_RUN_JOB !== "ai-pdm-prod-openswx-metadata" || !/^ai-pdm-prod-openswx-metadata-[a-z0-9-]{1,28}$/u.test(env.CLOUD_RUN_EXECUTION ?? "") || env.CLOUD_RUN_TASK_INDEX !== "0" || env.CLOUD_RUN_TASK_ATTEMPT !== "0") throw Error("OPENSWX_EXECUTION_ENV_INVALID");
  return `${JOB}/executions/${env.CLOUD_RUN_EXECUTION}`;
}
async function parser(file, signal) {
  if (process.platform !== "linux" || process.arch !== "x64") throw Error("PARSER_ISOLATION_UNAVAILABLE");
  const result = await boundedProcess(READER, [file], { env: parserEnv, signal, timeoutMs: file === "--isolation-self-test" ? 5000 : 30000, maxBytes: MAX_OUTPUT_BYTES });
  if (result.reason || !result.cleanupVerified) throw Error(result.reason === "aborted" ? "OPENSWX_ABORTED" : "PARSER_CLEANUP_UNVERIFIED");
  const payload = JSON.parse(result.stdout);
  if (file === "--isolation-self-test") {
    if (result.code !== 0 || payload.schemaVersion !== "child_network_syscalls_denied.v1" || payload.status !== "verified") throw Error("PARSER_ISOLATION_UNAVAILABLE");
  } else if (![0, 2, 10, 11, 12].includes(result.code)) throw Error("PARSER_FAILED");
  return payload;
}
export async function isolationSelfTestOnly({ parse = parser, signal } = {}) {
  await parse("--isolation-self-test", signal);
  return { state: "isolation_verified" };
}
/** Explicit test seams prove finite control flow only; default execution requires actual Linux isolation self-test. */
export async function runAuxiliaryJob({ env = process.env, request = fetch, parse = parser, signal, deadlineMs = 270000, heartbeatMs = 5000, claimDelayMs = 1000, claimAttempts = 10 } = {}) {
  const executionName = executionFromEnvironment(env);
  const token = env.PDM_OPENSWX_READER_TOKEN;
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token ?? "") || env.GOOGLE_APPLICATION_CREDENTIALS || env.PDM_WORKLOAD_AUTH_CREDENTIALS || (env.PDM_OPENSWX_APP_ORIGIN && env.PDM_OPENSWX_APP_ORIGIN !== APP_ORIGIN)) throw Error("OPENSWX_WORKER_CONFIG_INVALID");
  const abort = new AbortController(), combined = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const deadline = setTimeout(() => abort.abort(), Math.min(deadlineMs, 270000));
  let temporary, heartbeat, heartbeatWork = Promise.resolve();
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  async function http(endpoint, method, body, maxBytes = MAX_OUTPUT_BYTES, fenceHeaders = {}) {
    const response = await request(`${APP_ORIGIN}${endpoint}`, { method, redirect: "error", headers: { ...headers, ...fenceHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.any([combined, AbortSignal.timeout(method === "GET" && endpoint.endsWith("/content") ? 60000 : 10000)]) });
    if (response.status === 204) return { status: 204 };
    const pendingClaim = response.status === 409 && endpoint === "/api/openswx-metadata-jobs/claim";
    if ((!response.ok && !pendingClaim) || !response.body) { await response.body?.cancel(); throw Error(`OPENSWX_HTTP_${response.status}`); }
    const reader = response.body.getReader(), chunks = []; let bytes = 0;
    try {
      while (true) { const r = await reader.read(); if (r.done) break; bytes += r.value.length; if (bytes > maxBytes) throw Error("OPENSWX_HTTP_OUTPUT_LIMIT"); chunks.push(r.value); }
      const output = Buffer.concat(chunks);
      if (pendingClaim && JSON.parse(output).code !== "OPENSWX_DISPATCH_PENDING") throw Error("OPENSWX_CLAIM_REJECTED");
      return { status: response.status, bytes: output, hash: response.headers.get("content-hash") };
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  try {
    // Before claim or any CAD download; no silent direct-parser fallback.
    await parse("--isolation-self-test", combined);
    let job;
    for (let n = 0; n < Math.min(claimAttempts, 10); n++) {
      const claimed = await http("/api/openswx-metadata-jobs/claim", "POST", { executionName }, 16384);
      if (claimed.status === 204) return { state: "empty" };
      if (claimed.status !== 409) { job = JSON.parse(claimed.bytes).job; break; }
      if (n + 1 < Math.min(claimAttempts, 10)) await new Promise((resolve, reject) => { const timer = setTimeout(done, claimDelayMs); function done() { combined.removeEventListener("abort", cancel); resolve(); } function cancel() { clearTimeout(timer); reject(Error("OPENSWX_ABORTED")); } combined.addEventListener("abort", cancel, { once: true }); if (combined.aborted) cancel(); });
    }
    if (!job) throw Error("OPENSWX_DISPATCH_PENDING");
    if (!safeId(job.id) || job.executionName !== executionName || job.readerCommit !== READER_COMMIT || !/^[a-f0-9]{64}$/u.test(job.sourceSetFingerprint) || !Number.isSafeInteger(job.attempt) || job.attempt < 1 || job.attempt > 2 || !Array.isArray(job.sources) || !job.sources.length || job.sources.length > 8 || new Set(job.sources.map(s => s.id)).size !== job.sources.length || job.sources.some(s => !safeId(s.id) || !safeId(s.fileAssetId) || !/^[a-f0-9]{64}$/u.test(s.sha256) || !Number.isSafeInteger(s.bytes) || s.bytes < 1 || s.bytes > MAX_INPUT_BYTES || !["sldprt", "sldasm", "slddrw"].includes(s.extension))) throw Error("OPENSWX_CLAIM_BINDING_INVALID");
    const base = `/api/openswx-metadata-jobs/${encodeURIComponent(job.id)}`;
    const fence = { "x-openswx-attempt": String(job.attempt), "x-openswx-reader-commit": READER_COMMIT, "x-openswx-source-fingerprint": job.sourceSetFingerprint, "x-openswx-execution": executionName };
    heartbeat = setInterval(() => { heartbeatWork = heartbeatWork.then(() => http(`${base}/heartbeat`, "POST", {}, 16384, fence)).catch(() => abort.abort()); }, heartbeatMs);
    temporary = await fs.mkdtemp(path.join(os.tmpdir(), "aipdm-openswx-"));
    const results = [];
    for (const source of job.sources) {
      if (combined.aborted) throw Error("OPENSWX_ABORTED");
      const content = await http(`${base}/sources/${encodeURIComponent(source.id)}/content`, "GET", undefined, source.bytes, fence);
      if (content.bytes?.length !== source.bytes || content.hash !== source.sha256 || sha(content.bytes) !== source.sha256) throw Error("OPENSWX_SOURCE_DRIFT");
      const file = path.join(temporary, `source.${source.extension}`);
      try { await fs.writeFile(file, content.bytes, { flag: "wx", mode: 0o600 }); const payload = await parse(file, combined); normalizeAuxiliary(payload, source); results.push({ sourceId: source.id, payload }); }
      finally { content.bytes?.fill(0); await fs.rm(file, { force: true }); }
    }
    const result = JSON.stringify({ schemaVersion: "aipdm.openswx-auxiliary.v1", results: job.sources.map(s => normalizeAuxiliary(results.find(r => r.sourceId === s.id).payload, s)) });
    if (Buffer.byteLength(result) > MAX_OUTPUT_BYTES || Buffer.byteLength(JSON.stringify({ results })) > MAX_OUTPUT_BYTES) throw Error("OPENSWX_RESULT_SIZE_LIMIT");
    const expectedDigest = sha(result);
    const verifyReceipt = value => { const saved = JSON.parse(value.bytes).job; if (saved?.id !== job.id || saved.status !== "completed" || saved.attempt !== job.attempt || saved.executionName !== executionName || saved.sourceSetFingerprint !== job.sourceSetFingerprint || saved.readerCommit !== READER_COMMIT || saved.completionDigest !== expectedDigest || !saved.completionReceiptId) throw Error("OPENSWX_COMPLETION_UNCONFIRMED"); return { state: "completed", receiptId: saved.completionReceiptId }; };
    try { return verifyReceipt(await http(`${base}/complete`, "POST", { results }, 16384, fence)); }
    catch {
      // Read back first. Unknown write is never a blind completion or new-job retry.
      return verifyReceipt(await http(base, "GET", undefined, 16384, fence));
    }
  } finally {
    clearTimeout(deadline); clearInterval(heartbeat); abort.abort();
    await heartbeatWork;
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}
