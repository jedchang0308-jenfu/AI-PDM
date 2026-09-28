import crypto from "node:crypto";
import { compareReviewTarget } from "@/lib/pdm-review-package";
import { principalRequestFailure, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";
import { readPrincipalReviewTarget } from "@/lib/pdm-principal-review-target";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string; entityType: string; entityId: string }> }) {
  const token = principalSessionTokenFromRequest(request);
  if (token) {
    return withPrincipalDev087Route(request, token, {
      path: "src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison/route.ts",
      method: "GET", permissionCode: "approval.inbox.view", readOnly: true
    }, async (tx, verified) => {
      const { requestId, entityType, entityId } = await params;
      const { item, target, current } = await readPrincipalReviewTarget(tx,
        verified, { requestId, entityType, entityId });
      const comparison = compareReviewTarget(target, current);
      return Response.json({ data: {
        requestId: item.id, entityType, entityId,
        packageHash: item.snapshotHash, snapshot: target.workspace,
        current: comparison.changed ? current : null, comparison
      }, meta: { correlationId: crypto.randomUUID() } },
      { headers: { "cache-control": "private, no-store" } });
    });
  }
  return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
}
