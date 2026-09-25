import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { principalDev087RoutePolicyAvailable } from "@/lib/pdm-principal-dev087-route";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ workId: string; fileBindingId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) {
    try {
      if (!principalDev087RoutePolicyAvailable(request, {
        path: "src/app/api/pdm/drawing-revision-works/[workId]/files/[fileBindingId]/route.ts",
        method: "DELETE", permissionCode: "numbering.workspace.update", readOnly: false
      })) return Response.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
      const { workId, fileBindingId } = await params;
      return dev087Success(await new DrawingRevisionWorkService().removeFilePrincipal(
        workId, fileBindingId, token, dev087CommandContext(request)));
    } catch (error) {
      return error instanceof JenfuPrincipalRequestError
        ? principalRequestFailure(error) : dev087RouteError(error);
    }
  }
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId, fileBindingId } = await params;
    return dev087Success(await new DrawingRevisionWorkService().removeFile(workId, fileBindingId, access.actor, dev087CommandContext(request)));
  } catch (error) {
    return dev087RouteError(error);
  }
}
