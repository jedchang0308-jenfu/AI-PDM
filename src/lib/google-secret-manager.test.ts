import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleSecretManagerProvider, getGoogleSecretManagerConfig,
  isExactVersionResource, isGoogleSecretManagerReadEnabled, isGoogleSecretManagerWriteEnabled,
  type GoogleSecretManagerConfig, type GoogleSecretManagerFetch
} from "./google-secret-manager";

const config: GoogleSecretManagerConfig = {
  projectId: "jenfu-platform-prod", expectedProjectNumber: "9536592944",
  secretId: "aipdm-prod-solidworks-document-manager-key", apiBaseUrl: "https://secretmanager.test/v1"
};
const requestSecret = "projects/jenfu-platform-prod/secrets/aipdm-prod-solidworks-document-manager-key";
const canonicalSecret = "projects/9536592944/secrets/aipdm-prod-solidworks-document-manager-key";
const reference = canonicalSecret + "/versions/7";
const syntheticValue = "protocol-fixture-not-a-real-license";
const response = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
function dependencies(fetchImpl: GoogleSecretManagerFetch = async () => response(200, {})) {
  const getAccessToken = vi.fn(async () => ({ token: "fixture-access-token" }));
  const getClient = vi.fn(async () => ({ getAccessToken }));
  return { auth: { getClient }, getAccessToken, fetchImpl: vi.fn<GoogleSecretManagerFetch>(fetchImpl) };
}
const invalidReferences = [
  "projects/9536592945/secrets/" + config.secretId + "/versions/7",
  requestSecret + "/versions/7",
  "projects/9536592944/secrets/other-secret/versions/7",
  canonicalSecret + "/versions/latest", canonicalSecret + "/versions/current",
  canonicalSecret + "/versions/0", canonicalSecret + "/versions/07",
  canonicalSecret + "/versions/", reference + "\n", reference + " ", " " + reference
];

