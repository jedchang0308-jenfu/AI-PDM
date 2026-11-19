import {describe,it,expect,vi,beforeEach} from "vitest";
const mocks=vi.hoisted(()=>({evaluate:vi.fn(),history:vi.fn(),review:vi.fn(),client:{},verified:{}}));
vi.mock("@/lib/db-async-provider",()=>({getAsyncDatabaseClient:()=>mocks.client}));
vi.mock("@/lib/jenfu-principal-http",()=>({principalSessionTokenFromRequest:()=>"fixture",principalRequestInput:async()=>({}),principalRequestFailure:()=>new Response(null,{status:401})}));
vi.mock("@/lib/jenfu-principal-request-guard",()=>({JenfuPrincipalRequestError:class extends Error{},withVerifiedJenfuPrincipalRequest:async(_input:unknown,execute:Function)=>execute(mocks.client,mocks.verified)}));
vi.mock("@/lib/jenfu-principal-permission-service",()=>({evaluatePrincipalWorkspacePermissionsInSnapshot:mocks.evaluate}));
vi.mock("@/lib/drawing-assembly-package",()=>({DrawingAssemblyPackageService:class{},ASSEMBLY_PACKAGE_LIMITS:{chunkBytes:8388608},assemblyError:(message:string,status:number)=>{throw Object.assign(new Error(message),{status});}}));
vi.mock("@/lib/drawing-assembly-review",()=>({authorizeAssemblyHistory:mocks.history,authorizeAssemblyReview:mocks.review,assemblyFrozenSummary:()=>({data:{packageId:"frozen"}}),assemblyFrozenResponse:async()=>()=>Promise.resolve(new Response())}));
vi.mock("@/lib/pdm-dev087-route",()=>({dev087RouteError:(error:{status?:number})=>new Response(null,{status:error.status??500})}));
import {handleAssemblyFrozenRoute} from "./drawing-assembly-route";
beforeEach(()=>{vi.clearAllMocks();mocks.evaluate.mockResolvedValue([{allowed:true}]);mocks.history.mockResolvedValue({});mocks.review.mockResolvedValue({});});
describe("assembly frozen parent permission semantics",()=>{
  it("uses the existing drawing history PAGE permission before reading a frozen revision",async()=>{
    const path="src/app/api/numbering/drawings/[drawingNumber]/history/[revisionId]/assembly-package/route.ts";
    const response=await handleAssemblyFrozenRoute(new Request("http://localhost/api/numbering/drawings/D/history/R/assembly-package"),path,{drawingId:"D",revisionId:"R"},"summary");
    expect(response.status).toBe(200);expect(mocks.evaluate).toHaveBeenCalledWith(mocks.client,mocks.verified,[{permissionKind:"page",permissionCode:"numbering.drawings.view",resourceGroup:"drawing"}]);
    expect(mocks.history).toHaveBeenCalledWith(mocks.client,mocks.verified,"D","R");
  });
  it("uses the review ACTION permission and stops denied actors before snapshot lookup",async()=>{
    mocks.evaluate.mockResolvedValue([{allowed:false}]);
    const path="src/app/api/pdm/review-requests/[requestId]/assembly-package/route.ts";
    const response=await handleAssemblyFrozenRoute(new Request("http://localhost/api/pdm/review-requests/review/assembly-package"),path,{reviewId:"review"},"summary");
    expect(response.status).toBe(403);expect(mocks.evaluate).toHaveBeenCalledWith(mocks.client,mocks.verified,[{permissionKind:"action",permissionCode:"approval.inbox.view",resourceGroup:"drawing"}]);expect(mocks.review).not.toHaveBeenCalled();
  });
});
