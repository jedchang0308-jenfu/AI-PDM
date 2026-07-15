#!/usr/bin/env node

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const DEV032_TRAFFIC_ROLLBACK_VERSION = "dev-032-production-traffic-rollback/v1";
export const DEV032_TRAFFIC_ROLLBACK_APPROVAL =
  "DEV-032-PRODUCTION-CLOUD-RUN-TRAFFIC-ROLLBACK-APPROVED";
export const DEV032_TRAFFIC_TARGET = Object.freeze({
  project: "jenfu-ai-pdm-prod",
  region: "asia-east1",
  service: "ai-pdm-prod"
});

const API_ROOT = "https://run.googleapis.com/v2";
const LATEST = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST";
const REVISION = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])])
  );
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function shortRevision(value) {
  return value ? String(value).split("/").at(-1) : null;
}

function normalizeTraffic(traffic) {
  if (!Array.isArray(traffic) || traffic.length !== 1) {
    throw new Error("PRODUCTION_TRAFFIC_MUST_HAVE_EXACTLY_ONE_TARGET");
  }
  const target = traffic[0];
  return {
    type: target.type ?? null,
    revision: shortRevision(target.revision),
    percent: Number(target.percent),
    tag: target.tag ?? null
  };
}

export function buildTrafficPatchBody(kind, rollbackRevision = "") {
  if (kind === "rollback") {
    if (!/^ai-pdm-prod-\d{5}-[a-z0-9]+$/u.test(rollbackRevision)) {
      throw new Error("PRODUCTION_ROLLBACK_REVISION_INVALID");
    }
    return {
      traffic: [{ type: REVISION, revision: rollbackRevision, percent: 100 }]
    };
  }
  if (kind === "latest") {
    return {
      traffic: [{ type: LATEST, percent: 100 }]
    };
  }
  throw new Error("PRODUCTION_TRAFFIC_PATCH_KIND_INVALID");
}

export function snapshotService(service) {
  const expectedName = `projects/${DEV032_TRAFFIC_TARGET.project}/locations/${DEV032_TRAFFIC_TARGET.region}/services/${DEV032_TRAFFIC_TARGET.service}`;
  if (service?.name !== expectedName) throw new Error("PRODUCTION_CLOUD_RUN_SERVICE_TARGET_MISMATCH");
  if (!service.template || typeof service.template !== "object") {
    throw new Error("PRODUCTION_CLOUD_RUN_TEMPLATE_MISSING");
  }
  return {
    generation: service.generation ?? null,
    latestCreatedRevision: service.latestCreatedRevision ?? null,
    latestReadyRevision: service.latestReadyRevision ?? null,
    templateSha256: sha256Json(service.template),
    traffic: normalizeTraffic(service.traffic)
  };
}

export function assertTrafficTransition(before, after, expected) {
  if (before.templateSha256 !== after.templateSha256) {
    throw new Error("PRODUCTION_CLOUD_RUN_TEMPLATE_DRIFT_DETECTED");
  }
  if (
    before.latestCreatedRevision !== after.latestCreatedRevision ||
    before.latestReadyRevision !== after.latestReadyRevision
  ) {
    throw new Error("PRODUCTION_CLOUD_RUN_REVISION_DRIFT_DETECTED");
  }
  if (after.latestCreatedRevision !== after.latestReadyRevision) {
    throw new Error("PRODUCTION_CLOUD_RUN_LATEST_REVISION_NOT_READY");
  }
  if (after.traffic.percent !== 100 || after.traffic.tag !== null) {
    throw new Error("PRODUCTION_CLOUD_RUN_TRAFFIC_ALLOCATION_INVALID");
  }
  if (expected.kind === "rollback") {
    if (after.traffic.type !== REVISION || after.traffic.revision !== expected.revision) {
      throw new Error("PRODUCTION_CLOUD_RUN_ROLLBACK_TARGET_MISMATCH");
    }
  } else if (expected.kind === "latest") {
    if (after.traffic.type !== LATEST || after.traffic.revision !== null) {
      throw new Error("PRODUCTION_CLOUD_RUN_LATEST_TARGET_MISMATCH");
    }
  } else {
    throw new Error("PRODUCTION_TRAFFIC_EXPECTATION_INVALID");
  }
  return true;
}

export function assertExecutionEnvironment(expectedLatestRevision, env = process.env) {
  if (env.DEV032_PRODUCTION_TRAFFIC_ROLLBACK_APPROVAL !== DEV032_TRAFFIC_ROLLBACK_APPROVAL) {
    throw new Error("PRODUCTION_TRAFFIC_ROLLBACK_APPROVAL_MISSING");
  }
  if (
    env.DEV032_PRODUCTION_PROJECT_ID !== DEV032_TRAFFIC_TARGET.project ||
    env.DEV032_PRODUCTION_REGION !== DEV032_TRAFFIC_TARGET.region ||
    env.DEV032_PRODUCTION_SERVICE !== DEV032_TRAFFIC_TARGET.service
  ) {
    throw new Error("PRODUCTION_TRAFFIC_ROLLBACK_TARGET_ENV_MISMATCH");
  }
  if (!expectedLatestRevision || env.DEV032_PRODUCTION_EXPECTED_LATEST_REVISION !== expectedLatestRevision) {
    throw new Error("PRODUCTION_TRAFFIC_ROLLBACK_LATEST_REVISION_MISMATCH");
  }
}

