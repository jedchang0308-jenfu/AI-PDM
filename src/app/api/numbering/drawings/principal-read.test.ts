import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), view: vi.fn(), series: vi.fn(), codes: vi.fn(), permission: vi.fn(),
  legacyGuard: vi.fn(), legacyCompany: vi.fn(), legacyView: vi.fn(),
  legacySeries: vi.fn(), legacyCodes: vi.fn(), legacyPermission: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(readonly snapshot: unknown) {}
    listDrawingModuleRecords(input: unknown) { return mocks.view(this.snapshot, input); }
    listProductSeriesOptions(companyId: string) { return mocks.series(this.snapshot, companyId); }
    listSeriesCodeOptions(companyId: string) { return mocks.codes(this.snapshot, companyId); }
  }
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.permission
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingPageAsync: mocks.legacyGuard,
  canUserUseNumberingActionAsync: mocks.legacyPermission
}));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));
vi.mock("@/lib/numbering-async", () => ({
  listDrawingModuleRecordsAsync: mocks.legacyView,
  listProductSeriesOptionsAsync: mocks.legacySeries,
  listSeriesCodeOptionsAsync: mocks.legacyCodes
}));

import { GET } from "@/app/api/numbering/drawings/route";

const request = new Request("https://example.test/api/numbering/drawings?query=ABC");
const snapshot = { transactionScope: "postgres" };
const verified = { session: { principalId: "principal-1" } };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("principal drawing list resource boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.principalRead.mockImplementation(async (_request, _code, read) =>
      read(snapshot, company, verified));
    mocks.view.mockResolvedValue([{ id: "drawing-1" }]);
    mocks.series.mockResolvedValue(["A"]);
    mocks.codes.mockResolvedValue(["A1"]);
    mocks.permission.mockResolvedValue([{ principalId: "principal-1", allowed: true }]);
  });

  it("reads drawing data and review capability through the verified snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      drawings: [{ id: "drawing-1" }], approvalProjection: { canReview: true }
    });
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.view).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", query: "ABC" }));
    expect(mocks.permission).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
    expect(mocks.legacyGuard).not.toHaveBeenCalled();
    expect(mocks.legacyView).not.toHaveBeenCalled();
  });

  it("does not infer review access from the historical PDM profile role", async () => {
    mocks.permission.mockResolvedValue([{ principalId: "principal-1", allowed: false }]);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ approvalProjection: { canReview: false } });
    expect(mocks.legacyPermission).not.toHaveBeenCalled();
  });
});
