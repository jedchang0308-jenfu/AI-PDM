import "server-only";

import { canUserUseNumberingActionAsync } from "@/lib/numbering-permission-guard";
import { hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";
import type { NumberingUserScope } from "@/lib/db";

export type DrawingRecognitionPartWorkAccess = {
  canCreate: boolean;
  canUpdate: boolean;
  canEditNonOwned: boolean;
};

export async function resolveDrawingRecognitionPartWorkAccess(user: NumberingUserScope): Promise<DrawingRecognitionPartWorkAccess> {
  const [create, update] = await Promise.all([
    canUserUseNumberingActionAsync(user, "numbering.workspace.create"),
    canUserUseNumberingActionAsync(user, "numbering.workspace.update")
  ]);
  return {
    canCreate: create.allowed,
    canUpdate: update.allowed,
    canEditNonOwned: hasPdmNonOwnerEditScope({ role: user.role })
  };
}
