import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

/** Recheck the conditional grant in the same write snapshot as the final impact. */
export async function requireRecognitionPostReleaseGrantInSnapshot(
  snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest,
  requiresPostReleaseChange: boolean
) {
  if (!requiresPostReleaseChange) return;
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    [{ permissionKind: "action", permissionCode: "post_release_change" }]);
  if (decisions.length !== 1 || !decisions[0].allowed ||
      decisions[0].principalId !== verified.session.principalId ||
      decisions[0].permissionCode !== "post_release_change") {
    throw new DrawingRecognitionError("RECOGNITION_POST_RELEASE_PERMISSION_DENIED",
      "沒有修改已發布資料的權限。", 403);
  }
}
