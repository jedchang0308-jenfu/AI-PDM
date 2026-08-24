import { createHumanStatus, type HumanStatusProjection } from "@/lib/human-status-projection";
import type { DrawingNumberRecord } from "@/lib/repositories/numbering-repository";

export function projectDrawingRecordHumanStatus(
  drawing: Pick<DrawingNumberRecord, "recordStatus">
): HumanStatusProjection {
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
