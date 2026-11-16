import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePrincipal: vi.fn(),
  resolvePolicy: vi.fn(),
  token: vi.fn(),
  principalInput: vi.fn(),
  admit: vi.fn()
}));

vi.mock("@/lib/numbering-permission-guard", () => ({ requirePrincipalNumberingPermissionAsync: mocks.requirePrincipal }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => ({ state: "absent" })
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicyFromRequest: mocks.resolvePolicy }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: mocks.principalInput
}));
vi.mock("@/lib/production-smoke-runtime", () => ({ assertProductionSmokeRuntimeIsolation: vi.fn() }));

vi.mock("@/lib/jenfu-principal-request-guard", async original => ({
  ...await original<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.admit
}));

import { requireNumberingPlatformCommandAsync, withTransferReviewCommand } from "@/lib/platform-command-context";

const verified = {
  identityIssuer: "https://issuer.test", identitySubject: "subject-one",
  principalId: "principal-one", employeeId: "employee-one",
  localPrincipalId: "profile-one", companyId: "company-one",
  sessionSchemaVersion: 2 as const
};

describe("DEV-121 command ingress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolvePolicy.mockReturnValue({ path: "src/app/api/numbering/records/route.ts", method: "POST",
      permissionCode: "numbering.create", authorizationMode: "permission", scopeResolver: "workspace" });
    mocks.token.mockReturnValue("verified-session-token");
    mocks.principalInput.mockReturnValue({ token: "verified-session-token" });
  });

  async function ingress(authorizationActor?: typeof verified, localRole = "Engineer") {
    mocks.requirePrincipal.mockResolvedValue({
      user: { id: "profile-one", role: localRole, company_id: "company-one", authorizationActor },
      company: { companyId: "company-one", companyCode: "JENFU", companyKind: "business" },
      permission: { allowed: true, roleCode: "rd", evaluatedRoles: ["rd"] }, response: null
    });
    return requireNumberingPlatformCommandAsync(new Request("https://ai-pdm.test/api/numbering/records", {
      method: "POST", headers: { "idempotency-key": "operation-one" }
    }), { action: "numbering.create", body: {} });
  }

  it("rejects a PostgreSQL human command without a verified actor before producing metadata", async () => {
    const result = await ingress();
    expect(result.response?.status).toBe(401);
    expect(result.actor).toBeNull();
    expect(result.metadata).toBeNull();
  });

  it("keeps a command without an exact route policy closed before authorization", async () => {
    mocks.resolvePolicy.mockReturnValue(null);
    const result = await ingress(verified);
    expect(result.response?.status).toBe(503);
    expect(mocks.requirePrincipal).not.toHaveBeenCalled();
  });

  it("does not use a verified principal for another company", async () => {
    const result = await ingress({ ...verified, companyId: "company-two" });
    expect(result.response?.status).toBe(403);
    expect(result.metadata).toBeNull();
  });

  it("passes the exact verified principal and idempotency key into the command", async () => {
    const result = await ingress(verified, "Admin");
    expect(result.response).toBeNull();
    if (result.response) return;
    expect(result.actor.principalId).toBe(verified.principalId);
    expect(result.actor.roles).toEqual(["rd"]);
    expect(result.actor.legacyRole).toBeUndefined();
    expect(result.metadata.actor.authorizationActor).toEqual(verified);
    expect(result.metadata.idempotencyKey).toBe("operation-one");
    expect(result.metadata.principalRequest).toEqual({ token: "verified-session-token" });
    expect(result.metadata.principalAuthorization).toMatchObject({
      routePath: "src/app/api/numbering/records/route.ts", method: "POST", permissionCode: "numbering.create"
    });
  });

  it("uses only the fixed part attachment route as the ingress parent group", async () => {
    const routePath = "src/app/api/parts/[partNumber]/attachments/[attachmentId]/previews/route.ts";
    mocks.resolvePolicy.mockReturnValue({ path: routePath, method: "POST",
      permissionCode: "numbering.attachments.manage", authorizationMode: "permission", scopeResolver: "workspace" });
    mocks.requirePrincipal.mockResolvedValue({
      user: { id: "profile-one", role: "Principal", company_id: "company-one", authorizationActor: verified },
      company: { companyId: "company-one", companyCode: "JENFU", companyKind: "business" },
      permission: { allowed: true, roleCode: "rd", evaluatedRoles: ["rd"] }, response: null
    });
    const request = new Request("https://ai-pdm.test/api/parts/PN-1/attachments/asset-one/previews", { method: "POST" });
    const result = await requireNumberingPlatformCommandAsync(request, {
      action: "numbering.attachments.manage", body: { resourceGroup: "drawing" }
    });
    expect(result.response).toBeNull();
    expect(mocks.requirePrincipal).toHaveBeenCalledWith(request, "action", "numbering.attachments.manage",
      { state: "absent" }, { resourceGroups: ["part"] });
  });

  it("scopes part upload ingress only for dynamic policies; category-specific model authorization stays in the command snapshot", async () => {
    const routePath = "src/app/api/parts/[partNumber]/attachments/route.ts";
    mocks.resolvePolicy.mockReturnValue({ path: routePath, method: "POST",
      permissionCode: "numbering.attachments.manage", authorizationMode: "permission", scopeResolver: "workspace" });
    mocks.requirePrincipal.mockResolvedValue({
      user: { id: "profile-one", role: "Principal", company_id: "company-one", authorizationActor: verified },
      company: { companyId: "company-one", companyCode: "JENFU", companyKind: "business" },
      permission: { allowed: true, roleCode: "rd", evaluatedRoles: ["rd"] }, response: null
    });
    const request = new Request("https://ai-pdm.test/api/parts/PN-1/attachments", { method: "POST" });
    const result = await requireNumberingPlatformCommandAsync(request, {
      action: "numbering.attachments.manage", body: { resourceGroup: "model" }
    });
    expect(result.response).toBeNull();
    expect(mocks.requirePrincipal).toHaveBeenCalledWith(request, "action", "numbering.attachments.manage",
      { state: "absent" }, { resourceGroups: ["part"], resourceGroupsDynamicOnly: true });
  });
});


