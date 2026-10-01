import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { evaluatePrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { JenfuPrincipalRequestError, type VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import type { NumberingUserScope } from "@/lib/db";
import { canUserUseNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { HumanStatusRoleCapabilities } from "@/lib/human-status-projection";

/**
 * Resolves only capabilities that affect viewer-facing responsibility labels.
 * Individual owner/reviewer assignments still take precedence in domain services.
 */
export async function resolveHumanStatusRoleCapabilitiesAsync(user: NumberingUserScope): Promise<HumanStatusRoleCapabilities> {
  const [edit, manageRelations, review, publish, release, restore, submit] = await Promise.all([
    canUserUseNumberingActionAsync(user, "numbering.draft.update"),
    canUserUseNumberingActionAsync(user, "numbering.link_variant"),
    canUserUseNumberingActionAsync(user, "numbering.approval.batch.decide"),
    canUserUseNumberingActionAsync(user, "numbering.publish"),
    canUserUseNumberingActionAsync(user, "release"),
    canUserUseNumberingActionAsync(user, "main_drawing_restore"),
    canUserUseNumberingActionAsync(user, "numbering.candidate.review.submit")
  ]);
  return {
    canEdit: edit.allowed,
    canManageRelations: manageRelations.allowed,
    canReview: review.allowed,
    canPublish: publish.allowed || release.allowed,
    canRestoreMainDrawing: restore.allowed,
    canSubmit: submit.allowed
  };
}


/** Viewer labels use published Principal grants in the resource read snapshot. */
export async function resolvePrincipalHumanStatusRoleCapabilitiesInSnapshot(
  snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest
): Promise<HumanStatusRoleCapabilities> {
  const codes = ["numbering.draft.update", "numbering.link_variant", "numbering.approval.batch.decide",
    "numbering.publish", "release", "main_drawing_restore", "numbering.candidate.review.submit"] as const;
  const decisions = await evaluatePrincipalWorkspacePermissionsInSnapshot(snapshot, verified,
    codes.map(permissionCode => ({ permissionKind: "action" as const, permissionCode })));
  if (decisions.length !== codes.length || decisions.some((decision, index) =>
    !decision || decision.principalId !== verified.session.principalId || decision.permissionCode !== codes[index])) {
    throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  }
  return { canEdit: decisions[0].allowed, canManageRelations: decisions[1].allowed,
    canReview: decisions[2].allowed, canPublish: decisions[3].allowed || decisions[4].allowed,
    canRestoreMainDrawing: decisions[5].allowed, canSubmit: decisions[6].allowed };
}
