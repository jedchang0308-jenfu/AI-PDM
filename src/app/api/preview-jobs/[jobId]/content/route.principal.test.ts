import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/lib/db-async-provider",()=>({getAsyncDatabaseClient:()=>({})}));
vi.mock("@/lib/preview-derivatives",()=>({readClaimedPreviewSourceAsync:mocks.read}));
import { GET } from "./route";
const params={params:Promise.resolve({jobId:"job-one"})};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("PDM_PREVIEW_WORKER_TOKEN","synthetic-worker-token");mocks.read.mockResolvedValue({bytes:Buffer.from("source"),fileName:"drawing.slddrw",mimeType:"application/octet-stream",contentHash:"a".repeat(64)})});
afterEach(()=>vi.unstubAllEnvs());
it("refuses requests without workload credential before any source read",async()=>{
 expect((await GET(new Request("https://owner.example/api/preview-jobs/job-one/content"),params)).status).toBe(403);
 expect(mocks.read).not.toHaveBeenCalled();
});
it("fails closed when worker credentials are not configured",async()=>{
 vi.stubEnv("PDM_PREVIEW_WORKER_TOKEN","");
 expect((await GET(new Request("https://owner.example/api/preview-jobs/job-one/content"),params)).status).toBe(503);
 expect(mocks.read).not.toHaveBeenCalled();
});
it("passes only server path job and credential holder to the source boundary",async()=>{
 const response=await GET(new Request("https://owner.example/api/preview-jobs/job-one/content?principalId=forged&assetId=other",{
 headers:{"x-pdm-preview-worker-token":"synthetic-worker-token","x-pdm-preview-worker-id":"worker-one"}}),params);
 expect(response.status).toBe(200);expect(await response.text()).toBe("source");
 expect(mocks.read).toHaveBeenCalledWith({}, {jobId:"job-one",workerId:"worker-one"});
 expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("does not return content for another holder or storage corruption",async()=>{
 const request=new Request("https://owner.example/api/preview-jobs/job-one/content",{headers:{"x-pdm-preview-worker-token":"synthetic-worker-token","x-pdm-preview-worker-id":"other"}});
 mocks.read.mockRejectedValueOnce(new Error("PREVIEW_SOURCE_CLAIM_FORBIDDEN"));
 expect((await GET(request,params)).status).toBe(403);
 mocks.read.mockRejectedValueOnce(new Error("private storage failure"));
 const response=await GET(request,params);expect(response.status).toBe(503);expect(await response.text()).not.toContain("private storage failure");
});
