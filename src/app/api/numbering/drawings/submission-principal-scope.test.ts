import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ companyGuard: vi.fn(), resolve: vi.fn(), principalRead: vi.fn() }));
vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.companyGuard
}));
vi.mock("@/lib/drawing-submission-workbench", () => ({
  DrawingSubmissionWorkbenchError: class extends Error {},
  resolveDrawingSubmissionContext: mocks.resolve
}));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));

import { GET as getContext } from "@/app/api/numbering/drawings/[drawingNumber]/submission-context/route";
import { GET as getReadiness } from "@/app/api/numbering/drawings/[drawingNumber]/submission-readiness/route";

const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business", displayName: "鉦富" };
const request = new Request("https://example.test/api/numbering/drawings/DRW-1/submission-context");
const params = { params: Promise.resolve({ drawingNumber: "DRW-1" }) };

describe("DEV-121 drawing submission reads use the principal company", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companyGuard.mockResolvedValue({ company, response: null });
    mocks.resolve.mockResolvedValue({ drawing: { id: "drawing-1" } });
    mocks.principalRead.mockResolvedValue(null);
  });

  it("passes the verified company to both read variants", async () => {
    expect((await getContext(request, params)).status).toBe(200);
    expect((await getReadiness(request, params)).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.resolve).toHaveBeenCalledWith({ company, drawingNumber: "DRW-1" }, undefined);
  });

  it("does not resolve a drawing after company authorization fails", async () => {
    mocks.companyGuard.mockResolvedValue({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    expect((await getContext(request, params)).status).toBe(403);
    expect((await getReadiness(request, params)).status).toBe(403);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("uses the same verified transaction for both principal submission reads", async () => {
    const snapshot = { transactionScope: "postgres" };
    mocks.principalRead.mockImplementation(async (_request, _code, read) => read(snapshot, company));
    expect((await getContext(request, params)).status).toBe(200);
    expect((await getReadiness(request, params)).status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
    expect(mocks.resolve).toHaveBeenCalledWith({ company, drawingNumber: "DRW-1" }, snapshot);
    expect(mocks.companyGuard).not.toHaveBeenCalled();
  });
});
