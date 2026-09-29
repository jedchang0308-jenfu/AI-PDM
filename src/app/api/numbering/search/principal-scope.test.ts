import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(), principalSearch: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(readonly snapshot: unknown) {}
    searchNumberingRecords(input: unknown) { return mocks.principalSearch(this.snapshot, input); }
  }
}));

import { GET } from "@/app/api/numbering/search/route";

const request = new Request("https://example.test/api/numbering/search?query=ABC");
const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("DEV-121 Principal-only numbering search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.principalSearch.mockResolvedValue([{ id: "principal-record" }]);
    mocks.principalRead.mockImplementation(async (_request, _code, read) => read(snapshot, company));
  });

  it("searches the verified company through the same Principal snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ results: [{ id: "principal-record" }] });
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.principalSearch).toHaveBeenCalledWith(snapshot,
      expect.objectContaining({ companyId: "company-jenfu", query: "ABC" }));
  });

  it("rejects absent or old sessions before any company or record read", async () => {
    mocks.token.mockReturnValueOnce(null);
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.principalSearch).not.toHaveBeenCalled();
  });

  it("does not read records after a Principal company or grant denial", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.principalSearch).not.toHaveBeenCalled();
  });

  it("fails closed if the Principal read dependency is unavailable", async () => {
    mocks.principalRead.mockResolvedValueOnce(null);
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(mocks.principalSearch).not.toHaveBeenCalled();
  });
});
