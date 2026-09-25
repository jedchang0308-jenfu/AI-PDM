import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), list: vi.fn(), legacyPage: vi.fn(),
  legacyAction: vi.fn(), legacyList: vi.fn(), legacyCompany: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(readonly snapshot: unknown) {}
    listSeriesCodeOptions(companyId: string) { return mocks.list(this.snapshot, companyId); }
  }
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingPageAsync: mocks.legacyPage,
  requireNumberingActionAsync: mocks.legacyAction
}));
vi.mock("@/lib/numbering-async", () => ({ listSeriesCodeOptionsAsync: mocks.legacyList }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));

import { GET } from "@/app/api/numbering/series-codes/route";

const request = new Request("https://example.test/api/numbering/series-codes");
const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("principal series-code read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue(["A1"]);
    mocks.principalRead.mockImplementation(async (_request, _permissions, read) => read(snapshot, company));
  });

  it("uses the explicit OR policy and verified company in the same snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ seriesCodeOptions: ["A1"] });
    expect(mocks.principalRead).toHaveBeenCalledWith(request, [
      { permissionKind: "page", permissionCode: "numbering.search" },
      { permissionKind: "page", permissionCode: "numbering.drawings.view" },
      { permissionKind: "action", permissionCode: "numbering.create" }
    ], expect.any(Function));
    expect(mocks.list).toHaveBeenCalledWith(snapshot, "company-jenfu");
    expect(mocks.legacyPage).not.toHaveBeenCalled();
    expect(mocks.legacyList).not.toHaveBeenCalled();
  });

  it("does not fall back to the old role path after a principal denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });
});
