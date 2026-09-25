import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(),
  evaluate: vi.fn(),
  priority: vi.fn(),
  localAcl: vi.fn(), catalogInput: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/repositories/access-control-async-repository", () => ({
  AsyncAccessControlRepository: class {
    getEnforcedRolePriority = mocks.priority;
  }
}));
vi.mock("@/lib/repositories/jenfu-entitlement-repository", () => ({
  JenfuEntitlementRepository: class {
    constructor(_client: unknown, catalog: unknown) { mocks.catalogInput(catalog); }
    evaluatePermissions = mocks.evaluate;
  }
}));
vi.mock("@/lib/repositories/principal-local-acl-repository", () => ({
  PrincipalLocalAclRepository: class {
    evaluateWorkspace = mocks.localAcl;
  }
}));

import { evaluatePrincipalWorkspacePermissions } from "@/lib/jenfu-principal-permission-service";
import principalRoleCatalog from "../../config/access-control/jenfu-role-catalog.v4.json" with { type: "json" };

const snapshot = { query: vi.fn(async (_sql: string): Promise<Array<Record<string, string | number>>> =>
  [{ decision_at: "2026-09-24T12:00:00Z" }]) };
const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: {
    contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm", sessionId: "session-one",
    identityIssuer: "https://issuer.test", identitySubject: "subject-one",
    principalId: "principal-one", employeeId: "employee-one", authEpoch: 1,
    issuedAt: "2026-09-24T11:00:00Z", expiresAt: "2026-09-24T19:00:00Z",
    assuranceLevel: "aal2"
  }
};
const authority = { authorityVersion: 6 };
const input = { token: "signed-token", keyRing: {} as never, identityIssuer: "https://issuer.test",
  trustPolicy: {} as never, database: {} as never,
  permissions: [{ permissionKind: "action" as const, permissionCode: "numbering.create" }] };
const publishedCatalogRows = principalRoleCatalog.roles.map((role, displayOrder) => ({
  contract_version: principalRoleCatalog.contractVersion,
  application_id: principalRoleCatalog.applicationId,
  catalog_version: principalRoleCatalog.catalogVersion,
  catalog_sha256: principalRoleCatalog.catalogSha256,
  display_order: displayOrder,
  stable_role_id: role.stableRoleId,
  role_definition_hash: role.roleDefinitionHash
}));

describe("DEV-121 principal workspace permission decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    snapshot.query.mockImplementation(async (sql: string) =>
      sql.includes("v_application_role_catalog_v1")
        ? publishedCatalogRows : [{ decision_at: "2026-09-24T12:00:00Z" }]);
    mocks.withVerified.mockImplementation(async (_request, evaluate) => evaluate(snapshot, verified));
    mocks.priority.mockResolvedValue(["system_admin", "rd_manager", "rd"]);
  });

  it("uses only the verified principal and company for an OrgMaster grant", async () => {
    mocks.evaluate.mockResolvedValue([{ authority, decisionCode: "allowed",
      role: { risk: "normal", roleCode: "rd" }, assignment: { assignmentId: "grant-one" } }]);
    const result = await evaluatePrincipalWorkspacePermissions(input);
    expect(result).toEqual([{ allowed: true, permissionCode: "numbering.create", decisionCode: "allowed",
      roleCode: "rd", assignmentId: "grant-one", principalId: "principal-one", authorityVersion: 6 }]);
    const [[queries, decisionAt]] = mocks.evaluate.mock.calls;
    expect(queries[0]).toMatchObject({
      actor: { principalId: "principal-one", localPrincipalId: "profile-one",
        companyId: "company-jenfu", sessionSchemaVersion: 2 },
      workspaceCode: "company-jenfu", projectCode: null,
      permissionCode: "numbering.create"
    });
    expect(decisionAt).toEqual(new Date("2026-09-24T12:00:00Z"));
    expect(snapshot.query).toHaveBeenCalledWith("SELECT transaction_timestamp()::text AS decision_at");
    expect(mocks.catalogInput).toHaveBeenCalledWith(principalRoleCatalog);
  });

  it("reads only principal-local ACL for a selected legacy authority", async () => {
    mocks.evaluate.mockResolvedValue([{ authority, decisionCode: "legacy_authority" }]);
    mocks.localAcl.mockResolvedValue([{ allowed: true, decisionCode: "allowed", roleCode: "rd", assignmentId: "principal-grant" }]);
    await expect(evaluatePrincipalWorkspacePermissions(input)).resolves.toMatchObject([
      { allowed: true, decisionCode: "allowed", roleCode: "rd", assignmentId: "principal-grant" }
    ]);
    expect(mocks.localAcl).toHaveBeenCalledWith(expect.objectContaining({
      principalId: "principal-one", decisionAt: new Date("2026-09-24T12:00:00Z")
    }));
  });

  it("keeps explicit deny and privileged AAL1 requests closed", async () => {
    mocks.evaluate.mockResolvedValue([{ authority, decisionCode: "permission_explicit_deny" }]);
    await expect(evaluatePrincipalWorkspacePermissions(input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "permission_explicit_deny" }
    ]);
    mocks.withVerified.mockImplementation(async (_request, evaluate) => evaluate(snapshot, {
      ...verified, session: { ...verified.session, assuranceLevel: "aal1" }
    }));
    mocks.evaluate.mockResolvedValue([{ authority, decisionCode: "allowed",
      role: { risk: "high", roleCode: "rd_manager" }, assignment: { assignmentId: "grant-two" } }]);
    await expect(evaluatePrincipalWorkspacePermissions(input)).resolves.toMatchObject([
      { allowed: false, decisionCode: "assurance_insufficient", roleCode: null }
    ]);
  });

  it("does not treat an empty permission batch as an authentication bypass", async () => {
    await expect(evaluatePrincipalWorkspacePermissions({ ...input, permissions: [] }))
      .rejects.toMatchObject({ code: "auth_session_invalid" });
    expect(mocks.withVerified).toHaveBeenCalledTimes(1);
  });

  it("uses v4 for every principal capability only after active catalog readback in the same snapshot", async () => {
    mocks.evaluate.mockResolvedValue([{ authority, decisionCode: "allowed",
      role: { risk: "normal", roleCode: "rd" }, assignment: { assignmentId: "grant-one" } }]);
    const permission = { ...input, permissions: [{ permissionKind: "action" as const,
      permissionCode: "numbering.workspace.create" }] };
    await expect(evaluatePrincipalWorkspacePermissions(permission))
      .resolves.toMatchObject([{ allowed: true }]);
    expect(mocks.catalogInput).toHaveBeenCalledWith(principalRoleCatalog);

    snapshot.query.mockImplementation(async (sql: string) =>
      sql.includes("v_application_role_catalog_v1")
        ? [{ catalog_version: "ai-pdm.role-catalog.2026-09-03.v3" }]
        : [{ decision_at: "2026-09-24T12:00:00Z" }]);
    await expect(evaluatePrincipalWorkspacePermissions(input))
      .rejects.toMatchObject({ code: "principal_dependency_unavailable" });
    expect(mocks.evaluate).toHaveBeenCalledTimes(1);
  });
});
