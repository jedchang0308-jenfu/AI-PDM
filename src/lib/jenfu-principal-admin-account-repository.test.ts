import { describe, expect, it, vi } from "vitest";
import { JenfuPrincipalAdminAccountRepository } from "@/lib/jenfu-principal-admin-account-repository";

const row = {
  id: "pdm-one", principal_id: "principal-one", employee_id: "employee-one",
  account_type: "human_personal", display_name: "Person One", email: "one@example.com",
  company_id: "company-jenfu", company_name: "Jenfu", account_status: "active",
  system_role_enabled: true, lifecycle_version: "4", profile_version: "3",
  session_invalid_before: null
};

describe("principal admin account projection", () => {
  it("lists exact workspace accounts from principal state without old membership or user role", async () => {
    const query = vi.fn().mockResolvedValue([row]);
    const repository = new JenfuPrincipalAdminAccountRepository({ kind: "postgres", query } as never);
    expect(await repository.list("company-jenfu", { query: "%_", status: "active" }))
      .toMatchObject([{ id: "pdm-one", principalId: "principal-one", accountStatus: "active",
        lifecycleVersion: 4, profileVersion: 3 }]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("account.company_id=:companyId");
    expect(sql).toContain("cutover.status='principal_active'");
    expect(sql).not.toContain("user_company_memberships");
    expect(sql).not.toContain("profile.role");
    expect(params.query).toBe("%_");
  });

  it("rejects ambiguous status and unsafe version projection", async () => {
    const query = vi.fn().mockResolvedValue([{ ...row, profile_version: "9007199254740992" }]);
    const repository = new JenfuPrincipalAdminAccountRepository({ kind: "postgres", query } as never);
    await expect(repository.list("company-jenfu", { status: "unknown" }))
      .rejects.toThrow("PRINCIPAL_ADMIN_ACCOUNT_REQUEST_INVALID");
    await expect(repository.list("company-jenfu"))
      .rejects.toThrow("PRINCIPAL_ADMIN_ACCOUNT_CONTRACT_INVALID");
  });

  it("loads one profile inside the verified company", async () => {
    const queryOne = vi.fn().mockResolvedValue(row);
    const repository = new JenfuPrincipalAdminAccountRepository({ kind: "postgres", queryOne } as never);
    expect(await repository.getByProfile("company-jenfu", "pdm-one"))
      .toMatchObject({ principalId: "principal-one" });
    expect(queryOne.mock.calls[0][1]).toEqual({ companyId: "company-jenfu", pdmUserId: "pdm-one" });
  });
});
