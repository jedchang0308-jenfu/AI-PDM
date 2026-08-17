#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRODUCTION_RELEASE_TRAFFIC_VERSION = "ai-pdm-production-release-traffic/v1";
export const PRODUCTION_RELEASE_TRAFFIC_APPROVAL = "AI-PDM-PRODUCTION-RELEASE-TRAFFIC-APPROVED";
export const PRODUCTION_RELEASE_TARGET = Object.freeze({
  project: "jenfu-ai-pdm-prod",
  region: "asia-east1",
  service: "ai-pdm-prod"
});

const API_ROOT = "https://run.googleapis.com/v2";
const LATEST = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST";
const REVISION = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION";
const revisionPattern = /^ai-pdm-prod-[a-z0-9-]{3,48}$/u;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function shortRevision(value) {
  return value ? String(value).split("/").at(-1) : null;
}

function normalizeTrafficTargets(traffic) {
  if (!Array.isArray(traffic) || traffic.length < 1) {
    throw new Error("PRODUCTION_RELEASE_TRAFFIC_TARGETS_MISSING");
  }
  const normalized = traffic.map((target) => ({
    type: target.type ?? null,
    revision: shortRevision(target.revision),
    percent: Number(target.percent ?? 0),
    tag: target.tag ?? null
  }));
  if (normalized.some((target) => !Number.isInteger(target.percent) || target.percent < 0 || target.percent > 100)) {
    throw new Error("PRODUCTION_RELEASE_TRAFFIC_PERCENT_INVALID");
  }
  if (normalized.reduce((total, target) => total + target.percent, 0) !== 100) {
    throw new Error("PRODUCTION_RELEASE_TRAFFIC_PERCENT_TOTAL_INVALID");
  }
  return normalized;
}

export function buildReleaseTrafficPatch(kind, revision = "") {
  if (kind === "latest") {
    return { traffic: [{ type: LATEST, percent: 100 }] };
  }
  if (kind === "revision") {
    if (!revisionPattern.test(revision)) throw new Error("PRODUCTION_RELEASE_ROLLBACK_REVISION_INVALID");
    return { traffic: [{ type: REVISION, revision, percent: 100 }] };
  }
  throw new Error("PRODUCTION_RELEASE_TRAFFIC_PATCH_KIND_INVALID");
}

export function snapshotReleaseService(service) {
  const expectedName = `projects/${PRODUCTION_RELEASE_TARGET.project}/locations/${PRODUCTION_RELEASE_TARGET.region}/services/${PRODUCTION_RELEASE_TARGET.service}`;
  if (service?.name !== expectedName) throw new Error("PRODUCTION_RELEASE_SERVICE_TARGET_MISMATCH");
  if (!service.template || typeof service.template !== "object") {
    throw new Error("PRODUCTION_RELEASE_SERVICE_TEMPLATE_MISSING");
  }
  return {
    generation: service.generation ?? null,
    latestCreatedRevision: shortRevision(service.latestCreatedRevision),
    latestReadyRevision: shortRevision(service.latestReadyRevision),
    templateSha256: sha256Json(service.template),
    traffic: normalizeTrafficTargets(service.traffic)
  };
}

export function assertReleaseTrafficTransition(before, after, expected) {
  if (before.templateSha256 !== after.templateSha256) {
    throw new Error("PRODUCTION_RELEASE_TEMPLATE_DRIFT_DETECTED");
  }
  if (
    before.latestCreatedRevision !== after.latestCreatedRevision ||
    before.latestReadyRevision !== after.latestReadyRevision
  ) {
    throw new Error("PRODUCTION_RELEASE_REVISION_DRIFT_DETECTED");
  }
  if (!after.latestReadyRevision || after.latestCreatedRevision !== after.latestReadyRevision) {
    throw new Error("PRODUCTION_RELEASE_LATEST_REVISION_NOT_READY");
  }
  if (after.traffic.length !== 1 || after.traffic[0].percent !== 100 || after.traffic[0].tag !== null) {
    throw new Error("PRODUCTION_RELEASE_FINAL_TRAFFIC_INVALID");
  }
  const target = after.traffic[0];
  if (expected.kind === "latest" && (target.type !== LATEST || target.revision !== null)) {
    throw new Error("PRODUCTION_RELEASE_LATEST_TARGET_MISMATCH");
  }
  if (expected.kind === "revision" && (target.type !== REVISION || target.revision !== expected.revision)) {
    throw new Error("PRODUCTION_RELEASE_ROLLBACK_TARGET_MISMATCH");
  }
  return true;
}

export function isReleaseTrafficApplied(snapshot, expected) {
  if (!snapshot || !Array.isArray(snapshot.traffic) || snapshot.traffic.length !== 1) return false;
  const target = snapshot.traffic[0];
  if (target.percent !== 100 || target.tag !== null) return false;
  if (expected.kind === "latest") return target.type === LATEST && target.revision === null;
  if (expected.kind === "revision") return target.type === REVISION && target.revision === expected.revision;
  return false;
}

