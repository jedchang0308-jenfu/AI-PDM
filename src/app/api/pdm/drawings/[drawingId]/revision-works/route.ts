import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts", method: "POST",
    permissionCode: "numbering.workspace.create", readOnly: false
  }, async (tx, verified) => {
    const { drawingId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new DrawingRevisionWorkService(tx)
      .createPrincipal(drawingId, body, verified, dev087CommandContext(request)));
  });
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response;
  try { const { drawingId } = await params; const body = await dev087Json(request); const result = await new DrawingRevisionWorkService().create(drawingId, body, access.actor, dev087CommandContext(request)); return dev087Success(result); } catch (error) { return dev087RouteError(error); }
}
