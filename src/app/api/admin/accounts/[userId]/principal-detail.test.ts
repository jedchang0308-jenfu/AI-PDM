import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyAuth: vi.fn(), withVerified: vi.fn(), evaluate: vi.fn(), getAccount: vi.fn()
}));
vi.mock("@/lib/account-lifecycle", () => ({
  AccountLifecycleError: class extends Error {}, getAdminAccountDetailAsync: vi.fn()
}));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: () => "firebase_bff", getJenfuPlatformAuthMode: () => "on" }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: (request: Request) => request.headers.get("x-principal-token"),
  principalRequestInput: (token: string) => ({ token }),
  principalRequestFailure: () => new Response(null, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  JenfuPrincipalRequestError: class extends Error {}, withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-principal-admin-account-repository", () => ({
  JenfuPrincipalAdminAccountRepository: class { getByProfile = mocks.getAccount; }
}));

import { GET } from "@/app/api/admin/accounts/[userId]/route";

describe("principal account detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({}, {
      profile: { companyId: "company-jenfu" }, session: { principalId: "actor" }
    }));
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.getAccount.mockResolvedValue({ id: "pdm-one", principalId: "principal-one",
      accountStatus: "active", companyId: "company-jenfu" });
  });

  const request = () => new Request("https://pdm.example/api/admin/accounts/pdm-one",
    { headers: { "x-principal-token": "signed-principal" } });

  it("reads target only after a current principal lifecycle decision", async () => {
    const response = await GET(request(), { params: Promise.resolve({ userId: "pdm-one" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjectMode: "principal",
      account: { id: "pdm-one", principalId: "principal-one" } });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      [{ permissionKind: "action", permissionCode: "accounts.lifecycle.manage" }]);
    expect(mocks.getAccount).toHaveBeenCalledWith("company-jenfu", "pdm-one");
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("denies before reading a target account", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    expect((await GET(request(), { params: Promise.resolve({ userId: "pdm-one" }) })).status).toBe(403);
    expect(mocks.getAccount).not.toHaveBeenCalled();
  });
});
