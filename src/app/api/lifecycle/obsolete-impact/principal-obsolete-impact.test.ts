import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), policy: vi.fn(), principalRead: vi.fn(), impact: vi.fn(),
  requestedCompany: vi.fn(), legacyPage: vi.fn(), legacyCompany: vi.fn(),
  authMode: vi.fn(), platformMode: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-company-read", () => ({ withPrincipalCompanyRead: mocks.principalRead }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: mocks.requestedCompany,
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingPageAsync: mocks.legacyPage }));
vi.mock("@/lib/numbering-obsolete-impact", () => ({
  getFormalObsoleteImpactAsync: mocks.impact,
  FormalObsoleteImpactError: class extends Error {}
}));

import { GET } from "@/app/api/lifecycle/obsolete-impact/route";

const path = "src/app/api/lifecycle/obsolete-impact/route.ts";
const snapshot = { source: "verified-principal-snapshot" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };
const request = () => new Request("https://ai-pdm.test/api/lifecycle/obsolete-impact?entityType=drawing_number&entityId=drawing-1");

describe("Principal-only formal obsolete impact read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "workspace" });
    mocks.requestedCompany.mockReturnValue({ state: "absent" });
    mocks.principalRead.mockImplementation(async (_request, _companyRequest, _permissions, read) =>
      read(snapshot, company));
    mocks.impact.mockResolvedValue({ recordStatus: "Released", entityId: "drawing-1" });
  });

  it("reads only after the reviewed workspace policy and in its verified snapshot", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { expectedPermissionCode: "numbering.search" });
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "page", permissionCode: "numbering.search" }],
      expect.any(Function));
    expect(mocks.impact).toHaveBeenCalledWith({ companyId: "company-jenfu",
      entityType: "drawing_number", entityId: "drawing-1",
      entityCode: null, client: snapshot });
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });

  it("requires a Principal session without consulting legacy permissions", async () => {
    mocks.token.mockReturnValue(null);
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });

  it("fails closed when the Principal read contract is unavailable", async () => {
    mocks.principalRead.mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(mocks.impact).not.toHaveBeenCalled();
    expect(mocks.legacyCompany).not.toHaveBeenCalled();
  });

  it("does not read a resource after denial or route-policy drift", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    expect((await GET(request())).status).toBe(403);
    expect(mocks.impact).not.toHaveBeenCalled();
    mocks.policy.mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.impact).not.toHaveBeenCalled();
  });

  it("rejects a non-formal record without exposing another company's impact", async () => {
    mocks.impact.mockResolvedValue({ recordStatus: "Draft", entityId: "drawing-1" });
    const response = await GET(request());
    expect(response.status).toBe(409);
    expect((await response.json()).impact).toBeUndefined();
  });
});
