import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ legacyAuth: vi.fn(), revoke: vi.fn(), allowedOrigin: vi.fn() }));
vi.mock("@/lib/account-lifecycle", () => ({
  AccountLifecycleError: class extends Error {}, revokeAdminAccountSessionsAsync: vi.fn()
}));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on" }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: (request: Request) => request.headers.get("x-principal-token"),
  principalRequestInput: (token: string) => ({ token }),
  principalRequestFailure: () => new Response(null, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-admin-session-revoke", () => ({
  PrincipalAdminSessionRevokeError: class extends Error {},
  revokePrincipalAccountSessions: mocks.revoke
}));
vi.mock("@/lib/request-origin", () => ({ isAllowedRequestOrigin: mocks.allowedOrigin }));

import { POST } from "@/app/api/admin/accounts/[userId]/sessions/revoke/route";

function request() {
  return new Request("https://pdm.example/api/admin/accounts/pdm-target/sessions/revoke", {
    method: "POST", headers: { "x-principal-token": "signed-principal",
      origin: "https://pdm.example", "content-type": "application/json" },
    body: JSON.stringify({ operationId: "revoke-target-one", reason: "security review" })
  });
}

describe("principal admin session revoke route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowedOrigin.mockReturnValue(true);
    mocks.revoke.mockResolvedValue({ operationId: "revoke-target-one",
      pdmUserId: "pdm-target", accountStatus: "active", lifecycleVersion: 3 });
  });

  it("keeps the target on the principal command and avoids legacy auth", async () => {
    const response = await POST(request(), { params: Promise.resolve({ userId: "pdm-target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjectMode: "principal",
      account: { accountStatus: "active", lifecycleVersion: 3 } });
    expect(mocks.revoke).toHaveBeenCalledWith(expect.objectContaining({
      pdmUserId: "pdm-target", token: "signed-principal",
      body: { operationId: "revoke-target-one", reason: "security review" }
    }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("rejects cross-origin mutation before executing the owner command", async () => {
    mocks.allowedOrigin.mockReturnValue(false);
    expect((await POST(request(), { params: Promise.resolve({ userId: "pdm-target" }) })).status).toBe(403);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
});