describe("transfer review write admission", () => {
  const tx = { query: vi.fn() };
  const session = { principalId: "principal-one", identityIssuer: "https://issuer.test",
    identitySubject: "subject-one", employeeId: "employee-one" };
  const admitted = { profile: { pdmUserId: "profile-one", companyId: "company-jenfu" }, session };
  const principalInput = { token: "verified-session-token" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PDM_AUTH_MODE", "firebase_bff");
    vi.stubEnv("PDM_JENFU_PLATFORM_AUTH_MODE", "on");
    vi.stubEnv("PDM_JENFU_ENTITLEMENT_MODE", "enforce");
    mocks.resolvePolicy.mockReturnValue({
      path: "src/app/api/transfer-packages/[id]/submit-review/route.ts",
      method: "POST", authorizationMode: "permission", scopeResolver: "workspace"
    });
    mocks.token.mockReturnValue(principalInput.token);
    mocks.principalInput.mockReturnValue(principalInput);
    tx.query.mockResolvedValue([{ id: "company-jenfu", company_code: "JENFU",
      company_kind: "business", display_name: "Test company" }]);
    mocks.admit.mockImplementation(async (_input, evaluate) => evaluate(tx, admitted));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("passes the admitted session to the command without opening a second snapshot", async () => {
    const request = new Request("https://ai-pdm.test/api/transfer-packages/package-one/submit-review", {
      method: "POST", headers: { "idempotency-key": "submit-one" }
    });
    const response = await withTransferReviewCommand(request, { action: "transfer.package.review.submit", body: {} },
      async (client, metadata) => {
        expect(client).toBe(tx);
        expect(metadata.actor).toMatchObject({ pdmUserId: "profile-one", organizationId: "company-jenfu" });
        expect(metadata.principalRequest).toBe(principalInput);
        expect(metadata.idempotencyKey).toBe("submit-one");
        expect(() => metadata.inVerifiedSnapshot!({ ...metadata.principalRequest! }, async () => null))
          .toThrow("auth_session_invalid");
        return metadata.inVerifiedSnapshot!(metadata.principalRequest!, async (commandClient, verified) => {
          expect(commandClient).toBe(tx);
          expect(verified).toBe(admitted);
          return Response.json({ ok: true });
        });
      });

    expect(response.status).toBe(200);
    expect(mocks.admit).toHaveBeenCalledOnce();
    expect(mocks.admit).toHaveBeenCalledWith(principalInput, expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.requirePrincipal).not.toHaveBeenCalled();
  });
});