function parseArgs(argv) {
  const args = {
    mode: "validate",
    rollbackRevision: "",
    expectedLatestRevision: "",
    outputDir: path.join("output", "dev-032-rollback-drill")
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") args.mode = argv[++index] ?? "";
    else if (arg === "--rollback-revision") args.rollbackRevision = argv[++index] ?? "";
    else if (arg === "--expected-latest-revision") args.expectedLatestRevision = argv[++index] ?? "";
    else if (arg === "--output-dir") args.outputDir = argv[++index] ?? "";
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!new Set(["validate", "drill", "restore-latest"]).has(args.mode)) {
    throw new Error("PRODUCTION_TRAFFIC_ROLLBACK_MODE_INVALID");
  }
  if (args.mode !== "restore-latest") buildTrafficPatchBody("rollback", args.rollbackRevision);
  return args;
}

function gcloudAccessToken() {
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "gcloud";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "gcloud.cmd auth print-access-token"]
    : ["auth", "print-access-token"];
  return execFileSync(executable, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function serviceUrl() {
  const { project, region, service } = DEV032_TRAFFIC_TARGET;
  return `${API_ROOT}/projects/${project}/locations/${region}/services/${service}`;
}

async function apiRequest(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-goog-user-project": DEV032_TRAFFIC_TARGET.project,
      ...(init.headers ?? {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`CLOUD_RUN_V2_API_${response.status}:${body?.error?.status ?? "UNKNOWN"}`);
  }
  return body;
}

async function waitForOperation(operation, token) {
  if (!operation?.name) return operation;
  let current = operation;
  for (let attempt = 0; attempt < 60 && !current.done; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    current = await apiRequest(`${API_ROOT}/${operation.name}`, token);
  }
  if (!current.done) throw new Error("PRODUCTION_TRAFFIC_OPERATION_TIMEOUT");
  if (current.error) throw new Error(`PRODUCTION_TRAFFIC_OPERATION_FAILED:${current.error.code ?? "UNKNOWN"}`);
  return current;
}

async function readService(token) {
  return snapshotService(await apiRequest(serviceUrl(), token));
}

async function patchTraffic(token, body, validateOnly) {
  const query = new URLSearchParams({
    updateMask: "traffic",
    validateOnly: String(validateOnly)
  });
  const operation = await apiRequest(`${serviceUrl()}?${query}`, token, {
    method: "PATCH",
    body: JSON.stringify(body)
  });
  // Cloud Run accepts validate-only requests but does not retain their operation for polling.
  return validateOnly ? operation : waitForOperation(operation, token);
}

function assertExpectedLatest(snapshot, expectedLatestRevision) {
  const currentCreated = shortRevision(snapshot.latestCreatedRevision);
  const currentReady = shortRevision(snapshot.latestReadyRevision);
  if (!currentCreated || currentCreated !== currentReady) {
    throw new Error("PRODUCTION_CLOUD_RUN_LATEST_REVISION_NOT_READY");
  }
  if (expectedLatestRevision && currentCreated !== expectedLatestRevision) {
    throw new Error("PRODUCTION_TRAFFIC_ROLLBACK_LATEST_REVISION_MISMATCH");
  }
  return currentCreated;
}

async function run(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const token = gcloudAccessToken();
  const startedAt = new Date().toISOString();
  const before = await readService(token);
  const expectedLatestRevision = args.expectedLatestRevision || assertExpectedLatest(before, "");
  assertExpectedLatest(before, expectedLatestRevision);

  if (args.mode !== "validate") assertExecutionEnvironment(expectedLatestRevision, env);
  if (args.rollbackRevision && args.rollbackRevision === expectedLatestRevision) {
    throw new Error("PRODUCTION_ROLLBACK_REVISION_MUST_PRECEDE_LATEST");
  }

  const report = {
    schemaVersion: DEV032_TRAFFIC_ROLLBACK_VERSION,
    mode: args.mode,
    startedAt,
    target: DEV032_TRAFFIC_TARGET,
    rollbackRevision: args.rollbackRevision || null,
    expectedLatestRevision,
    before,
    validateOnlyAccepted: false,
    rollback: null,
    restore: null,
    allChecksPassed: false
  };

  if (args.mode === "validate") {
    await patchTraffic(token, buildTrafficPatchBody("rollback", args.rollbackRevision), true);
    await patchTraffic(token, buildTrafficPatchBody("latest"), true);
    report.validateOnlyAccepted = true;
    report.allChecksPassed = true;
  } else if (args.mode === "drill") {
    await patchTraffic(token, buildTrafficPatchBody("rollback", args.rollbackRevision), false);
    report.rollback = await readService(token);
    assertTrafficTransition(before, report.rollback, { kind: "rollback", revision: args.rollbackRevision });

    await patchTraffic(token, buildTrafficPatchBody("latest"), false);
    report.restore = await readService(token);
    assertTrafficTransition(before, report.restore, { kind: "latest" });
    report.allChecksPassed = true;
  } else {
    await patchTraffic(token, buildTrafficPatchBody("latest"), false);
    report.restore = await readService(token);
    assertTrafficTransition(before, report.restore, { kind: "latest" });
    report.allChecksPassed = true;
  }

  report.completedAt = new Date().toISOString();
  await mkdir(args.outputDir, { recursive: true });
  const outputPath = path.join(args.outputDir, `traffic-rollback-${args.mode}-${Date.now()}.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, mode: args.mode, allChecksPassed: report.allChecksPassed }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
