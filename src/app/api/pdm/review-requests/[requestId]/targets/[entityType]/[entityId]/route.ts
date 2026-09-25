import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { parseReviewPackageSnapshot, reviewPackageTargetKey, type ReviewPackageEntityType } from "@/lib/pdm-review-package-contract";
import { compareReviewTarget, readCurrentReviewTarget, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
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
  const access = await resolveDev087RouteActor(request, "numbering.approvals");
  if (access.response || !access.actor) return access.response;
  try {
    const { requestId, entityType, entityId } = await params;
    if (entityType !== "drawing" && entityType !== "part") return Response.json({ error: { code: "NOT_FOUND", message: "審核對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const client = getAsyncDatabaseClient();
    const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: access.actor.companyId, requestId });
    if (!item || item.reviewerUserId !== access.actor.id || !access.actor.permissions.decide || item.requestStatus !== "pending") {
      return Response.json({ error: { code: "NOT_FOUND", message: "審核對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    }
    const parsed = parseReviewPackageSnapshot(item.snapshotPayload);
    if (parsed.kind === "legacy") return Response.json({ error: { code: "NOT_FOUND", message: "審核對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    if (parsed.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    const packageValue = verifyReviewPackageIntegrity(item.snapshotPayload, item.snapshotHash);
    const target = packageValue.targets.find((candidate) => candidate.targetKey === reviewPackageTargetKey(entityType, entityId));
    if (!target) return Response.json({ error: { code: "NOT_FOUND", message: "審核對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: access.actor.companyId, actorId: access.actor.id });
    const current = await readCurrentReviewTarget(client, { companyId: access.actor.companyId, entityType, entityId, workId: target.scope === "submitted" ? item.workId : null });
    return Response.json({ data: {
      schemaVersion: packageValue.schemaVersion,
      requestId: item.id,
      requestKind: item.requestKind,
      rowVersion: item.rowVersion,
      readonly: true,
      snapshot: target,
      drift: compareReviewTarget(target, current),
      interaction: { mode: "review_decide", basisState: "current", canMutateContent: false, canSubmit: false, canCancel: false, canApprove: true, canReturn: true, reasonCode: null },
      targetHash: target.evidenceHash
    }, meta: { contractToken, correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return dev087RouteError(error);
  }
}
