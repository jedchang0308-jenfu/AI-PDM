import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({claim:vi.fn(),database:vi.fn()}));
vi.mock("@/lib/db-async-provider",()=>({getAsyncDatabaseClient:mocks.database}));
vi.mock("@/lib/preview-derivatives",()=>({claimPreviewJobAsync:mocks.claim}));
import { POST } from "./route";
const token=Buffer.alloc(32,19).toString("base64url");
function configure(capability="solidworks_2d_preview_png"){
 vi.stubEnv("PDM_WORKLOAD_AUTH_CREDENTIALS",JSON.stringify({schemaVersion:"ai-pdm.workload-credentials.v1",workloads:[{id:"png-worker",token,purposes:["preview_jobs"],capabilities:[capability]}]}));
}
function request(body:Record<string,unknown>){return new Request("https://owner.example/api/preview-jobs/claim",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(body)});}
beforeEach(()=>{vi.clearAllMocks();configure();mocks.database.mockReturnValue({});mocks.claim.mockResolvedValue({id:"claimed-png"});});
afterEach(()=>vi.unstubAllEnvs());
it("does not let a PNG actor claim PDF or unknown kinds, including mixed and empty requests",async()=>{
 for(const supportedKinds of [["drawing_pdf"],["native_thumbnail_png","drawing_pdf"],["unknown"],[]]){
  const response=await POST(request({workerId:"png-worker",supportedKinds,supportedExtensions:["slddrw"]}));
  expect(response.status).toBe(403);expect(await response.json()).toEqual({error:"WORKLOAD_JOB_SCOPE_FORBIDDEN"});
 }
 expect(mocks.claim).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();
});
it("allows ordinary 2D and 3D PNG work with server-owned actor and extension scope",async()=>{
 for(const [capability,extension] of [["solidworks_2d_preview_png","slddrw"],["solidworks_3d_preview_png","sldprt"]]){
  configure(capability);
  const response=await POST(request({workerId:"png-worker",supportedKinds:["native_thumbnail_png"],supportedExtensions:[extension]}));
  expect(response.status).toBe(200);expect(mocks.claim).toHaveBeenLastCalledWith({}, {workerId:"png-worker",supportedKinds:["native_thumbnail_png"],supportedExtensions:[extension]});
 }
});
it("preserves the default PNG caller and refuses an extension outside its published capability",async()=>{
 expect((await POST(request({workerId:"png-worker",supportedExtensions:["slddrw"]}))).status).toBe(200);
 mocks.claim.mockClear();mocks.database.mockClear();
 expect((await POST(request({workerId:"png-worker",supportedKinds:["native_thumbnail_png"],supportedExtensions:["sldprt"]}))).status).toBe(403);
 expect(mocks.claim).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();
});
