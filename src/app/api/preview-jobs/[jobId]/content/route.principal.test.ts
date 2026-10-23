import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/db-async-provider",()=>({getAsyncDatabaseClient:()=>({})}));
vi.mock("@/lib/preview-derivatives",()=>({readClaimedPreviewSourceAsync:mocks.read}));
import { GET } from "./route";
const token=Buffer.alloc(32,11).toString("base64url");
const basis={companyId:"company-one",sourceFileAssetId:"asset-one",sourceContentHash:"a".repeat(64),attemptCount:1,lockedAt:"2026-10-23T00:00:00.000Z"};
const lease=Buffer.from(JSON.stringify({leaseProtocolVersion:2,leaseBasis:basis})).toString("base64url");
const params={params:Promise.resolve({jobId:"job-one"})};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS",JSON.stringify({schemaVersion:"ai-pdm.workload-credentials.v1",workloads:[{id:"worker-one",token,purposes:["preview_jobs"],capabilities:["solidworks_2d_preview_png"]}]}));mocks.read.mockResolvedValue({bytes:Buffer.from("source"),fileName:"drawing.slddrw",mimeType:"application/octet-stream",contentHash:"a".repeat(64)})});
afterEach(()=>vi.unstubAllEnvs());
it("refuses requests without workload credential before any source read",async()=>{
 expect((await GET(new Request("https://owner.example/api/preview-jobs/job-one/content"),params)).status).toBe(403);
 expect(mocks.read).not.toHaveBeenCalled();
});
it("fails closed when worker credentials are not configured",async()=>{
 vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS","");
 expect((await GET(new Request("https://owner.example/api/preview-jobs/job-one/content"),params)).status).toBe(503);
 expect(mocks.read).not.toHaveBeenCalled();
});
it("passes only server path job and credential holder to the source boundary",async()=>{
 const response=await GET(new Request("https://owner.example/api/preview-jobs/job-one/content?principalId=forged&assetId=other",{
 headers:{"x-pdm-preview-lease":lease,authorization:`Bearer ${token}`,"x-pdm-preview-worker-id":"worker-one"}}),params);
 expect(response.status).toBe(200);expect(await response.text()).toBe("source");
 expect(response.headers.get("x-pdm-preview-lease-protocol-version")).toBe("2");
 expect(mocks.read).toHaveBeenCalledWith({}, {jobId:"job-one",workerId:"worker-one",leaseBasis:basis});
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not return content for another holder or storage corruption",async()=>{
 const forged=new Request("https://owner.example/api/preview-jobs/job-one/content",{headers:{"x-pdm-preview-lease":lease,authorization:`Bearer ${token}`,"x-pdm-worker-id":"other"}});
 expect((await GET(forged,params)).status).toBe(403);expect(mocks.read).not.toHaveBeenCalled();
 const request=new Request("https://owner.example/api/preview-jobs/job-one/content",{headers:{"x-pdm-preview-lease":lease,authorization:`Bearer ${token}`,"x-pdm-worker-id":"worker-one"}});
 mocks.read.mockRejectedValueOnce(new Error("PREVIEW_JOB_CLAIM_LOST"));
 expect((await GET(request,params)).status).toBe(409);
 mocks.read.mockRejectedValueOnce(new Error("private storage failure"));
 const response=await GET(request,params);expect(response.status).toBe(503);expect(await response.text()).not.toContain("private storage failure");
});
