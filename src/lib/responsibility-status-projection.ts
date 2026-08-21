import {
  HUMAN_STATUS_DISPLAY_LABELS,
  projectViewerHumanStatus,
  type HumanStatusAction,
  type HumanStatusFilter,
  type HumanStatusIcon,
  type HumanStatusProjection,
  type HumanStatusRoleCapabilities,
  type HumanStatusTone,
  type ViewerHumanStatusProjection
} from "@/lib/human-status-projection";
import { workStatusMatchesFilter, type WorkStatusFilter } from "@/lib/work-status-presentation";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";

export type ResponsibilityStatusCategory = "owner" | "review_owner" | "system" | "system_admin" | "usable" | "terminal" | "unknown";
export type ResponsibilityStatusBasis = "assignee" | "active_review" | "automatic_finalization" | "recovery_action" | "objective" | "unknown";
export type ResponsibilityStatusActorRole = "owner" | "review_owner" | "system" | "system_admin" | null;

export type ResponsibilityStatusProjection = {
  schemaVersion: 1;
  category: ResponsibilityStatusCategory;
  label: string;
  tone: HumanStatusTone;
  icon: HumanStatusIcon;
  basis: ResponsibilityStatusBasis;
  actorRole: ResponsibilityStatusActorRole;
  actorLabel: string;
  autoCompletes: boolean;
  nextStep: string | null;
};

export type ViewerActionabilityBasis = "assignee" | "reviewer" | "role_capability" | "permission" | "none";

export type ViewerActionabilityProjection = {
  schemaVersion: 1;
  isMine: boolean;
  canAct: boolean;
  basis: ViewerActionabilityBasis;
  disabledReason: string | null;
};

export type ResponsibilityActionEvidence = {
  kind: string;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  href?: string | null;
};

export type ResponsibilityStatusInput = {
  status: HumanStatusProjection;
  hasActiveReviewWorkItem?: boolean;
  hasOwnerResponsibilityAction?: boolean;
  hasSystemAdminRecoveryAction?: boolean;
  systemFinalizing?: boolean;
  nextStep?: string | null;
  responsibilityActions?: readonly ResponsibilityActionEvidence[];
};

export type ViewerActionabilityInput = {
  responsibilityStatus: ResponsibilityStatusProjection;
  actorId: string;
  ownerId?: string | null;
  reviewerIds?: readonly string[];
  ownerQueueEligible?: boolean;
  reviewQueueEligible?: boolean;
  systemAdminQueueEligible?: boolean;
  responsibilityActions?: readonly ResponsibilityActionEvidence[];
};

function actionNextStep(actions: readonly ResponsibilityActionEvidence[] | undefined, fallback: string | null) {
  return actions?.find((action) => action.enabled)?.label ?? actions?.[0]?.label ?? fallback;
}

function firstDisabledReason(actions: readonly ResponsibilityActionEvidence[] | undefined) {
  return actions?.find((action) => action.disabledReason)?.disabledReason ?? null;
}

function hasOwnerEvidence(input: ResponsibilityStatusInput) {
  return input.hasOwnerResponsibilityAction === true;
}

