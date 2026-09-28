import { describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PrincipalWorkspaceDecision } from "@/lib/jenfu-principal-permission-service";
import { AsyncTransferPackageRepository } from "@/lib/repositories/transfer-package-async-repository";

const decision = (roleCode: string | null, principalId = "principal-actor"): PrincipalWorkspaceDecision => ({
  allowed: true, permissionCode: "transfer.package.update", decisionCode: "allowed",
  roleCode, assignmentId: "assignment-one", principalId, authorityVersion: 2
});

function fixture(ownerPrincipalId: string | null) {
  const row = { id: "package-one", company_id: "company-one", owner_id: "profile-owner",
    package_status: "Draft", row_version: 1, review_request_id: null };
  const query = vi.fn(async (sql: string) => sql.includes("principal_accounts")
    ? ownerPrincipalId ? [{ principal_id: ownerPrincipalId }] : [] : []);
  const queryOne = vi.fn(async (sql: string) => sql.includes("UPDATE transfer_packages")
    ? { id: row.id } : row);
  const execute = vi.fn(async () => undefined);
  const client = { kind: "postgres", query, queryOne, execute,
    transaction: async (fn: (database: AsyncDatabaseClient) => Promise<unknown>) => fn(client as AsyncDatabaseClient),
    close: async () => undefined } as AsyncDatabaseClient;
  return { repository: new AsyncTransferPackageRepository(client), query, queryOne, execute };
}

function input(principalDecision: PrincipalWorkspaceDecision | null) {
  return { packageId: "package-one", actor: { userId: "profile-actor", companyId: "company-one",
      role: "Admin", principalId: "principal-actor", principalDecision },
    expectedRowVersion: 1, title: "Updated title", caseType: "design_change_case" as const,
    caseReason: "Customer request", sourceReferenceStatus: "provided" as const,
    sourceReference: "ECO-1", sourceReferenceReason: null };
}

describe("transfer package Principal owner decision", () => {
  it("rejects legacy role and local profile equality without a current Principal decision", async () => {
    const { repository, query, execute } = fixture("principal-actor");
    await expect(repository.updateHeader(input(null))).rejects.toMatchObject({
      code: "TRANSFER_PACKAGE_FORBIDDEN", status: 403
    });
    expect(query).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("allows an active package owner's matching principal in the same transaction", async () => {
    const { repository, query, execute } = fixture("principal-actor");
    const result = await repository.updateHeader(input(decision("rd")));
    expect(result.id).toBe("package-one");
    expect(query).toHaveBeenCalledWith(expect.stringContaining("account.account_status = 'active'"),
      { ownerId: "profile-owner", companyId: "company-one" });
    expect(execute).toHaveBeenCalled();
  });

  it("denies an unrelated or inactive owner despite a valid workspace grant", async () => {
    for (const owner of ["principal-other", null]) {
      const { repository, execute } = fixture(owner);
      await expect(repository.updateHeader(input(decision("rd")))).rejects.toMatchObject({
        code: "TRANSFER_PACKAGE_FORBIDDEN", status: 403
      });
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("allows only the current published manager role to manage another owner's package", async () => {
    const { repository, query } = fixture("principal-other");
    expect((await repository.updateHeader(input(decision("rd_manager")))).id).toBe("package-one");
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining("principal_accounts"), expect.anything());
    await expect(repository.updateHeader(input(decision("rd_manager", "principal-other")))).rejects.toMatchObject({
      code: "TRANSFER_PACKAGE_FORBIDDEN", status: 403
    });
  });
});
