import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

vi.mock("server-only", () => ({}));

import { readV3OccupiedRootCodes } from "@/lib/repositories/numbering-async-repository";

function clientWithRows(input: {
  master?: Array<{ root_code: string }>;
  projections?: Array<{ drawing_number: string }>;
  audits?: Array<{ action: string; detail_json: string }>;
  reservations?: Array<{ code: string }>;
}) {
  const query = vi.fn()
    .mockResolvedValueOnce(input.master ?? [])
    .mockResolvedValueOnce(input.projections ?? [])
    .mockResolvedValueOnce(input.audits ?? [])
    .mockResolvedValueOnce(input.reservations ?? []);
  const client = { query } as unknown as AsyncDatabaseClient;
  return { client, query };
}

function detail(value: unknown) {
  return JSON.stringify(value);
}

function validDelete(rootCode: string, rootId = `id-${rootCode}`, companyId = "company-a") {
  return {
    action: "numbering.draft.delete",
    detail_json: detail({ companyId, rootCode, releasePolicy: "never-approved-draft-v1", outcome: "deleted",
      root: { id: rootId, code: rootCode } }),
  };
}

describe("V3 occupied root reader and exact draft-delete release marker", () => {
  it("releases a root only for an exact, complete successful deletion marker", async () => {
    const { client } = clientWithRows({ audits: [
      { action: "numbering.draft.create", detail_json: detail({ companyId: "company-a", rootCode: "A0001" }) },
      validDelete("A0001"),
      { action: "numbering.draft.delete", detail_json: detail({ companyId: "company-a", rootCode: "A0002",
        releasePolicy: "other-policy", outcome: "deleted", root: { id: "id-A0002", code: "A0002" } }) },
      { action: "numbering.draft.delete", detail_json: detail({ companyId: "company-a", rootCode: "A0003",
        releasePolicy: "never-approved-draft-v1", outcome: "failed", root: { id: "id-A0003", code: "A0003" } }) },
      { action: "numbering.draft.delete", detail_json: detail({ companyId: "company-a", rootCode: "A0004",
        releasePolicy: "never-approved-draft-v1", outcome: "deleted", root: { id: "", code: "A0004" } }) },
      { action: "numbering.draft.delete", detail_json: detail({ companyId: "company-a", rootCode: "A0005",
        releasePolicy: "never-approved-draft-v1", outcome: "deleted", root: { id: "id-A0005", code: "A0006" } }) },
    ] });

    await expect(readV3OccupiedRootCodes(client, "company-a")).resolves.toEqual(["A0002", "A0003", "A0004", "A0005"]);
  });

  it("reoccupies a released root when a later allocation audit records that identity again", async () => {
    const { client, query } = clientWithRows({ audits: [
      { action: "numbering.draft.create", detail_json: detail({ companyId: "company-a", rootCode: "A0001" }) },
      validDelete("A0001"),
      { action: "numbering.draft.create", detail_json: detail({ companyId: "company-a", rootCode: "A0001" }) },
    ] });

    await expect(readV3OccupiedRootCodes(client, "company-a")).resolves.toEqual(["A0001"]);
    expect(query.mock.calls[2][0]).toContain("ORDER BY created_at ASC, id ASC");
    expect(query.mock.calls[2][1]).toEqual({ companyId: "company-a" });
  });

  it("retains independent recovery and candidate reservations after a delete marker", async () => {
    const { client, query } = clientWithRows({
      audits: [{ action: "numbering.draft.create", detail_json: detail({ companyId: "company-a", rootCode: "A0001" }) },
        validDelete("A0001")],
      reservations: [{ code: "A0002" }, { code: "A0003" }],
    });

    await expect(readV3OccupiedRootCodes(client, "company-a")).resolves.toEqual(["A0002", "A0003"]);
    const reservationSql = query.mock.calls[3][0] as string;
    expect(reservationSql).toContain("number_kind = 'root' AND reservation_status = 'reserved'");
    expect(reservationSql).toContain("draft_item_type = 'root'");
    expect(reservationSql).toContain("reservation_state IN ('active', 'review_locked', 'approved_locked', 'promoted', 'recycled')");
    expect(query.mock.calls[3][1]).toEqual({ companyId: "company-a" });
  });

  it("ignores another tenant's audit identity and releases only within the requested tenant", async () => {
    const { client, query } = clientWithRows({ audits: [
      { action: "numbering.draft.create", detail_json: detail({ companyId: "company-b", rootCode: "A0001" }) },
      validDelete("A0002", "id-A0002", "company-b"),
    ] });

    await expect(readV3OccupiedRootCodes(client, "company-a")).resolves.toEqual([]);
    for (const [, params] of query.mock.calls) expect(params).toEqual({ companyId: "company-a" });
  });
});
