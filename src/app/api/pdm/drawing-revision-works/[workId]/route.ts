import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawing-revision-works/[workId]/route.ts", method: "GET",
    permissionCode: "numbering.workspace.view", readOnly: true
  }, async (tx, verified) => {
    const { workId } = await params;
    return Response.json(await new DrawingRevisionWorkService(tx).readPrincipal(workId, verified),
      { headers: { "cache-control": "private, no-store" } });
  });
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId } = await params;
    return Response.json(await new DrawingRevisionWorkService().read(workId, access.actor),
      { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
export async function PATCH(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawing-revision-works/[workId]/route.ts", method: "PATCH",
    permissionCode: "numbering.workspace.update", readOnly: false
  }, async (tx, verified) => {
    const { workId } = await params;
    return dev087Success(await new DrawingRevisionWorkService(tx).updatePrincipal(
      workId, await dev087Json(request), verified, dev087CommandContext(request)));
  });
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId } = await params;
    return dev087Success(await new DrawingRevisionWorkService().update(
      workId, await dev087Json(request), access.actor, dev087CommandContext(request)));
  } catch (error) { return dev087RouteError(error); }
}
