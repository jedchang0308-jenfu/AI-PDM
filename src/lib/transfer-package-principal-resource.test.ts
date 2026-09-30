import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { principalCanManageTransferPackageInSnapshot } from "@/lib/transfer-package-principal-resource";

const decision = (permissionCode: string, roleCode: string, principalId = "principal-one") => ({
  allowed: true, permissionCode, roleCode, principalId, decisionCode: "allowed",
  assignmentId: "assignment-one", publishedAssignmentVersion: 1
});

function fixture(ownerPrincipalId: string | null) {
  const query = vi.fn(async () => ownerPrincipalId ? [{ principal_id: ownerPrincipalId }] : []);
  return { client: { query } as unknown as AsyncDatabaseClient, query };
}

describe("Principal transfer package resource authorization", () => {
  it("uses the current permission decision and exact owner principal for review", async () => {
    const { client, query } = fixture("principal-one");
    const input = { client, companyId: "company-one", ownerProfileId: "profile-owner",
      actorPrincipalId: "principal-one", decision: decision("transfer.package.review.submit", "rd"),
      permissionCode: "transfer.package.review.submit" };
    expect(await principalCanManageTransferPackageInSnapshot(input)).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("account.account_status = 'active'"),
      { ownerId: "profile-owner", companyId: "company-one" });
    expect(await principalCanManageTransferPackageInSnapshot({ ...input,
      permissionCode: "transfer.package.review.withdraw" })).toBe(false);
    expect(await principalCanManageTransferPackageInSnapshot({ ...input,
      decision: decision("transfer.package.review.submit", "rd", "principal-other") })).toBe(false);
  });

  it("rejects an unlinked owner and only accepts a published manager decision as override", async () => {
    const { client, query } = fixture(null);
    const input = { client, companyId: "company-one", ownerProfileId: "profile-owner",
      actorPrincipalId: "principal-one", decision: decision("transfer.package.review.withdraw", "rd"),
      permissionCode: "transfer.package.review.withdraw" };
    expect(await principalCanManageTransferPackageInSnapshot(input)).toBe(false);
    expect(await principalCanManageTransferPackageInSnapshot({ ...input,
      decision: decision("transfer.package.review.withdraw", "rd_manager") })).toBe(true);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
