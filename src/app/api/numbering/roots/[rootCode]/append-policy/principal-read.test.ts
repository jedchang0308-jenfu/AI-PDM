import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), repositoryClient: vi.fn(), rootDetail: vi.fn(), preview: vi.fn(),
  legacyPage: vi.fn(), legacyCompany: vi.fn(), database: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(client: unknown) { mocks.repositoryClient(client); }
    getNumberingRootDetail = mocks.rootDetail;
  }
}));
vi.mock("@/lib/numbering-preview", () => ({ previewAppendNumbersAsync: mocks.preview }));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingPageAsync: mocks.legacyPage }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));

import { GET } from "@/app/api/numbering/roots/[rootCode]/append-policy/route";

const request = new Request("https://example.test/api/numbering/roots/A0001/append-policy");
const params = { params: Promise.resolve({ rootCode: "A0001" }) };
const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business",
  displayName: "Jenfu" };

describe("principal append-policy read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rootDetail.mockResolvedValue({
      root: { rootCode: "A0001", recordStatus: "Active", itemKind: "manufactured" },
      partNumbers: [], drawingNumbers: [], summary: { partCount: 0, drawingCount: 0 }
    });
    mocks.preview.mockImplementation(async (_client, _companyId, _rootCode, purposeCode) => ({
      part: "A0001-P01", drawing: `A0001-${purposeCode}01`
    }));
    mocks.principalRead.mockImplementation(async (_request, _permission, read) => read(snapshot, company));
  });

  it("uses the verified principal snapshot for root and both previews", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.repositoryClient).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(mocks.rootDetail).toHaveBeenCalledWith("A0001", company.companyId);
    expect(mocks.preview.mock.calls.map(([client, companyId, rootCode, purpose]) =>
      [client, companyId, rootCode, purpose])).toEqual([
        [snapshot, company.companyId, "A0001", "M"],
        [snapshot, company.companyId, "A0001", "R"]
      ]);
    expect(mocks.legacyPage).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("does not fall back to legacy identity after principal denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request, params);
    expect(response.status).toBe(403);
    expect(mocks.rootDetail).not.toHaveBeenCalled();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });
});
