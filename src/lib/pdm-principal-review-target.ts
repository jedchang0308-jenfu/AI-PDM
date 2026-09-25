import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { parseReviewPackageSnapshot, reviewPackageTargetKey,
  type ReviewPackageEntityType } from "@/lib/pdm-review-package-contract";
import { readCurrentReviewTarget, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";

/** The target and comparison views use the same reviewer-bound principal snapshot. */
export async function readPrincipalReviewTarget(client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, input: {
    requestId: string; entityType: string; entityId: string;
  }) {
  if (verified.session.assuranceLevel !== "aal2") {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }
  const [decision] = await evaluatePrincipalWorkspacePermissionsInSnapshot(client,
    verified, [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
  if (!decision?.allowed) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }
  if (input.entityType !== "drawing" && input.entityType !== "part") {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核對象不存在", 404);
  }
  const companyId = verified.profile.companyId;
  const item = await new PdmWorkReviewAsyncRepository(client).get(client,
    { companyId, requestId: input.requestId });
  if (!item || item.reviewerUserId !== verified.profile.pdmUserId ||
      item.requestStatus !== "pending") {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核對象不存在", 404);
  }
  if (!["part_change", "drawing_revision"].includes(item.requestKind)) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "此審核類型尚未遷移", 503);
  }
  const parsed = parseReviewPackageSnapshot(item.snapshotPayload);
  if (parsed.kind !== "v2") {
    throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
  }
  const packageValue = verifyReviewPackageIntegrity(item.snapshotPayload, item.snapshotHash);
  const entityType = input.entityType as ReviewPackageEntityType;
  const target = packageValue.targets.find((candidate) =>
    candidate.targetKey === reviewPackageTargetKey(entityType, input.entityId));
  if (!target) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "審核對象不存在", 404);
  }
  let basisState: "current" | "stale" | "preproduction" = "current";
  if (item.requestKind === "drawing_revision") {
    if (!item.workId) {
      throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    }
    const repository = new DrawingRevisionWorkAsyncRepository(client);
    const work = await repository.readWork(client, companyId, item.workId);
    if (!work) {
      throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    }
    basisState = (await repository.resolveWorkBasis(client, work)).basisState;
  }
  const current = await readCurrentReviewTarget(client, {
    companyId, entityType, entityId: input.entityId,
    workId: target.scope === "submitted" ? item.workId : null
  });
  return { item, target, current, packageValue, basisState };
}
