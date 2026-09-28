import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalToken: vi.fn(),
  principalGuard: vi.fn(),
}));

vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.principalToken
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requirePrincipalNumberingPermissionAsync: mocks.principalGuard
}));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => ({ state: "absent" })
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
  });

  it("rejects any company mismatch without falling back to old membership", async () => {
    mocks.principalGuard.mockResolvedValue({ user: principalUser, permission: { allowed: true },
      company: { ...company, companyId: "company-other" }, response: null });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(403);
  });

  it("does not accept an incomplete principal permission decision", async () => {
    mocks.principalGuard.mockResolvedValue({ user: principalUser, permission: null, company, response: null });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(403);
  });

  it("rejects a historical session without consulting local role or membership", async () => {
    mocks.principalToken.mockReturnValue(null);
    mocks.principalGuard.mockResolvedValue({ user: { id: "", role: "" }, permission: null,
      response: Response.json({ code: "auth_session_invalid" }, { status: 401 }) });
    const result = await requireNumberingCompanyPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(401);
    expect(result.company).toBeNull();
    expect(mocks.principalGuard).toHaveBeenCalledWith(request, "page", "numbering.search", { state: "absent" });
  });
});