export function projectResponsibilityStatus(input: ResponsibilityStatusInput): ResponsibilityStatusProjection {
  const { status } = input;
  const nextStep = input.nextStep ?? actionNextStep(input.responsibilityActions, status.nextAction?.label ?? null);
  if (status.phase === "terminal") {
    return { schemaVersion: 1, category: "terminal", label: "已結束", tone: "neutral", icon: "archive", basis: "objective", actorRole: null, actorLabel: "目前不用處理", autoCompletes: false, nextStep };
  }
  if (status.phase === "usable") {
    return { schemaVersion: 1, category: "usable", label: "可使用", tone: "success", icon: "check", basis: "objective", actorRole: null, actorLabel: "目前可直接使用", autoCompletes: false, nextStep: null };
  }
  const hasVerifiedRecovery = input.hasSystemAdminRecoveryAction === true
    && ["formalization_failed", "release_status_mismatch"].includes(status.key)
    && Boolean(nextStep?.trim());
  if (hasVerifiedRecovery) {
    return { schemaVersion: 1, category: "system_admin", label: "待系統管理員處理", tone: "danger", icon: "alert", basis: "recovery_action", actorRole: "system_admin", actorLabel: "系統管理員", autoCompletes: false, nextStep };
  }
  if (status.key === "finalizing") {
    return { schemaVersion: 1, category: "system", label: "系統處理中", tone: "info", icon: "clock", basis: "automatic_finalization", actorRole: "system", actorLabel: "系統", autoCompletes: true, nextStep: null };
  }
  if (input.hasActiveReviewWorkItem === true) {
    return { schemaVersion: 1, category: "review_owner", label: "待審核負責人處理", tone: status.tone === "danger" ? "warning" : "info", icon: "clock", basis: "active_review", actorRole: "review_owner", actorLabel: "審核負責人", autoCompletes: false, nextStep };
  }
  if (hasOwnerEvidence(input)) {
    return { schemaVersion: 1, category: "owner", label: "待負責人處理", tone: status.tone, icon: status.icon === "clock" ? "play" : status.icon, basis: "assignee", actorRole: "owner", actorLabel: "負責人", autoCompletes: false, nextStep };
  }
  return { schemaVersion: 1, category: "unknown", label: HUMAN_STATUS_DISPLAY_LABELS.needs_confirmation, tone: "warning", icon: "alert", basis: "unknown", actorRole: null, actorLabel: "負責人待確認", autoCompletes: false, nextStep: nextStep ?? "查看明細" };
}

export function projectViewerActionability(input: ViewerActionabilityInput): ViewerActionabilityProjection {
  const { responsibilityStatus } = input;
  if (!["owner", "review_owner", "system_admin"].includes(responsibilityStatus.category)) {
    return { schemaVersion: 1, isMine: false, canAct: false, basis: "none", disabledReason: null };
  }

  let isMine = false;
  let basis: ViewerActionabilityBasis = "none";
  if (responsibilityStatus.category === "owner") {
    const assignedToActor = Boolean(input.ownerId && input.ownerId === input.actorId);
    isMine = assignedToActor || input.ownerQueueEligible === true;
    basis = assignedToActor ? "assignee" : isMine ? "role_capability" : input.ownerId ? "assignee" : "role_capability";
  } else if (responsibilityStatus.category === "review_owner") {
    isMine = input.reviewerIds ? input.reviewerIds.includes(input.actorId) : input.reviewQueueEligible === true;
    basis = input.reviewerIds ? "reviewer" : "role_capability";
  } else {
    isMine = input.systemAdminQueueEligible === true;
    basis = "permission";
  }

  const actions = input.responsibilityActions ?? [];
  const canAct = isMine && actions.some((action) => action.enabled);
  return {
    schemaVersion: 1,
    isMine,
    canAct,
    basis,
    disabledReason: isMine && !canAct ? firstDisabledReason(actions) ?? "目前條件尚未滿足，請查看明細。" : null
  };
}

export function projectLegacyViewerStatus(
  status: HumanStatusProjection,
  responsibilityStatus: ResponsibilityStatusProjection,
  actionability: ViewerActionabilityProjection,
  actions?: readonly ResponsibilityActionEvidence[]
): ViewerHumanStatusProjection {
  if (responsibilityStatus.category === "system") return projectViewerHumanStatus(status, { responsibility: "system", basis: "system", canAct: false, actorLabel: "系統正在處理", nextStep: null });
  if (responsibilityStatus.category === "usable") return projectViewerHumanStatus(status, { responsibility: "unknown", basis: "objective", canAct: false });
  if (responsibilityStatus.category === "terminal") return projectViewerHumanStatus(status, { responsibility: "unknown", basis: "objective", canAct: false });
  if (responsibilityStatus.category === "unknown") return projectViewerHumanStatus(status, { responsibility: "unknown", basis: "unknown", canAct: false, actorLabel: responsibilityStatus.actorLabel, nextStep: responsibilityStatus.nextStep });
  const basis = actionability.basis === "reviewer" ? "reviewer" : actionability.basis === "permission" ? "role_capability" : actionability.basis === "assignee" ? "assignee" : "role_capability";
  const responsibility = actionability.isMine ? "current_user" : "other_user";
  const actorLabel = responsibilityStatus.category === "review_owner"
    ? actionability.isMine ? "這筆審核需要你處理" : "等待審核負責人處理"
    : responsibilityStatus.category === "system_admin"
      ? actionability.isMine ? "這筆異常需要你處理" : "等待系統管理員處理"
      : actionability.isMine ? "這筆工作由你負責" : "等待負責人處理";
  return projectViewerHumanStatus(status, {
    responsibility,
    basis,
    canAct: actionability.canAct,
    actorLabel,
    nextStep: actionNextStep(actions, responsibilityStatus.nextStep)
  });
}

