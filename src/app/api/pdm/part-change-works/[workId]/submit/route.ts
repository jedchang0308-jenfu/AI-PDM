import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Success } from "@/lib/pdm-dev087-route";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ workId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (!token) return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
  return withPrincipalDev087Route(request, token, {
    path: "src/app/api/pdm/part-change-works/[workId]/submit/route.ts", method: "POST",
    permissionCode: "numbering.candidate.review.submit", readOnly: false
  }, async (tx, verified) => {
    const { workId } = await params;
    return dev087Success(await new PartChangeWorkService(tx)
      .submitPrincipal(workId, verified, dev087CommandContext(request)));
  });
}
