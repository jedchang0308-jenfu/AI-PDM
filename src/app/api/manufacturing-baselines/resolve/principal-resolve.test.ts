import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), policy: vi.fn(), principalRead: vi.fn(), resolve: vi.fn(),
  legacyAuth: vi.fn(), requestedCompany: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-company-read", () => ({ withPrincipalCompanyRead: mocks.principalRead }));
vi.mock("@/lib/company-context", () => ({ requestedPdmCompanyCodeFromRequest: mocks.requestedCompany }));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/shared-3d-baseline", () => ({
  resolveRequiredMaForBaselineAsync: mocks.resolve,
  Shared3dBaselineError: class extends Error {}
}));

import { GET, POST } from "@/app/api/manufacturing-baselines/resolve/route";

const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const routePath = "src/app/api/manufacturing-baselines/resolve/route.ts";

describe("principal manufacturing baseline resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-session");
    mocks.policy.mockImplementation((_path, method) => ({ path: routePath, method,
      authorizationMode: "permission", permissionCode: "manufacturing.baseline.view" }));
    mocks.requestedCompany.mockReturnValue({ state: "valid", companyCode: "JENFU" });
    mocks.principalRead.mockImplementation(async (_request, _companyRequest, _permissions, read) =>
      read(snapshot, company, { session: { principalId: "principal-one" } }));
    mocks.resolve.mockResolvedValue({ owner: { companyId: "company-jenfu" }, required: [], missing: [] });
  });

  it("reads the resource in the verified snapshot for the exact GET route", async () => {
    const request = new Request("https://ai-pdm.test/api/manufacturing-baselines/resolve?ownerScope=part_root&ownerCode=R-1");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(routePath, "GET",
      { expectedPermissionCode: "manufacturing.baseline.view" });
    expect(mocks.principalRead).toHaveBeenCalledWith(request,
      { state: "valid", companyCode: "JENFU" },
      [{ permissionKind: "action", permissionCode: "manufacturing.baseline.view" }],
      expect.any(Function));
    expect(mocks.resolve).toHaveBeenCalledWith({ ownerScope: "part_root", ownerCode: "R-1" }, snapshot);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("refuses a POST whose server-read owner belongs to another company", async () => {
    mocks.resolve.mockResolvedValue({ owner: { companyId: "another-company" }, required: [], missing: [] });
    const response = await POST(new Request("https://ai-pdm.test/api/manufacturing-baselines/resolve", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerScope: "part_number", ownerCode: "P-1" })
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ code: "entitlement_scope_mismatch" });
    expect(mocks.resolve).toHaveBeenCalledWith({ ownerScope: "part_number", ownerCode: "P-1" }, snapshot);
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("fails closed if the route manifest is unavailable", async () => {
    mocks.policy.mockReturnValue(null);
    const response = await GET(new Request("https://ai-pdm.test/api/manufacturing-baselines/resolve"));
    expect(response.status).toBe(503);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("keeps the existing v1 path for the unconverted cohort", async () => {
    mocks.token.mockReturnValue(null);
    mocks.legacyAuth.mockResolvedValue({ user: { id: "old-profile" }, response: null });
    const response = await GET(new Request("https://ai-pdm.test/api/manufacturing-baselines/resolve?ownerCode=R-1"));
    expect(response.status).toBe(200);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.resolve).toHaveBeenCalledWith({ ownerScope: "part_number", ownerCode: "R-1" });
  });
});
