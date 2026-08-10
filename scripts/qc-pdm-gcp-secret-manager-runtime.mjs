#!/usr/bin/env node

import { GoogleSecretManagerProvider } from "../src/lib/google-secret-manager.ts";

const originalEnv = { ...process.env };
const results = [];

function record(name, passed, detail = "") {
  results.push({ name, passed, detail });
  if (!passed) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
}

function response(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

try {
  process.env.PDM_ENABLE_GCP_SECRET_WRITES = "true";
  process.env.PDM_ENABLE_GCP_SECRET_READS = "true";
  const requests = [];
  const auth = { getClient: async () => ({ getAccessToken: async () => ({ token: "adc-test-token" }) }) };
  const fetchImpl = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith(":addVersion")) return response(200, { name: "projects/demo/secrets/pdm-sw-key/versions/7" });
    return response(200, { payload: { data: Buffer.from("dm-license-key-1234", "utf8").toString("base64") } });
  };
  const provider = new GoogleSecretManagerProvider(
    { projectId: "demo", secretId: "pdm-sw-key", apiBaseUrl: "https://secretmanager.test/v1" },
    { auth, fetchImpl }
  );
  const versionName = await provider.addVersion("dm-license-key-1234");
  const value = await provider.accessVersion(versionName);
  const addRequest = requests[0];
  const readRequest = requests[1];
  const addBody = JSON.parse(String(addRequest.init.body));
  record("GSM-RUNTIME-001 addVersion pins returned exact version", versionName.endsWith("/versions/7") && addRequest.url.endsWith(":addVersion"));
  record("GSM-RUNTIME-002 payload is encoded and auth is server-side", addBody.payload.data === Buffer.from("dm-license-key-1234", "utf8").toString("base64") && addRequest.init.headers.authorization === "Bearer adc-test-token");
  record("GSM-RUNTIME-003 accessVersion reads exact version and decodes payload", readRequest.url.endsWith("/versions/7:access") && value === "dm-license-key-1234");

  let latestCode = "";
  try {
    await provider.accessVersion("projects/demo/secrets/pdm-sw-key/versions/latest");
  } catch (error) {
    latestCode = error.code;
  }
  record("GSM-RUNTIME-004 latest alias is rejected before network access", latestCode === "GCP_SECRET_MANAGER_VERSION_REFERENCE_INVALID" && requests.length === 2);

  process.env.PDM_ENABLE_GCP_SECRET_WRITES = "false";
  let writeGateCode = "";
  try {
    await provider.addVersion("blocked-write");
  } catch (error) {
    writeGateCode = error.code;
  }
  record("GSM-RUNTIME-005 write gate blocks disabled writes", writeGateCode === "GCP_SECRET_MANAGER_WRITE_GATE_REQUIRED");

  process.env.PDM_ENABLE_GCP_SECRET_WRITES = "true";
  const faultProvider = (status) => new GoogleSecretManagerProvider(
    { projectId: "demo", secretId: "pdm-sw-key", apiBaseUrl: "https://secretmanager.test/v1" },
    { auth, fetchImpl: async () => response(status, { error: { message: "raw-provider-detail-must-not-escape" } }) }
  );
  const faultCases = [
    [403, "GCP_SECRET_MANAGER_PERMISSION_DENIED", false],
    [404, "GCP_SECRET_MANAGER_VERSION_NOT_FOUND", false],
    [429, "GCP_SECRET_MANAGER_RATE_LIMITED", true],
    [500, "GCP_SECRET_MANAGER_REQUEST_FAILED", true]
  ];
  for (const [status, expectedCode, retryable] of faultCases) {
    let code = "";
    let isRetryable = false;
    let message = "";
    try {
      await faultProvider(status).accessVersion("projects/demo/secrets/pdm-sw-key/versions/7");
    } catch (error) {
      code = error.code;
      isRetryable = error.retryable;
      message = error.message;
    }
    record(`GSM-RUNTIME-${status} provider fault maps to redacted stable code`, code === expectedCode && isRetryable === retryable && !message.includes("raw-provider-detail"));
  }

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
