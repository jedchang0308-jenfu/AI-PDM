import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { isProductionSliceAllowedApiMutation, isProductionSliceOpenPagePath, productionSliceClientStatus } from "@/lib/production-slice";
import { POST as previewHeartbeat } from "@/app/api/preview-workers/heartbeat/route";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/windows-service-devices", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/windows-service-devices")>(),
  WindowsServiceDeviceRepository: class {
    findAuthorizedByCredentialHash(hash: string) { return mocks.authorize(hash); }
  }
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: () => ({ kind: "postgres" }) }));
vi.mock("@/lib/repositories/settings-secret-async-repository", () => ({
  AsyncSettingsSecretRepository: class { upsertWorkerCapabilityHeartbeat(input: unknown) { return mocks.upsert(input); } }
}));

const active = { NODE_ENV: "production", PDM_PRODUCTION_SLICE_MODE: "official-numbering-draft" };
const commands = [
  "/api/settings/windows-service/enrollments",
  "/api/settings/windows-service/devices/device-one/revoke",
  "/api/windows-service/enroll",
  "/api/windows-service/start",
  "/api/windows-service/heartbeat",
  "/api/preview-workers/heartbeat",
  "/api/preview-jobs/claim",
  "/api/preview-jobs/job-one/heartbeat",
  "/api/preview-jobs/job-one/complete"
] as const;

afterEach(() => vi.unstubAllEnvs());

describe("DEV125 Windows service reaches only its existing owner guards", () => {
  it("opens the exact manager page in the active production slice", () => {
    const path = "/settings/windows-service";
    expect(isProductionSliceOpenPagePath(path, active)).toBe(true);
    expect(productionSliceClientStatus(active).openPagePaths).toContain(path);
    expect(isProductionSliceOpenPagePath(path, { PDM_PRODUCTION_SLICE_MODE: "unknown" })).toBe(false);
    expect(isProductionSliceOpenPagePath(`${path}/extra`, active)).toBe(false);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest(`https://pdm.example${path}`, { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    }
  });

  it.each(commands)("dispatches exact POST %s in the active slice", path => {
    expect(isProductionSliceAllowedApiMutation("POST", path, active)).toBe(true);
    expect(isProductionSliceAllowedApiMutation("POST", path, { PDM_PRODUCTION_SLICE_MODE: "unknown" })).toBe(false);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    expect(middleware(new NextRequest(`https://pdm.example${path}`, { method: "POST" })).headers.get("x-middleware-next")).toBe("1");
  });

  it.each(commands)("keeps non-POST writes closed for %s", path => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(isProductionSliceAllowedApiMutation(method, path, active)).toBe(false);
    }
  });

  it.each([
    "/api/settings/windows-service/devices",
    "/api/settings/windows-service/devices/device-one/revoke/extra",
    "/api/settings/windows-service/devices/device-one/delete",
    "/api/windows-service/enroll/extra",
    "/api/windows-service/jobs/preview/job-one",
    "/api/preview-jobs",
    "/api/preview-jobs/claim/extra",
    "/api/preview-jobs/job-one/content",
    "/api/preview-jobs/job-one/cancel",
    "/api/preview-jobs-extra/claim",
    "/api/preview-workers/heartbeat/extra",
    "/api/preview-workers-extra/heartbeat"
  ])("keeps unsupported mutation closed: %s", path => {
    expect(isProductionSliceAllowedApiMutation("POST", path, active)).toBe(false);
  });
});

describe("preview capability heartbeat reaches current device authorization in production", () => {
  const endpoint = "/api/preview-workers/heartbeat";
  const token = Buffer.alloc(32, 71).toString("base64url");
  const credentialHash = createHash("sha256").update(token).digest("hex");
  const deviceId = "device-preview";
  const instanceId = "instance-preview";
  const workerId = `${deviceId}:${instanceId}`;
  const owner = { principalId: "principal-preview", employeeId: "employee-preview",
    pdmUserId: "profile-preview", companyId: "company-one",
    identityIssuer: "https://accounts.google.com", identitySubject: "subject-preview" };
  const device = { id: deviceId, companyId: owner.companyId, name: "Preview PC", status: "active",
    instanceId, serviceVersion: "test", protocolVersion: 1, ownerPrincipalId: owner.principalId,
    registeredBy: owner.principalId, registeredAt: "2026-10-28T00:00:00.000Z",
    lastSeenAt: null, revokedAt: null, revokedBy: null, rowVersion: 1 };
  function request(capability: string, headers: Record<string, string> = { authorization: `Bearer ${token}` }) {
    return new NextRequest(`https://pdm.example${endpoint}`, { method: "POST",
      headers: { "content-type": "application/json", "x-pdm-worker-id": workerId, ...headers },
      body: JSON.stringify({ workerId, capability, status: "ready" }) });
  }
  async function dispatch(incoming: NextRequest) {
    const gate = middleware(incoming);
    return gate.headers.get("x-middleware-next") === "1" ? previewHeartbeat(incoming) : gate;
  }
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", active.PDM_PRODUCTION_SLICE_MODE);
    mocks.authorize.mockResolvedValue({ device, owner, credentialHash });
    mocks.upsert.mockResolvedValue(undefined);
  });
  it.each(["solidworks_2d_preview_png", "solidworks_3d_preview_png"])("accepts current device capability %s through middleware and handler", async capability => {
    const response = await dispatch(request(capability));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, capability });
    expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith(credentialHash);
    expect(mocks.upsert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      workerId, capabilityCode: capability, status: "ready"
    }));
  });
  it("rechecks the credential and rejects the next heartbeat after revocation", async () => {
    expect((await dispatch(request("solidworks_2d_preview_png"))).status).toBe(200);
    mocks.authorize.mockResolvedValueOnce(null);
    const response = await dispatch(request("solidworks_2d_preview_png"));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expect(mocks.authorize).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
  const unauthorizedHeaders: Record<string, string>[] = [
    {}, { "x-pdm-preview-worker-token": "legacy-token", "x-pdm-worker-id": "windows-parser" }
  ];
  it.each(unauthorizedHeaders)("rejects anonymous or retired fixed credentials without a capability write", async headers => {
    const response = await dispatch(request("solidworks_2d_preview_png", headers));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "WORKER_DEVICE_UNAUTHORIZED" });
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("keeps the command closed in an unknown slice", async () => {
    vi.stubEnv("PDM_PRODUCTION_SLICE_MODE", "unknown-mode");
    expect((await dispatch(request("solidworks_2d_preview_png"))).status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
