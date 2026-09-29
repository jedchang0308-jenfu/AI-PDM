import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(), policy: vi.fn(),
  verifiedRead: vi.fn(), decisions: vi.fn(), resource: vi.fn(),
  detail: vi.fn(), actionability: vi.fn(), detailClient: vi.fn(),
  statusClient: vi.fn(), legacyAuth: vi.fn(), legacyDetail: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode }));
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
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.decisions
}));
vi.mock("@/lib/jenfu-entitlement-http", () => ({
  jenfuEntitlementFailureResponse: (code: string) => Response.json({ code }, { status: 403 })
}));
vi.mock("@/lib/repositories/submission-list-async-repository", () => ({
  AsyncSubmissionListRepository: class {
    constructor(client: unknown) { mocks.detailClient(client); }
    getSubmission = mocks.detail;
  }
}));
vi.mock("@/lib/repositories/submission-status-async-repository", () => ({
  AsyncSubmissionStatusRepository: class {
    constructor(client: unknown) { mocks.statusClient(client); }
    getSubmissionReleaseActionability = mocks.actionability;
  }
}));
vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.legacyAuth, forbidden: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ canReadSubmissionAsync: vi.fn() }));
vi.mock("@/lib/submissions-async", () => ({ getSubmissionAsync: mocks.legacyDetail }));
vi.mock("@/lib/approval-workbench-legacy-redirect", () => ({
  resolveLegacyDrawingLifecycleNavigation: vi.fn()
}));

import { GET } from "@/app/api/submissions/[id]/route";

const path = "src/app/api/submissions/[id]/route.ts";
const verified = {
  profile: { pdmUserId: "profile-1", companyId: "company-1" },
  session: { principalId: "principal-1", assuranceLevel: "aal2" }
};
const snapshot = { queryOne: mocks.resource };
const request = () => new Request("https://ai-pdm.test/api/submissions/submission-1");
const context = { params: Promise.resolve({ id: "submission-1" }) };
const decision = (roleCode = "rd", allowed = true) => ({
  allowed, roleCode, permissionCode: "submission.view", principalId: "principal-1",
  decisionCode: allowed ? "allowed" : "permission_not_granted"
});

describe("Principal historical submission detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.verifiedRead.mockImplementation(async (_input, read) => read(snapshot, verified));
    mocks.decisions.mockResolvedValue([decision()]);
    mocks.resource.mockResolvedValue({ company_id: "company-1", submitted_by: "profile-1" });
    mocks.detail.mockResolvedValue({ id: "submission-1", company_id: "company-1",
      submitted_by: "profile-1", files: [] });
    mocks.actionability.mockResolvedValue({ code: "read_only" });
  });

  it("lets rd read only its own historical submission inside the verified snapshot", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect((await response.json()).historicalReadOnly).toBe(true);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { expectedPermissionCode: "submission.view" });
    expect(mocks.decisions).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "submission.view" }]);
    expect(mocks.resource).toHaveBeenCalledWith(expect.stringContaining("ai_pdm_core.submissions"),
      { id: "submission-1" });
    expect(mocks.detailClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.statusClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("allows an AAL2 published manager role to read another user's submission in the same company", async () => {
    mocks.decisions.mockResolvedValue([decision("rd_manager")]);
    mocks.resource.mockResolvedValue({ company_id: "company-1", submitted_by: "profile-2" });
    mocks.detail.mockResolvedValue({ id: "submission-1", company_id: "company-1",
      submitted_by: "profile-2", files: [] });
    expect((await GET(request(), context)).status).toBe(200);
  });

  it("denies an rd cross-owner read before loading the full detail or attachments", async () => {
    mocks.resource.mockResolvedValue({ company_id: "company-1", submitted_by: "profile-2" });
    const response = await GET(request(), context);
    expect(response.status).toBe(403);
    expect(response.headers.get("x-jenfu-principal-historical")).toBe("1");
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("hides other-company resources and does not load their details", async () => {
    mocks.resource.mockResolvedValue({ company_id: "company-2", submitted_by: "profile-1" });
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("does not query a resource after grant denial or policy drift", async () => {
    mocks.decisions.mockResolvedValueOnce([decision("rd", false)]);
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.resource).not.toHaveBeenCalled();
    mocks.policy.mockReturnValue(null);
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.resource).not.toHaveBeenCalled();
  });

  it("fails closed when the published permission decision cardinality drifts", async () => {
    mocks.decisions.mockResolvedValue([decision(), decision()]);
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.resource).not.toHaveBeenCalled();
  });

  it("refuses an unreviewed role or insufficient assurance for cross-owner read", async () => {
    mocks.decisions.mockResolvedValueOnce([decision("qa")]);
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.resource).not.toHaveBeenCalled();
    mocks.decisions.mockResolvedValue([decision("pdm_admin")]);
    mocks.verifiedRead.mockImplementation(async (_input, read) =>
      read(snapshot, { ...verified, session: { ...verified.session, assuranceLevel: "aal1" } }));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.detail).not.toHaveBeenCalled();
  });

  it("rejects a missing Principal session or disabled entitlement before reading the resource", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.entitlementMode.mockReturnValue("off");
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.resource).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("fails closed when the full detail disagrees with the authorized resource row", async () => {
    mocks.detail.mockResolvedValue({ id: "submission-1", company_id: "company-2",
      submitted_by: "profile-1", files: [] });
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.actionability).not.toHaveBeenCalled();
  });
});
