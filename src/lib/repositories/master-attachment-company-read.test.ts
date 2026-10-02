import { describe, expect, it, vi } from "vitest";
const preview = vi.hoisted(() => ({ recover: vi.fn(), enqueue: vi.fn(), decorate: vi.fn((_snapshot, rows) => rows) }));
vi.mock("@/lib/preview-derivatives", () => ({
  decorateMasterAttachmentsWithPreviewState: preview.decorate,
  enqueuePreviewJobForAttachmentAsync: preview.enqueue,
  recoverStalePreviewJobsAsync: preview.recover,
  getPreviewDerivativeBytesForAttachmentAsync: vi.fn(),
  isNativeSolidWorksPreviewSource: vi.fn(),
  requestedPreviewKindForSource: vi.fn()
}));
import { listMasterAttachmentsInCompanyAsync } from "@/lib/master-attachments-async";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncMasterAttachmentRepository } from "@/lib/repositories/master-attachment-async-repository";

function fixture() {
  const query = vi.fn().mockResolvedValue([]);
  const queryOne = vi.fn(async (sql: string, params: Record<string, string>) => {
    if (!sql.includes("AND company_id = :companyId")) throw new Error("UNSCOPED_ENTITY_LOOKUP");
    if (params.companyId !== "company-one") return null;
    return sql.includes("drawing_numbers")
      ? { id: "drawing-one", drawing_number: params.code }
      : { id: "part-one", part_number: params.code };
  });
  const execute = vi.fn(() => { throw new Error("READ_MUST_NOT_WRITE"); });
  const client = { query, queryOne, execute } as unknown as AsyncDatabaseClient;
  return { repository: new AsyncMasterAttachmentRepository(client), query, queryOne, execute };
}

describe("master attachment company-bound reads", () => {
  it.each(["part_number", "drawing_number"] as const)("binds %s lookup and attachment rows to the exact company/entity", async (entityType) => {
    const f = fixture();
    const result = await f.repository.listMasterAttachmentsInCompany({ entityType, entityCode: " SAME-CODE ", companyId: "company-one" });
    expect(result?.entity.id).toBe(entityType === "part_number" ? "part-one" : "drawing-one");
    expect(f.queryOne.mock.calls[0][1]).toEqual({ code: "SAME-CODE", companyId: "company-one" });
    expect(f.query.mock.calls[0][1]).toEqual({ entityType, entityId: result?.entity.id });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("does not fall back to another company's matching number", async () => {
    const f = fixture();
    expect(await f.repository.listMasterAttachmentsInCompany({ entityType: "part_number", entityCode: "SAME-CODE", companyId: "company-two" })).toBeNull();
    expect(f.query).not.toHaveBeenCalled();
  });
  it("binds deleted-data reads to the same company and never writes", async () => {
    const f = fixture();
    expect(await f.repository.listDeletedMasterAttachmentsInCompany({ entityType: "drawing_number", entityCode: "SAME-CODE", companyId: "company-two" })).toBeNull();
    expect(f.query).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
  it("rejects a missing company before any database read", async () => {
    const f = fixture();
    expect(await f.repository.listMasterAttachmentsInCompany({ entityType: "part_number", entityCode: "SAME-CODE", companyId: " " })).toBeNull();
    expect(f.queryOne).not.toHaveBeenCalled();
  });
});

describe("scoped attachment service has no read-side job mutations", () => {
  it("uses the supplied authorized snapshot without recovering or enqueuing jobs", async () => {
    const f = fixture();
    const client = { query: f.query, queryOne: f.queryOne, execute: f.execute } as unknown as AsyncDatabaseClient;
    const result = await listMasterAttachmentsInCompanyAsync(client, { entityType: "part_number", entityCode: "SAME-CODE", companyId: "company-one", deleted: false });
    expect(result?.entity.id).toBe("part-one");
    expect(preview.decorate).toHaveBeenCalledWith(client, []);
    expect(preview.recover).not.toHaveBeenCalled();
    expect(preview.enqueue).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });
});
