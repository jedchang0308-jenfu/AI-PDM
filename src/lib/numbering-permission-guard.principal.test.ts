import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuthAsync: vi.fn(),
  withVerified: vi.fn(),
  evaluate: vi.fn(),
  getUserById: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.requireAuthAsync }));
vi.mock("@/lib/auth-config", () => ({
  getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: () => "enforce" }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: () => "principal-token",
  principalRequestInput: () => ({ token: "principal-token" }),
  principalRequestFailure: () => Response.json({ code: "auth_session_invalid" }, { status: 401 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  JenfuPrincipalRequestError: class extends Error {
    constructor(readonly code: string) { super(code); }
  },
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/repositories/user-async-repository", () => ({
  AsyncUserRepository: class { getUserById = mocks.getUserById; }
}));
vi.mock("@/lib/company-context", () => ({
  resolvePrincipalCompanyContextInSnapshot: async () => ({
    company: { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business", displayName: "鉦富" },
    response: null
  })
}));

import { requireNumberingPermissionAsync, requirePrincipalNumberingPermissionAsync } from "@/lib/numbering-permission-guard";

const snapshot = { kind: "postgres" };
const verified = {
  profile: { pdmUserId: "profile-1", companyId: "company-jenfu" },
  session: {
    identityIssuer: "issuer-1", identitySubject: "subject-1", principalId: "principal-1",
    employeeId: "employee-1"
  }
};
const request = new Request("https://example.test/api/numbering/search");
const defaultCompany = { state: "absent" as const };

describe("DEV-121 v2 numbering guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withVerified.mockImplementation(async (_input, run) => run(snapshot, verified));
    mocks.getUserById.mockResolvedValue({ id: "profile-1", company_id: "company-jenfu", role: "Engineer" });
    mocks.evaluate.mockResolvedValue([{ allowed: true, decisionCode: "allowed", roleCode: "qa",
      assignmentId: "grant-1", principalId: "principal-1" }]);
  });

  it("uses the verified principal in one snapshot without invoking the v1 auth path", async () => {
    const result = await requirePrincipalNumberingPermissionAsync(request, "page", "numbering.search", defaultCompany);
    expect(result.response).toBeNull();
    expect(result.permission).toMatchObject({ allowed: true, roleCode: "qa" });
    expect(result.user.authorizationActor).toMatchObject({
      principalId: "principal-1", sessionSchemaVersion: 2, localPrincipalId: "profile-1"
    });
    expect(result.user.role).toBe("Principal");
    expect(result.company?.companyId).toBe("company-jenfu");
    expect(JSON.stringify(result.user)).not.toContain("principal-1");
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "page", permissionCode: "numbering.search" }]);
    expect(mocks.requireAuthAsync).not.toHaveBeenCalled();
  });

  it("does not accept an unproved project or mismatched workspace", async () => {
    const project = await requirePrincipalNumberingPermissionAsync(request, "action", "approval.request.decide", defaultCompany,
      { projectCode: "PROJECT-1" });
    const workspace = await requirePrincipalNumberingPermissionAsync(request, "page", "numbering.search", defaultCompany,
      { workspaceCode: "other-company" });
    expect(project.response?.status).toBe(403);
    expect(project.permission?.decisionCode).toBe("entitlement_scope_mismatch");
    expect(workspace.response?.status).toBe(403);
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("rejects profile drift and an incomplete principal decision", async () => {
    mocks.getUserById.mockResolvedValueOnce({ id: "profile-1", company_id: "other-company", role: "Admin" });
    const drift = await requirePrincipalNumberingPermissionAsync(request, "page", "numbering.search", defaultCompany);
    expect(drift.response?.status).toBe(401);
    mocks.evaluate.mockResolvedValueOnce([]);
    const partial = await requirePrincipalNumberingPermissionAsync(request, "page", "numbering.search", defaultCompany);
    expect(partial.response?.status).toBe(401);
    expect(mocks.requireAuthAsync).not.toHaveBeenCalled();
  });

  it("keeps an unreviewed numbering route closed to v2 sessions", async () => {
    const result = await requireNumberingPermissionAsync(request, "page", "numbering.search");
    expect(result.response?.status).toBe(503);
    expect(mocks.requireAuthAsync).not.toHaveBeenCalled();
    expect(mocks.withVerified).not.toHaveBeenCalled();
  });
});
