import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087Success } from "@/lib/pdm-dev087-route";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawing-revision-works/[workId]/route.ts", method: "GET",
    permissionCode: "numbering.workspace.view", readOnly: true
  }, async (tx, verified) => {
    const { workId } = await params;
    return Response.json(await new DrawingRevisionWorkService(tx).readPrincipal(workId, verified),
      { headers: { "cache-control": "private, no-store" } });
  });
}
export async function PATCH(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawing-revision-works/[workId]/route.ts", method: "PATCH",
    permissionCode: "numbering.workspace.update", readOnly: false
  }, async (tx, verified) => {
    const { workId } = await params;
    return dev087Success(await new DrawingRevisionWorkService(tx).updatePrincipal(
      workId, await dev087Json(request), verified, dev087CommandContext(request)));
  });
}
