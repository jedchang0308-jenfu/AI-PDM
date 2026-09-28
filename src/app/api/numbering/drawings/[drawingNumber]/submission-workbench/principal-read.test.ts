import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), context: vi.fn(), legacyPage: vi.fn(), legacyCompany: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/drawing-submission-workbench", () => ({
  DrawingSubmissionWorkbenchError: class extends Error {},
  resolveDrawingSubmissionContext: mocks.context
}));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingPageAsync: mocks.legacyPage }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));

import { GET } from "@/app/api/numbering/drawings/[drawingNumber]/submission-workbench/route";

const request = new Request("https://example.test/api/numbering/drawings/D-A0001-M01/submission-workbench?revision=B&partNumberId=p1&partNumberId=p2");
const params = { params: Promise.resolve({ drawingNumber: "D-A0001-M01" }) };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business",
  displayName: "Jenfu" };
const snapshot = { transactionScope: "principal-repeatable-read" };

describe("principal drawing submission workbench read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ drawing: { drawingNumber: "D-A0001-M01" }, blockers: [] });
    mocks.principalRead.mockImplementation(async (_request, _permission, read) => read(snapshot, company));
  });

  it("reads the company-scoped workbench in the verified principal snapshot", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({
      company, drawingNumber: "D-A0001-M01", targetRevision: "B", partNumberIds: ["p1", "p2"]
    }), snapshot);
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });

  it("does not reinterpret a denied principal as a legacy user", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request, params);
    expect(response.status).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });

  it("keeps the existing legacy session path for the pre-cutover cohort", async () => {
    mocks.principalRead.mockResolvedValue(null);
    mocks.legacyPage.mockResolvedValue({ user: { id: "legacy-profile" }, response: null });
    mocks.legacyCompany.mockResolvedValue({ company, response: null });
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(mocks.context).toHaveBeenCalledWith(expect.objectContaining({ company }), undefined);
  });
});
