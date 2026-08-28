export type NumberingStructureType = "single_part" | "assembly";
export type StoredPartStructureType = NumberingStructureType | "unclassified";

export const NUMBERING_STRUCTURE_TYPE_OPTIONS: ReadonlyArray<{
  value: NumberingStructureType;
  label: string;
}> = [
  { value: "single_part", label: "單一零件" },
  { value: "assembly", label: "組立件" }
];

export function parseNumberingStructureType(value: unknown): NumberingStructureType | undefined {
  return value === "single_part" || value === "assembly" ? value : undefined;
}

export function parseStoredPartStructureType(value: unknown): StoredPartStructureType {
  if (value === "assembly" || value === "unclassified") return value;
  return "single_part";
}

export function numberingStructureTypeLabel(value: StoredPartStructureType) {
  if (value === "assembly") return "組立件";
  if (value === "unclassified") return "未分類";
  return "單一零件";
}

/** Exact Part authority helper used by existing-root append and UI policy. */
export function consensusStoredPartStructureType(values: readonly unknown[]): StoredPartStructureType {
  if (values.length === 0) return "unclassified";
  const parsed = values.map(parseStoredPartStructureType);
  if (parsed.some((value, index) => values[index] !== "single_part" && values[index] !== "assembly")) return "unclassified";
  return parsed.every((value) => value === parsed[0]) ? parsed[0] : "unclassified";
}
