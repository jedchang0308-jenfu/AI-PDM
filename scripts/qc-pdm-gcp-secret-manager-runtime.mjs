#!/usr/bin/env node

import { GoogleSecretManagerProvider, getGoogleSecretManagerConfig } from "../src/lib/google-secret-manager.ts";

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
    if (String(input).endsWith(":addVersion")) return response(200, { name: "projects/9536592944/secrets/pdm-sw-key/versions/7" });
    return response(200, { name: "projects/9536592944/secrets/pdm-sw-key/versions/7", payload: { data: Buffer.from("dm-license-key-1234", "utf8").toString("base64") } });
  };
  const provider = new GoogleSecretManagerProvider(
    { projectId: "demo", expectedProjectNumber: "9536592944", secretId: "pdm-sw-key", apiBaseUrl: "https://secretmanager.test/v1" },
    { auth, fetchImpl }
  );
  const versionName = await provider.addVersion("dm-license-key-1234");
  const value = await provider.accessVersion(versionName);
  const addRequest = requests[0];
  const readRequest = requests[1];
  const addBody = JSON.parse(String(addRequest.init.body));
  record("GSM-RUNTIME-001 addVersion pins returned exact version", versionName === "projects/9536592944/secrets/pdm-sw-key/versions/7" && addRequest.url === "https://secretmanager.test/v1/projects/demo/secrets/pdm-sw-key:addVersion");
  record("GSM-RUNTIME-002 payload is encoded and auth is server-side", addBody.payload.data === Buffer.from("dm-license-key-1234", "utf8").toString("base64") && addRequest.init.headers.authorization === "Bearer adc-test-token");
  record("GSM-RUNTIME-003 accessVersion reads exact version and decodes payload", readRequest.url === "https://secretmanager.test/v1/projects/demo/secrets/pdm-sw-key/versions/7:access" && value === "dm-license-key-1234");

  let latestCode = "";
  try {
    await provider.accessVersion("projects/9536592944/secrets/pdm-sw-key/versions/latest");
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
    { projectId: "demo", expectedProjectNumber: "9536592944", secretId: "pdm-sw-key", apiBaseUrl: "https://secretmanager.test/v1" },
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
      await faultProvider(status).accessVersion("projects/9536592944/secrets/pdm-sw-key/versions/7");
    } catch (error) {
      code = error.code;
      isRetryable = error.retryable;
      message = error.message;
    }
    record(`GSM-RUNTIME-${status} provider fault maps to redacted stable code`, code === expectedCode && isRetryable === retryable && !message.includes("raw-provider-detail"));
  }

  // B regressions use only synthetic transport. No provider or license is contacted.
  process.env.PDM_ENABLE_GCP_SECRET_READS = "true";
  process.env.PDM_ENABLE_GCP_SECRET_WRITES = "true";
  const canonicalConfig = { projectId: "jenfu-platform-prod", expectedProjectNumber: "9536592944",
    secretId: "aipdm-prod-solidworks-document-manager-key", apiBaseUrl: "https://secretmanager.test/v1" };
  const requestSecret = "projects/jenfu-platform-prod/secrets/" + canonicalConfig.secretId;
  const canonicalSecret = "projects/9536592944/secrets/" + canonicalConfig.secretId;
  const canonicalReference = canonicalSecret + "/versions/7";
  const canary = "B-protocol-fixture-not-a-real-license";
  const canonicalRequests = [];
  let authCalls = 0;
  const countedAuth = { getClient: async () => {
    authCalls += 1;
    return { getAccessToken: async () => ({ token: "fixture-token" }) };
  } };
  const canonicalProvider = new GoogleSecretManagerProvider(canonicalConfig, { auth: countedAuth,
    fetchImpl: async input => {
      canonicalRequests.push(String(input));
      return response(200, String(input).endsWith(":addVersion") ? { name: canonicalReference }
        : { name: canonicalReference, payload: { data: Buffer.from(canary).toString("base64") } });
    } });
  const canonicalSaved = await canonicalProvider.addVersion(canary);
  const canonicalRead = await canonicalProvider.accessVersion(canonicalSaved);
  record("GSM-B-001 named request paths and numeric canonical reference roundtrip",
    canonicalSaved === canonicalReference && canonicalRead === canary && JSON.stringify(canonicalRequests) === JSON.stringify([
      canonicalConfig.apiBaseUrl + "/" + requestSecret + ":addVersion",
      canonicalConfig.apiBaseUrl + "/" + requestSecret + "/versions/7:access"
    ]));

  const expectCode = async (operation, expectedCode) => {
    try { await operation(); return false; } catch (error) {
      return error.code === expectedCode && !String(error.message).includes(canary);
    }
  };
  for (const [index, expectedProjectNumber] of [undefined, "jenfu-platform-prod", "09536592944", "9536592944\n"].entries()) {
    const previousAuth = authCalls, previousRequests = canonicalRequests.length;
    process.env.PDM_GCP_PROJECT_ID = canonicalConfig.projectId;
    process.env.PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID = canonicalConfig.secretId;
    if (expectedProjectNumber === undefined) delete process.env.PDM_GCP_EXPECTED_PROJECT_NUMBER;
    else process.env.PDM_GCP_EXPECTED_PROJECT_NUMBER = expectedProjectNumber;
    const rejected = await expectCode(() => new GoogleSecretManagerProvider(
      { ...canonicalConfig, expectedProjectNumber }, { auth: countedAuth, fetchImpl: async input => {
        canonicalRequests.push(String(input)); return response(200, {});
      } }), "GCP_SECRET_MANAGER_CONFIG_MISSING");
    record("GSM-B-CONFIG-" + (index + 1) + " invalid expected number has no auth or transport",
      rejected && getGoogleSecretManagerConfig() === null && authCalls === previousAuth && canonicalRequests.length === previousRequests);
  }
  const invalidInputs = [
    "projects/9536592945/secrets/" + canonicalConfig.secretId + "/versions/7",
    "projects/9536592944/secrets/other-secret/versions/7",
    requestSecret + "/versions/7", canonicalSecret + "/versions/latest",
    canonicalSecret + "/versions/0", canonicalReference + "\n"
  ];
  for (const [index, invalid] of invalidInputs.entries()) {
    const previousAuth = authCalls, previousRequests = canonicalRequests.length;
    const rejected = await expectCode(() => canonicalProvider.accessVersion(invalid), "GCP_SECRET_MANAGER_VERSION_REFERENCE_INVALID");
    record("GSM-B-REFERENCE-" + (index + 1) + " invalid reference has no auth or access request",
      rejected && authCalls === previousAuth && canonicalRequests.length === previousRequests);
  }
  for (const [index, name] of [canonicalSecret + "/versions/8", undefined, invalidInputs[0]].entries()) {
    let payloadReads = 0, calls = 0;
    const wrongResponse = new GoogleSecretManagerProvider(canonicalConfig, { auth,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, json: async () => ({ name, get payload() {
          payloadReads += 1; return { data: Buffer.from(canary).toString("base64") };
        } }) };
      } });
    const rejected = await expectCode(() => wrongResponse.accessVersion(canonicalReference), "GCP_SECRET_MANAGER_INVALID_VERSION");
    record("GSM-B-RESPONSE-" + (index + 1) + " wrong or missing response name blocks payload",
      rejected && calls === 1 && payloadReads === 0);
  }
  for (const [index, name] of [invalidInputs[0], invalidInputs[1], invalidInputs[3]].entries()) {
    const calls = [];
    const invalidAdd = new GoogleSecretManagerProvider(canonicalConfig, { auth, fetchImpl: async input => {
      calls.push(String(input)); return response(200, { name });
    } });
    const rejected = await expectCode(() => invalidAdd.addVersion(canary), "GCP_SECRET_MANAGER_INVALID_VERSION");
    record("GSM-B-ADD-" + (index + 1) + " wrong add reference never triggers a read",
      rejected && calls.length === 1 && calls[0] === canonicalConfig.apiBaseUrl + "/" + requestSecret + ":addVersion");
  }
  process.env.PDM_ENABLE_GCP_SECRET_READS = "false";
  const previousReadAuth = authCalls, previousReadRequests = canonicalRequests.length;
  record("GSM-B-READ-GATE disabled read has no auth or request",
    await expectCode(() => canonicalProvider.accessVersion(canonicalReference), "GCP_SECRET_MANAGER_READ_GATE_REQUIRED")
      && authCalls === previousReadAuth && canonicalRequests.length === previousReadRequests);

  console.log(JSON.stringify({ passed: results.length, failed: 0, results }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: results.length, failed: 1, error: error instanceof Error ? error.message : String(error), results }, null, 2));
  process.exitCode = 1;
} finally {
  for (const key of new Set([...Object.keys(process.env), ...Object.keys(originalEnv)])) {
    if (!Object.hasOwn(originalEnv, key)) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
}
