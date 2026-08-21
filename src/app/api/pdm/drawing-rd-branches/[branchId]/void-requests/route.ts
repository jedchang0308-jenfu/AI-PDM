import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ branchId: string }> }) { const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response; try { const { branchId } = await params; const body = await dev087Json(request); return dev087Success(await new DrawingRevisionWorkService().requestVoid(branchId, String(body.rowKey ?? ""), access.actor, dev087CommandContext(request))); } catch (error) { return dev087RouteError(error); } }
