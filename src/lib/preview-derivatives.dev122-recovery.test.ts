import { afterEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { recoverStalePreviewJobsAsync } from "@/lib/preview-derivatives";

const now = Date.parse("2026-10-04T05:00:00.000Z");
const scope = { companyId: "company-one", sourceFileAssetIds: ["asset-one"] };
function fixture(rows: unknown[], changed: boolean = true) {
  const query = vi.fn(async (_sql: string, _params?: unknown) => rows.map(value => {
    const row = value as { updated_at: string | Date; previous_updated_at?: string };
    return { locked_by:"worker-one",previous_locked_at:"2026-10-04T00:00:00.000Z",source_valid:1, company_id:"company-one",source_file_asset_id:"asset-one",source_content_hash:"a".repeat(64), ...row, previous_updated_at: row.previous_updated_at ?? String(row.updated_at) };
  }));
  const queryOne = vi.fn(async (_sql: string, _params?: unknown) => changed ? { id: "job-one" } : null);
  return { query, queryOne, client: { query, queryOne } as unknown as AsyncDatabaseClient };
}
afterEach(() => vi.restoreAllMocks());

describe("DEV122 bounded preview recovery (focused contract; native evidence is separate)", () => {
  it("leaves legacy no-scope wrappers as a zero-query no-op", async () => {
    const { client, query, queryOne } = fixture([]);
    expect(await recoverStalePreviewJobsAsync(client)).toEqual({ recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 });
    expect(query).not.toHaveBeenCalled();
    expect(queryOne).not.toHaveBeenCalled();
  });
  it.each(["native Date", "SQLite string"])("preserves fresh millisecond boundaries for %s", async kind => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const timestamp = (age: number) => kind === "native Date" ? new Date(now - age) : new Date(now - age).toISOString();
    const { client, queryOne } = fixture([
      { id: "running", status: "running", attempt_count: 2, updated_at: timestamp(29_999) },
      { id: "queued", status: "queued", attempt_count: 2, updated_at: timestamp(119_999) }
    ]);
    expect(await recoverStalePreviewJobsAsync(client, scope)).toEqual({ recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 });
    expect(queryOne).not.toHaveBeenCalled();
  });
  it("requeues attempt 2, terminates attempt 3 and expired unclaimed work", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { client, query, queryOne } = fixture([
      { id: "retry", status: "running", attempt_count: 2, updated_at: new Date(now - 30_001) },
      { id: "exhausted", status: "running", attempt_count: 3, updated_at: new Date(now - 30_001) },
      { id: "unclaimed", status: "queued", attempt_count: 2, updated_at: new Date(now - 120_001) }
    ]);
    expect(await recoverStalePreviewJobsAsync(client, scope)).toEqual({ recovered: 3, queuedUnclaimed: 1, invalidSourceTerminated: 0 });
    expect(query.mock.calls[0]?.[0]).toContain("job.status IN ('running','queued')");
    expect(queryOne.mock.calls.map(call => call[1])).toEqual([
      expect.objectContaining({ jobId: "retry", nextStatus: "queued", previousAttempts: 2, completedAt: null }),
      expect.objectContaining({ jobId: "exhausted", nextStatus: "failed", previousAttempts: 3 }),
      expect.objectContaining({ jobId: "unclaimed", nextStatus: "failed", errorCode: "preview_worker_unavailable" })
    ]);
  });
  it("counts a fresh-heartbeat CAS miss as zero, retaining exact timestamp/status/attempt comparison", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const updated = new Date(now - 30_001), exactToken = "2026-10-04 04:59:29.999123+00";
    const { client, queryOne } = fixture([{ id: "job-one", status: "running", attempt_count: 2, updated_at: updated, previous_updated_at: exactToken }], false);
    expect(await recoverStalePreviewJobsAsync(client, scope)).toEqual({ recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 });
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("job.updated_at=:previousUpdatedAt"),
      expect.objectContaining({ previousUpdatedAt: exactToken, previousStatus: "running", previousAttempts: 2 }));
    expect(queryOne.mock.calls[0]?.[0]).toContain("RETURNING id");
  });
  it("binds authorized resources and rechecks actual source hash, owner and supported kind during CAS", async () => {
    vi.spyOn(Date, "now").mockReturnValue(now);
    const { client, query, queryOne } = fixture([{ id: "job-one", status: "running", attempt_count: 2, updated_at: new Date(now - 30_001) }]);
    await recoverStalePreviewJobsAsync(client, scope);
    for (const sql of [query.mock.calls[0]?.[0], queryOne.mock.calls[0]?.[0]]) {
      expect(sql).toContain("job.company_id=:recoveryCompany");
      expect(sql).toContain("job.source_file_asset_id IN (:recoveryAsset0)");
      expect(sql).toContain("fa.content_hash=job.source_content_hash");
      expect(sql).toContain("job.requested_kind='native_thumbnail_png'");
      expect(sql).toContain("part.company_id = job.company_id");
    }
    expect(query.mock.calls[0]?.[1]).toEqual({ recoveryCompany: "company-one", recoveryAsset0: "asset-one" });
  });
  it("uses only explicitly supported workload kinds/extensions", async () => {
    const { client, query } = fixture([]);
    await recoverStalePreviewJobsAsync(client, { supportedKinds: ["native_thumbnail_png"], supportedExtensions: [".SLDDRW"] });
    expect(query.mock.calls[0]?.[1]).toEqual({ recoveryKind0: "native_thumbnail_png", recoveryExtension0: "slddrw" });
    expect(query.mock.calls[0]?.[0]).toContain("job.requested_kind IN (:recoveryKind0)");
  });
  it.each(["missing source","hash drift","owner drift"])("counts %s termination separately and fences the full observed generation",async()=>{
    vi.spyOn(Date,"now").mockReturnValue(now);
    const {client,queryOne}=fixture([{id:"invalid",status:"running",attempt_count:1,updated_at:new Date(now-30000),source_valid:0},
      {id:"queued-invalid",status:"queued",attempt_count:0,updated_at:new Date(now-120001),source_valid:0}]);
    expect(await recoverStalePreviewJobsAsync(client,scope)).toEqual({recovered:0,queuedUnclaimed:0,invalidSourceTerminated:1});
    expect(queryOne).toHaveBeenCalledTimes(1);
    expect(queryOne.mock.calls[0][1]).toMatchObject({jobId:"invalid",errorCode:"preview_source_unavailable",nextStatus:"failed",previousSourceValid:0,previousAttempts:1,previousLockedBy:"worker-one",previousLockedAt:"2026-10-04T00:00:00.000Z"});
    const sql=queryOne.mock.calls[0][0];expect(sql).toContain("job.locked_by=:previousLockedBy");expect(sql).toContain("job.locked_at=:previousLockedAt");
  });
  it("does not count a concurrent refreshed generation as an invalid-source termination",async()=>{
    vi.spyOn(Date,"now").mockReturnValue(now);const {client}=fixture([{id:"invalid",status:"running",attempt_count:1,updated_at:new Date(now-30000),source_valid:0}],false);
    expect(await recoverStalePreviewJobsAsync(client,scope)).toEqual({recovered:0,queuedUnclaimed:0,invalidSourceTerminated:0});
  });

  it.each([["running",30000],["queued",120000]] as const)("expires the exact %s threshold at %i ms",async(status,age)=>{
    vi.spyOn(Date,"now").mockReturnValue(now);const {client,queryOne}=fixture([{id:"boundary",status,attempt_count:3,updated_at:new Date(now-age)}]);
    expect(await recoverStalePreviewJobsAsync(client,scope)).toEqual({recovered:1,queuedUnclaimed:status==="queued"?1:0,invalidSourceTerminated:0});
    expect(queryOne).toHaveBeenCalledOnce();
  });

});
