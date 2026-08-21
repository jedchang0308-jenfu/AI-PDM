import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import { humanStatusDetail, type HumanStatusProjection } from "@/lib/human-status-projection";
import type { ResponsibilityStatusProjection } from "@/lib/responsibility-status-projection";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { parsePdmWorkbenchFilterSelection, PdmWorkbenchFilterSelectionError, PDM_WORKBENCH_FILTER_NONE_TOKEN } from "@/lib/pdm-workbench-filter-selection";

export type WorkStatusFilter =
  | "all"
  | "editing"
  | "reviewing"
  | "needs_confirmation"
  | "rd_available"
  | "production_available";

export type WorkStatusRowFilter = Exclude<WorkStatusFilter, "all">;

export const WORK_STATUS_FILTER_VALUES: readonly WorkStatusFilter[] = [
  "all",
  "editing",
  "reviewing",
  "needs_confirmation",
  "rd_available",
  "production_available"
];

export const WORK_STATUS_LABELS: Record<WorkStatusFilter, string> = {
  all: "全部",
  editing: "編輯中",
  reviewing: "審核中",
  needs_confirmation: "待確認",
  rd_available: "研發版可使用",
  production_available: "量產版可使用"
};

export const WORK_STATUS_FILTER_OPTIONS: ReadonlyArray<{ value: WorkStatusFilter; label: string }> = WORK_STATUS_FILTER_VALUES.map((value) => ({
  value,
  label: WORK_STATUS_LABELS[value]
}));

export const WORK_STATUS_MULTI_SELECT_VALUES: readonly WorkStatusRowFilter[] = WORK_STATUS_FILTER_VALUES.filter((value): value is WorkStatusRowFilter => value !== "all");
export const WORK_STATUS_MULTI_SELECT_OPTIONS = WORK_STATUS_MULTI_SELECT_VALUES.map((value) => ({ value, label: WORK_STATUS_LABELS[value] }));

export type WorkStatusPresentation =
  | {
      kind: "work_status";
      filterValue: WorkStatusRowFilter;
      label: "編輯中" | "審核中" | "待確認" | "研發版可使用" | "量產版可使用";
      description: string;
      tone: "info" | "warning" | "success";
      icon: "play" | "clock" | "alert" | "check";
      reason: "owner" | "review_owner" | "automatic_finalization" | "system_admin_recovery" | "responsibility_unknown" | "availability_unknown" | "rd_available" | "production_available";
    }
  | {
      kind: "terminal_result";
      filterValue: null;
      label: string;
      description: string;
      tone: "neutral";
      icon: "archive";
      reason: "terminal";
    };

export type NormalizedWorkStatusQuery = {
  filter: WorkStatusFilter;
  includeHistory: boolean;
  view: string;
  rewriteRequired: boolean;
};

function isCanonicalWorkStatusFilter(value: string | null | undefined): value is WorkStatusFilter {
  return Boolean(value && WORK_STATUS_FILTER_VALUES.includes(value as WorkStatusFilter));
}

export function normalizeWorkStatusQuery(
  rawFilter: string | null | undefined,
  rawHistory: string | null | undefined,
  rawView: string | null | undefined,
  options: { supportsMineView?: boolean } = {}
): NormalizedWorkStatusQuery {
  const raw = rawFilter?.trim() ?? "";
  const history = rawHistory?.trim() ?? "";
  const originalView = rawView?.trim() || "all";
  const supportsMineView = options.supportsMineView === true;
  let filter: WorkStatusFilter = isCanonicalWorkStatusFilter(raw) ? raw : "all";
  let view = ["all", "mine", "work"].includes(originalView) ? originalView : "all";
  let includeHistory = history === "include";

  if (raw === "history") {
    filter = "all";
    includeHistory = true;
  } else if (["owner", "review_owner", "system", "system_admin", "availability_unknown", "needs_confirmation", "rd", "production"].includes(raw)) {
    filter = raw === "owner"
      ? "editing"
      : ["review_owner", "system"].includes(raw)
        ? "reviewing"
        : ["system_admin", "availability_unknown", "needs_confirmation"].includes(raw)
          ? "needs_confirmation"
          : raw === "rd" ? "rd_available" : "production_available";
  } else if (["needs_action", "waiting", "ready"].includes(raw)) {
    filter = "all";
    if (raw === "needs_action" && supportsMineView) view = "mine";
  } else if (!isCanonicalWorkStatusFilter(raw)) {
    filter = "all";
  }

  return {
    filter,
    includeHistory,
    view,
    rewriteRequired: !isCanonicalWorkStatusFilter(raw) || view !== originalView || (includeHistory && history !== "include")
  };
}

