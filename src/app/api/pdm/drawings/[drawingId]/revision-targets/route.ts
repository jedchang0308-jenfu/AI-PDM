import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response;
  try { const { drawingId } = await params; const sourceRowKey = new URL(request.url).searchParams.get("sourceRowKey") ?? ""; return Response.json(await new DrawingRevisionWorkService().targets(drawingId, sourceRowKey, access.actor), { headers: { "cache-control": "private, no-store" } }); } catch (error) { return dev087RouteError(error); }
}
