import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ partId: string }> }) { const access = await resolveDev087RouteActor(request, "numbering.search"); if (access.response || !access.actor) return access.response; try { const { partId } = await params; return dev087Success(await new PartChangeWorkService().create(partId, access.actor, dev087CommandContext(request))); } catch (error) { return dev087RouteError(error); } }
