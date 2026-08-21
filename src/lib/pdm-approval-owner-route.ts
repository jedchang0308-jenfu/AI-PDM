import type { ApprovalPlatformInboxItem } from "@/lib/repositories/approval-platform-async-repository";
import type { PdmDetailSurface, PdmEntityKey } from "@/lib/pdm-entity-detail-contract";

const PDM_OWNER_ACTIONS = new Set([
  "numbering.candidate_bundle_review",
  "numbering.candidate_publication_review",
  "numbering.drawing_revision_lifecycle_review",
  "numbering.drawing_revision_impact_review",
  "numbering.same_drawing_variant_after_release",
  "numbering.main_drawing_restore",
  "numbering.obsolete_part_number",
  "numbering.obsolete_ma_drawing",
  "numbering.obsolete_part_root",
  "numbering.release",
  "numbering.release_missing_ma_confirm",
  "drawing_package.supplement_review"
]);

type OwnerTarget = NonNullable<ApprovalPlatformInboxItem["primaryTarget"]>;

export type PdmApprovalOwnerContext = {
  entityKey: PdmEntityKey;
  surface: PdmDetailSurface;
};

function ownerLocation(target: OwnerTarget) {
  const targetType = target.type.toLowerCase();
  if (targetType.includes("workspace")) return { prefix: "candidate", surface: "relation" } as const;
  if (targetType.includes("root")) return { prefix: "root", surface: "relation" } as const;
  if (targetType.includes("drawing")) return { path: "/numbering/drawings", prefix: "drawing", surface: "drawing" } as const;
  if (targetType.includes("part")) return { prefix: "part", surface: "part" } as const;
  return null;
}

export function isPdmOwnerApprovalAction(actionCode: string) {
  return PDM_OWNER_ACTIONS.has(actionCode);
}

export function resolvePdmApprovalOwnerContext(
  item: Pick<ApprovalPlatformInboxItem, "actionCode" | "primaryTarget">
): PdmApprovalOwnerContext | null {
  if (!isPdmOwnerApprovalAction(item.actionCode)) return null;
  const target = item.primaryTarget;
  if (!target?.targetId.trim()) return null;
  const location = ownerLocation(target);
  if (!location) return null;
  return {
    entityKey: `${location.prefix}:${target.targetId}` as PdmEntityKey,
    surface: location.surface
  };
}

export function buildPdmApprovalOwnerHref(
  item: Pick<ApprovalPlatformInboxItem, "actionCode" | "id" | "primaryTarget">,
  returnTo: string
) {
  const context = resolvePdmApprovalOwnerContext(item);
  if (!context) return null;
  const target = item.primaryTarget;
  if (!target) return null;
  const location = ownerLocation(target);
  if (!location) return null;
  return `/approvals/${encodeURIComponent(item.id)}?returnTo=${encodeURIComponent(returnTo)}`;
}
