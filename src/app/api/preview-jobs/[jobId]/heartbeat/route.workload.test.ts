import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), database: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));
vi.mock("@/lib/preview-derivatives", () => ({ heartbeatPreviewJobAsync: mocks.heartbeat }));
vi.mock("@/lib/worker-service-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/worker-service-auth")>(), authenticateWorkerService: mocks.auth
}));
import { POST } from "./route";

const workerId = "device-one:instance-one";
const actor = { kind: "windows_service_device", id: workerId, deviceId: "device-one", companyId: "company-one",
  instanceId: "instance-one", credentialHash: "a".repeat(64), device: {},
  purposes: [], capabilities: [] };
const basis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64), attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const params = { params: Promise.resolve({ jobId: "job-one" }) };
function request(body: object = {}, authorized = true) {
  return new Request("https://pdm.test/api/preview-jobs/job-one/heartbeat", { method: "POST",
    headers: { ...(authorized ? { authorization: "Bearer synthetic" } : {}), "content-type": "application/json" },
    body: JSON.stringify({ leaseProtocolVersion: 2, leaseBasis: basis, ...body }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ actor });
  mocks.database.mockReturnValue({}); mocks.heartbeat.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

it("echoes the negotiated version after the authenticated heartbeat is accepted", async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, leaseProtocolVersion: 2 });
  expect(mocks.heartbeat).toHaveBeenCalledWith({}, { jobId: "job-one", workerId, leaseBasis: basis });
});
it.each([undefined, 1, "2", null])("rejects an invalid protocol before database access: %j", async leaseProtocolVersion => {
  expect((await POST(request({ leaseProtocolVersion }), params)).status).toBe(400);
  expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.heartbeat).not.toHaveBeenCalled();
});
it("keeps workload and lost-lease refusals intact", async () => {
  mocks.auth.mockResolvedValueOnce({ response: Response.json({ error: "WORKER_DEVICE_UNAUTHORIZED" }, { status: 403 }) });
  expect((await POST(request({}, false), params)).status).toBe(403);
  expect((await POST(request({ workerId: "other-worker" }), params)).status).toBe(403);
  expect(mocks.database).not.toHaveBeenCalled();
  mocks.heartbeat.mockResolvedValueOnce(false);
  const response = await POST(request(), params);
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: "PREVIEW_JOB_CLAIM_LOST" });
});
