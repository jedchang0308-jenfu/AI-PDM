#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const CANONICAL_BASE_URL = "https://jenfu-ai-pdm-prod.web.app";
const candidatePattern = /^https:\/\/[a-z0-9-]+---ai-pdm-prod-[a-z0-9-]+\.a\.run\.app$/u;
const directPattern = /^https:\/\/ai-pdm-prod-[a-z0-9-]+\.a\.run\.app$/u;
const revisionPattern = /^ai-pdm-prod-[a-z0-9-]{3,48}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const sourceRevisionPattern = /^[a-f0-9]{40}$/u;

function parseArgs(argv) {
  const args = { kind: "", baseUrl: "", directBaseUrl: "", revision: "", imageDigest: "", sourceRevision: "", output: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--kind") args.kind = argv[++index] ?? "";
    else if (arg === "--base-url") args.baseUrl = argv[++index] ?? "";
    else if (arg === "--direct-base-url") args.directBaseUrl = argv[++index] ?? "";
    else if (arg === "--revision") args.revision = argv[++index] ?? "";
    else if (arg === "--image-digest") args.imageDigest = argv[++index] ?? "";
    else if (arg === "--source-revision") args.sourceRevision = argv[++index] ?? "";
    else if (arg === "--output") args.output = argv[++index] ?? "";
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!new Set(["candidate", "canonical"]).has(args.kind)) throw new Error("PRODUCTION_SMOKE_KIND_INVALID");
  if (args.kind === "candidate" && !candidatePattern.test(args.baseUrl)) throw new Error("PRODUCTION_SMOKE_CANDIDATE_URL_INVALID");
  if (args.kind === "canonical" && args.baseUrl !== CANONICAL_BASE_URL) throw new Error("PRODUCTION_SMOKE_CANONICAL_URL_INVALID");
  if (!directPattern.test(args.directBaseUrl)) throw new Error("PRODUCTION_SMOKE_DIRECT_URL_INVALID");
  if (!revisionPattern.test(args.revision)) throw new Error("PRODUCTION_SMOKE_REVISION_INVALID");
  if (!digestPattern.test(args.imageDigest)) throw new Error("PRODUCTION_SMOKE_IMAGE_DIGEST_INVALID");
  if (!sourceRevisionPattern.test(args.sourceRevision)) throw new Error("PRODUCTION_SMOKE_SOURCE_REVISION_INVALID");
  if (!args.output) throw new Error("PRODUCTION_SMOKE_OUTPUT_REQUIRED");
  return args;
}

async function request(url, init = {}) {
  return fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000) });
}

async function responseJson(response) {
  return response.json().catch(() => ({}));
}

async function run(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const checks = [];
  const check = async (name, expected, operation) => {
    try {
      const actual = await operation();
      const passed = typeof expected === "function" ? Boolean(expected(actual)) : actual === expected;
      checks.push({ name, passed, actual, expected: typeof expected === "function" ? "contract predicate" : expected });
    } catch (error) {
      checks.push({ name, passed: false, actual: error instanceof Error ? error.message : String(error), expected: typeof expected === "function" ? "contract predicate" : expected });
    }
  };

  await check(`${args.kind} login entrypoint`, (value) => value.status === 200 && value.shell === true, async () => {
    const response = await request(`${args.baseUrl}/login`);
    const body = await response.text();
    return { status: response.status, shell: /AI PDM/u.test(body), cacheControl: response.headers.get("cache-control") };
  });
  await check(`${args.kind} auth mode`, (value) => value.status === 200 && value.authMode === "firebase_bff" && value.noStore, async () => {
    const response = await request(`${args.baseUrl}/api/auth/mode`);
    const body = await responseJson(response);
    return { status: response.status, authMode: body.authMode ?? null, noStore: /no-store/iu.test(response.headers.get("cache-control") ?? "") };
  });
  await check(`${args.kind} production slice`, (value) => value.status === 200 && value.configured === true && value.active === true && value.mode === "official-numbering-draft" && value.noStore, async () => {
    const response = await request(`${args.baseUrl}/api/production-slice/status`);
    const body = await responseJson(response);
    return { status: response.status, configured: body.configured, active: body.active, mode: body.mode, noStore: /no-store/iu.test(response.headers.get("cache-control") ?? "") };
  });

  for (const apiPath of ["/api/numbering/permissions", "/api/numbering/draft-workspaces"]) {
    await check(`${args.kind} protected GET ${apiPath}`, (value) => value.status === 401 && value.noStore, async () => {
      const response = await request(`${args.baseUrl}${apiPath}`);
      return { status: response.status, noStore: /no-store/iu.test(response.headers.get("cache-control") ?? "") };
    });
  }

  for (const pagePath of ["/upload", "/handoff", "/approvals"]) {
    await check(`${args.kind} unopened page ${pagePath}`, 200, async () => (await request(`${args.baseUrl}${pagePath}`)).status);
  }

  for (const apiPath of [
    "/api/numbering/part-number-drafts/smoke-only/submit-review",
    "/api/files/upload",
    "/api/cad/preview",
    "/api/bom/publish"
  ]) {
    await check(`${args.kind} unopened mutation ${apiPath}`, (value) => value.status === 403 && value.code === "feature_not_open_in_production_slice" && value.mode === "official-numbering-draft", async () => {
      const response = await request(`${args.baseUrl}${apiPath}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      const body = await responseJson(response);
      return { status: response.status, code: body.error ?? null, mode: body.mode ?? null };
    });
  }

  await check("direct run.app session exchange denied", 403, async () => {
    const response = await request(`${args.directBaseUrl}/api/auth/firebase/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: args.directBaseUrl },
      body: JSON.stringify({ idToken: "smoke-only-invalid-token" })
    });
    return response.status;
  });

  const failed = checks.filter((item) => !item.passed).length;
  const report = {
    schemaVersion: "ai-pdm-production-release-smoke/v1",
    generatedAt: new Date().toISOString(),
    kind: args.kind,
    target: "jenfu-ai-pdm-prod",
    baseUrl: args.baseUrl,
    directBaseUrl: args.directBaseUrl,
    revision: args.revision,
    imageDigest: args.imageDigest,
    sourceRevision: args.sourceRevision,
    passed: checks.length - failed,
    failed,
    checks
  };
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: args.output, passed: report.passed, failed }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
