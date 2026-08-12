import { createHumanStatus, humanStatusActionFrom, type HumanStatusProjection } from "@/lib/human-status-projection";
import type { DrawingWorkbenchRow } from "@/lib/drawing-workbench";
import type { DrawingNumberRecord } from "@/lib/repositories/numbering-repository";

export type DrawingWorkbenchStatusViewModel = {
  primaryStage: DrawingWorkbenchRow["stage"];
  primaryLabel: string;
  humanStatus: HumanStatusProjection;
  warning: DrawingWorkbenchRow["warning"];
  terminal: DrawingWorkbenchRow["terminal"];
};

type DrawingWorkbenchStatusSource = Omit<DrawingWorkbenchRow, "humanStatus" | "viewerStatus" | "availabilityScope" | "preview"> & { preview?: DrawingWorkbenchRow["preview"] };

export function projectDrawingHumanStatus(row: DrawingWorkbenchStatusSource): HumanStatusProjection {
  if (row.stage === "history_only") {
    if (row.terminal?.kind === "cancelled") return createHumanStatus("cancelled", "terminal", "已取消", "neutral", "archive");
    if (row.terminal?.kind === "merged") return createHumanStatus("merged", "terminal", "已合併", "neutral", "archive");
    return createHumanStatus("obsolete", "terminal", "已作廢", "neutral", "archive");
  }
  if (row.releaseStatusMismatch) {
    return createHumanStatus("release_status_mismatch", "action_required", "發布狀態異常", "danger", "alert", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "recovery_required") {
    return createHumanStatus("formalization_failed", "action_required", "正式化失敗", "danger", "alert", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "correction_required") {
    return createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "building" || row.stage === "drawing_preparation") {
    return createHumanStatus("preparing", "waiting", row.stage === "building" ? "建立中" : "準備中", "info", "clock", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "bundle_ready") {
    return createHumanStatus("ready_to_submit", "ready", "可送審", "success", "play", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "in_review" || row.stage === "revision_in_review") {
    return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "auto_finalizing") {
    return createHumanStatus("finalizing", "waiting", "發布中", "info", "clock", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "official_controlled") {
    return createHumanStatus("rd_controlled", "usable", "研發受控", "success", "check", humanStatusActionFrom(row.primaryAction));
  }
  if (row.stage === "released") {
    return createHumanStatus("released", "usable", "已發布", "success", "check", humanStatusActionFrom(row.primaryAction));
  }
  return createHumanStatus("data_needs_review", "action_required", "資料需確認", "warning", "alert", humanStatusActionFrom(row.primaryAction));
}

export function getDrawingWorkbenchStatusViewModel(row: DrawingWorkbenchRow): DrawingWorkbenchStatusViewModel {
  return {
    primaryStage: row.stage,
    primaryLabel: row.stageLabel,
    humanStatus: row.humanStatus ?? projectDrawingHumanStatus(row),
    warning: row.warning,
    terminal: row.terminal
  };
}

export function projectDrawingRecordHumanStatus(drawing: Pick<DrawingNumberRecord, "recordStatus">): HumanStatusProjection {
  if (drawing.recordStatus === "Obsolete") return createHumanStatus("obsolete", "terminal", "已作廢", "neutral", "archive");
  if (drawing.recordStatus === "Merged") return createHumanStatus("merged", "terminal", "已合併", "neutral", "archive");
  if (drawing.recordStatus === "MainDrawingInvalid") return createHumanStatus("main_drawing_invalid", "action_required", "主圖失效", "danger", "alert");
  if (drawing.recordStatus === "Rejected" || drawing.recordStatus === "NeedInfo") return createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert");
  if (drawing.recordStatus === "PendingReview" || drawing.recordStatus === "PendingAdminConfirm") return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
  if (drawing.recordStatus === "Draft") return createHumanStatus("preparing", "waiting", "準備中", "info", "clock");
  if (drawing.recordStatus === "Released") return createHumanStatus("released", "usable", "已發布", "success", "check");
  if (drawing.recordStatus === "Active") return createHumanStatus("rd_controlled", "usable", "研發受控", "success", "check");
  return createHumanStatus("data_needs_review", "action_required", "資料需確認", "warning", "alert");
}