export function projectResponsibilityStatusPair(input: ResponsibilityStatusInput & Omit<ViewerActionabilityInput, "responsibilityStatus">) {
  const responsibilityStatus = projectResponsibilityStatus(input);
  const viewerActionability = projectViewerActionability({ ...input, responsibilityStatus });
  const viewerStatus = projectLegacyViewerStatus(input.status, responsibilityStatus, viewerActionability, input.responsibilityActions);
  return { responsibilityStatus, viewerActionability, viewerStatus };
}

export function responsibilityStatusDisplayLabel(
  responsibilityStatus: ResponsibilityStatusProjection | null | undefined,
  availabilityLabel?: string | null
) {
  if (!responsibilityStatus) return HUMAN_STATUS_DISPLAY_LABELS.needs_confirmation;
  if (responsibilityStatus.category === "usable") return availabilityLabel ?? HUMAN_STATUS_DISPLAY_LABELS.availability_unknown;
  return responsibilityStatus.label;
}

function isManualResponsibility(category: ResponsibilityStatusCategory) {
  return category === "owner" || category === "review_owner" || category === "system_admin";
}

export function responsibilityStatusMatchesFilter(
  responsibilityStatus: ResponsibilityStatusProjection,
  actionability: ViewerActionabilityProjection,
  objectiveStatus: Pick<HumanStatusProjection, "phase">,
  filter: HumanStatusFilter | WorkStatusFilter,
  availabilityScope?: { scope: "none" | "rd" | "production" | "unknown" } | null
) {
  if (["editing", "reviewing", "needs_confirmation", "rd_available", "production_available"].includes(filter) || filter === "all") {
    return workStatusMatchesFilter(responsibilityStatus, objectiveStatus, filter as WorkStatusFilter, availabilityScope);
  }
  if (filter === "owner" || filter === "review_owner" || filter === "system" || filter === "system_admin") return responsibilityStatus.category === filter;
  if (filter === "needs_action") return isManualResponsibility(responsibilityStatus.category) && actionability.isMine;
  if (filter === "waiting") return isManualResponsibility(responsibilityStatus.category) && !actionability.isMine;
  if (filter === "production") return responsibilityStatus.category === "usable" && availabilityScope?.scope === "production";
  if (filter === "rd") return responsibilityStatus.category === "usable" && availabilityScope?.scope === "rd";
  if (filter === "availability_unknown") return responsibilityStatus.category === "usable" && (!availabilityScope || availabilityScope.scope === "unknown" || availabilityScope.scope === "none");
  if (filter === "needs_confirmation") return responsibilityStatus.category === "unknown";
  if (filter === "history") return responsibilityStatus.category === "terminal";
  return actionability.isMine && objectiveStatus.phase === "ready";
}

export function responsibilityStatusMatchesSelection(
  responsibilityStatus: ResponsibilityStatusProjection,
  actionability: ViewerActionabilityProjection,
  objectiveStatus: Pick<HumanStatusProjection, "phase">,
  selection: PdmWorkbenchFilterSelection<WorkStatusFilter>,
  availabilityScope?: { scope: "none" | "rd" | "production" | "unknown" } | null
) {
  if (selection.mode === "all") return true;
  if (selection.mode === "none") return false;
  return selection.values.some((filter) => responsibilityStatusMatchesFilter(responsibilityStatus, actionability, objectiveStatus, filter, availabilityScope));
}

