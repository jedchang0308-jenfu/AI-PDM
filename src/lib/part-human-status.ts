import type { HumanStatusProjection } from "@/lib/human-status-projection";
import { createHumanStatus } from "@/lib/human-status-projection";
import type { NumberingRecordStatus, PartModuleListRecord } from "@/lib/repositories/numbering-repository";

const MANUFACTURING_ITEM_KINDS = new Set(["manufactured"]);

type PartHumanStatusSource = Pick<PartModuleListRecord, "recordStatus" | "itemKind" | "primaryDrawingNumber"> & {
  hasManufacturingDrawing?: boolean;
};

function hasManufacturingDrawing(source: PartHumanStatusSource) {
  return source.hasManufacturingDrawing ?? Boolean(source.primaryDrawingNumber);
}

function terminalStatus(status: NumberingRecordStatus) {
  if (status === "Obsolete") return createHumanStatus("obsolete", "terminal", "已作廢", "neutral", "archive");
  if (status === "Merged") return createHumanStatus("merged", "terminal", "已合併", "neutral", "archive");
  return null;
}

export function projectPartHumanStatus(source: PartHumanStatusSource): HumanStatusProjection {
  const terminal = terminalStatus(source.recordStatus);
  if (terminal) return terminal;

  if (source.recordStatus === "MainDrawingInvalid") {
    return createHumanStatus("main_drawing_invalid", "action_required", "主圖失效", "danger", "alert");
  }

  if (MANUFACTURING_ITEM_KINDS.has(source.itemKind) && !hasManufacturingDrawing(source)) {
    return createHumanStatus("missing_manufacturing_drawing", "action_required", "缺製造圖", "danger", "alert");
  }

  if (source.recordStatus === "Rejected" || source.recordStatus === "NeedInfo") {
    return createHumanStatus("correction_required", "action_required", "待修正", "warning", "alert");
  }
  if (source.recordStatus === "PendingReview" || source.recordStatus === "PendingAdminConfirm") {
    return createHumanStatus("waiting_review", "waiting", "待審核", "info", "clock");
  }
  if (source.recordStatus === "Draft") {
    return createHumanStatus("preparing", "waiting", "準備中", "info", "clock");
  }
  if (source.recordStatus === "Released") {
    return createHumanStatus("released", "usable", "已發布", "success", "check");
  }
  if (source.recordStatus === "Active") {
    return createHumanStatus("usable", "usable", "可使用", "success", "check");
  }

  return createHumanStatus("data_needs_review", "action_required", "資料需確認", "warning", "alert");
}