export function normalizeWorkStatusFilter(value: string | null | undefined): WorkStatusFilter {
  return normalizeWorkStatusQuery(value, null, null).filter;
}

export function parseWorkStatusSelection(
  params: URLSearchParams,
  options: { history?: string | null | undefined; view?: string | null | undefined; supportsMineView?: boolean; strict?: boolean } = {}
): { selection: PdmWorkbenchFilterSelection<WorkStatusFilter>; includeHistory: boolean; view: string; rewriteRequired: boolean } {
  const rawValues = params.getAll("humanStatus").map((value) => value.trim());
  const rawHistory = options.history?.trim() ?? "";
  if (rawHistory && rawHistory !== "include" && rawHistory !== "exclude") {
    throw new PdmWorkbenchFilterSelectionError("請重新選擇有效的歷史資料範圍。");
  }
  if (rawValues.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN)) {
    return {
      selection: parsePdmWorkbenchFilterSelection(params, "humanStatus", { allowedValues: WORK_STATUS_MULTI_SELECT_VALUES }),
      includeHistory: rawHistory === "include",
      view: ["all", "mine", "work"].includes(options.view?.trim() ?? "") ? options.view!.trim() : "all",
      rewriteRequired: true
    };
  }
  if (rawValues.length <= 1) {
    const raw = rawValues[0] ?? "";
    const legacy = normalizeWorkStatusQuery(raw, rawHistory, options.view, { supportsMineView: options.supportsMineView });
    const isKnownLegacy = raw === "" || raw === "all" || raw === "history"
      || ["owner", "review_owner", "system", "system_admin", "availability_unknown", "needs_confirmation", "rd", "production", "needs_action", "waiting", "ready"].includes(raw)
      || WORK_STATUS_MULTI_SELECT_VALUES.includes(raw as WorkStatusRowFilter);
    if (options.strict && raw && !isKnownLegacy && legacy.filter === "all") throw new PdmWorkbenchFilterSelectionError();
    return {
      selection: legacy.filter === "all" ? { mode: "all" } : { mode: "some", values: [legacy.filter] },
      includeHistory: legacy.includeHistory,
      view: legacy.view,
      rewriteRequired: !isKnownLegacy || legacy.rewriteRequired
    };
  }
  return {
    selection: parsePdmWorkbenchFilterSelection(params, "humanStatus", { allowedValues: WORK_STATUS_MULTI_SELECT_VALUES }),
    includeHistory: rawHistory === "include",
    view: ["all", "mine", "work"].includes(options.view?.trim() ?? "") ? options.view!.trim() : "all",
    rewriteRequired: true
  };
}

export function workStatusMatchesFilter(
  responsibilityStatus: Pick<ResponsibilityStatusProjection, "category" | "basis">,
  status: Pick<HumanStatusProjection, "phase">,
  filter: WorkStatusFilter,
  availabilityScope?: Pick<AvailabilityScopeProjection, "scope"> | null
) {
  if (filter === "all") return true;
  if (status.phase === "terminal" || responsibilityStatus.category === "terminal") return false;
  if (filter === "editing") return responsibilityStatus.category === "owner";
  if (filter === "reviewing") return responsibilityStatus.category === "review_owner" || responsibilityStatus.category === "system";
  if (filter === "needs_confirmation") {
    return responsibilityStatus.category === "system_admin" || responsibilityStatus.category === "unknown" || (responsibilityStatus.category === "usable" && (!availabilityScope || ["none", "unknown"].includes(availabilityScope.scope)));
  }
  if (filter === "rd_available") return responsibilityStatus.category === "usable" && availabilityScope?.scope === "rd";
  return responsibilityStatus.category === "usable" && availabilityScope?.scope === "production";
}

