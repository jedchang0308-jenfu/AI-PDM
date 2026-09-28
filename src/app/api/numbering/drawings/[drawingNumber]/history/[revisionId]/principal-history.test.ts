import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ principalRead: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/pdm-canonical-drawing-history", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  readCanonicalDrawingHistoryRevision: mocks.history
}));

import { GET } from "@/app/api/numbering/drawings/[drawingNumber]/history/[revisionId]/route";

const request = new Request("https://ai-pdm.example/api/numbering/drawings/drawing-one/history/revision-one");
const params = { params: Promise.resolve({ drawingNumber: "drawing-one", revisionId: "revision-one" }) };

describe("Principal drawing revision history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the exact company and revision in the verified permission snapshot", async () => {
    const snapshot = { kind: "postgres", marker: "verified-snapshot" };
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, { companyId: "company-one" }));
    mocks.history.mockResolvedValue({ data: { revisionId: "revision-one" } });

    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.history).toHaveBeenCalledWith({
      client: snapshot, companyId: "company-one", drawingId: "drawing-one", revisionId: "revision-one"
    });
  });

  it("does not query history when the Principal grant or company is denied", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    expect((await GET(request, params)).status).toBe(403);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("does not fall through to the old actor when no Principal session is present", async () => {
    mocks.principalRead.mockResolvedValue(null);
    const response = await GET(request, params);
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
