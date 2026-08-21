import { PdmCanonicalWorkbenchService } from "@/lib/pdm-canonical-workbench";
import { canonicalActorFromRoute, dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ rowKey: string }> }) { const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response; try { const { rowKey } = await params; return Response.json(await new PdmCanonicalWorkbenchService().detail(rowKey, "drawing", canonicalActorFromRoute(access.actor)), { headers: { "cache-control": "private, no-store" } }); } catch (error) { return dev087RouteError(error); } }
