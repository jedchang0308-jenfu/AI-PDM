import { handleAssemblyPackageRoute, readAssemblyBinary, readAssemblyJson } from "@/lib/drawing-assembly-route";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/bom/route.ts",async(service,token)=>{return service.bom(token,request,workId,id,new URL(request.url).searchParams.get("configuration")??"");},200);
}
export async function PATCH(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/bom/route.ts",async(service,token)=>{const input=await readAssemblyJson(request); return service.bom(token,request,workId,id,String(input.configuration??""),input);},200);
}
