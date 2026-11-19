import { handleAssemblyPackageRoute, readAssemblyBinary, readAssemblyJson } from "@/lib/drawing-assembly-route";
export const runtime = "nodejs";
export async function PUT(request:Request,{params}:{params:Promise<{workId: string; id: string}>}) {
  const {workId,id}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/[id]/content/route.ts",async(service,token)=>{return service.content(token,request,workId,id,request.headers.get("Content-Range"),await readAssemblyBinary(request));},200);
}
