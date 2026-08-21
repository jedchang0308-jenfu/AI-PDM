import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response;
  try { const { drawingId } = await params; const body = await dev087Json(request); const result = await new DrawingRevisionWorkService().create(drawingId, { sourceRowKey: String(body.sourceRowKey ?? ""), candidateToken: String(body.candidateToken ?? "") }, access.actor, dev087CommandContext(request)); return dev087Success(result); } catch (error) { return dev087RouteError(error); }
}
