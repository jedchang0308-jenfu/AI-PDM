import crypto from "node:crypto";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";
import { parseReviewPackageSnapshot, reviewPackageTargetKey } from "@/lib/pdm-review-package-contract";
import { compareReviewTarget, readCurrentReviewTarget, verifyReviewPackageIntegrity } from "@/lib/pdm-review-package";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { PdmWorkReviewAsyncRepository } from "@/lib/repositories/pdm-work-review-async-repository";
export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ requestId: string; entityType: string; entityId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.approvals");
  if (access.response || !access.actor) return access.response;
  try {
    const { requestId, entityType, entityId } = await params;
    if (entityType !== "drawing" && entityType !== "part") return Response.json({ error: { code: "NOT_FOUND", message: "比較對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const client = getAsyncDatabaseClient();
    const item = await new PdmWorkReviewAsyncRepository(client).get(client, { companyId: access.actor.companyId, requestId });
    if (!item || item.reviewerUserId !== access.actor.id || !access.actor.permissions.decide || item.requestStatus !== "pending") {
      return Response.json({ error: { code: "NOT_FOUND", message: "比較對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    }
    const parsed = parseReviewPackageSnapshot(item.snapshotPayload);
    if (parsed.kind === "legacy") return Response.json({ error: { code: "NOT_FOUND", message: "比較對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    if (parsed.kind === "invalid") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
    const packageValue = verifyReviewPackageIntegrity(item.snapshotPayload, item.snapshotHash);
    const snapshot = packageValue.targets.find((target) => target.targetKey === reviewPackageTargetKey(entityType, entityId));
    if (!snapshot) return Response.json({ error: { code: "NOT_FOUND", message: "比較對象不存在", correlationId: crypto.randomUUID() } }, { status: 404 });
    const current = await readCurrentReviewTarget(client, { companyId: access.actor.companyId, entityType, entityId, workId: snapshot.scope === "submitted" ? item.workId : null });
    const comparison = compareReviewTarget(snapshot, current);
    return Response.json({ data: { requestId, entityType, entityId, packageHash: item.snapshotHash, snapshot: snapshot.workspace, current: comparison.changed ? current : null, comparison }, meta: { correlationId: crypto.randomUUID() } }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return dev087RouteError(error);
  }
}
