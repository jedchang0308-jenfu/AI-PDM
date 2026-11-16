import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "on", withVerified: vi.fn(), evaluate: vi.fn(), listPrincipal: vi.fn(), listSubmitted: vi.fn()
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
  AsyncApprovalPlatformRepository: class {
    listPrincipalWorkReviewInbox = mocks.listPrincipal;
    listPrincipalSubmittedReviews = mocks.listSubmitted;
  }
}));
import { GET } from "@/app/api/approvals/inbox/route";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one", assuranceLevel: "aal1" }
};
const snapshot = { kind: "postgres", transactionScope: "postgres" };
function request(token = true, filters = "status=active") {
  const header = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
    .toString("base64url");
  return new Request(`https://pdm.example/api/approvals/inbox?${filters}`, {
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
  mocks.listSubmitted.mockResolvedValue({ items: [], nextCursor: null, previousCursor: null,
    summary: { total: 0, pending: 0, needsInfo: 0, applyFailed: 0 } });
});

describe("Principal approval inbox", () => {
  it("uses the verified actor and available source permissions for my submissions", async () => {
    mocks.withVerified.mockImplementationOnce(async (_input, action) => action(snapshot, {
      ...verified, permissions: { catalogVersion: "ai-pdm.role-policy.fixture" }
    }));
    mocks.evaluate.mockImplementationOnce(async (_tx, _verified, checks: { permissionCode: string }[]) =>
      checks.map((check, index) => ({ ...check, allowed: index === 0,
        principalId: "principal-one", decisionCode: index === 0 ? "allowed" : "permission_not_granted" })));

    const response = await GET(request(true, "view=submitted&actorId=other-profile&companyId=other-company"));

    expect(response.status).toBe(200);
    expect(mocks.withVerified).toHaveBeenCalledOnce();
    expect(mocks.evaluate).toHaveBeenCalledOnce();
    expect(mocks.listPrincipal).not.toHaveBeenCalled();
    expect(mocks.listSubmitted).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", actorId: "profile-one", status: "all",
      readable: { drawing: true, part: false, transfer: false }
    }));
  });

  it("uses the verified Principal grant and reads assigned reviews in the same snapshot", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(mocks.listPrincipal).toHaveBeenCalledWith(expect.objectContaining({
      companyId: "company-jenfu", actorId: "profile-one", principalId: "principal-one", status: "active"
    }));
  });

  it("opens the shared inbox for a drawing-only reviewer without relying on a broad inbox grant", async () => {
    mocks.withVerified.mockImplementationOnce(async (_input, action) => action(snapshot, {
      ...verified, permissions: { catalogVersion: "ai-pdm.role-policy.fixture" }
    }));
    mocks.evaluate.mockImplementation(async (_tx, _verified,
      checks: { permissionCode: string; resourceGroup?: string }[]) => checks.map(check => {
      const allowed = check.resourceGroup === "drawing";
      return { ...check, allowed, principalId: "principal-one",
        decisionCode: allowed ? "allowed" : "permission_not_granted" };
    }));
    expect((await GET(request())).status).toBe(200);
    expect(mocks.withVerified).toHaveBeenCalledOnce();
    expect(mocks.listPrincipal).toHaveBeenCalledWith(expect.objectContaining({
      includeAssigned: false,
      sharedAccess: expect.objectContaining({ drawing: true, part: false, transfer: false })
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
