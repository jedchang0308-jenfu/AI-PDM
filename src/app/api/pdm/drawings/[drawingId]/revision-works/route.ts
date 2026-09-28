import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087CommandContext, dev087Json, dev087Success } from "@/lib/pdm-dev087-route";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawings/[drawingId]/revision-works/route.ts", method: "POST",
    permissionCode: "numbering.workspace.create", readOnly: false
  }, async (tx, verified) => {
    const { drawingId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new DrawingRevisionWorkService(tx)
      .createPrincipal(drawingId, body, verified, dev087CommandContext(request)));
  });
}
