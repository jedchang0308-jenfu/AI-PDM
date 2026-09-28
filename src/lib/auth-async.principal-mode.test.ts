import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  database: vi.fn()
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
  getAuthMode: () => "demo"
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

import { requirePdmRouteAuthorizationAsync } from "@/lib/auth-async";

describe("principal-only authorization mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
