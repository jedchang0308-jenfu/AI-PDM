import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "on", withVerified: vi.fn(), evaluate: vi.fn(), listPrincipal: vi.fn()
}));
vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-config")>(),
  getJenfuPlatformAuthMode: () => mocks.mode
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/repositories/approval-platform-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/approval-platform-async-repository")>(),
  AsyncApprovalPlatformRepository: class { listPrincipalWorkReviewInbox = mocks.listPrincipal; }
}));
import { GET } from "@/app/api/approvals/inbox/route";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one", assuranceLevel: "aal1" }
};
const snapshot = { kind: "postgres", transactionScope: "postgres" };
function request(token = true) {
  const header = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
    .toString("base64url");
  return new Request("https://pdm.example/api/approvals/inbox?status=active", {
    headers: token ? { cookie: `__session=${header}.payload.signature` } : {}
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mode = "on";
  mocks.withVerified.mockImplementation(async (_input, action) => action(snapshot, verified));
  mocks.evaluate.mockResolvedValue([{
    allowed: true, permissionCode: "approval.inbox.view", principalId: "principal-one",
    decisionCode: "allowed"
  }]);
  mocks.listPrincipal.mockResolvedValue({ items: [], nextCursor: null, previousCursor: null,
    summary: { total: 0, pending: 0, needsInfo: 0, applyFailed: 0 } });
});

describe("Principal approval inbox", () => {
  it("uses the verified Principal grant and reads assigned reviews in the same snapshot", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.listPrincipal).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", actorId: "profile-one", principalId: "principal-one", status: "active"
    }));
  });

  it("rejects missing or denied Principal access before reading an inbox", async () => {
    expect((await GET(request(false))).status).toBe(401);
    mocks.evaluate.mockResolvedValueOnce([{
      allowed: false, permissionCode: "approval.inbox.view", principalId: "principal-one",
      decisionCode: "permission_not_granted"
    }]);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.listPrincipal).not.toHaveBeenCalled();
  });

  it("rejects off-mode instead of entering historical role authorization", async () => {
    mocks.mode = "off";
    expect((await GET(request())).status).toBe(503);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(mocks.listPrincipal).not.toHaveBeenCalled();
  });

  it("fails closed on another principal and accepts a published grant at AAL1", async () => {
    mocks.evaluate.mockResolvedValueOnce([{
      allowed: true, permissionCode: "approval.inbox.view", principalId: "principal-other",
      decisionCode: "allowed"
    }]);
    expect((await GET(request())).status).toBe(503);
    mocks.withVerified.mockImplementationOnce(async (_input, action) => action(snapshot, {
      ...verified, session: { ...verified.session, assuranceLevel: "aal1" }
    }));
    expect((await GET(request())).status).toBe(200);
    expect(mocks.listPrincipal).toHaveBeenCalledOnce();
    mocks.evaluate.mockResolvedValueOnce([{
      allowed: false, permissionCode: "approval.inbox.view", principalId: "principal-one",
      decisionCode: "permission_not_granted"
    }]);
    expect((await GET(request())).status).toBe(403);
  });
});
