import { handleAssemblyPackageRoute, readAssemblyBinary, readAssemblyJson } from "@/lib/drawing-assembly-route";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/download/route.ts",async(service,token)=>{return service.download(token,request,workId,id);},200);
}
