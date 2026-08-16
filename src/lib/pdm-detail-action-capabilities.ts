import { canUserUseNumberingActionAsync } from "@/lib/numbering-permission-guard";
import type { NumberingUserScope } from "@/lib/db";

export type PdmDetailCapability = {
  allowed: boolean;
  permissionCode: string;
  contactRole: string;
};

export type PdmDetailActionCapabilities = {
  workspaceEdit: PdmDetailCapability;
  workspaceCancel: PdmDetailCapability;
  draftEdit: PdmDetailCapability;
  submitReview: PdmDetailCapability;
  withdrawReview: PdmDetailCapability;
  retryPublication: PdmDetailCapability;
  createRevision: PdmDetailCapability;
  manageFiles: PdmDetailCapability;
  manageRelation: PdmDetailCapability;
  managePermissions: PdmDetailCapability;
};

const capabilityDefinitions = {
  workspaceEdit: ["numbering.workspace.update", "工作負責人或研發主管"],
  workspaceCancel: ["numbering.workspace.cancel", "工作負責人或研發主管"],
  draftEdit: ["numbering.draft.update", "研發主管或 PDM Admin"],
  submitReview: ["numbering.candidate.review.submit", "研發主管或 PDM Admin"],
  withdrawReview: ["numbering.candidate.review.withdraw", "送審者、研發主管或 PDM Admin"],
  retryPublication: ["numbering.publish", "發行人員或 PDM Admin"],
  createRevision: ["post_release_change", "研發主管或 PDM Admin"],
  manageFiles: ["numbering.attachments.manage", "研發主管或 PDM Admin"],
  manageRelation: ["numbering.link_variant", "研發主管或 PDM Admin"],
  managePermissions: ["settings.admin_matrix", "PDM Admin"]
} as const;

export const EMPTY_PDM_DETAIL_ACTION_CAPABILITIES: PdmDetailActionCapabilities = Object.fromEntries(
  Object.entries(capabilityDefinitions).map(([key, [permissionCode, contactRole]]) => [
    key,
    { allowed: false, permissionCode, contactRole }
  ])
) as PdmDetailActionCapabilities;

export async function resolvePdmDetailActionCapabilities(user: NumberingUserScope): Promise<PdmDetailActionCapabilities> {
  const entries = await Promise.all(
    Object.entries(capabilityDefinitions).map(async ([key, [permissionCode, contactRole]]) => {
      const result = await canUserUseNumberingActionAsync(user, permissionCode);
      return [key, { allowed: result.allowed, permissionCode, contactRole }] as const;
    })
  );
  return Object.fromEntries(entries) as PdmDetailActionCapabilities;
}
