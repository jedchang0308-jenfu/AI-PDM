import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { PartChangeWorkService } from "@/lib/part-change-work";
import { dev087CommandContext, dev087Json, dev087RouteError, dev087Success, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { validateDev087ReviewDecision } from "@/lib/pdm-work-review";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { retiredWorkbenchCommandResponse } from "@/lib/pdm-retired-workbench-route";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
import { runPrincipalDev087Command } from "@/lib/pdm-principal-dev087-command";
import { verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
export const runtime = "nodejs";

async function principalDecision(request: Request, params: Promise<{ requestId: string }>, token: string) {
  try {
    const policy = resolveJenfuRoutePolicy(
      "src/app/api/pdm/review-requests/[requestId]/decisions/route.ts", "POST",
      { expectedPermissionCode: "approval.request.decide" });
    if (policy?.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
      return Response.json({ code: "principal_route_policy_unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const { requestId } = await params;
    const body = await dev087Json(request);
    if (Object.keys(body).length !== 1 || !("decision" in body)) {
      throw new CanonicalWorkbenchError("DEV087_DECISION_NOT_ALLOWED", "審核決策格式無效", 422);
    }
    const decision = validateDev087ReviewDecision(body.decision);
    const context = dev087CommandContext(request);
    return await withVerifiedJenfuPrincipalRequest(principalRequestInput(token), async (tx, verified) => {
      if (verified.session.assuranceLevel !== "aal2") {
        return Response.json({ code: "assurance_insufficient" },
          { status: 403, headers: { "cache-control": "no-store" } });
      }
      const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx, verified,
        [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
      if (decisions.length !== 1 || !decisions[0] || !decisions[0].allowed) {
        return jenfuEntitlementFailureResponse(decisions[0]?.decisionCode ?? "permission_not_granted");
      }
      const companyId = verified.profile.companyId;
      await verifyCanonicalWorkbenchCommandContract(tx, {
        companyId, actorId: verified.profile.pdmUserId, token: context.contractToken
      });
      const item = await new PdmWorkReviewAsyncRepository(tx).get(tx, { companyId, requestId });
      if (!item) {
        // A completed decision deletes its pending request. Recheck the exact
        // principal receipt before deciding this is an unknown request.
        const replay = await runPrincipalDev087Command(tx, verified, {
          command: "review.decision", idempotencyKey: context.idempotencyKey,
          request: { requestId, decision, expectedRowVersion: context.expectedRowVersion },
          effectKey: `review:${requestId}`,
          correlationId: context.correlationId ?? crypto.randomUUID()
        }, async () => { throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404); });
        return dev087Success(replay);
      }
      if (!["part_change", "drawing_revision"].includes(item.requestKind)) {
        return Response.json({ code: "principal_review_kind_not_migrated" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      if (item.reviewerUserId !== verified.profile.pdmUserId) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核項目不存在", 404);
      }
      const result = item.requestKind === "drawing_revision"
        ? await new DrawingRevisionWorkService(tx)
          .decidePrincipal(requestId, decision, verified, context)
        : await new PartChangeWorkService(tx)
          .decidePrincipal(requestId, decision, verified, context);
      return dev087Success(result);
    }, { readOnly: false, isolationLevel: "serializable" });
  } catch (error) {
    return error instanceof JenfuPrincipalRequestError
      ? principalRequestFailure(error) : dev087RouteError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) return principalDecision(request, params, principalToken);
  const access = await resolveDev087RouteActor(request, "numbering.approvals"); if (access.response || !access.actor) return access.response;
  try {
    const { requestId } = await params; const body = await dev087Json(request); if (Object.keys(body).length !== 1 || !("decision" in body)) throw new CanonicalWorkbenchError("DEV087_DECISION_NOT_ALLOWED", "審核決策格式無效", 422); const decision = validateDev087ReviewDecision(body.decision); const client = getAsyncDatabaseClient(); const reviews = new PdmWorkReviewAsyncRepository(client); const item = await reviews.get(client, { companyId: access.actor.companyId, requestId });
    if (!item) {
      const terminalReceipt = await reviews.getTerminalReceipt(client, { companyId: access.actor.companyId, requestId });
      if (terminalReceipt) return Response.json({ error: { code: "WORKBENCH_REVIEW_REQUEST_STALE", message: "重新開啟目前審核項目", correlationId: crypto.randomUUID() } }, { status: 409 });
      return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    }
    if (item.requestKind === "relation_change") return retiredWorkbenchCommandResponse();
    const context = dev087CommandContext(request); let result;
    if (item.requestKind === "part_change") result = await new PartChangeWorkService(client).decide(requestId, decision, access.actor, context);
    else result = await new DrawingRevisionWorkService(client).decide(requestId, decision, access.actor, context);
    return dev087Success(result);
  } catch (error) { return dev087RouteError(error); }
}