beforeEach(() => {
  vi.stubEnv("PDM_GCP_PROJECT_ID", config.projectId);
  vi.stubEnv("PDM_GCP_EXPECTED_PROJECT_NUMBER", config.expectedProjectNumber);
  vi.stubEnv("PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID", config.secretId);
  vi.stubEnv("PDM_GOOGLE_SECRET_MANAGER_API_BASE_URL", config.apiBaseUrl + "/");
  vi.stubEnv("PDM_ENABLE_GCP_SECRET_READS", "true");
  vi.stubEnv("PDM_ENABLE_GCP_SECRET_WRITES", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("Google Secret Manager separate request ID and expected project number", () => {
  it("loads the explicit pair without deriving the project number from ADC or request ID", () => {
    expect(getGoogleSecretManagerConfig()).toEqual(config);
    expect(isGoogleSecretManagerReadEnabled()).toBe(true);
    expect(isGoogleSecretManagerWriteEnabled()).toBe(true);
  });

  it.each([undefined, "", "0", "09536592944", "-1", "1.0", "1e3",
    "jenfu-platform-prod", " 9536592944", "9536592944 ", "9536592944\n"])(
    "fails closed for expected project number %j before auth or fetch", expectedProjectNumber => {
      const deps = dependencies();
      vi.stubEnv("PDM_GCP_EXPECTED_PROJECT_NUMBER", expectedProjectNumber);
      expect(getGoogleSecretManagerConfig()).toBeNull();
      expect(() => new GoogleSecretManagerProvider(undefined, deps)).toThrow(
        expect.objectContaining({ code: "GCP_SECRET_MANAGER_CONFIG_MISSING", status: 409 }));
      expect(() => new GoogleSecretManagerProvider({ ...config, expectedProjectNumber } as GoogleSecretManagerConfig, deps))
        .toThrow(expect.objectContaining({ code: "GCP_SECRET_MANAGER_CONFIG_MISSING" }));
      expect(deps.auth.getClient).not.toHaveBeenCalled();
      expect(deps.getAccessToken).not.toHaveBeenCalled();
      expect(deps.fetchImpl).not.toHaveBeenCalled();
    });

  it.each(["PDM_GCP_PROJECT_ID", "PDM_SOLIDWORKS_DOCUMENT_MANAGER_SECRET_ID"])(
    "does not configure a provider when %s is absent", name => {
      vi.stubEnv(name, "");
      // Disable the existing project-ID fallback as well; it may not supply the expected number.
      vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
      const deps = dependencies();
      expect(getGoogleSecretManagerConfig()).toBeNull();
      expect(() => new GoogleSecretManagerProvider(undefined, deps))
        .toThrow(expect.objectContaining({ code: "GCP_SECRET_MANAGER_CONFIG_MISSING" }));
      expect(deps.auth.getClient).not.toHaveBeenCalled();
      expect(deps.fetchImpl).not.toHaveBeenCalled();
    });

  it("adds by named project, retains numeric reference, and accesses by named project with exact response binding", async () => {
    const deps = dependencies(async input => String(input).endsWith(":addVersion")
      ? response(200, { name: reference })
      : response(200, { name: reference, payload: { data: Buffer.from(syntheticValue).toString("base64") } }));
    const provider = new GoogleSecretManagerProvider(config, deps);
    expect(await provider.addVersion(syntheticValue)).toBe(reference);
    expect(await provider.accessVersion(reference)).toBe(syntheticValue);
    expect(deps.fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      config.apiBaseUrl + "/" + requestSecret + ":addVersion",
      config.apiBaseUrl + "/" + requestSecret + "/versions/7:access"
    ]);
    const init = deps.fetchImpl.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ payload: { data: Buffer.from(syntheticValue).toString("base64") } });
    expect(init.headers).toMatchObject({ authorization: "Bearer fixture-access-token" });
  });

  it.each(invalidReferences)("rejects input reference %s with no auth or network effects", async invalid => {
    const deps = dependencies();
    await expect(new GoogleSecretManagerProvider(config, deps).accessVersion(invalid))
      .rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_VERSION_REFERENCE_INVALID", status: 400 });
    expect(deps.auth.getClient).not.toHaveBeenCalled();
    expect(deps.getAccessToken).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([...invalidReferences, undefined])("rejects add response name %j without accepting an alias", async name => {
    const deps = dependencies(async () => response(200, name === undefined ? {} : { name }));
    await expect(new GoogleSecretManagerProvider(config, deps).addVersion(syntheticValue))
      .rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_INVALID_VERSION", status: 502 });
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(deps.fetchImpl.mock.calls[0][0])).toBe(config.apiBaseUrl + "/" + requestSecret + ":addVersion");
  });

  it.each([canonicalSecret + "/versions/8", requestSecret + "/versions/7", undefined, reference + "\n",
    "projects/9536592945/secrets/" + config.secretId + "/versions/7",
    "projects/9536592944/secrets/other-secret/versions/7"])(
    "rejects mismatching access response %j before observing payload", async name => {
      let payloadReads = 0;
      const deps = dependencies(async () => ({
        ok: true,
        json: async () => ({ name, get payload() {
          payloadReads += 1;
          return { data: Buffer.from(syntheticValue).toString("base64") };
        } })
      }) as Response);
      await expect(new GoogleSecretManagerProvider(config, deps).accessVersion(reference))
        .rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_INVALID_VERSION", status: 502 });
      expect(payloadReads).toBe(0);
      expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    });

  it.each(["read", "write"] as const)("retains the disabled %s gate without network effects", async gate => {
    vi.stubEnv(gate === "read" ? "PDM_ENABLE_GCP_SECRET_READS" : "PDM_ENABLE_GCP_SECRET_WRITES", "false");
    const deps = dependencies(), provider = new GoogleSecretManagerProvider(config, deps);
    await expect(gate === "read" ? provider.accessVersion(reference) : provider.addVersion(syntheticValue))
      .rejects.toMatchObject({ code: gate === "read" ? "GCP_SECRET_MANAGER_READ_GATE_REQUIRED" : "GCP_SECRET_MANAGER_WRITE_GATE_REQUIRED", status: 409 });
    expect(deps.auth.getClient).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    [401, "GCP_SECRET_MANAGER_PERMISSION_DENIED", 401, false],
    [403, "GCP_SECRET_MANAGER_PERMISSION_DENIED", 403, false],
    [404, "GCP_SECRET_MANAGER_VERSION_NOT_FOUND", 404, false],
    [429, "GCP_SECRET_MANAGER_RATE_LIMITED", 429, true],
    [400, "GCP_SECRET_MANAGER_VERSION_DISABLED", 409, false],
    [500, "GCP_SECRET_MANAGER_REQUEST_FAILED", 502, true]
  ] as const)("keeps provider status %i redacted", async (httpStatus, code, status, retryable) => {
    const deps = dependencies(async () => response(httpStatus, { error: { message: "private-upstream-detail" } }));
    const error = await new GoogleSecretManagerProvider(config, deps).accessVersion(reference).catch(value => value);
    expect(error).toMatchObject({ code, status, retryable });
    expect(error.message).not.toContain("private-upstream-detail");
  });

  it("keeps empty exact-version payload failure distinct from reference mismatch", async () => {
    const deps = dependencies(async () => response(200, { name: reference, payload: { data: "" } }));
    await expect(new GoogleSecretManagerProvider(config, deps).accessVersion(reference))
      .rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_SECRET_EMPTY", status: 404 });
  });

  it("does not expose a synthetic canary embedded in a rejected provider response", async () => {
    const deps = dependencies(async () => response(200, { name: syntheticValue, payload: { data: syntheticValue } }));
    const error = await new GoogleSecretManagerProvider(config, deps).addVersion(syntheticValue).catch(value => value);
    expect(error).toMatchObject({ code: "GCP_SECRET_MANAGER_INVALID_VERSION", status: 502 });
    expect(String(error)).not.toContain(syntheticValue);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("redacts transport failures", async () => {
    const deps = dependencies(async () => { throw new Error("private-transport-detail"); });
    const error = await new GoogleSecretManagerProvider(config, deps).accessVersion(reference).catch(value => value);
    expect(error).toMatchObject({ code: "GCP_SECRET_MANAGER_UNREACHABLE", status: 503, retryable: true });
    expect(error.message).not.toContain("private-transport-detail");
  });

  it("does not fetch without a runtime access token", async () => {
    const deps = dependencies();
    deps.getAccessToken.mockResolvedValue({ token: "" });
    await expect(new GoogleSecretManagerProvider(config, deps).accessVersion(reference))
      .rejects.toMatchObject({ code: "GCP_SECRET_MANAGER_ADC_UNAVAILABLE", status: 503, retryable: true });
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });

  it("matches the whole raw resource and escapes the exact Secret name", () => {
    const secret = "projects/9536592944/secrets/exact.name";
    expect(isExactVersionResource(secret + "/versions/1", secret)).toBe(true);
    expect(isExactVersionResource(secret.replace(".", "X") + "/versions/1", secret)).toBe(false);
    expect(isExactVersionResource(secret + "/versions/1\n", secret)).toBe(false);
  });
});
