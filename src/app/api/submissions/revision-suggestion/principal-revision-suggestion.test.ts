import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policy: vi.fn(), principalRead: vi.fn(), listRevisions: vi.fn()
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({
  resolveJenfuRoutePolicy: mocks.policy
}));
vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/submission-write-async-repository", () => ({
  AsyncSubmissionWriteRepository: class {
    constructor(readonly client: unknown) {}
    listSubmissionRevisionsByDrawing(input: unknown) {
      return mocks.listRevisions(this.client, input);
    }
  }
}));

import { GET, POST } from "@/app/api/submissions/revision-suggestion/route";

const path = "src/app/api/submissions/revision-suggestion/route.ts";
const snapshot = { source: "verified-principal-snapshot" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };

describe("revision suggestion Principal boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, company));
    mocks.listRevisions.mockResolvedValue([]);
  });

  it("uses published create permission and one company-bound snapshot for GET", async () => {
    const request = new Request("https://ai-pdm.test/api/submissions/revision-suggestion?drawingNumber=D-1&pdm_company_code=JENFU");
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { expectedPermissionCode: "submission.create" });
    expect(mocks.principalRead).toHaveBeenCalledWith(request,
      { state: "valid", companyCode: "JENFU" },
      [{ permissionKind: "action", permissionCode: "submission.create" }],
      expect.any(Function));
    expect(mocks.listRevisions).toHaveBeenCalledWith(snapshot,
      { companyId: "company-jenfu", drawingNumber: "D-1" });
    expect((await response.json()).suggestedRevisionCode).toEqual(expect.any(String));
  });

  it("rejects policy drift and denied grants before reading POST body or revision data", async () => {
    const drift = new Request("https://ai-pdm.test/api/submissions/revision-suggestion", {
      method: "POST", body: "invalid-json"
    });
    mocks.policy.mockReturnValueOnce(null);
    expect((await POST(drift)).status).toBe(503);
    expect(drift.bodyUsed).toBe(false);
    expect(mocks.principalRead).not.toHaveBeenCalled();

    const denied = new Request("https://ai-pdm.test/api/submissions/revision-suggestion", {
      method: "POST", body: "invalid-json"
    });
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    expect((await POST(denied)).status).toBe(403);
    expect(denied.bodyUsed).toBe(false);
    expect(mocks.listRevisions).not.toHaveBeenCalled();
  });

  it("rejects body company mismatch or malformed input before querying revisions", async () => {
    const mismatched = await POST(new Request("https://ai-pdm.test/api/submissions/revision-suggestion", {
      method: "POST", body: JSON.stringify({ drawingNumber: "D-1", pdmCompanyCode: "MAXIMA" })
    }));
    expect(mismatched.status).toBe(403);
    const malformed = await POST(new Request("https://ai-pdm.test/api/submissions/revision-suggestion", {
      method: "POST", body: "null"
    }));
    expect(malformed.status).toBe(400);
    expect(mocks.listRevisions).not.toHaveBeenCalled();
  });

  it("does not fall back to a legacy session", async () => {
    mocks.principalRead.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://ai-pdm.test/api/submissions/revision-suggestion?drawingNumber=D-1"));
    expect(response.status).toBe(401);
    expect(mocks.listRevisions).not.toHaveBeenCalled();
  });
});
