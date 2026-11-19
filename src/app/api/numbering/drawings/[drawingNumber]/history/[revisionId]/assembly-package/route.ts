import { handleAssemblyFrozenRoute } from "@/lib/drawing-assembly-route";
export const runtime="nodejs";
export async function GET(request:Request,{params}:{params:Promise<{drawingNumber:string;revisionId:string}>}) {
 const {drawingNumber,revisionId}=await params;
 return handleAssemblyFrozenRoute(request,"src/app/api/numbering/drawings/[drawingNumber]/history/[revisionId]/assembly-package/route.ts",{drawingId:drawingNumber,revisionId},"summary");
}
