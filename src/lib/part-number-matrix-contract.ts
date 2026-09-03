export type PartMatrixPayload = {
  partName: string;
  itemKind: "purchased" | "manufactured";
  customSpecification: string | null;
  isUniversal: boolean;
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
};

export type PartMatrixRowKey = keyof PartMatrixPayload;

export type PartMaintenanceTab = "data" | "maintenance";

export const PART_MAINTENANCE_TABS: ReadonlyArray<{ value: PartMaintenanceTab; label: string }> = [
  { value: "data", label: "資料" },
  { value: "maintenance", label: "維護" }
];

export function normalizePartMaintenanceTab(value: unknown): PartMaintenanceTab {
  return value === "maintenance" ? value : "data";
}

export const PART_MATRIX_AUTOSAVE_IDLE_MS = 800;
export const PART_MATRIX_MAX_CONCURRENCY = 3;

export const PART_MATRIX_ROW_REGISTRY: ReadonlyArray<{
  key: PartMatrixRowKey;
  label: string;
  control: "text" | "select" | "checkbox" | "textarea" | "pair";
}> = [
  { key: "partName", label: "品名", control: "text" },
  { key: "itemKind", label: "料件類型", control: "select" },
  { key: "customSpecification", label: "規格／特性", control: "text" },
  { key: "materialLabel", label: "材質", control: "pair" },
  { key: "colorLabel", label: "顏色", control: "pair" },
  { key: "surfaceTreatment", label: "表面處理", control: "text" },
  { key: "isUniversal", label: "共用件", control: "checkbox" },
  { key: "variantNote", label: "變體備註", control: "textarea" }
];

export function normalizeMatrixText(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

export function matrixPayloadValue(payload: PartMatrixPayload, key: PartMatrixRowKey) {
  if (key === "materialLabel") return payload.materialLabel ? `${payload.materialCode ? `${payload.materialCode} · ` : ""}${payload.materialLabel}` : "—";
  if (key === "colorLabel") return payload.colorLabel ? `${payload.colorCode ? `${payload.colorCode} · ` : ""}${payload.colorLabel}` : "—";
  const value = payload[key];
  return typeof value === "boolean" ? (value ? "true" : "false") : value ?? "";
}

export function matrixPayloadEqual(left: PartMatrixPayload, right: PartMatrixPayload) {
  return PART_MATRIX_ROW_REGISTRY.every((row) => matrixPayloadValue(left, row.key) === matrixPayloadValue(right, row.key));
}

export function matrixRowDiffers(columns: Array<{ payload: PartMatrixPayload }>, key: PartMatrixRowKey) {
  return new Set(columns.map((column) => matrixPayloadValue(column.payload, key))).size > 1;
}
