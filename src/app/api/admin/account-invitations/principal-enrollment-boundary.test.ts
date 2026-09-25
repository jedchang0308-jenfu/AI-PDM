import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  authMode: vi.fn(),
  createLegacyInvitation: vi.fn(),
  createLocalInvitation: vi.fn(),
  principalToken: vi.fn(),
  principalInput: vi.fn(),
  principalVerify: vi.fn(),
  principalFailure: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.authorize }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode }));
vi.mock("@/lib/account-invitations", () => ({
  AccountInvitationError: class AccountInvitationError extends Error {},
  createAccountInvitationAsync: mocks.createLocalInvitation,
  listAccountInvitationsAsync: vi.fn(),
  revokeAccountInvitationAsync: vi.fn()
}));
vi.mock("@/lib/firebase-managed-invitations", () => ({
  createFirebaseManagedInvitation: mocks.createLegacyInvitation,
  revokeFirebaseManagedInvitation: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.principalToken,
  principalRequestInput: mocks.principalInput,
  principalRequestFailure: mocks.principalFailure
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.principalVerify
}));

import { POST } from "@/app/api/admin/account-invitations/route";

describe("principal-first enrollment boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorize.mockResolvedValue({ user: { id: "admin-profile" }, response: null });
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.principalToken.mockReturnValue(null);
    mocks.principalInput.mockReturnValue({ token: "principal-session" });
    mocks.principalVerify.mockResolvedValue(true);
    mocks.principalFailure.mockReturnValue(new Response(null, { status: 401 }));
  });

  it("rejects UID-backed invitation creation without writing an identity or profile", async () => {
    const response = await POST(new Request("https://pdm.example/api/admin/account-invitations", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "new@jenfu.com.tw", role: "Admin" })
    }));
    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "principal_enrollment_required" });
    expect(mocks.createLegacyInvitation).not.toHaveBeenCalled();
    expect(mocks.createLocalInvitation).not.toHaveBeenCalled();
  });

  it("does not let an unauthorized caller probe the enrollment state", async () => {
    mocks.authorize.mockResolvedValue({ user: null, response: new Response(null, { status: 401 }) });
    const response = await POST(new Request("https://pdm.example/api/admin/account-invitations", { method: "POST" }));
    expect(response?.status).toBe(401);
    expect(mocks.authMode).not.toHaveBeenCalled();
  });

  it("returns the principal enrollment direction only after verifying a v2 session", async () => {
    mocks.principalToken.mockReturnValue("principal-session");
    const request = new Request("https://pdm.example/api/admin/account-invitations", { method: "POST" });
    const response = await POST(request);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "principal_enrollment_required" });
    expect(mocks.principalVerify).toHaveBeenCalledWith({ token: "principal-session" }, expect.any(Function));
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.createLocalInvitation).not.toHaveBeenCalled();

    mocks.principalVerify.mockRejectedValue(new Error("invalid v2 session"));
    expect((await POST(request)).status).toBe(401);
    expect(mocks.createLocalInvitation).not.toHaveBeenCalled();
  });
});
