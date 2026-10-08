import { describe, expect, it, vi } from "vitest";
import { JenfuPrincipalAccountError, JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";

const row = {
  principal_id: "principal-one", pdm_user_id: "pdm-user-one", employee_id: "employee-one",
  account_type: "human_personal", company_id: "company-one", lifecycle_version: "3",
  profile_version: "2", account_status: "active", system_role_enabled: true,
  minimum_assurance: "aal1", session_invalid_before: null,
};

describe("AI-PDM principal account readback", () => {
  it("reads only the active principal-to-profile link", async () => {
    const queryOne = vi.fn(async (_sql: string, _params: { principalId: string }) => row);
    const account = await new JenfuPrincipalAccountRepository({ kind: "postgres", queryOne } as never).requireActive("principal-one");
    expect(account).toMatchObject({ principalId: "principal-one", pdmUserId: "pdm-user-one", lifecycleVersion: 3, profileVersion: 2 });
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining("FROM ai_pdm_core.principal_accounts account"),
      { principalId: "principal-one" });
    expect(queryOne.mock.calls[0][0]).not.toContain("principal_identity_cutovers");
  });

  it("accepts privileged AAL1 metadata and distinguishes a missing account from malformed state", async () => {
    const queryOne = vi.fn();
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres", queryOne } as never);
    const privileged = await new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => ({ ...row, account_type: "human_privileged", minimum_assurance: "aal1" })) } as never)
      .requireActive("principal-one");
    expect(privileged).toMatchObject({ accountType: "human_privileged", minimumAssurance: "aal1" });
    queryOne.mockResolvedValueOnce(null);
    await expect(repository.requireActive("principal-one"))
      .rejects.toMatchObject({ code: "principal_account_missing" });
    for (const candidate of [{ ...row, principal_id: "principal-two" },
      { ...row, minimum_assurance: "aal2" }, { ...row, account_status: "unknown" },
      { ...row, account_status: "suspended", employee_id: "" },
      { ...row, account_status: "suspended", company_id: 42 },
      { ...row, account_status: "suspended", lifecycle_version: "invalid" },
      { ...row, account_status: "suspended", profile_version: true },
      { ...row, account_status: "suspended", system_role_enabled: "false" },
      { ...row, account_status: "suspended", session_invalid_before: "invalid" }]) {
      queryOne.mockResolvedValueOnce(candidate);
      await expect(repository.requireActive("principal-one")).rejects.toThrow("principal_account_unavailable");
    }
    expect(queryOne).toHaveBeenCalledTimes(10);
  });

  it.each(["suspended", "expired", "offboarded"])("classifies a valid %s owner account as inactive", async accountStatus => {
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => ({ ...row, account_status: accountStatus, system_role_enabled: false })) } as never);
    await expect(repository.requireActive("principal-one"))
      .rejects.toMatchObject({ code: "principal_account_inactive" });
  });

  it.each([false, 0])("classifies a valid disabled system role (%s) as inactive", async enabled => {
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => ({ ...row, system_role_enabled: enabled })) } as never);
    await expect(repository.requireActive("principal-one"))
      .rejects.toMatchObject({ code: "principal_account_inactive" });
  });

  it("keeps a database read failure unavailable without leaking its detail", async () => {
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => { throw new Error("private database failure"); }) } as never);
    await expect(repository.requireActive("principal-one"))
      .rejects.toMatchObject({ code: "principal_account_unavailable", message: "principal_account_unavailable" });
  });

  it("does not trust an inactive-shaped exception from the database read", async () => {
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => { throw new JenfuPrincipalAccountError("principal_account_inactive"); }) } as never);
    await expect(repository.requireActive("principal-one"))
      .rejects.toMatchObject({ code: "principal_account_unavailable" });
  });

  it("rejects non-PostgreSQL reads instead of falling back to a UID mapping", async () => {
    const queryOne = vi.fn();
    await expect(new JenfuPrincipalAccountRepository({ kind: "sqlite", queryOne } as never).requireActive("principal-one"))
      .rejects.toThrow("principal_account_unavailable");
    expect(queryOne).not.toHaveBeenCalled();
  });

  it("invokes the owner first-login command with verified identity facts and validates its receipt", async () => {
    const queryOne = vi.fn(async () => ({ receipt: {
      created: true, principalId: "principal-one", pdmUserId: "pdm-user-one",
      companyId: "company-jenfu", accountStatus: "active",
      lifecycleVersion: 1, profileVersion: 1
    } }));
    const receipt = await new JenfuPrincipalAccountRepository({ kind: "postgres", queryOne } as never)
      .ensureFirstLogin({
        identityIssuer: "https://securetoken.google.com/jenfu-platform-prod",
        identitySubject: "subject-one", principalId: "principal-one",
        employeeId: "employee-one", accountType: "human_personal", mappingVersion: 7,
        publishedAt: "2026-10-08T00:00:00.000Z", verifiedEmail: "one@jenfu.com.tw"
      });
    expect(receipt).toMatchObject({ created: true, principalId: "principal-one",
      pdmUserId: "pdm-user-one", accountStatus: "active" });
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining(
      "ensure_authorized_first_login_account_v1"), expect.objectContaining({
        principalId: "principal-one", employeeId: "employee-one",
        verifiedEmail: "one@jenfu.com.tw"
      }));
  });

  it("keeps first-login identity conflicts typed and lets serializable races retry", async () => {
    const conflict = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => { throw new Error("AIPDM_FIRST_LOGIN_IDENTITY_CONFLICT"); }) } as never);
    const input = {
      identityIssuer: "issuer-one", identitySubject: "subject-one",
      principalId: "principal-one", employeeId: "employee-one",
      accountType: "human_personal" as const, mappingVersion: 1,
      publishedAt: "2026-10-08T00:00:00.000Z", verifiedEmail: "one@jenfu.com.tw"
    };
    await expect(conflict.ensureFirstLogin(input))
      .rejects.toMatchObject({ code: "principal_account_conflict" });
    const race = Object.assign(new Error("serialization retry"), { code: "40001" });
    const retry = new JenfuPrincipalAccountRepository({ kind: "postgres",
      queryOne: vi.fn(async () => { throw race; }) } as never);
    await expect(retry.ensureFirstLogin(input)).rejects.toBe(race);
  });
});
