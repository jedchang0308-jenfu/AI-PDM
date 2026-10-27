import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ complete: vi.fn(), database: vi.fn(), auth: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));
vi.mock("@/lib/preview-derivatives", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/preview-derivatives")>(),
  completePreviewJobAsync: mocks.complete
}));
vi.mock("@/lib/worker-service-auth", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/worker-service-auth")>(), authenticateWorkerService: mocks.auth
}));
import { POST } from "./route";
import { PrincipalJobAuthorityError } from "@/lib/principal-job-authority";
const workerId = "device-one:instance-one";
const actor = { kind: "windows_service_device", id: workerId, deviceId: "device-one", companyId: "company-one",
  ownerPrincipalId: "principal-one", instanceId: "instance-one", credentialHash: "a".repeat(64), device: {}, purposes: [], capabilities: [] };
const basis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: "a".repeat(64), attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const params = { params: Promise.resolve({ jobId: "job-one" }) };
function request(body: object, authorized = true) {
  return new Request("https://pdm.test/api/preview-jobs/job-one/complete", { method: "POST",
    headers: { ...(authorized ? { authorization: "Bearer synthetic" } : {}), "content-type": "application/json" }, body: JSON.stringify({leaseProtocolVersion:2,leaseBasis:basis,cancelReason:"operator_shutdown",...body}) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ actor });
  mocks.database.mockReturnValue({});
  mocks.complete.mockResolvedValue({ accepted: true, derivativeIds: [] });
});
afterEach(() => vi.unstubAllEnvs());
it("keeps an authenticated worker cancellation distinct from a failed renderer", async () => {
  const response = await POST(request({ status: "cancelled", leaseBasis: basis, workerId, derivatives: [{ unsafe: "ignored" }] }), params);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ accepted: true, derivativeIds: [], leaseProtocolVersion: 2 });
  expect(mocks.complete).toHaveBeenCalledWith({}, { workerId, ownerPrincipalId: "principal-one", jobId: "job-one", status: "cancelled", leaseBasis: basis, cancelReason:"operator_shutdown" });
});
it.each([undefined, {}, { ...basis, attemptCount: 0 }, { ...basis, sourceContentHash: "wrong" }])("rejects incomplete cancellation basis before database access: %j", async leaseBasis => {
  const response = await POST(request({ status: "cancelled", leaseBasis }), params);
  expect(response.status).toBe(400);
  expect(mocks.database).not.toHaveBeenCalled();
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not accept missing workload proof or another worker label", async () => {
  mocks.auth.mockResolvedValueOnce({ response: Response.json({ error: "WORKER_DEVICE_UNAUTHORIZED" }, { status: 403 }) });
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

it.each([
  ["PRINCIPAL_JOB_RESOURCE_VIEW_DENIED",403],
  ["PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE",503]
] as const)("returns a safe typed completion refusal for %s",async(code,status)=>{
  const error=new PrincipalJobAuthorityError(code,status);error.message="private-provider-detail";
  mocks.complete.mockRejectedValueOnce(error);
  const response=await POST(request({status:"cancelled"}),params);
  expect(response.status).toBe(status);expect(await response.json()).toEqual({error:code});
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