export function actionEvidenceFrom(action: {
  kind: string;
  label: string;
  enabled: boolean;
  disabledReason?: string | null;
  href?: string | null;
} | null | undefined): ResponsibilityActionEvidence | null {
  if (!action) return null;
  return { kind: action.kind, label: action.label, enabled: action.enabled, disabledReason: action.disabledReason ?? null, href: action.href ?? null };
}

export function humanStatusActionEvidence(action: HumanStatusAction | null | undefined): ResponsibilityActionEvidence | null {
  if (!action) return null;
  return { kind: action.kind, label: action.label, enabled: action.enabled, disabledReason: action.disabledReason, href: action.href };
}

/**
 * Projects records without an individual assignee through the product's
 * stable role vocabulary. The capability matrix remains the source of
 * viewer actionability; it does not change the responsibility label.
 */
export function projectRoleResponsibilityStatusPair(input: {
  status: HumanStatusProjection;
  actorId: string;
  capabilities: HumanStatusRoleCapabilities;
  href?: string | null;
  systemAdminRecovery?: boolean;
}) {
  const href = input.href ?? null;
  const capabilities = input.capabilities;
  const recoveryStatusWithoutEvidence = ["formalization_failed", "release_status_mismatch"].includes(input.status.key) && input.systemAdminRecovery !== true;
  const action: ResponsibilityActionEvidence | null = input.status.phase === "terminal" || input.status.phase === "usable" || recoveryStatusWithoutEvidence
    ? null
    : input.status.key === "waiting_review"
      ? { kind: "review", label: capabilities.canReview ? "前往審核" : "查看審核進度", enabled: capabilities.canReview, disabledReason: capabilities.canReview ? null : "目前不是審核負責人。", href }
      : input.systemAdminRecovery
        ? { kind: "recover_publication", label: "處理發布異常", enabled: capabilities.canPublish, disabledReason: capabilities.canPublish ? null : "目前不是系統管理員。", href }
        : ["missing_manufacturing_drawing", "missing_part", "data_conflict"].includes(input.status.key)
          ? { kind: "manage_relation", label: "維護圖料關係", enabled: capabilities.canManageRelations, disabledReason: capabilities.canManageRelations ? null : "目前不是圖料關係負責人。", href }
          : input.status.key === "main_drawing_invalid"
            ? { kind: "restore_main_drawing", label: "處理主圖恢復", enabled: capabilities.canRestoreMainDrawing, disabledReason: capabilities.canRestoreMainDrawing ? null : "目前不是主圖維護負責人。", href }
            : input.status.key === "ready_to_submit"
              ? { kind: "submit_review", label: "送交審核", enabled: capabilities.canSubmit, disabledReason: capabilities.canSubmit ? null : "目前不是送審負責人。", href }
              : { kind: "edit", label: "開啟明細處理", enabled: capabilities.canEdit, disabledReason: capabilities.canEdit ? null : "目前不是負責人。", href };
  const reviewOwner = input.status.key === "waiting_review";
  const systemAdmin = input.systemAdminRecovery === true;
  const responsibilityActions = action ? [action] : [];
  return projectResponsibilityStatusPair({
    status: input.status,
    actorId: input.actorId,
    hasActiveReviewWorkItem: reviewOwner,
    hasOwnerResponsibilityAction: !reviewOwner && !systemAdmin && !recoveryStatusWithoutEvidence && input.status.phase !== "terminal" && input.status.phase !== "usable",
    hasSystemAdminRecoveryAction: systemAdmin,
    ownerQueueEligible: !reviewOwner && !systemAdmin && Boolean(action?.enabled),
    reviewQueueEligible: reviewOwner && capabilities.canReview,
    systemAdminQueueEligible: systemAdmin && capabilities.canPublish,
    responsibilityActions
  });
}
