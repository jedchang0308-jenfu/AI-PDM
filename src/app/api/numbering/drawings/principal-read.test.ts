import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(), view: vi.fn(), series: vi.fn(),
  codes: vi.fn(), permission: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
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

import { GET } from "@/app/api/numbering/drawings/route";

const request = new Request("https://example.test/api/numbering/drawings?query=ABC");
const snapshot = { transactionScope: "postgres" };
const verified = { session: { principalId: "principal-1" } };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("Principal-only drawing list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.principalRead.mockImplementation(async (_request, _code, read) =>
      read(snapshot, company, verified));
    mocks.view.mockResolvedValue([{ id: "drawing-1" }]);
    mocks.series.mockResolvedValue(["A"]);
    mocks.codes.mockResolvedValue(["A1"]);
    mocks.permission.mockResolvedValue([{ principalId: "principal-1", allowed: true }]);
  });

  it("reads drawings and review capability from one verified Principal snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      drawings: [{ id: "drawing-1" }], approvalProjection: { canReview: true }
    });
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.view).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", query: "ABC" }));
    expect(mocks.permission).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
  });

  it("does not infer review access from the historical profile", async () => {
    mocks.permission.mockResolvedValue([{ principalId: "principal-1", allowed: false }]);
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ approvalProjection: { canReview: false } });
  });

  it("rejects absent or old sessions before any drawing or grant read", async () => {
    mocks.token.mockReturnValueOnce(null);
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.permission).not.toHaveBeenCalled();
  });

  it("does not read drawings after a Principal company or page denial", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.view).not.toHaveBeenCalled();
  });
});
