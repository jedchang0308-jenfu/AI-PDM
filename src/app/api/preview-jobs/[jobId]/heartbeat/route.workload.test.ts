import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ heartbeat: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));
vi.mock("@/lib/preview-derivatives", () => ({ heartbeatPreviewJobAsync: mocks.heartbeat }));
import { POST } from "./route";

const token = Buffer.alloc(32, 22).toString("base64url");
const basis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64), attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const params = { params: Promise.resolve({ jobId: "job-one" }) };
function request(body: object = {}, authorized = true) {
  return new Request("https://pdm.test/api/preview-jobs/job-one/heartbeat", { method: "POST",
    headers: { ...(authorized ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: JSON.stringify({ leaseProtocolVersion: 2, leaseBasis: basis, ...body }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [
    { id: "png-worker", token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] }
  ] }));
  mocks.database.mockReturnValue({}); mocks.heartbeat.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

it("echoes the negotiated version after the authenticated heartbeat is accepted", async () => {
  const response = await POST(request(), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, leaseProtocolVersion: 2 });
  expect(mocks.heartbeat).toHaveBeenCalledWith({}, { jobId: "job-one", workerId: "png-worker", leaseBasis: basis });
});
it.each([undefined, 1, "2", null])("rejects an invalid protocol before database access: %j", async leaseProtocolVersion => {
  expect((await POST(request({ leaseProtocolVersion }), params)).status).toBe(400);
  expect(mocks.database).not.toHaveBeenCalled(); expect(mocks.heartbeat).not.toHaveBeenCalled();
});
it("keeps workload and lost-lease refusals intact", async () => {
  expect((await POST(request({}, false), params)).status).toBe(403);
  expect((await POST(request({ workerId: "other-worker" }), params)).status).toBe(403);
  expect(mocks.database).not.toHaveBeenCalled();
  mocks.heartbeat.mockResolvedValueOnce(false);
  const response = await POST(request(), params);
  expect(response.status).toBe(409); expect(await response.json()).toEqual({ code: "PREVIEW_JOB_CLAIM_LOST" });
});
