import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ companyGuard: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.companyGuard
}));
vi.mock("@/lib/drawing-revision-workbench", () => ({ resolveDrawingRevisionContext: mocks.resolve }));

import { GET } from "@/app/api/numbering/drawings/resolve/route";

const request = new Request("https://example.test/api/numbering/drawings/resolve?drawingNumber=DRW-1");
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("DEV-121 drawing resolution company boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companyGuard.mockResolvedValue({ company, response: null });
    mocks.resolve.mockResolvedValue({ drawing: { id: "drawing-1" } });
  });

  it("passes only the authorized company into drawing resolution", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mocks.companyGuard).toHaveBeenCalledWith(request, "page", "numbering.drawings.view");
    expect(mocks.resolve).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", drawingNumber: "DRW-1"
    }));
  });

  it("does not read drawings after authorization fails", async () => {
    mocks.companyGuard.mockResolvedValue({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });
});
