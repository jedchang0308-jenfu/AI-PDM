import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  companyGuard: vi.fn(),
  search: vi.fn()
}));

vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.companyGuard
}));
vi.mock("@/lib/numbering-async", () => ({ searchNumberingRecordsAsync: mocks.search }));

import { GET } from "@/app/api/numbering/search/route";

const request = new Request("https://example.test/api/numbering/search?query=ABC");
const user = { id: "profile-1", role: "Principal", authorizationActor: {
  principalId: "principal-1", localPrincipalId: "profile-1",
  companyId: "company-jenfu", sessionSchemaVersion: 2
} };

describe("DEV-121 principal search resource boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.companyGuard.mockResolvedValue({ user, permission: { allowed: true },
      company: { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" }, response: null });
    mocks.search.mockResolvedValue([{ id: "record-1" }]);
  });

  it("searches only the company bound to the verified principal", async () => {
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({ companyId: "company-jenfu", query: "ABC" }));
    expect(mocks.companyGuard).toHaveBeenCalledWith(request, "page", "numbering.search");
  });

  it("does not use historical profile membership to search another company", async () => {
    mocks.companyGuard.mockResolvedValue({ user: null, permission: null,
      company: null, response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
