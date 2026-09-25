import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ legacyAuth: vi.fn(), update: vi.fn(), allowedOrigin: vi.fn() }));
vi.mock("@/lib/account-lifecycle", () => ({
  AccountLifecycleError: class extends Error {}, updateAdminAccountLifecycleAsync: vi.fn()
}));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/auth-config", () => ({ getAuthMode: () => "firebase_bff", getJenfuPlatformAuthMode: () => "on" }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: (request: Request) => request.headers.get("x-principal-token"),
  principalRequestInput: (token: string) => ({ token }),
  principalRequestFailure: () => new Response(null, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-lifecycle-service", () => ({
  PrincipalLifecycleError: class extends Error {}, updatePrincipalAccountLifecycle: mocks.update
}));
vi.mock("@/lib/request-origin", () => ({ isAllowedRequestOrigin: mocks.allowedOrigin }));

import { POST } from "@/app/api/admin/accounts/[userId]/lifecycle/route";

function request() {
  return new Request("https://pdm.example/api/admin/accounts/pdm-target/lifecycle", {
    method: "POST", headers: { "x-principal-token": "signed-principal",
      origin: "https://pdm.example", "content-type": "application/json" },
    body: JSON.stringify({ operationId: "lifecycle-one", action: "suspend", reason: "review" })
  });
}

describe("principal account lifecycle route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.allowedOrigin.mockReturnValue(true);
    mocks.update.mockResolvedValue({ operationId: "lifecycle-one", pdmUserId: "pdm-target",
      accountStatus: "suspended" });
  });

  it("uses only the principal command and exact target profile", async () => {
    const response = await POST(request(), { params: Promise.resolve({ userId: "pdm-target" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ subjectMode: "principal",
      account: { accountStatus: "suspended" } });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      pdmUserId: "pdm-target", token: "signed-principal",
      body: { operationId: "lifecycle-one", action: "suspend", reason: "review" }
    }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("rejects cross-origin before running a principal mutation", async () => {
    mocks.allowedOrigin.mockReturnValue(false);
    expect((await POST(request(), { params: Promise.resolve({ userId: "pdm-target" }) })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
