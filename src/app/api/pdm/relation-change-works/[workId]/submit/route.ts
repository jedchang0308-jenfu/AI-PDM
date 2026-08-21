import { RelationChangeWorkService } from "@/lib/relation-change-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ workId: string }> }) { const access = await resolveDev087RouteActor(request, "numbering.search"); if (access.response || !access.actor) return access.response; try { const { workId } = await params; return dev087Success(await new RelationChangeWorkService().submit(workId, access.actor, dev087CommandContext(request))); } catch (error) { return dev087RouteError(error); } }
