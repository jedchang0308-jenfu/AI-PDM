import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { dev087RouteError } from "@/lib/pdm-dev087-route";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import { parseReviewPackageSnapshot, splitReviewPackageTargetKey } from "@/lib/pdm-review-package-contract";
import { verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { principalRequestFailure, principalRequestInput, principalSessionTokenFromRequest } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalRequestError, withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { jenfuEntitlementFailureResponse } from "@/lib/jenfu-entitlement-http";
import { resolveJenfuRoutePolicy } from "@/lib/jenfu-route-permission-map";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ requestId: string }> }) {
  const principalToken = principalSessionTokenFromRequest(request);
  if (principalToken) {
    try {
      const policy = resolveJenfuRoutePolicy(
        "src/app/api/pdm/review-requests/[requestId]/route.ts", "GET",
        { expectedPermissionCode: "approval.inbox.view" });
      if (policy?.authorizationMode !== "permission" || policy.scopeResolver !== "workspace") {
        return Response.json({ code: "principal_route_policy_unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } });
      }
      const { requestId } = await params;
      return await withVerifiedJenfuPrincipalRequest(principalRequestInput(principalToken), async (tx, verified) => {
        const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(tx, verified, [
          { permissionKind: "action", permissionCode: "approval.inbox.view" },
          { permissionKind: "action", permissionCode: "approval.request.decide" }
        ]);
        if (decisions.length !== 2 || decisions.some((decision) => !decision.allowed)) {
          return jenfuEntitlementFailureResponse(
            decisions.find((decision) => !decision.allowed)?.decisionCode ?? "permission_not_granted");
        }
        return readAssignedReview(tx, requestId, {
          id: verified.profile.pdmUserId, companyId: verified.profile.companyId,
          permissions: { decide: true }
        });
      }, { readOnly: true, isolationLevel: "repeatable_read" });
    } catch (error) {
      return error instanceof JenfuPrincipalRequestError
        ? principalRequestFailure(error) : dev087RouteError(error);
    }
  }
  return principalRequestFailure(new JenfuPrincipalRequestError("auth_session_invalid"));
}

async function readAssignedReview(client: AsyncDatabaseClient, requestId: string,
  actor: { id: string; companyId: string; permissions: { decide: boolean } }) {
  try {
    const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: actor.companyId, requestId });
    if (!item || item.reviewerUserId !== actor.id || !actor.permissions.decide || item.requestStatus !== "pending") return Response.json({ error: { code: "NOT_FOUND", message: "審核項目不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    if (!["part_change", "drawing_revision", "drawing_rd_void"].includes(item.requestKind)) {
      return Response.json({ code: "principal_review_kind_not_migrated" },
        { status: 503, headers: { "cache-control": "no-store" } });
    }
    const parsedSnapshot = parseReviewPackageSnapshot(item.snapshotPayload);
    if (parsedSnapshot.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    if (parsedSnapshot.kind !== "v2") {
      throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    }
    const packageValue = verifyReviewPackageIntegrity(item.snapshotPayload, item.snapshotHash);
    if (packageValue.requestKind !== item.requestKind ||
        packageValue.primaryTargetKey !==
          `${item.entityType}:${item.canonicalEntityId}`) {
      throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID",
        "審核包格式無效", 409);
    }
    const contractToken = await issueCanonicalWorkbenchContract(client, { companyId: actor.companyId, actorId: actor.id });
    const targetSummaries = packageValue.targets.map((target) => ({
      targetKey: target.targetKey,
      ...splitReviewPackageTargetKey(target.targetKey),
      number: target.workspace.identity.code,
      identity: target.workspace.identity,
      revision: target.workspace.identity.revision,
      scope: target.scope,
      markers: target.markers,
      evidenceHash: target.evidenceHash,
      fileCount: target.workspace.files.length,
      attachmentCount: target.workspace.attachments.length
    }));
    let reviewBasisState: "current" | "stale" | "preproduction" = "current";
    if (item.requestKind === "drawing_revision") {
      if (!item.workId) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT",
        "資料已改變，請退回修改後重新送審", 409);
      const repository = new DrawingRevisionWorkAsyncRepository(client);
      const work = await repository.readWork(client, actor.companyId, item.workId);
      if (!work) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT",
        "資料已改變，請退回修改後重新送審", 409);
      const basis = await repository.resolveWorkBasis(client, work);
      reviewBasisState = basis.basisState;
    } else if (item.requestKind === "drawing_rd_void") {
      if (!item.branchId || item.workId !== null ||
          packageValue.decisionBasis.kind !== "drawing_rd_void") {
        throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID",
          "審核包格式無效", 409);
      }
      const current = await client.queryOne<{
        drawing_id: string; branch_id: string; revision_id: string;
        revision: string; branch_status: string;
        latest_approved_revision_id: string | null;
      }>(`SELECT state.canonical_entity_id AS drawing_id,
                state.branch_id, state.revision_id, revision.revision,
                branch.status AS branch_status,
                branch.latest_approved_revision_id
           FROM canonical_workbench_states state
           JOIN drawing_rd_branches branch
             ON branch.id = state.branch_id AND branch.company_id = state.company_id
           JOIN drawing_revisions revision
             ON revision.id = state.revision_id AND revision.company_id = state.company_id
          WHERE state.company_id = :companyId AND state.branch_id = :branchId
            AND state.canonical_entity_id = :drawingId
            AND state.entity_type = 'drawing'
            AND state.data_layer = 'drawing_rd'
            AND state.handling = 'review_owner' AND state.work_id IS NULL`,
        { companyId: actor.companyId, branchId: item.branchId,
          drawingId: item.canonicalEntityId });
      const basis = current ? { drawingId: current.drawing_id,
        branchId: current.branch_id, revisionId: current.revision_id,
        revision: current.revision } : null;
      reviewBasisState = current && current.branch_status === "open" &&
        current.latest_approved_revision_id === current.revision_id &&
        dev087RequestHash(basis) === packageValue.decisionBasis.hash
        ? "current" : "stale";
    }
    return Response.json({ data: {
      schemaVersion: packageValue.schemaVersion,
      requestId: item.id,
      requestKind: item.requestKind,
      entityType: item.entityType,
      entityId: item.canonicalEntityId,
      workId: item.workId,
      rowVersion: item.rowVersion,
      readonly: true,
      interaction: { mode: reviewBasisState === "stale" ? "review_stale_cleanup" : "review_decide",
        basisState: reviewBasisState, canMutateContent: false, canSubmit: false,
        canCancel: false, canApprove: reviewBasisState !== "stale", canReturn: true,
        reasonCode: reviewBasisState === "stale" ? "DRAWING_PRODUCTION_BASE_STALE" : null },
      primaryTargetKey: packageValue.primaryTargetKey,
      root: packageValue.root,
      matrix: packageValue.matrix,
      packageHash: packageValue.packageHash,
      submittedAt: packageValue.submittedAt,
      targets: targetSummaries,
      actions: reviewBasisState === "stale"
        ? [{ key: "return_for_correction", label: "退回修改" }]
        : [{ key: "approve", label: "核准" },
          { key: "return_for_correction", label: "退回修改" }]
    }, meta: { contractToken, correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) { return dev087RouteError(error); }
}
