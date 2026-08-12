export type NumberSortDirection = "asc" | "desc";

export const DEFAULT_NUMBER_SORT_DIRECTION: NumberSortDirection = "asc";

export function parseNumberSortDirection(
  value: string | null | undefined,
  fallback: NumberSortDirection = DEFAULT_NUMBER_SORT_DIRECTION
): NumberSortDirection {
  return value === "desc" || value === "asc" ? value : fallback;
}

export function compareNumberCodes(left: string, right: string, direction: NumberSortDirection) {
  const comparison = left.localeCompare(right, "zh-Hant", { numeric: true, sensitivity: "base" });
  return direction === "desc" ? -comparison : comparison;
}
