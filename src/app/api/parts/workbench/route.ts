import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return principalCanonicalWorkbenchResponse(request,
    "src/app/api/parts/workbench/route.ts", "part",
    (service, actor) => service.list(new URL(request.url), "part", actor));
}
