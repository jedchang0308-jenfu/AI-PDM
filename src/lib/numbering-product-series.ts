export function normalizeProductSeries(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function productSeriesFromCoreName(coreName: string) {
  const normalized = coreName.trim();
  if (!normalized) return "";
  return normalized.split("_", 1)[0]?.trim() ?? "";
}

export function productSeriesOptionsFromCoreNames(coreNames: string[]) {
  return Array.from(new Set(coreNames.map(productSeriesFromCoreName).filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "zh-Hant", { numeric: true, sensitivity: "base" })
  );
}
