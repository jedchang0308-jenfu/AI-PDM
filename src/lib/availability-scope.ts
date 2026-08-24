import type { NumberingRecordStatus, PartModuleListRecord } from "@/lib/repositories/numbering-repository";

export type AvailabilityScope = "none" | "rd" | "production" | "unknown";
export type AvailabilityBasis = "lifecycle" | "release_evidence" | "dependency" | "record" | "conflict" | "none";

export type AvailabilityScopeProjection = {
  schemaVersion: 1;
  scope: AvailabilityScope;
  label: "研發可用" | "生產可用" | "可用範圍待確認" | null;
  basis: AvailabilityBasis;
  summary: string;
};

const manufacturingItemKinds = new Set(["manufactured"]);

function scope(
  value: AvailabilityScope,
  basis: AvailabilityBasis,
  summary: string
): AvailabilityScopeProjection {
  return {
    schemaVersion: 1,
    scope: value,
    label: value === "rd" ? "研發可用" : value === "production" ? "生產可用" : value === "unknown" ? "可用範圍待確認" : null,
    basis,
    summary
  };
}

export function projectDrawingAvailability(source: {
  stage: string;
  usage: string;
  releaseStatusMismatch?: boolean;
  terminal?: unknown;
}): AvailabilityScopeProjection {
  if (source.terminal || source.stage === "history_only") return scope("none", "none", "這筆圖面已結束，不能再作為現行使用依據。");
  if (source.releaseStatusMismatch) return scope("unknown", "conflict", "發布資料尚未完成確認，暫不能判定生產使用資格。");
  if (source.stage === "released" && source.usage === "released") {
    return scope("production", "release_evidence", "圖面已發布，可供生產使用。");
  }
  if (source.stage === "released" || source.usage === "released") {
    return scope("unknown", "conflict", "圖面發布證據不一致，暫不能判定生產使用資格。");
  }
  if (source.stage === "official_controlled" || source.usage === "rd_controlled") {
    return scope("rd", "lifecycle", "研發受控圖面，可供研發查閱與驗證。");
  }
  return scope("none", "none", "目前尚未取得研發或生產使用資格。");
}

export function projectDrawingRecordAvailability(source: Pick<{ recordStatus: NumberingRecordStatus }, "recordStatus">): AvailabilityScopeProjection {
  if (source.recordStatus === "Released") return scope("production", "release_evidence", "圖面已發布，可供生產使用。");
  if (source.recordStatus === "Active") return scope("rd", "record", "目前為研發受控圖面，可供研發查閱與驗證。");
  if (["Obsolete", "Merged"].includes(source.recordStatus)) return scope("none", "none", "這筆圖面已結束，不能再作為現行使用依據。");
  return scope("none", "none", "目前尚未取得研發或生產使用資格。");
}

export function projectPartAvailability(source: Pick<PartModuleListRecord, "recordStatus" | "itemKind" | "primaryDrawingNumber"> & {
  hasManufacturingDrawing?: boolean;
  primaryDrawingRecordStatus?: NumberingRecordStatus | null;
}): AvailabilityScopeProjection {
  if (["Obsolete", "Merged"].includes(source.recordStatus)) return scope("none", "none", "這筆料號已結束，不能再作為現行使用依據。");
  const requiresManufacturingDrawing = manufacturingItemKinds.has(source.itemKind);
  const hasManufacturingDrawing = source.hasManufacturingDrawing ?? Boolean(source.primaryDrawingNumber);
  if (requiresManufacturingDrawing && !hasManufacturingDrawing) {
    return scope("none", "dependency", "尚未具備必要的製造圖關聯。");
  }
  if (source.recordStatus === "Active") return scope("rd", "record", "料號可供研發查閱與驗證，但尚未取得生產使用資格。");
  if (source.recordStatus === "Released") {
    if (requiresManufacturingDrawing && source.primaryDrawingRecordStatus !== "Released") {
      return scope("unknown", "dependency", "料號已發布，但製造圖版次尚未完成發布。");
    }
      return scope("production", "release_evidence", "料號已發布，可供生產使用。");
  }
  return scope("none", "none", "目前尚未取得研發或生產使用資格。");
}

export function projectRelationRootAvailability(source: {
  recordStatus: NumberingRecordStatus;
  relationshipHealth: string;
  blockerCount: number;
  dependencyReleaseReady?: boolean;
}): AvailabilityScopeProjection {
  if (source.relationshipHealth !== "complete" || source.blockerCount > 0) {
    return scope("none", "dependency", "圖料關係尚未完整，不能判定生產使用資格。");
  }
  if (source.recordStatus === "Released" && source.dependencyReleaseReady === false) {
      return scope("unknown", "dependency", "關聯料號或製造圖尚未全部發布，暫不能判定生產使用資格。");
  }
  if (source.recordStatus === "Released") return scope("production", "release_evidence", "已發布且圖料關係完整，可供生產使用。");
  if (source.recordStatus === "Active") return scope("rd", "record", "圖料關係完整，可供研發查閱與驗證。");
  return scope("none", "none", "目前尚未取得研發或生產使用資格。");
}

export function projectRelationChildAvailability(source: { recordStatus: NumberingRecordStatus }): AvailabilityScopeProjection {
  return projectDrawingRecordAvailability(source);
}
