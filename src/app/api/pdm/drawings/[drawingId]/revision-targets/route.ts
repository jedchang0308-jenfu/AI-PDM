import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawings/[drawingId]/revision-targets/route.ts", method: "GET",
    permissionCode: "numbering.workspace.create", readOnly: true
  }, async (tx, verified) => {
    const { drawingId } = await params;
    const sourceRowKey = new URL(request.url).searchParams.get("sourceRowKey") ?? "";
    return Response.json(await new DrawingRevisionWorkService(tx)
      .targetsPrincipal(drawingId, sourceRowKey, verified),
      { headers: { "cache-control": "private, no-store" } });
  });
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view"); if (access.response || !access.actor) return access.response;
  try { const { drawingId } = await params; const sourceRowKey = new URL(request.url).searchParams.get("sourceRowKey") ?? ""; return Response.json(await new DrawingRevisionWorkService().targets(drawingId, sourceRowKey, access.actor), { headers: { "cache-control": "private, no-store" } }); } catch (error) { return dev087RouteError(error); }
}
