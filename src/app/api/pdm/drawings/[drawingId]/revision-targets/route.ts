import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ drawingId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/drawings/[drawingId]/revision-targets/route.ts", method: "GET",
    permissionCode: "numbering.workspace.create", readOnly: true
  }, async (tx, verified) => {
    const { drawingId } = await params;
    const sourceRowKey = new URL(request.url).searchParams.get("sourceRowKey") ?? "";
    return Response.json(await new DrawingRevisionWorkService(tx)
      .targetsPrincipal(drawingId, sourceRowKey, verified),
      { headers: { "cache-control": "private, no-store" } });
  });
}
