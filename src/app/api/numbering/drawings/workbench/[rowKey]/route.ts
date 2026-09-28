import { PdmCanonicalWorkbenchService } from "@/lib/pdm-canonical-workbench";
import { canonicalActorFromRoute, dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) {
  const principalResponse = await principalCanonicalWorkbenchResponse(request,
    "src/app/api/numbering/drawings/workbench/[rowKey]/route.ts", "drawing",
    async (service, actor) => service.detail((await params).rowKey, "drawing", actor));
  if (principalResponse) return principalResponse;
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { rowKey } = await params;
    return Response.json(await new PdmCanonicalWorkbenchService().detail(
      rowKey, "drawing", canonicalActorFromRoute(access.actor)),
    { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