export function assertReleaseExecutionEnvironment(expectedLatestRevision, env = process.env) {
  if (env.PDM_PRODUCTION_RELEASE_TRAFFIC_APPROVAL !== PRODUCTION_RELEASE_TRAFFIC_APPROVAL) {
    throw new Error("PRODUCTION_RELEASE_TRAFFIC_APPROVAL_MISSING");
  }
  if (
    env.PDM_PRODUCTION_PROJECT_ID !== PRODUCTION_RELEASE_TARGET.project ||
    env.PDM_PRODUCTION_REGION !== PRODUCTION_RELEASE_TARGET.region ||
    env.PDM_PRODUCTION_SERVICE !== PRODUCTION_RELEASE_TARGET.service
  ) {
    throw new Error("PRODUCTION_RELEASE_TARGET_ENV_MISMATCH");
  }
  if (!expectedLatestRevision || env.PDM_PRODUCTION_EXPECTED_LATEST_REVISION !== expectedLatestRevision) {
    throw new Error("PRODUCTION_RELEASE_EXPECTED_LATEST_MISMATCH");
  }
}

function parseArgs(argv) {
  const args = {
    mode: "validate",
    rollbackRevision: "",
    expectedLatestRevision: "",
    outputDir: path.join("output", "production-release")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") args.mode = argv[++index] ?? "";
    else if (arg === "--rollback-revision") args.rollbackRevision = argv[++index] ?? "";
    else if (arg === "--expected-latest-revision") args.expectedLatestRevision = argv[++index] ?? "";
    else if (arg === "--output-dir") args.outputDir = argv[++index] ?? "";
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!new Set(["validate", "promote-latest", "rollback-revision"]).has(args.mode)) {
    throw new Error("PRODUCTION_RELEASE_TRAFFIC_MODE_INVALID");
  }
  if (args.mode !== "promote-latest") buildReleaseTrafficPatch("revision", args.rollbackRevision);
  return args;
}

function gcloudAccessToken() {
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "gcloud";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "gcloud.cmd auth print-access-token"]
    : ["auth", "print-access-token"];
  return execFileSync(executable, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function serviceUrl() {
  const { project, region, service } = PRODUCTION_RELEASE_TARGET;
  return `${API_ROOT}/projects/${project}/locations/${region}/services/${service}`;
}

async function apiRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-goog-user-project": PRODUCTION_RELEASE_TARGET.project,
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`CLOUD_RUN_V2_API_${response.status}:${body?.error?.status ?? "UNKNOWN"}`);
  return body;
}

async function readService(token) {
  return snapshotReleaseService(await apiRequest(serviceUrl(), token));
}

async function waitForReleaseTraffic(token, expected) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const snapshot = await readService(token);
    if (isReleaseTrafficApplied(snapshot, expected)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("PRODUCTION_RELEASE_TRAFFIC_CONVERGENCE_TIMEOUT");
}

async function patchTraffic(token, body, validateOnly) {
  const query = new URLSearchParams({ updateMask: "traffic", validateOnly: String(validateOnly) });
  return apiRequest(`${serviceUrl()}?${query}`, token, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
}

function assertExpectedLatest(snapshot, expectedLatestRevision) {
  if (!snapshot.latestReadyRevision || snapshot.latestCreatedRevision !== snapshot.latestReadyRevision) {
    throw new Error("PRODUCTION_RELEASE_LATEST_REVISION_NOT_READY");
  }
  if (!revisionPattern.test(expectedLatestRevision) || snapshot.latestReadyRevision !== expectedLatestRevision) {
    throw new Error("PRODUCTION_RELEASE_EXPECTED_LATEST_MISMATCH");
  }
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const token = gcloudAccessToken();
  const before = await readService(token);
  assertExpectedLatest(before, args.expectedLatestRevision);
  if (args.rollbackRevision === args.expectedLatestRevision) {
    throw new Error("PRODUCTION_RELEASE_ROLLBACK_MUST_PRECEDE_LATEST");
  }

  const report = {
    schemaVersion: PRODUCTION_RELEASE_TRAFFIC_VERSION,
    mode: args.mode,
    generatedAt: new Date().toISOString(),
    target: PRODUCTION_RELEASE_TARGET,
    expectedLatestRevision: args.expectedLatestRevision,
    rollbackRevision: args.rollbackRevision || null,
    before,
    validateOnlyAccepted: false,
    after: null,
    allChecksPassed: false
  };

  if (args.mode === "validate") {
    await patchTraffic(token, buildReleaseTrafficPatch("latest"), true);
    await patchTraffic(token, buildReleaseTrafficPatch("revision", args.rollbackRevision), true);
    report.validateOnlyAccepted = true;
  } else {
    assertReleaseExecutionEnvironment(args.expectedLatestRevision, env);
    const expected = args.mode === "promote-latest"
      ? { kind: "latest" }
      : { kind: "revision", revision: args.rollbackRevision };
    const body = args.mode === "promote-latest"
      ? buildReleaseTrafficPatch("latest")
      : buildReleaseTrafficPatch("revision", args.rollbackRevision);
    await patchTraffic(token, body, false);
    report.after = await waitForReleaseTraffic(token, expected);
    assertReleaseTrafficTransition(before, report.after, expected);
  }

  report.allChecksPassed = true;
  await mkdir(args.outputDir, { recursive: true });
  const outputPath = path.join(args.outputDir, `traffic-${args.mode}-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, mode: args.mode, allChecksPassed: true }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
