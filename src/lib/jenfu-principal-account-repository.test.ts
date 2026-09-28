import { describe, expect, it, vi } from "vitest";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";

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

  it("rejects missing, disabled, wrong-principal, or under-assured privileged accounts", async () => {
    const queryOne = vi.fn();
    const repository = new JenfuPrincipalAccountRepository({ kind: "postgres", queryOne } as never);
    for (const candidate of [null, { ...row, account_status: "suspended" },
      { ...row, principal_id: "principal-two" }, { ...row, account_type: "human_privileged", minimum_assurance: "aal1" }]) {
      queryOne.mockResolvedValueOnce(candidate);
      await expect(repository.requireActive("principal-one")).rejects.toThrow("principal_account_unavailable");
    }
    expect(queryOne).toHaveBeenCalledTimes(4);
  });

  it("rejects non-PostgreSQL reads instead of falling back to a UID mapping", async () => {
    const queryOne = vi.fn();
    await expect(new JenfuPrincipalAccountRepository({ kind: "sqlite", queryOne } as never).requireActive("principal-one"))
      .rejects.toThrow("principal_account_unavailable");
    expect(queryOne).not.toHaveBeenCalled();
  });
});
