import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), scope: vi.fn(), company: vi.fn(),
  list: vi.fn(), metrics: vi.fn(), listClient: vi.fn(), metricsClient: vi.fn(),
  legacyAuth: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({
  getAuthMode: mocks.authMode, getJenfuPlatformAuthMode: mocks.platformMode
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: () => ({ token: "principal-session" }),
  principalRequestFailure: (error: { code?: string }) => Response.json({
    code: error.code === "auth_session_invalid" ? "auth_session_invalid" : "principal_dependency_unavailable"
  }, { status: error.code === "auth_session_invalid" ? 401 : 503 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.verifiedRead
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-submission-access", () => ({
  authorizePrincipalSubmissionListInSnapshot: mocks.scope
}));
vi.mock("@/lib/company-context", () => ({
  requestedPdmCompanyCodeFromRequest: () => ({ state: "absent" }),
  resolvePrincipalCompanyContextInSnapshot: mocks.company,
  resolvePdmCompanyContextAsync: vi.fn()
}));
vi.mock("@/lib/repositories/submission-list-async-repository", () => ({
  AsyncSubmissionListRepository: class {
    constructor(client: unknown) { mocks.listClient(client); }
    listSubmissions = mocks.list;
  }
}));
vi.mock("@/lib/repositories/dashboard-async-repository", () => ({
  AsyncDashboardRepository: class {
    constructor(client: unknown) { mocks.metricsClient(client); }
    getDashboardMetrics = mocks.metrics;
  }
}));
vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.legacyAuth }));
vi.mock("@/lib/dashboard-metrics-async", () => ({ getDashboardMetricsAsync: vi.fn() }));
vi.mock("@/lib/submissions-async", () => ({ listSubmissionsAsync: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ scopedSubmittedBy: vi.fn() }));

import { GET } from "@/app/api/submissions/route";

const path = "src/app/api/submissions/route.ts";
const snapshot = { kind: "postgres" };
const verified = { profile: { pdmUserId: "profile-1", companyId: "company-jenfu" },
  session: { principalId: "principal-1" } };
const request = () => new Request("https://ai-pdm.test/api/submissions?limit=2&offset=3");

describe("Principal historical submission list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.verifiedRead.mockImplementation(async (_input, read) => read(snapshot, verified));
    mocks.scope.mockResolvedValue({ submittedBy: "profile-1" });
    mocks.company.mockResolvedValue({ company: { companyId: "company-jenfu", companyCode: "JENFU" },
      response: null });
    mocks.list.mockResolvedValue([{ id: "one" }, { id: "two" }, { id: "three" }]);
    mocks.metrics.mockResolvedValue({ pending: 1, released: 1, rejected: 0, failed: 0 });
  });

  it("uses the verified snapshot, published scope, and exact company for rows and metrics", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.submissions).toEqual([{ id: "one" }, { id: "two" }]);
    expect(body.pagination).toEqual({ limit: 2, offset: 3, count: 2, hasMore: true, nextOffset: 5 });
    expect(body.historicalReadOnly).toBe(true);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { expectedPermissionCode: "submission.view" });
    expect(mocks.scope).toHaveBeenCalledWith(snapshot, verified);
    expect(mocks.listClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.metricsClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.list).toHaveBeenCalledWith({ status: undefined, submittedBy: "profile-1",
      companyId: "company-jenfu", limit: 3, offset: 3, includeHistory: false });
    expect(mocks.metrics).toHaveBeenCalledWith({ submittedBy: "profile-1", companyId: "company-jenfu" });
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("allows a published AAL2 manager's company-wide list without profile owner widening", async () => {
    mocks.scope.mockResolvedValue({ submittedBy: undefined });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      submittedBy: undefined, companyId: "company-jenfu"
    }));
  });

  it("returns grant and company denial before reading any submission data", async () => {
    mocks.scope.mockResolvedValueOnce(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.company).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
    mocks.company.mockResolvedValueOnce({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("refuses a missing session or policy drift without falling back to the old guard", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    mocks.policy.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.verifiedRead).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
