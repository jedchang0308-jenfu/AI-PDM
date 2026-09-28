import crypto from "node:crypto";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
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
      path: "src/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/route.ts",
      method: "GET", permissionCode: "approval.inbox.view", readOnly: true
    }, async (tx, verified) => {
      const { requestId, entityType, entityId } = await params;
      const { item, target, current, packageValue, basisState } = await readPrincipalReviewTarget(tx,
        verified, { requestId, entityType, entityId });
      const contractToken = await issueCanonicalWorkbenchContract(tx, {
        companyId: verified.profile.companyId, actorId: verified.profile.pdmUserId
      });
      return Response.json({ data: {
        schemaVersion: packageValue.schemaVersion,
        requestId: item.id, requestKind: item.requestKind,
        rowVersion: item.rowVersion, readonly: true, snapshot: target,
        drift: compareReviewTarget(target, current),
        interaction: { mode: basisState === "stale" ? "review_stale_cleanup" : "review_decide", basisState,
          canMutateContent: false, canSubmit: false, canCancel: false,
          canApprove: basisState !== "stale", canReturn: true,
          reasonCode: basisState === "stale" ? "DRAWING_PRODUCTION_BASE_STALE" : null },
        targetHash: target.evidenceHash
      }, meta: { contractToken, correlationId: crypto.randomUUID() } },
      { headers: { "cache-control": "private, no-store" } });
    });
  }
  return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
}
