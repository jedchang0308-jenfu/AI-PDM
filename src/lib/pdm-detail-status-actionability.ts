import { createHumanStatus, projectViewerHumanStatus, type HumanStatusProjection, type ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { ContextActionBarModel, PdmDetailActionDescriptor, PdmDetailStateFamily } from "@/lib/pdm-entity-detail-contract";

const responsibilityKinds = new Set([
  "edit",
  "manage_files",
  "manage_relation",
  "submit_review",
  "retry_apply",
  "retry_cleanup",
  "create_revision",
  "approve",
  "return_for_correction",
  "reject",
  "view_review"
]);

export function normalizePdmDetailStateFamily(value: string | null | undefined): PdmDetailStateFamily {
  if (value === "released") return "released";
  if (value === "rd_controlled" || value === "official_controlled") return "rd_controlled";
  if (value === "in_review" || value === "revision_in_review") return "in_review";
  if (value === "auto_finalizing") return "auto_finalizing";
  if (value === "correction_required") return "correction_required";
  if (value === "recovery_required") return "recovery_required";
  if (["history_only", "cancelled", "obsolete", "merged", "superseded"].includes(value ?? "")) return "history_only";
  if (value === "bundle_ready") return "bundle_ready";
  if (value === "drawing_preparation" || value === "drawing_addendum_required" || value === "preparing") return "drawing_preparation";
  if (value === "terminal") return "terminal";
  return "building";
}

export function projectPdmDetailObjectiveStatus(input: {
  stateFamily: PdmDetailStateFamily;
  entityKind: "candidate" | "drawing" | "part" | "root";
}): HumanStatusProjection {
  const { stateFamily, entityKind } = input;
  if (["history_only", "terminal"].includes(stateFamily)) return createHumanStatus("cancelled", "terminal", "已結束", "neutral", "archive");
  if (stateFamily === "recovery_required") return createHumanStatus("formalization_failed", "action_required", "需要處理", "danger", "alert");
  if (stateFamily === "correction_required") return createHumanStatus("correction_required", "action_required", "需要修正", "warning", "alert");
  if (stateFamily === "in_review") return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
  if (stateFamily === "auto_finalizing") return createHumanStatus("finalizing", "waiting", "系統處理中", "info", "clock");
  if (stateFamily === "bundle_ready") return createHumanStatus("ready_to_submit", "ready", "可送審", "info", "play");
  if (stateFamily === "released") return createHumanStatus("released", "usable", "已發布", "success", "check");
  if (stateFamily === "rd_controlled") {
    return entityKind === "root"
      ? createHumanStatus("relation_complete", "usable", "圖料關係", "success", "check")
      : createHumanStatus("rd_controlled", "usable", "研發受控", "success", "check");
  }
  return createHumanStatus("preparing", "waiting", stateFamily === "drawing_preparation" ? "準備中" : "建立中", "info", "clock");
}

function actions(actionBar: ContextActionBarModel) {
  return [actionBar.primary, ...actionBar.secondary].filter((action): action is PdmDetailActionDescriptor => Boolean(action));
}

function responsibilityActions(actionBar: ContextActionBarModel) {
  return actions(actionBar).filter((action) => responsibilityKinds.has(action.kind));
}

export function projectPdmDetailViewerStatus(input: {
  objectiveStatus: HumanStatusProjection;
  stateFamily: PdmDetailStateFamily;
  actorId: string;
  ownerId: string | null;
  reviewerIds?: string[];
  reviewRequestId?: string | null;
  reviewContext?: boolean;
  actionBar: ContextActionBarModel;
}): ViewerHumanStatusProjection {
  const { objectiveStatus, stateFamily, actionBar } = input;
  if (objectiveStatus.phase === "usable" || objectiveStatus.phase === "terminal" || stateFamily === "auto_finalizing") {
    return projectViewerHumanStatus(objectiveStatus, {
      responsibility: stateFamily === "auto_finalizing" ? "system" : "unknown",
      basis: stateFamily === "auto_finalizing" ? "system" : "objective",
      canAct: false
    });
  }

  if (stateFamily === "in_review") {
    if (!input.reviewRequestId) {
      return projectViewerHumanStatus(objectiveStatus, {
        responsibility: "unknown",
        basis: "unknown",
        canAct: false,
        actorLabel: "找不到有效的審核工作項",
        nextStep: "請聯絡 PDM 管理者確認流程"
      });
    }
    const exactReviewer = Boolean(input.reviewContext || input.reviewerIds?.includes(input.actorId));
    if (exactReviewer) {
      const reviewActions = actions(actionBar).filter((action) => action.group === "review" || action.kind === "view_review");
      return projectViewerHumanStatus(objectiveStatus, {
        responsibility: "current_user",
        basis: "reviewer",
        canAct: reviewActions.some((action) => action.enabled),
        actorLabel: "這筆審核需要你處理",
        nextStep: reviewActions.find((action) => action.enabled)?.label ?? reviewActions[0]?.label ?? "確認審核狀態"
      });
    }
    return projectViewerHumanStatus(objectiveStatus, {
      responsibility: "other_user",
      basis: "reviewer",
      canAct: false,
      actorLabel: "等待指定審核人員處理",
      nextStep: "查看審核進度"
    });
  }

  const applicable = responsibilityActions(actionBar);
  const enabled = applicable.filter((action) => action.enabled);
  const ownerIsCurrent = Boolean(input.ownerId && input.ownerId === input.actorId);
  if (ownerIsCurrent && applicable.length > 0) {
    return projectViewerHumanStatus(objectiveStatus, {
      responsibility: "current_user",
      basis: "assignee",
      canAct: enabled.length > 0,
      actorLabel: enabled.length > 0 ? "這筆工作由你負責" : "這筆工作由你負責，但目前有條件尚未滿足",
      nextStep: enabled[0]?.label ?? applicable[0]?.label ?? null
    });
  }
  if (input.ownerId && input.ownerId !== input.actorId) {
    return projectViewerHumanStatus(objectiveStatus, {
      responsibility: "other_user",
      basis: "assignee",
      canAct: false,
      actorLabel: "等待工作負責人處理",
      nextStep: "查看進度"
    });
  }
  if (enabled.length > 0) {
    return projectViewerHumanStatus(objectiveStatus, {
      responsibility: "current_user",
      basis: "role_capability",
      canAct: true,
      actorLabel: "你的角色可處理這一步",
      nextStep: enabled[0].label
    });
  }
  return projectViewerHumanStatus(objectiveStatus, {
    responsibility: applicable.length > 0 ? "other_user" : "unknown",
    basis: applicable.length > 0 ? "role_capability" : "unknown",
    canAct: false,
    actorLabel: applicable.length > 0 ? "等待具備權限的負責人處理" : "尚未辨識可處理的負責人",
    nextStep: applicable[0]?.label ?? "查看明細"
  });
}

export function pdmDetailActionabilityInvariant(input: {
  viewerStatus: ViewerHumanStatusProjection;
  actionBar: ContextActionBarModel;
}) {
  const applicable = responsibilityActions(input.actionBar);
  const violations: string[] = [];
  if (input.viewerStatus.category === "current_user" && applicable.length === 0) violations.push("current_user_without_responsibility_action");
  if (input.viewerStatus.canAct && !applicable.some((action) => action.enabled)) violations.push("can_act_without_enabled_responsibility_action");
  return violations;
}
