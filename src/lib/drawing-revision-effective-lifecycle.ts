export type EffectiveDrawingRevisionLifecycleState =
  | "preparing"
  | "in_review"
  | "correction_required"
  | "rd_controlled"
  | "released"
  | "superseded"
  | "cancelled";

export const LEGACY_DRAWING_REVIEW_TERMINAL_ACTIONS = [
  "confirm_original_part_reuse",
  "approve_replacement_part_and_drawing_release"
] as const;

export function isMinorDrawingRevision(revision: string | null | undefined) {
  return Boolean(revision?.includes("."));
}

/**
 * Compatibility projector for legacy FFF reviews.
 *
 * A completed minor-revision FFF review intentionally keeps the physical
 * package Pending, but its effective lifecycle is R&D controlled. This helper
 * is the single TypeScript authority used by canonical synchronization and
 * workbench readers; it never upgrades a revision to Released.
 */
export function projectEffectiveDrawingRevisionLifecycle(input: {
  revision: string | null | undefined;
  physicalStatus: string | null | undefined;
  lifecycleState: string | null | undefined;
  candidateStatus?: string | null;
  hasActiveApprovalRequest?: boolean;
  hasLegacyTerminalConfirmation?: boolean;
}): EffectiveDrawingRevisionLifecycleState {
  if (input.lifecycleState === "released" || input.physicalStatus === "Released") return "released";
  if (
    input.physicalStatus === "Pending" &&
    isMinorDrawingRevision(input.revision) &&
    input.hasLegacyTerminalConfirmation
  ) return "rd_controlled";
  if (input.lifecycleState === "rd_controlled") return "rd_controlled";
  if (input.lifecycleState === "correction_required" || input.physicalStatus === "Rejected") return "correction_required";
  if (input.candidateStatus === "promoted" && !input.hasActiveApprovalRequest) return "rd_controlled";
  if (
    input.lifecycleState === "in_review" ||
    input.physicalStatus === "Pending" ||
    input.candidateStatus === "review_locked"
  ) return "in_review";
  if (input.lifecycleState === "superseded") return "superseded";
  if (input.physicalStatus === "Cancelled" || input.candidateStatus === "cancelled") return "cancelled";
  if (input.candidateStatus === "promoted") return "rd_controlled";
  return "preparing";
}

/** Controlled canonical evidence is monotonic and cannot be downgraded by an
 * older physical source record during compatibility synchronization. */
export function preserveControlledDrawingRevisionLifecycle(
  current: EffectiveDrawingRevisionLifecycleState,
  projected: EffectiveDrawingRevisionLifecycleState
): EffectiveDrawingRevisionLifecycleState {
  if (current === "superseded") return "superseded";
  if (current === "released") return projected === "superseded" ? "superseded" : "released";
  if (current === "rd_controlled") {
    return projected === "released" || projected === "superseded" ? projected : "rd_controlled";
  }
  return projected;
}
