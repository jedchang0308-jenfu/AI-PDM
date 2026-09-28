import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  verifiedRequest: vi.fn(),
  company: vi.fn(),
  evaluate: vi.fn()
}));

vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAuthMode: () => "firebase_bff",
  getJenfuPlatformAuthMode: () => "on"
}));
vi.mock("@/lib/entitlement-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getJenfuEntitlementMode: () => "enforce"
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: () => ({ token: "verified-token" })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withVerifiedJenfuPrincipalRequest: mocks.verifiedRequest
}));
vi.mock("@/lib/company-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolvePrincipalCompanyContextInSnapshot: mocks.company
}));
vi.mock("@/lib/jenfu-principal-permission-service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));

import { authorizePrincipalWorkspaceExternalRead } from "@/lib/principal-company-read";

const snapshot = { kind: "postgres" };
const verified = {
  session: { principalId: "principal-one" },
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" }
};
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business",
  displayName: "Jenfu" };
const routePath = "src/app/api/settings/secrets/route.ts";
const request = () => new Request("https://ai-pdm.test/api/settings/secrets");

describe("principal authorization before external reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("signed-token");
    mocks.company.mockResolvedValue({ company, response: null });
    mocks.evaluate.mockResolvedValue([{ allowed: true, principalId: "principal-one",
      permissionCode: "settings.secret.manage" }]);
    mocks.verifiedRequest.mockImplementation(async (_input, useSnapshot) =>
      useSnapshot(snapshot, verified));
  });

  it("returns only the verified subject after the permission snapshot finishes", async () => {
    const result = await authorizePrincipalWorkspaceExternalRead(request(), routePath,
      "settings.secret.manage");
    expect(result).toEqual({ principalId: "principal-one", profileId: "profile-one", company });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "settings.secret.manage" }]);
  });

  it("uses the published admin-matrix grant for the role change feed", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId: "principal-one",
      permissionCode: "settings.admin_matrix" }]);
    const result = await authorizePrincipalWorkspaceExternalRead(
      new Request("https://ai-pdm.test/api/settings/access/role-capabilities/change-feed"),
      "src/app/api/settings/access/role-capabilities/change-feed/route.ts",
      "settings.admin_matrix");

    expect(result).toEqual({ principalId: "principal-one", profileId: "profile-one", company });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "settings.admin_matrix" }]);
  });

  it("binds an external computation to its exact POST policy", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true, principalId: "principal-one",
      permissionCode: "pdm.file_metadata.detect" }]);
    const post = new Request("https://ai-pdm.test/api/file-metadata/detect", { method: "POST" });
    const result = await authorizePrincipalWorkspaceExternalRead(post,
      "src/app/api/file-metadata/detect/route.ts", "pdm.file_metadata.detect", "POST");
    expect(result).toEqual({ principalId: "principal-one", profileId: "profile-one", company });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "pdm.file_metadata.detect" }]);
    const wrongMethod = await authorizePrincipalWorkspaceExternalRead(request(),
      "src/app/api/file-metadata/detect/route.ts", "pdm.file_metadata.detect", "POST");
    expect((wrongMethod as Response).status).toBe(503);
    expect(mocks.verifiedRequest).toHaveBeenCalledOnce();
  });

  it("rejects denied, missing-token and wrong-policy requests before provider access", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false, principalId: "principal-one",
      permissionCode: "settings.secret.manage", decisionCode: "permission_not_granted" }]);
    const denied = await authorizePrincipalWorkspaceExternalRead(request(), routePath,
      "settings.secret.manage");
    expect(denied).toBeInstanceOf(Response);
    expect((denied as Response).status).toBe(403);

    mocks.token.mockReturnValueOnce(null);
    const missing = await authorizePrincipalWorkspaceExternalRead(request(), routePath,
      "settings.secret.manage");
    expect((missing as Response).status).toBe(401);

    const wrongPolicy = await authorizePrincipalWorkspaceExternalRead(request(), routePath,
      "settings.manage");
    expect((wrongPolicy as Response).status).toBe(503);
    expect(mocks.verifiedRequest).toHaveBeenCalledTimes(1);
  });
});
