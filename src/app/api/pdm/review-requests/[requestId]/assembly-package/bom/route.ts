import { handleAssemblyFrozenRoute } from "@/lib/drawing-assembly-route";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{requestId:string}>}) {
 const {requestId}=await params;
 return handleAssemblyFrozenRoute(request,"src/app/api/pdm/review-requests/[requestId]/assembly-package/bom/route.ts",{reviewId:requestId},"bom");
}
