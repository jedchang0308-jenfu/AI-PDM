import type { CanonicalWorkbenchListDto } from "./pdm-canonical-workbench-contract";

type ListData = CanonicalWorkbenchListDto["data"];
export type WorkbenchSeriesOption = { value: string; label: string };

/** Owned by one app shell. Only display data is retained, never command tokens or details. */
export function createPdmWorkbenchCache(now = Date.now, ttlMs = 30_000, limit = 12) {
  let generation = 0;
  const lists = new Map<string, { data: ListData; expiresAt: number }>();
  let series: { options: WorkbenchSeriesOption[]; expiresAt: number } | null = null;
  const listeners = new Set<() => void>();
  return {
    generation: () => generation,
    readList(url: string) {
      const entry = lists.get(url);
      if (!entry || entry.expiresAt <= now()) { lists.delete(url); return null; }
      return entry.data;
    },
    writeList(url: string, data: ListData, version: number) {
      if (version !== generation) return;
      lists.delete(url);
      lists.set(url, { data, expiresAt: now() + ttlMs });
      while (lists.size > limit) lists.delete(lists.keys().next().value!);
    },
    readSeries() { return series && series.expiresAt > now() ? series.options : null; },
    writeSeries(options: WorkbenchSeriesOption[], version: number) {
      if (version === generation) series = { options, expiresAt: now() + ttlMs };
    },
    clear(clearVisible = true) {
      generation++;
      lists.clear();
      series = null;
      if (clearVisible) listeners.forEach(listener => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}
