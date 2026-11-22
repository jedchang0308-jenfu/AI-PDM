import type { CanonicalWorkbenchListDto } from "./pdm-canonical-workbench-contract";

type ListData = CanonicalWorkbenchListDto["data"];
export type WorkbenchSeriesOption = { value: string; label: string };

/** Owned by one app shell. Only display data is retained, never command tokens or details. */
export function createPdmWorkbenchCache(now = Date.now, ttlMs = 30_000, limit = 12, maxAgeMs = 300_000) {
  let generation = 0;
  const lists = new Map<string, { data: ListData; freshUntil: number; expiresAt: number }>();
  let series: { options: WorkbenchSeriesOption[]; expiresAt: number } | null = null;
  const listeners = new Set<() => void>();
  return {
    generation: () => generation,
    readListSnapshot(url: string) {
      const entry = lists.get(url);
      if (!entry || entry.expiresAt <= now()) { lists.delete(url); return null; }
      return { data: entry.data, fresh: entry.freshUntil > now() };
    },
    readList(url: string) {
      const entry = this.readListSnapshot(url);
      return entry?.fresh ? entry.data : null;
    },
    writeList(url: string, data: ListData, version: number) {
      if (version !== generation) return;
      lists.delete(url);
      // Actions are authority hints from the original read, not reusable display data.
      const display = { ...data, groups: data.groups.map(group => ({ ...group, rows: group.rows.map(row => ({ ...row, actions: [] })) })) };
      lists.set(url, { data: display, freshUntil: now() + ttlMs, expiresAt: now() + Math.max(ttlMs, maxAgeMs) });
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
