import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), input: vi.fn(), failure: vi.fn(),
  authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), permission: vi.fn(),
  queryOne: vi.fn(), delivery: vi.fn()
}));
vi.mock("@/lib/auth-config", () => ({
  getAuthMode: mocks.authMode, getJenfuPlatformAuthMode: mocks.platformMode
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: mocks.input,
  principalRequestFailure: mocks.failure
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.verifiedRead
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.permission
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-release-package-delivery", () => ({
  deliverPrincipalReleasePackage: mocks.delivery
}));

import { GET as handoffPackage } from "@/app/api/handoff/[id]/release-package/route";
import { GET as procurementPackage } from "@/app/api/integrations/procurement/releases/[id]/package/route";

const verified = {
  session: { principalId: "principal-1" },
  profile: { pdmUserId: "profile-1", companyId: "company-1" }
};
const snapshot = { queryOne: mocks.queryOne };
const context = { params: Promise.resolve({ id: "submission-1" }) };
const routes = [
  { get: handoffPackage, path: "src/app/api/handoff/[id]/release-package/route.ts",
    url: "/api/handoff/submission-1/release-package",
    code: "handoff.published.view", scope: "published handoff company" },
  { get: procurementPackage,
    path: "src/app/api/integrations/procurement/releases/[id]/package/route.ts",
    url: "/api/integrations/procurement/releases/submission-1/package",
    code: "integration.procurement.view", scope: "published procurement company" }
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockReturnValue("principal-token");
  mocks.input.mockReturnValue({ token: "principal-token" });
  mocks.failure.mockImplementation(() =>
    Response.json({ code: "auth_session_invalid" }, { status: 401 }));
  mocks.authMode.mockReturnValue("firebase_bff");
  mocks.platformMode.mockReturnValue("on");
  mocks.entitlementMode.mockReturnValue("enforce");
  mocks.policy.mockImplementation((path: string) => ({ path,
    authorizationMode: "permission",
    scopeResolver: path.includes("procurement")
      ? "published procurement company" : "published handoff company" }));
  mocks.verifiedRead.mockImplementation(async (_input, evaluate) => evaluate(snapshot, verified));
  mocks.permission.mockImplementation(async (_snapshot, _verified, requested) => [{
    allowed: true, principalId: "principal-1", permissionCode: requested[0].permissionCode,
    decisionCode: "allowed"
  }]);
  mocks.queryOne.mockImplementation(async (sql: string) => sql.includes("release_packages")
    ? { id: "package-1", submission_id: "submission-1" }
    : { id: "submission-1", company_id: "company-1" });
  mocks.delivery.mockResolvedValue(new Response("ZIP", { status: 200 }));
});

describe("published package Principal access", () => {
  it.each(routes)("uses $code with the same-company current Released row before delivery", async (route) => {
    const request = new Request("https://ai-pdm.test" + route.url);
    expect((await route.get(request, context)).status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(route.path, "GET",
      { expectedPermissionCode: route.code });
    expect(mocks.permission).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: route.code }]);
    expect(mocks.queryOne).toHaveBeenCalledTimes(2);
    const [sql, parameters] = mocks.queryOne.mock.calls[0];
    expect(sql).toContain("s.company_id=:companyId");
    expect(sql).toContain("s.status='Released'");
    expect(sql).toContain("NOT EXISTS");
    expect(parameters).toEqual({ id: "submission-1", companyId: "company-1" });
    expect(mocks.delivery).toHaveBeenCalledWith(request, "submission-1",
      route.path.replace(/^src\/app/u, "").replace(/\/route\.ts$/u, ""), {
        releasePackage: { id: "package-1", submission_id: "submission-1" },
        principalId: "principal-1", profileId: "profile-1", companyId: "company-1"
      });
  });

  it.each(routes)("fails closed on denied $code before resource or storage", async (route) => {
    mocks.permission.mockResolvedValue([{ allowed: false, principalId: "principal-1",
      permissionCode: route.code, decisionCode: "permission_not_granted" }]);
    expect((await route.get(new Request("https://ai-pdm.test" + route.url), context)).status).toBe(403);
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("rejects other-company, non-current or unpublished records before package read", async () => {
    const request = new Request("https://ai-pdm.test" + routes[0].url);
    mocks.queryOne.mockResolvedValueOnce({ id: "submission-1", company_id: "company-2" });
    expect((await handoffPackage(request, context)).status).toBe(404);
    mocks.queryOne.mockResolvedValueOnce(null);
    expect((await handoffPackage(request, context)).status).toBe(404);
    expect(mocks.queryOne).toHaveBeenCalledTimes(2);
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("rejects mismatched package ownership and invalid Principal decision", async () => {
    const request = new Request("https://ai-pdm.test" + routes[0].url);
    mocks.queryOne.mockImplementation(async (sql: string) => sql.includes("release_packages")
      ? { id: "package-1", submission_id: "submission-2" }
      : { id: "submission-1", company_id: "company-1" });
    expect((await handoffPackage(request, context)).status).toBe(503);
    mocks.permission.mockResolvedValue([{ allowed: true, principalId: "other",
      permissionCode: "handoff.published.view", decisionCode: "allowed" }]);
    expect((await handoffPackage(request, context)).status).toBe(503);
    expect(mocks.delivery).not.toHaveBeenCalled();
  });

  it("rejects absent session or route policy without querying permissions", async () => {
    const request = new Request("https://ai-pdm.test" + routes[0].url);
    mocks.token.mockReturnValueOnce(null);
    expect((await handoffPackage(request, context)).status).toBe(401);
    mocks.policy.mockReturnValueOnce(null);
    expect((await handoffPackage(request, context)).status).toBe(503);
    expect(mocks.permission).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
});
