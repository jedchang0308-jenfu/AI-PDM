import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Json, dev087Success } from "@/lib/pdm-dev087-route";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ partId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/parts/[partId]/change-works/route.ts", method: "POST",
    permissionCode: "numbering.workspace.create", readOnly: false
  }, async (tx, verified) => {
    const { partId } = await params;
    const body = await dev087Json(request);
    return dev087Success(await new PartChangeWorkService(tx)
      .createPrincipal(partId, verified, dev087CommandContext(request), body.initialPayload));
  });
}
