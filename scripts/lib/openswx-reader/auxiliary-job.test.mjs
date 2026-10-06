import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { boundedProcess } from "./process.mjs";
import { fileURLToPath } from "node:url";
import { runAuxiliaryJob, executionFromEnvironment, isolationSelfTestOnly } from "./auxiliary-job.mjs";
import { normalizeAuxiliary, READER_COMMIT } from "./normalize.mjs";
const env = { CLOUD_RUN_JOB: "ai-pdm-prod-openswx-metadata", CLOUD_RUN_EXECUTION: "ai-pdm-prod-openswx-metadata-test", CLOUD_RUN_TASK_INDEX: "0", CLOUD_RUN_TASK_ATTEMPT: "0", PDM_OPENSWX_READER_TOKEN: "x".repeat(43) };
const bytes = Buffer.from("synthetic-cad"), hash = crypto.createHash("sha256").update(bytes).digest("hex");
const source = { id: "source", fileAssetId: "asset", sha256: hash, bytes: bytes.length, extension: "sldprt", storageGeneration: null };
const payload = { schemaVersion: "aipdm.openswx-public-api.v1", status: "opened", documentType: "part", version: 1, sheetCount: 0, globalProperties: { Unicode: "本體", Empty: "" }, configurations: [] };
const job = { id: "job", attempt: 1, executionName: executionFromEnvironment(env), readerCommit: READER_COMMIT, sourceSetFingerprint: hash, sources: [source] };
const digest = crypto.createHash("sha256").update(JSON.stringify({ schemaVersion: "aipdm.openswx-auxiliary.v1", results: [normalizeAuxiliary(payload, source)] })).digest("hex");
const completed = { ...job, status: "completed", completionDigest: digest, completionReceiptId: "receipt" };
test("no-CAD bootstrap self-test needs no token and exposes no HTTP seam", async () => {
  const calls = [];
  assert.deepEqual(await isolationSelfTestOnly({ parse: async file => { calls.push(file); } }), { state: "isolation_verified" });
  assert.deepEqual(calls, ["--isolation-self-test"]);
});
test("isolation self-test occurs before claim; empty 204 ends without CAD", async () => {
  const calls = [];
  const result = await runAuxiliaryJob({ env, claimAttempts: 1, parse: async file => { calls.push(file); }, request: async url => { calls.push(url); return new Response(null, { status: 204 }); } });
  assert.equal(result.state, "empty"); assert.equal(calls[0], "--isolation-self-test"); assert.equal(calls.length, 2);
});
test("failed isolation performs zero HTTP", async () => { let calls = 0; await assert.rejects(runAuxiliaryJob({ env, parse: async () => { throw Error("PARSER_ISOLATION_UNAVAILABLE"); }, request: async () => { calls++; } }), /PARSER_ISOLATION_UNAVAILABLE/); assert.equal(calls, 0); });
test("pending 409 cannot masquerade as empty smoke and retries claim only within the fixed bound", async () => {
  let claims = 0;
  await assert.rejects(runAuxiliaryJob({ env, parse: async () => ({}), claimAttempts: 2, claimDelayMs: 1, request: async url => { assert.ok(url.endsWith("/claim")); claims++; return Response.json({ code: "OPENSWX_DISPATCH_PENDING" }, { status: 409 }); } }), /OPENSWX_DISPATCH_PENDING/);
  assert.equal(claims, 2);
});
test("actual closed entry rejects arbitrary commands and env arguments before any runner", async () => {
  const entry = fileURLToPath(new URL("../../run-openswx-metadata-job.mjs", import.meta.url));
  for (const args of [["--command", "echo"], ["--isolation-self-test-only", "--env=SECRET"], ["--arbitrary"]]) {
    const result = await boundedProcess(process.execPath, [entry, ...args], { timeoutMs: 5000, maxBytes: 1024, env: {} });
    assert.equal(result.code, 1); assert.equal(result.cleanupVerified, true); assert.equal(result.stdout, ""); assert.equal(result.stderr, "OPENSWX_FINITE_EXECUTION_FAILED\n");
  }
});
test("actual entry emits only closed state and execution fields; mock module does not prove Linux/HTTP", async () => {
  const entry = fileURLToPath(new URL("../../run-openswx-metadata-job.mjs", import.meta.url));
  for (const [state, args, expectedCode] of [["empty", [], 0], ["completed", [], 0], ["isolation_verified", ["--isolation-self-test-only"], 0], ["unexpected", [], 1], ["completed", ["--isolation-self-test-only"], 1]]) {
    const moduleSource = `export const runAuxiliaryJob=async()=>({state:${JSON.stringify(state)},receiptId:'PRIVATE_RECEIPT',result:'PRIVATE_RESULT'});export const isolationSelfTestOnly=runAuxiliaryJob;export const executionFromEnvironment=()=>${JSON.stringify(job.executionName)};`;
    const hook = `import {registerHooks} from 'node:module';registerHooks({load(url,context,next){if(url.endsWith('/lib/openswx-reader/auxiliary-job.mjs'))return {format:'module',source:${JSON.stringify(moduleSource)},shortCircuit:true};return next(url,context);}});`;
    const result = await boundedProcess(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(hook)}`, entry, ...args], { timeoutMs: 5000, maxBytes: 2048, env: { ...env, PDM_OPENSWX_READER_TOKEN: "PRIVATE_TOKEN" } });
    assert.equal(result.code, expectedCode); assert.equal(result.cleanupVerified, true);
    assert.ok(!result.stdout.includes("PRIVATE_"));
    if (expectedCode === 0) assert.deepEqual(JSON.parse(result.stdout), { schemaVersion: "aipdm.openswx-finite-terminal.v1", state, executionName: args.length ? null : job.executionName });
    else { assert.equal(result.stdout, ""); assert.equal(result.stderr, "OPENSWX_FINITE_EXECUTION_FAILED\n"); }
  }
});
test("one job, digest-confirmed completion and own temp cleanup", async () => {
  let file, claims = 0;
  const result = await runAuxiliaryJob({ env, parse: async p => { if (p === "--isolation-self-test") return {}; file = p; assert.deepEqual(await fs.readFile(p), bytes); return payload; }, request: async (url, init) => {
    assert.equal(init.redirect, "error"); assert.ok(url.startsWith("https://ai-pdm-prod-9536592944.asia-east1.run.app/"));
    if (url.endsWith("/claim")) { claims++; return Response.json({ job }); }
    if (url.endsWith("/content")) return new Response(bytes, { headers: { "content-hash": hash } });
    if (url.endsWith("/complete")) return Response.json({ job: completed });
    throw Error("unexpected-http");
  } });
  assert.deepEqual(result, { state: "completed", receiptId: "receipt" }); assert.equal(claims, 1); await assert.rejects(fs.stat(file), { code: "ENOENT" });
});
test("unknown completion reads exact attempt back once without another POST", async () => {
  let posts = 0, reads = 0;
  const result = await runAuxiliaryJob({ env, parse: async () => payload, request: async url => {
    if (url.endsWith("/claim")) return Response.json({ job });
    if (url.endsWith("/content")) return new Response(bytes, { headers: { "content-hash": hash } });
    if (url.endsWith("/complete")) { posts++; throw Error("unknown-response"); }
    reads++; return Response.json({ job: completed });
  } });
  assert.equal(result.state, "completed"); assert.equal(posts, 1); assert.equal(reads, 1);
});
test("wrong execution/project and result digest reject; foreign origins and ADC never accepted", async () => {
  assert.throws(() => executionFromEnvironment({ ...env, CLOUD_RUN_JOB: "sibling" }));
  for (const config of [{ ...env, GOOGLE_APPLICATION_CREDENTIALS: "forbidden" }, { ...env, PDM_OPENSWX_APP_ORIGIN: "https://sibling.test" }]) await assert.rejects(runAuxiliaryJob({ env: config }), /CONFIG_INVALID/);
  await assert.rejects(runAuxiliaryJob({ env, parse: async () => payload, request: async url => url.endsWith("/claim") ? Response.json({ job: { ...job, executionName: job.executionName.replace("9536592944", "123") } }) : Response.json({}) }), /CLAIM_BINDING_INVALID/);
  await assert.rejects(runAuxiliaryJob({ env, parse: async () => payload, request: async url => url.endsWith("/claim") ? Response.json({ job }) : url.endsWith("/content") ? new Response(bytes, { headers: { "content-hash": hash } }) : Response.json({ job: { ...completed, completionDigest: "b".repeat(64) } }) }), /COMPLETION_UNCONFIRMED/);
});
test("deadline abort prevents completion and cleans downloaded temp on parser abort", async () => {
  let file, completions = 0;
  await assert.rejects(runAuxiliaryJob({ env, deadlineMs: 100, parse: async (p, signal) => {
    if (p === "--isolation-self-test") return {}; file = p;
    await new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(Error("aborted")), { once: true }); if (signal.aborted) reject(Error("aborted")); });
  }, request: async url => { if (url.endsWith("/claim")) return Response.json({ job }); if (url.endsWith("/content")) return new Response(bytes, { headers: { "content-hash": hash } }); completions++; return Response.json({}); } }), /aborted/);
  assert.equal(completions, 0); await assert.rejects(fs.stat(file), { code: "ENOENT" });
});
