import type { BomPurpose } from "@/lib/types";

export function bomPurposeLabel(purpose: BomPurpose) {
  return purpose === "sales_kit" ? "非製造 BOM" : "製造 BOM";
}

export function bomPurposeShortLabel(purpose: BomPurpose) {
  return purpose === "sales_kit" ? "非製造" : "製造";
}

export function bomCreateActionLabel(purpose?: BomPurpose | null) {
  return purpose ? `建立${bomPurposeLabel(purpose)}` : "建立 BOM";
}

export function bomOpenActionLabel() {
  return "開啟既有 BOM";
}

export function bomClassifyActionLabel() {
  return "設定為組立件";
}

export function bomBlockerLabel(code: string | null | undefined) {
  const labels: Record<string, string> = {
    BOM_PARENT_INACTIVE: "Parent 目前不可使用",
    BOM_ASSEMBLY_REQUIRES_M_DRAWING: "製造 BOM 需要主要製造圖 M",
    BOM_SALES_KIT_DISABLED: "非製造 BOM 功能尚未啟用",
    BOM_SALES_KIT_MIGRATION_BLOCKED: "非製造 BOM 資料結構尚未就緒",
    BOM_PURPOSE_INVALID: "目前沒有可用的 BOM 用途",
    BOM_PURPOSE_CONFLICT: "已有不同用途的 BOM",
    BOM_DEFINITION_STATE_INVALID: "BOM 定義尚未有可開啟的版本",
    BOM_CREATE_FORBIDDEN: "目前角色沒有建立 BOM 的權限"
  };
  return code ? labels[code] ?? "目前無法建立 BOM" : "";
}
