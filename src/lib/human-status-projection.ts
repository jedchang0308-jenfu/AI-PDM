export const HUMAN_STATUS_PHASES = [
  "action_required",
  "waiting",
  "ready",
  "usable",
  "terminal"
] as const;

export type HumanStatusPhase = (typeof HUMAN_STATUS_PHASES)[number];
export type HumanStatusTone = "danger" | "warning" | "info" | "success" | "neutral";
export type HumanStatusIcon = "alert" | "clock" | "play" | "check" | "archive";
export type HumanStatusFilter = "all" | "needs_action" | "waiting" | "system" | "ready" | "production" | "rd" | "availability_unknown" | "needs_confirmation" | "history";

export const HUMAN_STATUS_FILTER_VALUES: readonly HumanStatusFilter[] = [
  "all",
  "needs_action",
  "waiting",
  "system",
  "ready",
  "production",
  "rd",
  "availability_unknown",
  "needs_confirmation",
  "history"
];

export const HUMAN_STATUS_DISPLAY_LABELS = {
  all: "全部工作狀態",
  needs_action: "待你處理",
  waiting: "等他人處理",
  system: "系統處理中",
  usable: "可使用",
  production: "生產可用",
  rd: "研發可用",
  availability_unknown: "可用範圍待確認",
  needs_confirmation: "負責人待確認",
  history: "歷史"
} as const;

/** Visible filter vocabulary is sourced from the same display labels used by the work-status table. */
export const HUMAN_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: HumanStatusFilter; label: string }> = [
  { value: "all", label: HUMAN_STATUS_DISPLAY_LABELS.all },
  { value: "needs_action", label: HUMAN_STATUS_DISPLAY_LABELS.needs_action },
  { value: "waiting", label: HUMAN_STATUS_DISPLAY_LABELS.waiting },
  { value: "system", label: HUMAN_STATUS_DISPLAY_LABELS.system },
  { value: "production", label: HUMAN_STATUS_DISPLAY_LABELS.production },
  { value: "rd", label: HUMAN_STATUS_DISPLAY_LABELS.rd },
  { value: "availability_unknown", label: HUMAN_STATUS_DISPLAY_LABELS.availability_unknown },
  { value: "needs_confirmation", label: HUMAN_STATUS_DISPLAY_LABELS.needs_confirmation },
  { value: "history", label: HUMAN_STATUS_DISPLAY_LABELS.history }
];

export function isHumanStatusFilter(value: string | null | undefined): value is HumanStatusFilter {
  return Boolean(value && HUMAN_STATUS_FILTER_VALUES.includes(value as HumanStatusFilter));
}

export function normalizeHumanStatusFilter(value: string | null | undefined): HumanStatusFilter {
  const normalized = value?.trim() || "all";
  return isHumanStatusFilter(normalized) ? normalized : "all";
}

export type HumanStatusKey =
  | "cancelled"
  | "obsolete"
  | "merged"
  | "formalization_failed"
  | "release_status_mismatch"
  | "data_conflict"
  | "main_drawing_invalid"
  | "missing_manufacturing_drawing"
  | "missing_part"
  | "correction_required"
  | "data_needs_review"
  | "waiting_review"
  | "finalizing"
  | "preparing"
  | "ready_to_submit"
  | "usable"
  | "rd_controlled"
  | "released"
  | "relation_complete";

export type HumanStatusAction = {
  kind: string;
  label: string;
  enabled: boolean;
  href: string | null;
  disabledReason: string | null;
};

export type HumanStatusProjection = {
  schemaVersion: 1;
  key: HumanStatusKey;
  phase: HumanStatusPhase;
  label: string;
  tone: HumanStatusTone;
  icon: HumanStatusIcon;
  nextAction: HumanStatusAction | null;
};

export type ViewerHumanStatusCategory = "current_user" | "other_user" | "system" | "usable" | "terminal" | "unknown";
export type ViewerHumanStatusBasis = "assignee" | "reviewer" | "role_capability" | "system" | "objective" | "unknown";

