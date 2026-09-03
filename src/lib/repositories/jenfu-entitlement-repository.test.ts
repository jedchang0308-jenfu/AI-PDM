import { describe, expect, it } from "vitest";
import {
  JenfuEntitlementRepository,
  type JenfuEntitlementRoleCatalog
} from "@/lib/repositories/jenfu-entitlement-repository";

const actor = {
  identityIssuer: "https://securetoken.google.com/jenfu-test",
  identitySubject: "uid-001",
  principalId: "principal-001",
  employeeId: "employee-001"
};

const authorityRow = {
  contract_version: "jenfu.platform-entitlement.v1",
  application_id: "ai-pdm",
  authority_source: "orgmaster_authority" as const,
  authority_version: 2,
  employee_id: null,
  updated_at: "2026-01-01T00:00:00.000Z",
  operation_id: null
};

const assignment = {
  contract_version: "jenfu.platform-entitlement.v1",
  assignment_version_id: "assignment-version-1",
  assignment_version: 1,
  assignment_id: "assignment-1",
  grant_kind: "direct" as const,
  delegation_id: null,
  application_id: "ai-pdm",
  identity_issuer: actor.identityIssuer,
  identity_subject: actor.identitySubject,
  principal_id: actor.principalId,
  employee_id: actor.employeeId,
  subject_kind: "employee" as const,
  target_principal_id: null,
  stable_role_id: "role-rd",
  role_code: "rd",
  catalog_version: "stale-provenance-is-allowed",
  scope_kind: "workspace" as const,
  scope_key: "workspace-1",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_until: null,
  published_at: "2026-01-01T00:00:00.000Z",
  authority_version: 2
};

type FakeClientOptions = {
  authorityRows?: unknown[];
  assignmentRows?: unknown[];
  failAuthority?: boolean;
  failAssignments?: boolean;
};

function fakeClient(options: FakeClientOptions = {}) {
  return {
    kind: "postgres" as const,
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) {
        if (options.failAuthority) throw new Error("authority database unavailable");
        return (options.authorityRows ?? [authorityRow]) as T[];
      }
      if (options.failAssignments) throw new Error("assignment database unavailable");
      return (options.assignmentRows ?? [assignment]) as T[];
    },
    async queryOne<T>(): Promise<T | null> { return null; },
    async execute(): Promise<void> {},
    async transaction<T>(fn: (client: any) => Promise<T> | T): Promise<T> { return fn(this); },
    async close(): Promise<void> {}
  };
}

function repository(options: FakeClientOptions = {}, activeCatalog?: JenfuEntitlementRoleCatalog) {
  return new JenfuEntitlementRepository(fakeClient(options), activeCatalog);
}

describe("DEV-005 EntitlementRepository", () => {
  it("allows an explicit active workspace permission even when catalogVersion is provenance-only", async () => {
    const result = await repository().evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "workspace-1"
    });
    expect(result.decisionCode).toBe("allowed");
    if (result.decisionCode === "allowed") expect(result.assignment.assignmentId).toBe("assignment-1");
  });

  it("allows an external specialist only for the assigned project", async () => {
    const projectAssignment = {
      ...assignment,
      stable_role_id: "role-external-specialist",
      role_code: "external_specialist",
      scope_kind: "project" as const,
      scope_key: "PROJECT-001",
      valid_until: "2099-01-01T00:00:00.000Z"
    };
    const scopedRepository = repository({ assignmentRows: [projectAssignment] });
    await expect(scopedRepository.evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "workspace-1",
      projectCode: "PROJECT-001"
    })).resolves.toMatchObject({ decisionCode: "allowed" });
    await expect(scopedRepository.evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "workspace-1",
      projectCode: "PROJECT-002"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
    await expect(scopedRepository.evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
  });

  it("does not read effective assignments after selecting legacy authority", async () => {
    const result = await repository({
      authorityRows: [{ ...authorityRow, authority_source: "legacy_authority" }],
      failAssignments: true
    }).evaluatePermission({ actor, permissionKind: "page", permissionCode: "numbering.request" });
    expect(result.decisionCode).toBe("legacy_authority");
    expect(result.assignments).toHaveLength(0);
  });

  it("fails closed when authority is missing, duplicated, or unavailable", async () => {
    await expect(repository({ authorityRows: [] }).resolveAuthority({ employeeId: actor.employeeId }))
      .rejects.toMatchObject({ code: "entitlement_authority_unknown" });
    await expect(repository({ authorityRows: [authorityRow, { ...authorityRow, authority_source: "legacy_authority" }] }).resolveAuthority({ employeeId: actor.employeeId }))
      .rejects.toMatchObject({ code: "entitlement_dual_authority_detected" });
    await expect(repository({ failAuthority: true }).resolveAuthority({ employeeId: actor.employeeId }))
      .rejects.toMatchObject({ code: "entitlement_authority_unavailable" });
  });

  it("fails closed when the assignment projection is unavailable", async () => {
    await expect(repository({ failAssignments: true }).evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "entitlement_authority_unavailable" });
  });

  it("rejects workspace scope mismatch", async () => {
    await expect(repository().evaluatePermission({
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "workspace-2"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
  });

  it("rejects inactive roles, catalog mismatches, expired assignments, and missing permissions", async () => {
    await expect(repository({ assignmentRows: [{ ...assignment, stable_role_id: "role-retired" }] }).evaluatePermission({
      actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "entitlement_role_inactive" });
    await expect(repository({ assignmentRows: [{ ...assignment, role_code: "qa" }] }).evaluatePermission({
      actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository({ assignmentRows: [{ ...assignment, valid_until: "2026-02-01T00:00:00.000Z" }] }).evaluatePermission({
      actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository().evaluatePermission({
      actor, permissionKind: "page", permissionCode: "unknown.permission", workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "permission_not_granted" });
  });

  it("preserves explicit deny semantics in an injected catalog", async () => {
    const denyCatalog: JenfuEntitlementRoleCatalog = {
      roles: [{
        stableRoleId: "role-rd",
        roleCode: "rd",
        displayName: "研發",
        assignable: true,
        risk: "normal",
        subjectKind: "employee",
        recommendationAllowed: true,
        delegationAllowed: true,
        allowedScopeKinds: ["workspace"],
        assignmentTier: "app_admin",
        permissions: [{ code: "numbering.request", kind: "page", allowed: false }],
        roleDefinitionHash: "test-only-explicit-deny"
      }]
    };
    await expect(repository({}, denyCatalog).evaluatePermission({
      actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "workspace-1"
    })).rejects.toMatchObject({ code: "permission_explicit_deny" });
  });

  it("rejects duplicate rows and the 32-row safety bound", async () => {
    await expect(repository({ assignmentRows: [assignment, { ...assignment, assignment_id: "assignment-duplicate" }] }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    const tooManyRows = Array.from({ length: 33 }, (_, index) => ({
      ...assignment,
      assignment_id: `assignment-${index}`,
      stable_role_id: `role-${index}`
    }));
    await expect(repository({ assignmentRows: tooManyRows }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });
});
