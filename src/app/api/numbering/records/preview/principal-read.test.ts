import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), preview: vi.fn(), legacyAction: vi.fn(),
  legacyCompany: vi.fn(), database: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/numbering-preview", () => ({ previewNewBundleNumbersAsync: mocks.preview }));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingActionAsync: mocks.legacyAction }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));

import { GET } from "@/app/api/numbering/records/preview/route";

const request = new Request("https://example.test/api/numbering/records/preview?content=drawing_part&purposeCode=R");
const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("principal numbering preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue({ root: "A0001", part: "A0001-P01", drawing: "A0001-R01" });
    mocks.principalRead.mockImplementation(async (_request, _permissions, read) => read(snapshot, company));
  });

  it("reads the preview with the authorized company in the same principal snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).nextNumbers.drawing).toBe("A0001-R01");
    expect(mocks.principalRead).toHaveBeenCalledWith(request,
      [{ permissionKind: "action", permissionCode: "numbering.create" }], expect.any(Function));
    expect(mocks.preview).toHaveBeenCalledWith(snapshot, "company-jenfu", "R");
    expect(mocks.legacyAction).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("does not fall back to a legacy role after principal denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.legacyAction).not.toHaveBeenCalled();
  });
});
