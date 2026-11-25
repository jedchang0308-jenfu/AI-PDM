import type { AsyncDatabaseClient } from "./db-async-provider";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "./jenfu-principal-permission-service";
import { hasPdmNonOwnerEditScope } from "./pdm-edit-scope-policy";
import { CanonicalWorkbenchError } from "./pdm-canonical-workbench-contract";

/** The drawing editor and its package metadata share one read scope. */
export async function drawingWorkReadPermissions(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  const permissions = ["numbering.workspace.view", "numbering.workspace.update",
    "numbering.candidate.review.submit", "numbering.workspace.cancel"] as const;
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(client, verified,
    permissions.map(permissionCode => ({ permissionKind: "action", permissionCode, resourceGroup: "drawing" })));
  if (decisions.length !== permissions.length || !decisions[0]?.allowed) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }
  return {
    decisions,
    canEditNonOwned: hasPdmNonOwnerEditScope({ roles: decisions.filter(decision => decision.allowed)
      .flatMap(decision => decision.roleCode ? [decision.roleCode] : []) }),
  };
}