/** Viewer-specific presentation. It never replaces the objective lifecycle state. */
export type ViewerHumanStatusProjection = {
  schemaVersion: 1;
  category: ViewerHumanStatusCategory;
  label: string;
  tone: HumanStatusTone;
  icon: HumanStatusIcon;
  basis: ViewerHumanStatusBasis;
  canAct: boolean;
  actorLabel: string;
  nextStep: string | null;
};

export type ViewerHumanStatusContext = {
  responsibility: "current_user" | "other_user" | "system" | "unknown";
  basis: ViewerHumanStatusBasis;
  canAct: boolean;
  actorLabel?: string;
  nextStep?: string | null;
};

export type HumanStatusRoleCapabilities = {
  canEdit: boolean;
  canManageRelations: boolean;
  canReview: boolean;
  canPublish: boolean;
  canRestoreMainDrawing: boolean;
  canSubmit: boolean;
};

/** Compact vocabulary shown in list views. */
export type HumanStatusPrimaryCategory = "action" | "waiting" | "usable" | "terminal";

export type HumanStatusDetail = {
  title: string;
  summary: string;
  actor: string;
  autoCompletes: boolean;
  nextStep: string | null;
};

export function humanStatusPrimaryCategory(phase: HumanStatusPhase): HumanStatusPrimaryCategory {
  if (phase === "action_required" || phase === "ready") return "action";
  if (phase === "waiting") return "waiting";
  if (phase === "usable") return "usable";
  return "terminal";
}

export function humanStatusPrimaryLabel(status: Pick<HumanStatusProjection, "phase">, viewerStatus?: ViewerHumanStatusProjection | null): string {
  if (viewerStatus) return viewerStatus.label;
  const labels: Record<HumanStatusPrimaryCategory, string> = {
    action: HUMAN_STATUS_DISPLAY_LABELS.needs_action,
    waiting: HUMAN_STATUS_DISPLAY_LABELS.waiting,
    usable: HUMAN_STATUS_DISPLAY_LABELS.usable,
    terminal: HUMAN_STATUS_DISPLAY_LABELS.history
  };
  return labels[humanStatusPrimaryCategory(status.phase)];
}

export function humanStatusDisplayLabel(
  status: Pick<HumanStatusProjection, "phase">,
  viewerStatus?: ViewerHumanStatusProjection | null,
  availabilityLabel?: string | null
) {
  if (status.phase === "usable") return availabilityLabel ?? HUMAN_STATUS_DISPLAY_LABELS.availability_unknown;
  if (viewerStatus?.category === "usable" && availabilityLabel) return availabilityLabel;
  if (viewerStatus?.category === "terminal") return HUMAN_STATUS_DISPLAY_LABELS.history;
  if (viewerStatus?.category === "unknown") return HUMAN_STATUS_DISPLAY_LABELS.needs_confirmation;
  return humanStatusPrimaryLabel(status, viewerStatus);
}

function humanStatusDetailSummary(status: HumanStatusProjection): string {
  switch (status.key) {
    case "missing_manufacturing_drawing": return "尚未建立必要的製造圖關聯。";
    case "main_drawing_invalid": return "目前主要圖面無法使用。";
    case "missing_part": return "尚未建立必要料號。";
    case "correction_required": return "資料需要修正後才能繼續。";
    case "formalization_failed": return "正式化沒有完成，需要重新處理。";
    case "release_status_mismatch": return "發布資料與主資料不一致。";
    case "data_conflict": return "資料之間有衝突，需要確認。";
    case "ready_to_submit": return "內容已備妥，下一步可以送審。";
    case "preparing": return "首版資料尚未完成。";
    case "waiting_review": return "資料已送出，等待審核結果。";
    case "finalizing": return "系統正在建立正式資料與關聯。";
    case "cancelled":
    case "obsolete":
    case "merged": return "這筆資料已結束，僅供查閱。";
    case "usable":
    case "rd_controlled":
    case "released":
    case "relation_complete": return "目前可以使用。";
    default: return "這筆資料需要處理後才能繼續。";
  }
}

