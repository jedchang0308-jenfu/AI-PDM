import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), database: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));
vi.mock("@/lib/preview-derivatives", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/preview-derivatives")>(),
  completePreviewJobAsync: mocks.complete
}));
import { POST } from "./route";
const token = Buffer.alloc(32, 21).toString("base64url");
const basis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64), attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const params = { params: Promise.resolve({ jobId: "job-one" }) };
function request(body: object, authorized = true) {
  return new Request("https://pdm.test/api/preview-jobs/job-one/complete", { method: "POST",
    headers: { ...(authorized ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({leaseProtocolVersion:2,leaseBasis:basis,cancelReason:"operator_shutdown",...body}) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS", JSON.stringify({ schemaVersion: "ai-pdm.workload-credentials.v1", workloads: [{ id: "png-worker", token, purposes: ["preview_jobs"], capabilities: ["solidworks_2d_preview_png"] }] }));
  mocks.database.mockReturnValue({});
  mocks.complete.mockResolvedValue({ accepted: true, derivativeIds: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("keeps an authenticated worker cancellation distinct from a failed renderer", async () => {
  const response = await POST(request({ status: "cancelled", leaseBasis: basis, workerId: "png-worker", derivatives: [{ unsafe: "ignored" }] }), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ accepted: true, derivativeIds: [], leaseProtocolVersion: 2 });
  expect(mocks.complete).toHaveBeenCalledWith({}, { workerId: "png-worker", jobId: "job-one", status: "cancelled", leaseBasis: basis, cancelReason:"operator_shutdown" });
});
it.each([undefined, {}, { ...basis, attemptCount: 0 }, { ...basis, sourceContentHash: "wrong" }])("rejects incomplete cancellation basis before database access: %j", async leaseBasis => {
  const response = await POST(request({ status: "cancelled", leaseBasis }), params);
  expect(response.status).toBe(400);
  expect(mocks.database).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not accept missing workload proof or another worker label", async () => {
  expect((await POST(request({ status: "cancelled", leaseBasis: basis }, false), params)).status).toBe(403);
  expect((await POST(request({ status: "cancelled", leaseBasis: basis, workerId: "other-worker" }), params)).status).toBe(403);
  expect(mocks.database).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("reports a lost lease as conflict and retains the existing failed completion", async () => {
  mocks.complete.mockResolvedValueOnce({ accepted: false, derivativeIds: [] });
  expect((await POST(request({ status: "cancelled", leaseBasis: basis }), params)).status).toBe(409);
  expect((await POST(request({ status: "failed", errorCode: "renderer_failed", errorSummary: "Renderer failed." }), params)).status).toBe(200);
  expect(mocks.complete).toHaveBeenLastCalledWith({}, expect.objectContaining({ status: "failed", errorCode: "renderer_failed" }));
});

it.each(["unknown", "", null, undefined, 0])("rejects unknown completion status without coercion: %j",async status=>{
 expect((await POST(request({status}),params)).status).toBe(400);expect(mocks.database).not.toHaveBeenCalled();
});
it.each(["failed","skipped","succeeded","cancelled"])("requires the same complete lease on %s",async status=>{
 expect((await POST(request({status,leaseBasis:undefined}),params)).status).toBe(400);expect(mocks.database).not.toHaveBeenCalled();
});

it.each(["failed", "skipped", "succeeded", "cancelled"])("echoes the negotiated version on accepted %s completion", async status => {
  const response = await POST(request({ status }), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ accepted: true, leaseProtocolVersion: 2 });
});
