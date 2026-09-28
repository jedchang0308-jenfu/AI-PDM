import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), decisions: vi.fn(), scope: vi.fn(),
  company: vi.fn(), search: vi.fn(), listClient: vi.fn(), query: vi.fn(),
  legacyAuth: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({
  getAuthMode: mocks.authMode, getJenfuPlatformAuthMode: mocks.platformMode
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-entitlement-http", () => ({
  jenfuEntitlementFailureResponse: (code: string) =>
    Response.json({ code }, { status: 403 })
}));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: () => ({ token: "principal-session" }),
  principalRequestFailure: () => Response.json({ code: "principal_dependency_unavailable" }, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.decisions
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
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
    searchSubmissions = mocks.search;
  }
}));
vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.legacyAuth }));
vi.mock("@/lib/submissions-async", () => ({ searchSubmissionsAsync: vi.fn() }));
vi.mock("@/lib/permissions", () => ({ scopedSubmittedBy: vi.fn() }));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: vi.fn() }));

import { GET } from "@/app/api/search/route";

const path = "src/app/api/search/route.ts";
const snapshot = { kind: "postgres", query: mocks.query };
const verified = { profile: { pdmUserId: "profile-1", companyId: "company-jenfu" },
  session: { principalId: "principal-1" } };
const request = (search: string) => new Request("https://ai-pdm.test/api/search?" + search);

describe("Principal dashboard search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.policy.mockImplementation((_path, _method, input) => ({
      path, discriminator: input.discriminator, authorizationMode: "permission",
      scopeResolver: input.discriminator === "search:part" ? "principal company" : "submission company"
    }));
    mocks.verifiedRead.mockImplementation(async (_input, read) => read(snapshot, verified));
    mocks.scope.mockResolvedValue({ submittedBy: "profile-1" });
    mocks.company.mockResolvedValue({ company: { companyId: "company-jenfu", companyCode: "JENFU" },
      response: null });
    mocks.search.mockResolvedValue([{ id: "own-submission" }]);
    mocks.decisions.mockResolvedValue([{ allowed: true, permissionCode: "numbering.search",
      principalId: "principal-1" }]);
    mocks.query.mockResolvedValue([{ id: "part-1", item_id: "item-1", part_number: "P-123",
      part_name: "Part", part_root_id: "root-1" }]);
  });

  it("uses submission.view, the verified historical owner, and one snapshot for submission search", async () => {
    const response = await GET(request("q=drawing&material=steel"));
    expect(response.status).toBe(200);
    expect((await response.json()).submissions).toEqual([{ id: "own-submission" }]);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { discriminator: "search:submission", expectedPermissionCode: "submission.view" });
    expect(mocks.scope).toHaveBeenCalledWith(snapshot, verified);
    expect(mocks.listClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({
      query: "drawing", submittedBy: "profile-1", companyId: "company-jenfu",
      filters: expect.objectContaining({ material: "steel" })
    }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("uses a separate numbering.search grant and exact company for part lookup", async () => {
    const response = await GET(request("entity=part&q=P-123"));
    expect(response.status).toBe(200);
    expect((await response.json()).parts).toEqual([{ id: "part-1", part_number_id: "part-1",
      item_id: "item-1", part_number: "P-123", part_name: "Part",
      part_root_id: "root-1", revision: "" }]);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { discriminator: "search:part", expectedPermissionCode: "numbering.search" });
    expect(mocks.decisions).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "page", permissionCode: "numbering.search" }]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("ai_pdm_core.part_numbers"),
      { companyId: "company-jenfu", queryLike: "%P-123%" });
    expect(mocks.scope).not.toHaveBeenCalled();
  });

  it("denies missing grants, wrong principal, and wrong company before content reads", async () => {
    mocks.decisions.mockResolvedValueOnce([{ allowed: false, permissionCode: "numbering.search",
      principalId: "principal-1", decisionCode: "permission_not_granted" }]);
    expect((await GET(request("entity=part&q=P-123"))).status).toBe(403);
    mocks.decisions.mockResolvedValueOnce([{ allowed: true, permissionCode: "numbering.search",
      principalId: "another-principal" }]);
    expect((await GET(request("entity=part&q=P-123"))).status).toBe(503);
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.company.mockResolvedValueOnce({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    expect((await GET(request("q=drawing"))).status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("does not fall back to old auth when token or exact route policy is missing", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request("q=drawing"))).status).toBe(401);
    mocks.policy.mockReturnValue(null);
    expect((await GET(request("q=drawing"))).status).toBe(503);
    expect(mocks.verifiedRead).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