export function humanStatusDetail(status: HumanStatusProjection, viewerStatus?: ViewerHumanStatusProjection | null): HumanStatusDetail {
  const category = humanStatusPrimaryCategory(status.phase);
  const isFinalizing = status.key === "finalizing";
  const title = status.key === "preparing" ? "首版尚未完成" : status.label;

  if (viewerStatus) {
    return {
      title: isFinalizing ? "系統正在正式化" : title,
      summary: humanStatusDetailSummary(status),
      actor: viewerStatus.actorLabel,
      autoCompletes: viewerStatus.category === "system",
      nextStep: viewerStatus.nextStep
    };
  }

  if (category === "action") {
    return {
      title,
      summary: humanStatusDetailSummary(status),
      actor: status.nextAction?.enabled ? "需要你處理" : "需要負責人處理",
      autoCompletes: false,
      nextStep: status.nextAction?.label ?? "開啟明細確認"
    };
  }

  if (category === "waiting") {
    return {
      title: isFinalizing ? "系統正在正式化" : title,
      summary: humanStatusDetailSummary(status),
      actor: isFinalizing ? "系統處理中" : status.key === "waiting_review" ? "等待審核人員" : status.key === "preparing" ? "需要負責人補齊" : "目前不用操作",
      autoCompletes: isFinalizing,
      nextStep: isFinalizing ? null : status.nextAction?.label ?? (status.key === "waiting_review" ? "查看審核進度" : "開啟明細")
    };
  }

  return {
    title,
    summary: humanStatusDetailSummary(status),
    actor: "目前不用處理",
    autoCompletes: false,
    nextStep: status.nextAction?.label ?? (category === "terminal" ? "查看紀錄" : null)
  };
}

export function phaseMatchesFilter(phase: HumanStatusPhase, filter: HumanStatusFilter) {
  if (filter === "all") return true;
  if (filter === "needs_action") return phase === "action_required";
  if (filter === "history") return phase === "terminal";
  if (["production", "rd", "availability_unknown", "needs_confirmation"].includes(filter)) return false;
  return phase === filter;
}

export function viewerStatusMatchesFilter(
  viewerStatus: ViewerHumanStatusProjection,
  objectiveStatus: Pick<HumanStatusProjection, "phase">,
  filter: HumanStatusFilter,
  availabilityScope?: { scope: "none" | "rd" | "production" | "unknown" } | null
) {
  if (filter === "all") return true;
  if (filter === "needs_action") return viewerStatus.category === "current_user";
  if (filter === "waiting") return viewerStatus.category === "other_user";
  if (filter === "system") return viewerStatus.category === "system";
  if (filter === "production") return viewerStatus.category === "usable" && availabilityScope?.scope === "production";
  if (filter === "rd") return viewerStatus.category === "usable" && availabilityScope?.scope === "rd";
  if (filter === "availability_unknown") return viewerStatus.category === "usable" && (!availabilityScope || availabilityScope.scope === "unknown" || availabilityScope.scope === "none");
  if (filter === "needs_confirmation") return viewerStatus.category === "unknown";
  if (filter === "history") return viewerStatus.category === "terminal";
  // Backward-compatible URL support for the former `ready` filter.
  return viewerStatus.category === "current_user" && objectiveStatus.phase === "ready";
}

