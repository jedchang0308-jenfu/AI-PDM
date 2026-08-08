import type { HumanStatusProjection } from "@/lib/human-status-projection";
import { createHumanStatus } from "@/lib/human-status-projection";
import type { NumberingRecordStatus, NumberingRootDetailRecord } from "@/lib/repositories/numbering-repository";

export type DrawingPartRelationHealth =
  | "complete"
  | "missing_manufacturing_drawing"
  | "missing_part"
  | "ambiguous"
  | "blocked"
  | "draft";

export type DrawingPartRelationStatusSource = {
  recordStatus: NumberingRecordStatus;
  relationshipHealth: DrawingPartRelationHealth;
  blockerCount: number;
};

export type NumberingRootStatusProjection = {
  relationshipHealth: DrawingPartRelationHealth;
  blockerCount: number;
  humanStatus: HumanStatusProjection;
};

export function projectRelationHumanStatus(source: DrawingPartRelationStatusSource): HumanStatusProjection {
  if (source.recordStatus === "Obsolete") return createHumanStatus("obsolete", "terminal", "已作廢", "neutral", "archive");
  if (source.recordStatus === "Merged") return createHumanStatus("merged", "terminal", "已合併", "neutral", "archive");
  if (source.recordStatus === "MainDrawingInvalid") {
    return createHumanStatus("main_drawing_invalid", "action_required", "主圖失效", "danger", "alert");
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
  if (source.relationshipHealth === "ambiguous") {
    return createHumanStatus("data_conflict", "action_required", "檢查主圖", "danger", "alert");
  }
  if (source.relationshipHealth === "blocked") {
    return createHumanStatus("data_conflict", "action_required", "關聯受阻", "danger", "alert");
  }
  if (source.relationshipHealth === "missing_manufacturing_drawing") {
    return createHumanStatus("missing_manufacturing_drawing", "action_required", "缺製造圖", "danger", "alert");
  }
  if (source.relationshipHealth === "missing_part") {
    return createHumanStatus("missing_part", "action_required", "缺料號", "danger", "alert");
  }
  if (source.relationshipHealth === "draft") {
    return createHumanStatus("preparing", "waiting", "準備中", "info", "clock");
  }
  if (source.relationshipHealth === "complete" && source.blockerCount === 0) {
    return createHumanStatus("relation_complete", "usable", "關聯完整", "success", "check");
  }
  return createHumanStatus("data_needs_review", "action_required", "資料需確認", "warning", "alert");
}

export function projectNumberingRootStatus(
  detail: Pick<NumberingRootDetailRecord, "root" | "partNumbers" | "drawingNumbers" | "links" | "summary">
): NumberingRootStatusProjection {
  const manufacturingDrawingIds = new Set(
    detail.drawingNumbers.filter((drawing) => drawing.purposeCode === "M" || drawing.purposeCode === "MA").map((drawing) => drawing.id)
  );
  const hasMissingManufacturingDrawing = detail.partNumbers.some((part) => {
    if (!["manufactured", "outsourced", "custom"].includes(part.itemKind)) return false;
    return !detail.links.some((link) => link.partNumberId === part.id && link.linkType === "primary_manufacturing" && manufacturingDrawingIds.has(link.drawingNumberId));
  });
  const relationshipHealth: DrawingPartRelationHealth = detail.summary.hasMainDrawingInvalid
    ? "blocked"
    : detail.partNumbers.length === 0
      ? "missing_part"
      : manufacturingDrawingIds.size === 0 || hasMissingManufacturingDrawing
        ? "missing_manufacturing_drawing"
        : detail.summary.warningCount > 0
          ? "ambiguous"
          : "complete";
  const blockerCount = detail.summary.warningCount;
  return {
    relationshipHealth,
    blockerCount,
    humanStatus: projectRelationHumanStatus({ recordStatus: detail.root.recordStatus, relationshipHealth, blockerCount })
  };
}

export function projectNumberingRootDetailHumanStatus(
  detail: Pick<NumberingRootDetailRecord, "root" | "partNumbers" | "drawingNumbers" | "links" | "summary">
): HumanStatusProjection {
  return projectNumberingRootStatus(detail).humanStatus;
}
