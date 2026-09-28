import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from
  "@/lib/repositories/approval-platform-async-repository";

describe("Principal approval inbox source boundary", () => {
  it("reads only assigned, supported PDM reviews without querying legacy approval sources", async () => {
    const query = vi.fn(async (_sql: string, _params: Record<string, unknown>) => [{
      id: "review-one", company_id: "company-jenfu", request_kind: "part_change",
      entity_type: "part", canonical_entity_id: "part-one", reviewer_user_id: "profile-one",
      requested_at: "2026-09-28T01:00:00Z", requested_by: "profile-two",
      requested_by_name: "Requester", target_code: "P-001", target_name: "Part one",
      revision: null
    }]);
    const client = { kind: "postgres", query } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalInbox({
      companyId: "company-jenfu", actorId: "profile-one", status: "active", limit: 10
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      source: "pdm_work_review", id: "review-one", companyId: "company-jenfu"
    });
    expect(page.summary).toMatchObject({ total: 1, pending: 1 });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("FROM pdm_work_review_requests review");
    expect(sql).toContain("review.reviewer_user_id = :actorId");
    expect(params).toMatchObject({ companyId: "company-jenfu", actorId: "profile-one" });
    expect(Object.values(params)).toContain("part_change");
    expect(Object.values(params)).toContain("drawing_revision");
    expect(Object.values(params)).not.toContain("drawing_rd_void");
  });
});