function terminalPresentation(status: HumanStatusProjection): WorkStatusPresentation {
  return {
    kind: "terminal_result",
    filterValue: null,
    label: status.label || "已結束",
    description: humanStatusDetail(status, null).summary,
    tone: "neutral",
    icon: "archive",
    reason: "terminal"
  };
}

function confirmationPresentation(
  description: string,
  reason: "system_admin_recovery" | "responsibility_unknown" | "availability_unknown"
): WorkStatusPresentation {
  return {
    kind: "work_status",
    filterValue: "needs_confirmation",
    label: "待確認",
    description,
    tone: "warning",
    icon: "alert",
    reason
  };
}

export function projectWorkStatusPresentation(input: {
  status: HumanStatusProjection | null | undefined;
  responsibilityStatus?: ResponsibilityStatusProjection | null;
  availabilityScope?: AvailabilityScopeProjection | null;
}): WorkStatusPresentation | null {
  const { status, responsibilityStatus, availabilityScope } = input;
  if (!status) return null;
  if (status.phase === "terminal" || responsibilityStatus?.category === "terminal") return terminalPresentation(status);

  if (status.phase === "usable" || responsibilityStatus?.category === "usable") {
    if (availabilityScope?.scope === "rd") {
      return { kind: "work_status", filterValue: "rd_available", label: "研發版可使用", description: "已受控，可用於研發、試作與設計驗證；不可作為量產依據。", tone: "success", icon: "check", reason: "rd_available" };
    }
    if (availabilityScope?.scope === "production") {
      return { kind: "work_status", filterValue: "production_available", label: "量產版可使用", description: "已正式發布，可作為採購、製造與量產依據。", tone: "success", icon: "check", reason: "production_available" };
    }
    return confirmationPresentation("已符合可使用階段，但用途範圍證據不足，需確認研發版或量產版。", "availability_unknown");
  }

  if (responsibilityStatus?.category === "system_admin") {
    const validRecovery = responsibilityStatus.basis === "recovery_action"
      && ["formalization_failed", "release_status_mismatch"].includes(status.key)
      && Boolean(responsibilityStatus.nextStep?.trim());
    if (validRecovery) return confirmationPresentation("自動化處理異常，由系統管理員確認並執行恢復。", "system_admin_recovery");
    return confirmationPresentation("系統無法確認目前責任或有效工作項，請由管理者查核。", "responsibility_unknown");
  }

  if (responsibilityStatus?.category === "system" && responsibilityStatus.basis === "automatic_finalization" && status.key === "finalizing") {
    return { kind: "work_status", filterValue: "reviewing", label: "審核中", description: "審核已完成，系統正在自動發布，不需人工操作。", tone: "info", icon: "clock", reason: "automatic_finalization" };
  }
  if (responsibilityStatus?.category === "review_owner") {
    return { kind: "work_status", filterValue: "reviewing", label: "審核中", description: "已送審，等待審核負責人完成審核。", tone: "info", icon: "clock", reason: "review_owner" };
  }
  if (responsibilityStatus?.category === "owner") {
    return { kind: "work_status", filterValue: "editing", label: "編輯中", description: "資料尚在建立、補件或修正，由負責人處理。", tone: "info", icon: "play", reason: "owner" };
  }
  return confirmationPresentation("系統無法確認目前責任或有效工作項，請由管理者查核。", "responsibility_unknown");
}
