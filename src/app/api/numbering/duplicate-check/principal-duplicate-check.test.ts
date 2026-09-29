import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  write: vi.fn(), repositoryClient: vi.fn(), check: vi.fn()
}));

vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyWrite: mocks.write
}));
vi.mock("@/lib/repositories/numbering-async-repository", () => ({
  AsyncNumberingRepository: class {
    constructor(client: unknown) { mocks.repositoryClient(client); }
    checkNumberingDuplicates = mocks.check;
  }
}));

import { POST } from "@/app/api/numbering/duplicate-check/route";

const snapshot = { transactionScope: "principal-serializable-write" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };
const verified = {
  session: { principalId: "principal-1", profileVersion: 7 },
  profile: { pdmUserId: "profile-1" }
};
function request(body: Record<string, unknown>) {
  return new Request("https://ai-pdm.test/api/numbering/duplicate-check", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Principal-only numbering duplicate check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.write.mockImplementation(async (_request, _path, _permission, callback) =>
      callback(snapshot, company, verified));
    mocks.check.mockResolvedValue({ blocked: false, warningsOnly: false, matches: [] });
  });

  it("binds the historical profile and security audit to the verified Principal", async () => {
    const input = request({
      coreName: "motor", createdBy: "spoofed-profile",
      principalId: "spoofed-principal", companyCode: "OTHER"
    });
    const response = await POST(input);
    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(input,
      "src/app/api/numbering/duplicate-check/route.ts", "numbering.duplicate_check",
      expect.any(Function));
    expect(mocks.repositoryClient).toHaveBeenCalledExactlyOnceWith(snapshot);
    expect(mocks.check).toHaveBeenCalledWith({
      companyId: "company-jenfu", rootCode: undefined, coreName: "motor",
      partNumber: undefined, partName: undefined, drawingNumber: undefined,
      createdBy: "profile-1"
    }, { principalId: "principal-1", profileVersion: 7 });
    expect((await response.json()).pdmCompany).toEqual(company);
  });

  it("does not parse body or write after Principal denial", async () => {
    mocks.write.mockResolvedValue(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    const response = await POST(request({ coreName: "motor" }));
    expect(response.status).toBe(403);
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("rejects an empty query before writing an audit event", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(mocks.check).not.toHaveBeenCalled();
  });
});
