import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";

export const PDM_WORKBENCH_FILTER_NONE_TOKEN = "__none__";
const LEGACY_ALL_TOKENS = new Set(["", "all"]);

export class PdmWorkbenchFilterSelectionError extends Error {
  readonly code = "workbench_invalid_filter";
  readonly status = 400;
  readonly retryable = false;

  constructor(message = "請重新選擇有效的篩選條件。") {
    super(message);
    this.name = "PdmWorkbenchFilterSelectionError";
  }
}

export type PdmWorkbenchFilterSelectionConfig<T extends string = string> = {
  allowedValues?: readonly T[];
  maxValues?: number;
  maxValueLength?: number;
  sortValues?: (left: T, right: T) => number;
};

function defaultCompare(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertValue<T extends string>(value: string, config: PdmWorkbenchFilterSelectionConfig<T>) {
  const maxValueLength = config.maxValueLength ?? 120;
  if (!value || value === PDM_WORKBENCH_FILTER_NONE_TOKEN || value.length > maxValueLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new PdmWorkbenchFilterSelectionError();
  }
  if (config.allowedValues && !config.allowedValues.includes(value as T)) {
    throw new PdmWorkbenchFilterSelectionError();
  }
}

function uniqueAndSort<T extends string>(values: readonly T[], config: PdmWorkbenchFilterSelectionConfig<T>) {
  const unique = [...new Set(values)];
  if (config.allowedValues) {
    const order = new Map(config.allowedValues.map((value, index) => [value, index]));
    unique.sort((left, right) => (order.get(left) ?? Number.MAX_SAFE_INTEGER) - (order.get(right) ?? Number.MAX_SAFE_INTEGER));
  } else {
    unique.sort(config.sortValues ?? defaultCompare);
  }
  return unique;
}

export function parsePdmWorkbenchFilterSelection<T extends string = string>(
  params: URLSearchParams,
  key: string,
  config: PdmWorkbenchFilterSelectionConfig<T> = {}
): PdmWorkbenchFilterSelection<T> {
  const rawValues = params.getAll(key).map((value) => value.trim());
  if (rawValues.length === 0 || (rawValues.length === 1 && LEGACY_ALL_TOKENS.has(rawValues[0]))) return { mode: "all" };
  if (rawValues.includes(PDM_WORKBENCH_FILTER_NONE_TOKEN)) {
    if (rawValues.length !== 1) throw new PdmWorkbenchFilterSelectionError();
    return { mode: "none" };
  }
  if (rawValues.some((value) => LEGACY_ALL_TOKENS.has(value))) throw new PdmWorkbenchFilterSelectionError();
  if (rawValues.length > (config.maxValues ?? 50)) throw new PdmWorkbenchFilterSelectionError();
  for (const value of rawValues) assertValue(value, config);
  const values = uniqueAndSort(rawValues as T[], config);
  if (values.length === 0) return { mode: "none" };
  return { mode: "some", values };
}

export function parsePdmWorkbenchFilterSelectionForBrowser<T extends string = string>(
  params: URLSearchParams,
  key: string,
  config: PdmWorkbenchFilterSelectionConfig<T> = {}
): PdmWorkbenchFilterSelection<T> {
  try {
    return parsePdmWorkbenchFilterSelection(params, key, config);
  } catch {
    params.delete(key);
    params.set(key, PDM_WORKBENCH_FILTER_NONE_TOKEN);
    return { mode: "none" };
  }
}

export function canonicalizePdmWorkbenchFilterSelection<T extends string>(
  selection: PdmWorkbenchFilterSelection<T>,
  options: readonly T[] = [],
  config: PdmWorkbenchFilterSelectionConfig<T> = {}
): PdmWorkbenchFilterSelection<T> {
  if (selection.mode === "all") return { mode: "all" };
  if (selection.mode === "none") return { mode: "none" };
  const values = uniqueAndSort(selection.values, options.length > 0 ? { ...config, allowedValues: options } : config);
  if (values.length === 0) return { mode: "none" };
  if (options.length > 0 && options.every((option) => values.includes(option)) && values.length === options.length) return { mode: "all" };
  return { mode: "some", values };
}

export function serializePdmWorkbenchFilterSelection<T extends string>(
  params: URLSearchParams,
  key: string,
  selection: PdmWorkbenchFilterSelection<T>,
  config: PdmWorkbenchFilterSelectionConfig<T> = {}
) {
  params.delete(key);
  const canonical = canonicalizePdmWorkbenchFilterSelection(selection, [], config);
  if (canonical.mode === "none") params.set(key, PDM_WORKBENCH_FILTER_NONE_TOKEN);
  if (canonical.mode === "some") for (const value of canonical.values) params.append(key, value);
}

export function selectionMatches<T extends string>(selection: PdmWorkbenchFilterSelection<T>, value: T) {
  return selection.mode === "all" || (selection.mode === "some" && selection.values.includes(value));
}

export function selectionHashValue<T extends string>(selection: PdmWorkbenchFilterSelection<T>) {
  if (selection.mode === "all") return "*";
  if (selection.mode === "none") return "!";
  return [...selection.values];
}

export function selectionIncludesAny<T extends string>(selection: PdmWorkbenchFilterSelection<T>, values: readonly T[]) {
  if (selection.mode === "all") return true;
  if (selection.mode === "none") return false;
  return values.some((value) => selection.values.includes(value));
}
