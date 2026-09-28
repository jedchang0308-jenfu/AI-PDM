import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policy: vi.fn(), principalRead: vi.fn(), findLock: vi.fn()
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({
  resolveJenfuRoutePolicy: mocks.policy
}));
vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/repositories/item-lock-async-repository", () => ({
  AsyncItemLockRepository: class {
    constructor(readonly client: unknown) {}
    findActiveItemLockForSubmissionIdentifiers(input: unknown) {
      return mocks.findLock(this.client, input);
    }
  }
}));

import { POST } from "@/app/api/submissions/preflight-lock/route";

const path = "src/app/api/submissions/preflight-lock/route.ts";
const snapshot = { source: "verified-principal-snapshot" };
const company = { companyId: "company-jenfu", companyCode: "JENFU" };
const verified = { profile: { pdmUserId: "historical-profile-one" },
  session: { principalId: "principal-one" } };
function request(body: string) {
  return new Request("https://ai-pdm.test/api/submissions/preflight-lock", {
    method: "POST", body, headers: { "content-type": "application/json" }
  });
}

describe("submission preflight lock Principal boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, company, verified));
  });

  it("rejects route-policy drift or denied grants before parsing input or reading locks", async () => {
    const drift = request("invalid-json");
    mocks.policy.mockReturnValueOnce(null);
    expect((await POST(drift)).status).toBe(503);
    expect(drift.bodyUsed).toBe(false);
    expect(mocks.principalRead).not.toHaveBeenCalled();

    const denied = request("invalid-json");
    mocks.principalRead.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    expect((await POST(denied)).status).toBe(403);
    expect(denied.bodyUsed).toBe(false);
    expect(mocks.findLock).not.toHaveBeenCalled();
  });

  it("reads the company-bound lock in the verified snapshot", async () => {
    mocks.findLock.mockResolvedValue({ id: "lock-one", locked_by: "historical-profile-one" });
    const response = await POST(request(JSON.stringify({
      pdm_company_code: "JENFU", drawing_number: "DRAW-1"
    })));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.policy).toHaveBeenCalledWith(path, "POST",
      { expectedPermissionCode: "submission.update" });
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "submission.update" }],
      expect.any(Function));
    expect(mocks.findLock).toHaveBeenCalledWith(snapshot, {
      companyId: "company-jenfu", drawingNumber: "DRAW-1", partNumber: ""
    });
    expect((await response.json()).lockedByCurrentUser).toBe(true);
  });

  it("rejects a different company or missing identifiers without reading locks", async () => {
    const otherCompany = await POST(request(JSON.stringify({
      pdmCompanyCode: "MAXIMA", drawingNumber: "DRAW-1"
    })));
    expect(otherCompany.status).toBe(403);
    const missing = await POST(request(JSON.stringify({ pdmCompanyCode: "JENFU" })));
    expect(missing.status).toBe(400);
    const malformed = await POST(request("null"));
    expect(malformed.status).toBe(400);
    expect(mocks.findLock).not.toHaveBeenCalled();
  });

  it("does not fall back to a demo or legacy session", async () => {
    mocks.principalRead.mockResolvedValueOnce(null);
    const response = await POST(request(JSON.stringify({ drawingNumber: "DRAW-1" })));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("auth_session_invalid");
    expect(mocks.findLock).not.toHaveBeenCalled();
  });
});
