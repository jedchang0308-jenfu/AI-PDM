import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  principalRead: vi.fn(), readiness: vi.fn(), legacyPage: vi.fn(),
  legacyCompany: vi.fn(), database: vi.fn()
}));

vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/drawing-submission-workbench", () => ({
  DrawingSubmissionWorkbenchError: class extends Error {},
  resolveRootSubmissionReadiness: mocks.readiness
}));
vi.mock("@/lib/numbering-permission-guard", () => ({ requireNumberingPageAsync: mocks.legacyPage }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: vi.fn(),
  resolveNumberingCompanyContextAsync: mocks.legacyCompany
}));
vi.mock("@/lib/db-async-provider", () => ({ getAsyncDatabaseClient: mocks.database }));

import { GET } from "@/app/api/numbering/roots/[rootCode]/submission-readiness/route";

const request = new Request("https://example.test/api/numbering/roots/A0001/submission-readiness");
const params = { params: Promise.resolve({ rootCode: "A0001" }) };
const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("principal root submission readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readiness.mockResolvedValue({ root: { rootCode: "A0001" }, blockers: [] });
    mocks.principalRead.mockImplementation(async (_request, _permission, read) => read(snapshot, company));
  });

  it("passes the verified snapshot through the root workbench", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.readiness).toHaveBeenCalledWith({ company, rootCode: "A0001" }, snapshot);
    expect(mocks.legacyPage).not.toHaveBeenCalled();
    expect(mocks.database).not.toHaveBeenCalled();
  });

  it("does not use the legacy role path after a principal denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request, params);
    expect(response.status).toBe(403);
    expect(mocks.readiness).not.toHaveBeenCalled();
    expect(mocks.legacyPage).not.toHaveBeenCalled();
  });
});
