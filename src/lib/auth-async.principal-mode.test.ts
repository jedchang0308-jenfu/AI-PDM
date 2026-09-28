import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  database: vi.fn(),
  authMode: "demo" as string,
  platformMode: "off" as string
}));

vi.mock("@/lib/auth", () => ({
  forbidden: () => Response.json({ code: "forbidden" }, { status: 403 }),
  unauthorized: () => Response.json({ code: "unauthorized" }, { status: 401 }),
  getLegacySessionPayload: mocks.session,
  getSessionCookieToken: vi.fn(),
  getSessionToken: vi.fn()
}));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAuthMode: () => mocks.authMode,
  getJenfuPlatformAuthMode: () => mocks.platformMode
}));
vi.mock("@/lib/db-async-provider", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAsyncDatabaseClient: mocks.database
}));
vi.mock("@/lib/repositories/user-async-repository", () => ({
  AsyncUserRepository: class { getUserById = mocks.user; }
}));
vi.mock("@/lib/entitlement-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getJenfuEntitlementMode: () => "legacy"
}));

import { getSessionUserAsync, requireAuthAsync, requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";

describe("principal-only authorization mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authMode = "demo";
    mocks.platformMode = "off";
    mocks.database.mockReturnValue({ kind: "sqlite" });
    mocks.session.mockImplementation(() => ({ userId: "profile-one", createdAt: Date.now() }));
    mocks.user.mockResolvedValue({ id: "profile-one", role: "Admin", company_id: "company-jenfu",
      account_status: "active", system_role_enabled: true, session_invalid_before: null });
  });

  it("does not grant a listed local Admin role when the entitlement mode is legacy", async () => {
    const result = await requirePdmRouteAuthorizationAsync(
      new Request("https://ai-pdm.test/api/settings", { method: "GET" }), ["Admin"]);
    expect(result.response?.status).toBe(503);
    expect(await result.response?.json()).toMatchObject({ code: "principal_authorization_unavailable" });
    expect(result).not.toHaveProperty("authorizationRoleCode");
  });

  it("does not resolve a historical profile or v1 session in Platform mode", async () => {
    mocks.authMode = "firebase_bff";
    mocks.platformMode = "on";
    const request = new Request("https://ai-pdm.test/api/parts/workbench", { method: "GET" });

    expect(await getSessionUserAsync(request)).toBeNull();
    const result = await requireAuthAsync(request);

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(503);
    expect(await result.response?.json()).toEqual({ code: "principal_route_not_migrated" });
    const legacyRoute = await requirePdmRouteAuthorizationAsync(request, ["Admin"]);
    expect(legacyRoute.response?.status).toBe(503);
    expect(mocks.database).not.toHaveBeenCalled();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
