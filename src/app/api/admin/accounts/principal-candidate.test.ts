import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyAuth: vi.fn(), withVerified: vi.fn(), evaluate: vi.fn(), listCandidates: vi.fn(),
  provision: vi.fn(), allowedOrigin: vi.fn(), listAccounts: vi.fn()
}));
vi.mock("@/lib/account-lifecycle", () => ({ AccountLifecycleError: class AccountLifecycleError extends Error {},
  listAdminAccountsAsync: vi.fn() }));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: () => "firebase_bff", getJenfuPlatformAuthMode: () => "on" }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: (request: Request) => request.headers.get("x-principal-token"),
  principalRequestInput: (token: string) => ({ token }),
  principalRequestFailure: () => new Response(null, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  JenfuPrincipalRequestError: class JenfuPrincipalRequestError extends Error {},
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-principal-candidate-repository", () => ({
  JenfuPrincipalCandidateRepository: class { listByPrincipal = mocks.listCandidates; }
}));
vi.mock("@/lib/jenfu-principal-admin-account-repository", () => ({
  JenfuPrincipalAdminAccountRepository: class { list = mocks.listAccounts; }
}));
vi.mock("@/lib/jenfu-principal-provision-service", () => ({
  JenfuPrincipalProvisionError: class JenfuPrincipalProvisionError extends Error {
    constructor(readonly code: string, readonly httpStatus: number) { super(code); }
  }, provisionPrincipalAccount: mocks.provision
}));
vi.mock("@/lib/request-origin", () => ({ isAllowedRequestOrigin: mocks.allowedOrigin }));

import { GET, POST } from "@/app/api/admin/accounts/route";

function request(query: string, principal = true) {
  return new Request(`https://pdm.example/api/admin/accounts${query}`,
    { headers: principal ? { "x-principal-token": "signed-principal-cookie" } : {} });
}

describe("principal candidate account view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({}, {
      session: { principalId: "actor-principal" }, profile: { companyId: "company-jenfu" }
    }));
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.listCandidates.mockResolvedValue([{ principalId: "target-principal", employeeId: "employee-one" }]);
    mocks.allowedOrigin.mockReturnValue(true);
  });

  it("uses the invitation capability and exact principal in the same verified snapshot", async () => {
    const response = await GET(request("?view=principal-candidate&principalId=target-principal"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ candidates: [{ principalId: "target-principal", employeeId: "employee-one" }] });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(),
      expect.objectContaining({ session: { principalId: "actor-principal" } }),
      [{ permissionKind: "action", permissionCode: "accounts.invitation.manage" }]);
    expect(mocks.listCandidates).toHaveBeenCalledWith("target-principal");
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("rejects missing principal proof and a denied capability before reading candidates", async () => {
    expect((await GET(request("?view=principal-candidate&principalId=target-principal", false))).status).toBe(401);
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    expect((await GET(request("?view=principal-candidate&principalId=target-principal"))).status).toBe(403);
    expect(mocks.listCandidates).not.toHaveBeenCalled();
  });

  it.each(["?view=unknown", "?view=", "?view=principal-candidate&view=principal-candidate",
    "?view=principal-candidate", "?view=principal-candidate&principalId=a&principalId=b"])
  ("rejects malformed view or selector %s", async (query) => {
    expect((await GET(request(query))).status).toBe(400);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});

describe("principal-only account creation route", () => {
  const request = (origin = true) => new Request("https://pdm.example/api/admin/accounts", {
    method: "POST", headers: {
      "content-type": "application/json", "x-principal-token": "signed-principal-cookie",
      ...(origin ? { origin: "https://pdm.example" } : {})
    }, body: JSON.stringify({ contractVersion: "ai-pdm.principal-provision.v1" })
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowedOrigin.mockReturnValue(true);
    mocks.provision.mockResolvedValue({ operationId: "one", replayed: false });
  });

  it("returns created then replay without using legacy role authorization", async () => {
    expect((await POST(request())).status).toBe(201);
    mocks.provision.mockResolvedValue({ operationId: "one", replayed: true });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("refuses a cross-origin mutation before reading a principal session", async () => {
    mocks.allowedOrigin.mockReturnValue(false);
    expect((await POST(request(false))).status).toBe(403);
    expect(mocks.provision).not.toHaveBeenCalled();
  });
});

describe("principal account list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate({}, {
      session: { principalId: "actor-principal" }, profile: { companyId: "company-jenfu" }
    }));
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.listAccounts.mockResolvedValue([{ id: "pdm-one", principalId: "target-principal",
      accountStatus: "active", companyId: "company-jenfu" }]);
  });

  it("reads principal account status by the verified workspace, never legacy user role", async () => {
    const response = await GET(request("?status=active&query=pdm"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjectMode: "principal",
      accounts: [{ id: "pdm-one", principalId: "target-principal" }] });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), expect.anything(),
      [{ permissionKind: "action", permissionCode: "accounts.lifecycle.manage" }]);
    expect(mocks.listAccounts).toHaveBeenCalledWith("company-jenfu",
      { query: "pdm", status: "active", limit: 100 });
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("denies before reading and rejects legacy security filters", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    expect((await GET(request(""))).status).toBe(403);
    expect(mocks.listAccounts).not.toHaveBeenCalled();
    expect((await GET(request("?role=Admin"))).status).toBe(400);
  });
});
