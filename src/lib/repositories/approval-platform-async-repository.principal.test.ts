import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalPlatformRepository } from
  "@/lib/repositories/approval-platform-async-repository";

describe("Principal approval inbox source boundary", () => {
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
    const query = vi.fn(async (sql: string, _params: Record<string, unknown>) => sql.includes("FROM pdm_work_review_requests review") ? [{
      id: "review-one", company_id: "company-jenfu", request_kind: "part_change",
      entity_type: "part", canonical_entity_id: "part-one", reviewer_user_id: "profile-one",
      requested_at: "2026-09-28T01:00:00Z", requested_by: "profile-two",
      requested_by_name: "Requester", target_code: "P-001", target_name: "Part one",
      revision: null
    }] : []);
    const client = { kind: "postgres", query } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalWorkReviewInbox({
      companyId: "company-jenfu", actorId: "profile-one", principalId: "principal-one",
      status: "active", limit: 10
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      source: "pdm_work_review", id: "review-one", companyId: "company-jenfu"
    });
    expect(page.summary).toMatchObject({ total: 1, pending: 1 });
    expect(query).toHaveBeenCalledTimes(2);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("FROM pdm_work_review_requests review");
    expect(sql).toContain("review.reviewer_user_id = :actorId");
    expect(params).toMatchObject({ companyId: "company-jenfu", actorId: "profile-one" });
    expect(Object.values(params)).toContain("part_change");
    expect(Object.values(params)).toContain("drawing_revision");
    expect(Object.values(params)).toContain("drawing_rd_void");
    const [transferSql, transferParams] = query.mock.calls[1];
    expect(transferSql).toContain("request.payload_json->'reviewer'->>'principalId' = :principalId");
    expect(transferParams).toMatchObject({ principalId: "principal-one", actorId: "profile-one" });
  });

  it("includes only a transfer request bound to the verified principal and profile", async () => {
    const query = vi.fn(async (sql: string, _params: Record<string, unknown>) => sql.includes("FROM approval_platform_requests request") ? [{
      id: "APR-TRF-00000000-0000-4000-8000-000000000001", company_id: "company-jenfu",
      title: "技轉包審核", reason: "ready", requested_by: "profile-owner",
      requested_by_name: "Owner", requested_at: "2026-09-29T00:00:00Z",
      transfer_package_id: "package-one", package_status: "InReview"
    }] : []);
    const client = { kind: "postgres", query } as unknown as AsyncDatabaseClient;
    const page = await new AsyncApprovalPlatformRepository(client).listPrincipalWorkReviewInbox({
      companyId: "company-jenfu", actorId: "profile-reviewer", principalId: "principal-reviewer",
      status: "active", limit: 10
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ source: "platform", actionCode: "transfer.package_review",
      packageId: "package-one", primaryTarget: { type: "transfer_package", targetId: "package-one" } });
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain("package.review_snapshot_hash = request.payload_json->>'snapshotHash'");
    expect(params).toMatchObject({ companyId: "company-jenfu", actorId: "profile-reviewer",
      principalId: "principal-reviewer" });
  });
});
