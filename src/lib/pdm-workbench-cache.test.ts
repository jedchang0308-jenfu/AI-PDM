import { describe, expect, it } from "vitest";
import { createPdmWorkbenchCache } from "./pdm-workbench-cache";
import type { CanonicalWorkbenchListDto } from "./pdm-canonical-workbench-contract";

const data: CanonicalWorkbenchListDto["data"] = {
  groups: [], nextCursor: null, previousCursor: null, totalGroups: 0, totalRows: 0
};

describe("app-owned workbench display cache", () => {
  it("separates domain, query and cursor; expires entries after 30 seconds", () => {
    let now = 0;
    const cache = createPdmWorkbenchCache(() => now);
    cache.writeList("/api/parts/workbench?query=A", data, cache.generation());
    expect(cache.readList("/api/parts/workbench?query=A")).toBe(data);
    expect(cache.readList("/api/parts/workbench?query=B")).toBeNull();
    expect(cache.readList("/api/parts/workbench?query=A&cursor=next")).toBeNull();
    expect(cache.readList("/api/numbering/drawings/workbench?query=A")).toBeNull();
    now = 30_000;
    expect(cache.readList("/api/parts/workbench?query=A")).toBeNull();
  });
  it("bounds memory, isolates app instances, and expires series as well", () => {
    let now = 0;
    const cache = createPdmWorkbenchCache(() => now, 30_000, 2);
    for (const key of ["A", "B", "C"]) cache.writeList(key, data, cache.generation());
    expect(cache.readList("A")).toBeNull();
    expect(cache.readList("B")).toBe(data);
    expect(createPdmWorkbenchCache().readList("B")).toBeNull();
    cache.writeSeries([], cache.generation());
    expect(cache.readSeries()).toEqual([]);
    now = 30_000;
    expect(cache.readSeries()).toBeNull();
  });
  it("invalidation clears all data and rejects pre-invalidation completions", () => {
    const cache = createPdmWorkbenchCache();
    const version = cache.generation();
    cache.writeList("A", data, version);
    cache.writeSeries([{ value: "A", label: "A" }], version);
    let cleared = 0;
    const unsubscribe = cache.subscribe(() => cleared++);
    cache.clear();
    cache.writeList("A", data, version);
    cache.writeSeries([], version);
    expect(cache.readList("A")).toBeNull();
    expect(cache.readSeries()).toBeNull();
    expect(cleared).toBe(1);
    unsubscribe();
    cache.clear();
    expect(cleared).toBe(1);
  });
});