export function projectViewerHumanStatus(
  status: HumanStatusProjection,
  context: ViewerHumanStatusContext
): ViewerHumanStatusProjection {
  if (status.phase === "usable") {
    return { schemaVersion: 1, category: "usable", label: "可使用", tone: "success", icon: "check", basis: "objective", canAct: false, actorLabel: "目前可直接使用", nextStep: null };
  }
  if (status.phase === "terminal") {
    return { schemaVersion: 1, category: "terminal", label: "已結束", tone: "neutral", icon: "archive", basis: "objective", canAct: false, actorLabel: "目前不用處理", nextStep: status.nextAction?.label ?? "查看紀錄" };
  }
  if (status.key === "finalizing" || context.responsibility === "system") {
    return { schemaVersion: 1, category: "system", label: "系統處理中", tone: "info", icon: "clock", basis: "system", canAct: false, actorLabel: context.actorLabel ?? "系統正在處理", nextStep: context.nextStep ?? null };
  }
  if (context.responsibility === "current_user") {
    return {
      schemaVersion: 1,
      category: "current_user",
      label: "待你處理",
      tone: status.tone,
      icon: status.icon === "clock" ? "play" : status.icon,
      basis: context.basis,
      canAct: context.canAct,
      actorLabel: context.actorLabel ?? (context.canAct ? "需要你處理" : "需要你處理，但目前缺少操作權限"),
      nextStep: context.nextStep ?? status.nextAction?.label ?? "開啟明細處理"
    };
  }
  if (context.responsibility === "other_user") {
    return {
      schemaVersion: 1,
      category: "other_user",
      label: "等他人處理",
      tone: status.tone === "danger" ? "warning" : "info",
      icon: "clock",
      basis: context.basis,
      canAct: false,
      actorLabel: context.actorLabel ?? "等待負責人處理",
      nextStep: context.nextStep ?? "查看進度"
    };
  }
  return {
    schemaVersion: 1,
    category: "unknown",
    label: HUMAN_STATUS_DISPLAY_LABELS.needs_confirmation,
    tone: "warning",
    icon: "alert",
    basis: "unknown",
    canAct: false,
    actorLabel: context.actorLabel ?? "尚未辨識負責人",
    nextStep: context.nextStep ?? "查看明細"
  };
}

/** Role-queue fallback for records that do not store an individual assignee. */
export function projectRoleViewerHumanStatus(status: HumanStatusProjection, capabilities: HumanStatusRoleCapabilities) {
  let allowed = capabilities.canEdit;
  let nextStep = "開啟明細處理";
  if (status.key === "waiting_review") {
    allowed = capabilities.canReview;
    nextStep = allowed ? "前往審核" : "查看審核進度";
  } else if (["missing_manufacturing_drawing", "missing_part", "data_conflict"].includes(status.key)) {
    allowed = capabilities.canManageRelations;
    nextStep = allowed ? "維護圖料關係" : "查看關聯缺口";
  } else if (status.key === "main_drawing_invalid") {
    allowed = capabilities.canRestoreMainDrawing;
    nextStep = allowed ? "處理主圖恢復" : "查看處理進度";
  } else if (["formalization_failed", "release_status_mismatch"].includes(status.key)) {
    allowed = capabilities.canPublish;
    nextStep = allowed ? "處理發布異常" : "查看處理進度";
  } else if (status.key === "ready_to_submit") {
    allowed = capabilities.canSubmit;
    nextStep = allowed ? "送交審核" : "查看準備內容";
  }
  return projectViewerHumanStatus(status, {
    responsibility: allowed ? "current_user" : "other_user",
    basis: "role_capability",
    canAct: allowed,
    actorLabel: allowed ? "你的角色可處理這一步" : "等待具備權限的負責人處理",
    nextStep
  });
}

export function humanStatusActionFrom(action: {
  kind: string;
  label: string;
  enabled: boolean;
  href?: string | null;
  disabledReason?: string | null;
} | null | undefined): HumanStatusAction | null {
  if (!action) return null;
  return {
    kind: action.kind,
    label: action.label,
    enabled: action.enabled,
    href: action.href ?? null,
    disabledReason: action.disabledReason ?? null
  };
}

export function createHumanStatus(
  key: HumanStatusKey,
  phase: HumanStatusPhase,
  label: string,
  tone: HumanStatusTone,
  icon: HumanStatusIcon,
  nextAction: HumanStatusAction | null = null
): HumanStatusProjection {
  return { schemaVersion: 1, key, phase, label, tone, icon, nextAction };
}
