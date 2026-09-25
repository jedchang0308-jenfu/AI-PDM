import { describe, expect, it, vi } from "vitest";
import { resolvePrincipalCompanyContextInSnapshot } from "@/lib/company-context";

const verified = { profile: { pdmUserId: "profile-1", companyId: "company-jenfu" } } as never;
const companyRow = { id: "company-jenfu", company_code: "JENFU", company_kind: "business", display_name: "鉦富" };

describe("DEV-121 principal company context", () => {
  it("reads only the company owned by the verified principal account", async () => {
    const query = vi.fn(async (_sql: string, _params: Record<string, unknown>) => [companyRow]);
    const result = await resolvePrincipalCompanyContextInSnapshot({ query } as never,
      verified, { state: "absent" });
    expect(result.company).toMatchObject({ companyId: "company-jenfu", companyCode: "JENFU" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM ai_pdm_core.companies WHERE id=:companyId"),
      { companyId: "company-jenfu" });
    expect(query.mock.calls[0][0]).not.toContain("user_company_memberships");
  });

  it("rejects another requested company without consulting legacy memberships", async () => {
    const query = vi.fn(async () => [companyRow]);
    const result = await resolvePrincipalCompanyContextInSnapshot({ query } as never,
      verified, { state: "valid", companyCode: "MAXIMA" });
    expect(result.response?.status).toBe(403);
    expect(query).not.toHaveBeenCalled();
  });

  it("fails closed on missing or conflicting company readback", async () => {
    const query = vi.fn(async () => [{ ...companyRow, company_code: "MAXIMA" }]);
    await expect(resolvePrincipalCompanyContextInSnapshot({ query } as never,
      verified, { state: "absent" })).rejects.toMatchObject({ code: "principal_dependency_unavailable" });
  });
});
