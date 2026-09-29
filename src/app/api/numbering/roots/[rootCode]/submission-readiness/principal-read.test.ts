import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(), readiness: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/principal-numbering-read", () => ({
  withPrincipalNumberingCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/drawing-submission-workbench", () => ({
  DrawingSubmissionWorkbenchError: class extends Error {},
  resolveRootSubmissionReadiness: mocks.readiness
}));

import { GET } from "@/app/api/numbering/roots/[rootCode]/submission-readiness/route";

const request = new Request("https://example.test/api/numbering/roots/A0001/submission-readiness");
const params = { params: Promise.resolve({ rootCode: "A0001" }) };
const snapshot = { transactionScope: "principal-repeatable-read" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };

describe("Principal-only root submission readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.readiness.mockResolvedValue({ root: { rootCode: "A0001" }, blockers: [] });
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company));
  });

  it("passes the verified snapshot through the root workbench", async () => {
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.readiness).toHaveBeenCalledWith({ company, rootCode: "A0001" }, snapshot);
  });

  it("rejects missing or old sessions before any readiness read", async () => {
    mocks.token.mockReturnValue(null);
    const response = await GET(request, params);
    expect(response.status).toBe(401);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("does not use a historical profile after Principal company or page denial", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await GET(request, params);
    expect(response.status).toBe(403);
    expect(mocks.readiness).not.toHaveBeenCalled();
  });

  it("fails closed when the Principal read dependency is unavailable", async () => {
    mocks.principalRead.mockResolvedValue(null);
    const response = await GET(request, params);
    expect(response.status).toBe(503);
    expect(mocks.readiness).not.toHaveBeenCalled();
  });
});
