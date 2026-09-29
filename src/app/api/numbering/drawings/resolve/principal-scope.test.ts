import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), resolve: vi.fn(), principalRead: vi.fn() }));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/drawing-revision-workbench", () => ({ resolveDrawingRevisionContext: mocks.resolve }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));

import { GET } from "@/app/api/numbering/drawings/resolve/route";

const request = new Request("https://example.test/api/numbering/drawings/resolve?drawingNumber=DRW-1");
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const snapshot = { transactionScope: "postgres" };

describe("DEV-121 Principal-only drawing resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.resolve.mockResolvedValue({ drawing: { id: "drawing-1" } });
    mocks.principalRead.mockImplementation(async (_request, _code, read) => read(snapshot, company));
  });

  it("resolves only the verified company's drawing in the Principal snapshot", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", drawingNumber: "DRW-1"
    }), snapshot);
  });

  it("rejects absent or old sessions before any drawing read", async () => {
    mocks.token.mockReturnValueOnce(null);
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("does not read drawings after a Principal company or grant denial", async () => {
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }));
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
