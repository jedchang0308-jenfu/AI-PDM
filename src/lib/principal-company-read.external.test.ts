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

import { authorizePrincipalWorkspaceExternalRead, withPrincipalCompanyWrite } from "@/lib/principal-company-read";

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

describe("principal workspace write boundary", () => {
  const settingsPath = "src/app/api/settings/route.ts";
  const settingsRequest = () => new Request("https://ai-pdm.test/api/settings", { method: "POST" });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("signed-token");
    mocks.company.mockResolvedValue({ company, response: null });
    mocks.evaluate.mockResolvedValue([{ allowed: true, principalId: "principal-one",
      permissionCode: "settings.manage" }]);
    mocks.verifiedRequest.mockImplementation(async (_input, useSnapshot) =>
      useSnapshot(snapshot, verified));
  });

  it("binds the exact POST grant and executes a write in the verified serializable snapshot", async () => {
    const write = vi.fn(async () => Response.json({ saved: true }));
    const result = await withPrincipalCompanyWrite(settingsRequest(), settingsPath,
      "settings.manage", write);
    expect(result.status).toBe(200);
    expect(mocks.verifiedRequest).toHaveBeenCalledWith({ token: "verified-token" },
      expect.any(Function), { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified,
      [{ permissionKind: "action", permissionCode: "settings.manage" }]);
    expect(write).toHaveBeenCalledWith(snapshot, company, verified);
  });

  it("never invokes the write after deny or company mismatch", async () => {
    const write = vi.fn(async () => Response.json({ saved: true }));
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false, principalId: "principal-one",
      permissionCode: "settings.manage", decisionCode: "permission_not_granted" }]);
    expect((await withPrincipalCompanyWrite(settingsRequest(), settingsPath,
      "settings.manage", write)).status).toBe(403);
    mocks.company.mockResolvedValueOnce({ company: null,
      response: Response.json({ code: "entitlement_scope_mismatch" }, { status: 403 }) });
    expect((await withPrincipalCompanyWrite(settingsRequest(), settingsPath,
      "settings.manage", write)).status).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });

  it("throws a rejected write out of the transaction while preserving its response", async () => {
    let transactionFailure: unknown;
    mocks.verifiedRequest.mockImplementationOnce(async (_input, useSnapshot) => {
      try { return await useSnapshot(snapshot, verified); }
      catch (error) { transactionFailure = error; throw error; }
    });
    const result = await withPrincipalCompanyWrite(settingsRequest(), settingsPath,
      "settings.manage", async () => Response.json({ code: "invalid_settings" }, { status: 400 }));
    expect(result.status).toBe(400);
    expect(transactionFailure).toBeInstanceOf(Error);
    expect((transactionFailure as Error).message).toBe("principal_write_rejected");
  });

  it("rejects a mismatched route, method, or policy before starting a transaction", async () => {
    const write = vi.fn(async () => Response.json({ saved: true }));
    expect((await withPrincipalCompanyWrite(request(), settingsPath,
      "settings.manage", write)).status).toBe(503);
    expect((await withPrincipalCompanyWrite(settingsRequest(), routePath,
      "settings.manage", write)).status).toBe(503);
    expect((await withPrincipalCompanyWrite(settingsRequest(), settingsPath,
      "settings.secret.manage", write)).status).toBe(503);
    expect(mocks.verifiedRequest).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});
