import { handleAssemblyPackageRoute, readAssemblyBinary, readAssemblyJson } from "@/lib/drawing-assembly-route";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/route.ts",async(service,token)=>{return service.get(token,request,workId,id);},200);
}
export async function PATCH(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/route.ts",async(service,token)=>{return service.select(token,request,workId,id,await readAssemblyJson(request),request.headers.get("Idempotency-Key")??"");},200);
}
