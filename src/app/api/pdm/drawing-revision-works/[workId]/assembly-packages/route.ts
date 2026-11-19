import { handleAssemblyPackageRoute, readAssemblyBinary, readAssemblyJson } from "@/lib/drawing-assembly-route";
export const runtime = "nodejs";
export async function GET(request:Request,{params}:{params:Promise<{workId: string}>}) {
  const {workId}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/route.ts",async(service,token)=>{return service.get(token,request,workId);},200);
}
export async function POST(request:Request,{params}:{params:Promise<{workId: string}>}) {
  const {workId}=await params;
  return handleAssemblyPackageRoute(request,"src/app/api/pdm/drawing-revision-works/[workId]/assembly-packages/route.ts",async(service,token)=>{return service.start(token,request,workId,await readAssemblyJson(request),request.headers.get("Idempotency-Key")??"");},201);
}
