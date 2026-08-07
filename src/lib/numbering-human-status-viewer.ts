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
