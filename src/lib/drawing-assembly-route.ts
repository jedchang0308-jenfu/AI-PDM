import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { resolveJenfuRoutePolicyFromRequest } from "@/lib/jenfu-route-permission-map";
import { dev087RouteError } from "@/lib/pdm-dev087-route";
import { AssemblyArchiveError } from "@/lib/assembly-archive";
import { DrawingAssemblyPackageService, ASSEMBLY_PACKAGE_LIMITS, assemblyError } from "@/lib/drawing-assembly-package";
import { authorizeAssemblyReview, authorizeAssemblyHistory, assemblyFrozenResponse,assemblyFrozenSummary } from "@/lib/drawing-assembly-review";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";

export async function readAssemblyBinary(request:Request,maxBytes=ASSEMBLY_PACKAGE_LIMITS.chunkBytes) {
  if(Number(request.headers.get("content-length"))>maxBytes) assemblyError("上傳分段超過限制",413);
  const reader=request.body?.getReader();if(!reader) assemblyError("缺少上傳內容",422);
  let size=0;const chunks:Uint8Array[]=[];
  try {while(true){const {done,value}=await reader.read();if(done) break;size+=value.byteLength;if(size>maxBytes) {await reader.cancel();assemblyError("上傳內容超過限制",413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  return Buffer.concat(chunks,size);
}
export async function readAssemblyJson(request:Request):Promise<Record<string,unknown>> {
  try {const data:unknown=JSON.parse((await readAssemblyBinary(request,64*1024)).toString("utf8"));if(!data || typeof data!=="object" || Array.isArray(data)) assemblyError("請提供有效資料",422);return data as Record<string,unknown>;}
  catch(error){if(error instanceof SyntaxError) assemblyError("請提供有效 JSON",422);throw error;}
}
/** Route map admission precedes body parsing. Domain methods re-admit each metadata transaction. */
export async function handleAssemblyPackageRoute(request:Request,path:string,execute:(service:DrawingAssemblyPackageService,token:string)=>Promise<unknown>,status=200) {
  const token=principalSessionTokenFromRequest(request);
  if(!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  try {
    const permission=request.method==="GET"?"numbering.workspace.view":"numbering.workspace.update";
    const policy=resolveJenfuRoutePolicyFromRequest(request,permission);
    if(policy?.path!==path || policy.method!==request.method || policy.authorizationMode!=="permission" || policy.scopeResolver!=="workspace") return Response.json({code:"principal_route_policy_unavailable"},{status:503,headers:{"cache-control":"no-store"}});
    const result=await execute(new DrawingAssemblyPackageService(),token);
    return result instanceof Response?result:Response.json(result,{status,headers:{"cache-control":"private, no-store"}});
  }catch(error){
    if(error instanceof JenfuPrincipalRequestError) return principalRequestFailure(error);
    if(error instanceof AssemblyArchiveError) return Response.json({error:{code:error.code,message:"組立包安全檢查未通過，請確認 ZIP 內容。"}},{status:/LIMIT/u.test(error.code)?413:422,headers:{"cache-control":"no-store"}});
    return dev087RouteError(error);
  }
}
export async function handleAssemblyFrozenRoute(request:Request,path:string,input:{reviewId:string}|{drawingId:string;revisionId:string},mode:"download"|"bom"|"summary") {
  const token=principalSessionTokenFromRequest(request);
  if(!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  try {
    const permission="reviewId" in input?"approval.inbox.view":"numbering.drawings.view";
    const permissionKind="reviewId" in input?"action":"page";
    const policy=resolveJenfuRoutePolicyFromRequest(request,permission);
    if(policy?.path!==path || policy.method!=="GET" || policy.authorizationMode!=="permission" || policy.scopeResolver!=="workspace") return Response.json({code:"principal_route_policy_unavailable"},{status:503});
    const deliver=await withVerifiedJenfuPrincipalRequest({...await principalRequestInput(token,request),database:getAsyncDatabaseClient()},async(tx,verified)=>{
      const [decision]=await evaluatePrincipalWorkspacePermissionsInSnapshot(tx,verified,[{permissionKind,permissionCode:permission,resourceGroup:"drawing"}]);
      if(!decision?.allowed) assemblyError("無權限執行此操作",403);
      const frozen="reviewId" in input?await authorizeAssemblyReview(tx,verified,input.reviewId):await authorizeAssemblyHistory(tx,verified,input.drawingId,input.revisionId);
      if(mode==="summary") return ()=>Promise.resolve(Response.json(assemblyFrozenSummary(frozen),{headers:{"cache-control":"private, no-store"}}));
      return assemblyFrozenResponse(tx,verified,frozen,mode,new URL(request.url).searchParams.get("configuration")??"");
    },{readOnly:true,isolationLevel:"repeatable_read"});
    return await deliver();
  }catch(error){return error instanceof JenfuPrincipalRequestError?principalRequestFailure(error):dev087RouteError(error);}
}
