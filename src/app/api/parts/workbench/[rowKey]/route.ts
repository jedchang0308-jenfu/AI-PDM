import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  return principalCanonicalWorkbenchResponse(request,
    "src/app/api/parts/workbench/[rowKey]/route.ts", "part",
    async (service, actor) => service.detail((await params).rowKey, "part", actor));
}
