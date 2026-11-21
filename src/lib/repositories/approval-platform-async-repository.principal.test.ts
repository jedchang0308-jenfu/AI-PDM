import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from
  "@/lib/repositories/approval-platform-async-repository";

describe("Principal approval inbox source boundary", () => {
  it("counts authorized pending requests without materializing response rows or names", async () => {
    const query = vi.fn(() => { throw new Error("Count must not read names"); });
    const queryOne = vi.fn(async (_sql: string, _params: Record<string, unknown>) => ({ total: 4 }));
    const client = { kind: "postgres", query, queryOne } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalWorkReviewInbox({
      companyId: "company-one", actorId: "reviewer", principalId: "principal-reviewer", summaryOnly: true });
    expect(page.items).toEqual([]);
    expect(page.summary.pending).toBe(4);
    expect(query).not.toHaveBeenCalled();
    const [sql] = queryOne.mock.calls[0];
    expect(sql).toContain("count(*)");
    expect(sql).not.toContain("row_to_json");
    expect(sql).toContain("review.reviewer_user_id = :actorId");
  });

  it("projects submitter display names for my submitted reviews", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("FROM users")
      ? [{ id: "profile-one", email: "test@example.test", display_name: "App alias" }]
      : [{ id: "profile-one", employee_name: "張測試" }]);
    const queryOne = vi.fn(async (sql: string, params: { submitterName: string }) => {
      expect(sql).toContain("CAST(:submitterName AS text) AS requested_by_name");
      expect(params.submitterName).toBe("張測試");
      return {
        rows: [
          {
            id: "review-one", source: "pdm_work_review", action_code: "numbering.pdm_part_change_review",
            action_title: "料號變更審核", domain_code: "numbering", target_code: "P-001", title: "Part",
            requested_by: "profile-one", requested_by_name: params.submitterName,
            requested_at: "2026-09-28T01:00:00Z", status: "pending"
          },
          {
            id: "transfer-one", source: "platform", action_code: "transfer.package_review",
            action_title: "技轉包審核", domain_code: "transfer", target_code: "TP-001", title: "Transfer",
            requested_by: "profile-one", requested_by_name: params.submitterName,
            requested_at: "2026-09-27T01:00:00Z", status: "approved"
          }
        ], total: 2, pending: 1, needs_info: 0, apply_failed: 0
      };
    });
    const client = { kind: "postgres", query, queryOne } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalSubmittedReviews({
      companyId: "company-jenfu", actorId: "profile-one", readable: { drawing: true, part: true, transfer: true },
      status: "all", limit: 10
    });
    expect(page.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "review-one", requestedBy: "profile-one", requestedByName: "張測試" }),
      expect.objectContaining({ id: "transfer-one", requestedBy: "profile-one", requestedByName: "張測試" })
    ]));
  });

  it("does not read a native approval detail from another company", async () => {
    const queryOne = vi.fn(async () => ({ id: "APR-TRF-one", company_id: "company-other" }));
    const query = vi.fn();
    const client = { kind: "postgres", queryOne, query } as unknown as AsyncDatabaseClient;
    const detail = await new AsyncApprovalPlatformRepository(client).getRequestDetail(
      "APR-TRF-one", "company-jenfu");
    expect(detail).toBeNull();
    expect(queryOne).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it("reads only assigned, supported PDM reviews without querying legacy approval sources", async () => {
    const query = vi.fn(async () => []);
    const queryOne = vi.fn(async (_sql: string, _params: Record<string, unknown>) => ({ total: 1, page: [{ source: "pdm_work_review", payload: {
      id: "review-one", company_id: "company-jenfu", request_kind: "part_change",
      entity_type: "part", canonical_entity_id: "part-one", reviewer_user_id: "profile-one",
      requested_at: "2026-09-28T01:00:00Z", requested_by: "profile-two",
      requested_by_name: "Requester", target_code: "P-001", target_name: "Part one",
      revision: null
    } }] }));
    const client = { kind: "postgres", query, queryOne } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalWorkReviewInbox({
      companyId: "company-jenfu", actorId: "profile-one", principalId: "principal-one",
      status: "active", limit: 10
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      source: "pdm_work_review", id: "review-one", companyId: "company-jenfu"
    });
    expect(page.summary).toMatchObject({ total: 1, pending: 1 });
    expect(queryOne).toHaveBeenCalledTimes(1);
    const [sql, params] = (queryOne.mock.calls[0] as unknown as [string, Record<string, unknown>]);
    expect(sql).toContain("FROM pdm_work_review_requests review");
    expect(sql).toContain("review.reviewer_user_id = :actorId");
    expect(params).toMatchObject({ companyId: "company-jenfu", actorId: "profile-one" });
    expect(Object.values(params)).toContain("part_change");
    expect(Object.values(params)).toContain("drawing_revision");
    expect(Object.values(params)).toContain("drawing_rd_void");
    const [transferSql, transferParams] = (queryOne.mock.calls[0] as unknown as [string, Record<string, unknown>]);
    expect(transferSql).toContain("request.payload_json->'reviewer'->>'principalId' = :principalId");
    expect(transferParams).toMatchObject({ principalId: "principal-one", actorId: "profile-one" });
  });

  it("includes only a transfer request bound to the verified principal and profile", async () => {
    const query = vi.fn(async () => []);
    const queryOne = vi.fn(async (_sql: string, _params: Record<string, unknown>) => ({ total: 1, page: [{ source: "platform", payload: {
      id: "APR-TRF-00000000-0000-4000-8000-000000000001", company_id: "company-jenfu",
      title: "技轉包審核", reason: "ready", requested_by: "profile-owner",
      requested_by_name: "Owner", requested_at: "2026-09-29T00:00:00Z",
      transfer_package_id: "package-one", package_status: "InReview"
    } }] }));
    const client = { kind: "postgres", query, queryOne } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalWorkReviewInbox({
      companyId: "company-jenfu", actorId: "profile-reviewer", principalId: "principal-reviewer",
      status: "active", limit: 10
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ source: "platform", actionCode: "transfer.package_review",
      packageId: "package-one", primaryTarget: { type: "transfer_package", targetId: "package-one" } });
    const [sql, params] = queryOne.mock.calls[0];
    expect(sql).toContain("package.review_snapshot_hash = request.payload_json->>'snapshotHash'");
    expect(params).toMatchObject({ companyId: "company-jenfu", actorId: "profile-reviewer",
      principalId: "principal-reviewer" });
  });
});
