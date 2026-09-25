import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalToken: vi.fn(),
  principalGuard: vi.fn(),
  legacyGuard: vi.fn(),
  legacyCompany: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.principalToken
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requirePrincipalNumberingPermissionAsync: mocks.principalGuard,
  requireNumberingPermissionAsync: mocks.legacyGuard
}));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => ({ state: "absent" }),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));

import { requireNumberingCompanyPermissionAsync } from "@/lib/numbering-company-permission";

const request = new Request("https://example.test/api/numbering/search");
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business", displayName: "鉦富" };
const principalUser = { id: "profile-1", role: "Principal", authorizationActor: {
  principalId: "principal-1", localPrincipalId: "profile-1", companyId: "company-jenfu", sessionSchemaVersion: 2
} };

describe("DEV-121 shared numbering company permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principalToken.mockReturnValue("principal-token");
    mocks.principalGuard.mockResolvedValue({ user: principalUser, permission: { allowed: true }, company, response: null });
  });

  it("uses only the verified principal company for a v2 workspace read", async () => {
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response).toBeNull();
    expect(result.company).toMatchObject({ companyId: "company-jenfu" });
    expect(mocks.principalGuard).toHaveBeenCalledWith(request, "page", "numbering.search", { state: "absent" });
    expect(mocks.legacyGuard).not.toHaveBeenCalled();
    expect(mocks.legacyCompany).not.toHaveBeenCalled();
  });

  it("rejects any company mismatch without falling back to old membership", async () => {
    mocks.principalGuard.mockResolvedValue({ user: principalUser, permission: { allowed: true },
      company: { ...company, companyId: "company-other" }, response: null });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(403);
    expect(mocks.legacyCompany).not.toHaveBeenCalled();
  });

  it("does not accept an incomplete principal permission decision", async () => {
    mocks.principalGuard.mockResolvedValue({ user: principalUser, permission: null, company, response: null });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(403);
    expect(mocks.legacyCompany).not.toHaveBeenCalled();
  });

  it("keeps the v1 company path only for a v1 request", async () => {
    mocks.principalToken.mockReturnValue(null);
    mocks.legacyGuard.mockResolvedValue({ user: { id: "legacy-profile", role: "Engineer" },
      permission: { allowed: true }, response: null });
    mocks.legacyCompany.mockResolvedValue({ company, response: null });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response).toBeNull();
    expect(result.company?.companyId).toBe("company-jenfu");
    expect(mocks.principalGuard).not.toHaveBeenCalled();
    expect(mocks.legacyCompany).toHaveBeenCalledWith("legacy-profile", { state: "absent" });
  });
});
