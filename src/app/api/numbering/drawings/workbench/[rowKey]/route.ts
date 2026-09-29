import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  return principalCanonicalWorkbenchResponse(request,
    "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts", "drawing",
    async (service, actor) => service.detail((await params).rowKey, "drawing", actor));
}
