import { describe, expect, it } from "vitest";
import {
  JenfuEntitlementRepository,
  type JenfuEntitlementRoleCatalog
} from "@/lib/repositories/jenfu-entitlement-repository";

const actor = {
  identityIssuer: "https://securetoken.google.com/jenfu-test",
  identitySubject: "uid-001",
  principalId: "principal-001",
  employeeId: "employee-001",
  localPrincipalId: "local-user-001",
  companyId: "company-jenfu"
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
  contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v2",
  assignment_version_id: "assignment-version-1",
  assignment_version: 1,
  assignment_id: "assignment-1",
  grant_kind: "direct" as const,
  delegation_id: null,
  application_id: "ai-pdm",
  principal_id: actor.principalId,
  employee_id: actor.employeeId,
  subject_kind: "employee" as const,
  target_principal_id: null,
  stable_role_id: "role-rd",
  role_code: "rd",
  catalog_version: "stale-provenance-is-allowed",
  scope_kind: "workspace" as const,
  scope_key: "current",
  valid_from: "2026-01-01T00:00:00.000Z",
  valid_until: null,
  published_at: "2026-01-01T00:00:00.000Z",
  authority_version: 2
};

const activeAccount = {
  contract_version: "organization.active-principal.v1",
  principal_issuer: actor.identityIssuer,
  principal_subject: actor.identitySubject,
  principal_id: actor.principalId,
  employee_id: actor.employeeId,
  employee_status: "active"
};

type FakeClientOptions = {
  authorityRows?: unknown[];
  activeAccountRows?: unknown[];
  assignmentRows?: unknown[];
  failAuthority?: boolean;
  failAssignments?: boolean;
  requireApplicationIdParam?: boolean;
};

function fakeClient(options: FakeClientOptions = {}) {
  return {
    kind: "postgres" as const,
    async query<T>(sql: string, params?: unknown): Promise<T[]> {
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) {
        if (options.failAuthority) throw new Error("authority database unavailable");
        return (options.authorityRows ?? [authorityRow]) as T[];
      }
      if (options.failAssignments) throw new Error("assignment database unavailable");
      if (sql.includes("v_active_principal_accounts_v1")) {
        return (options.activeAccountRows ?? [activeAccount]) as T[];
      }
      if (options.requireApplicationIdParam) {
        const named = params && typeof params === "object" && !Array.isArray(params)
          ? params as Record<string, unknown>
          : {};
        if (named.applicationId !== "ai-pdm") throw new Error("POSTGRES_NAMED_PARAMETER_MISSING: applicationId");
      }
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
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "company-jenfu"
    });
    expect(result.decisionCode).toBe("allowed");
    if (result.decisionCode === "allowed") expect(result.assignment.assignmentId).toBe("assignment-1");
  });

  it("returns independent decisions for each permission in one evaluation batch", async () => {
    const results = await repository().evaluatePermissions([
      { rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu" },
      { rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], actor, permissionKind: "page", permissionCode: "unknown.permission", workspaceCode: "company-jenfu" }
    ]);
    expect(results.map((result) => result.decisionCode)).toEqual(["allowed", "permission_not_granted"]);
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
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "company-jenfu",
      projectCode: "PROJECT-001"
    })).resolves.toMatchObject({ decisionCode: "allowed" });
    await expect(scopedRepository.evaluatePermission({
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "company-jenfu",
      projectCode: "PROJECT-002"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
    await expect(scopedRepository.evaluatePermission({
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.search",
      workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
  });

  it("does not read effective assignments after selecting legacy authority", async () => {
    const result = await repository({
      authorityRows: [{ ...authorityRow, authority_source: "legacy_authority" }],
      failAssignments: true
    }).evaluatePermission({ actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], permissionKind: "page", permissionCode: "numbering.request" });
    expect(result.decisionCode).toBe("legacy_authority");
    expect(result.assignments).toHaveLength(0);
  });

  it("binds the default application id when reading effective assignments", async () => {
    await expect(repository({ requireApplicationIdParam: true }).listEffectiveAssignments(actor))
      .resolves.toHaveLength(1);
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
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_authority_unavailable" });
  });

  it("rejects workspace scope mismatch", async () => {
    await expect(repository().evaluatePermission({
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor,
      permissionKind: "page",
      permissionCode: "numbering.request",
      workspaceCode: "company-other"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
    await expect(repository({ assignmentRows: [{ ...assignment, scope_key: "unrecognized" }] }).evaluatePermission({
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_scope_mismatch" });
  });

  it("rejects inactive roles, catalog mismatches, expired assignments, and missing permissions", async () => {
    await expect(repository({ assignmentRows: [{ ...assignment, stable_role_id: "role-retired" }] }).evaluatePermission({
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_role_inactive" });
    await expect(repository({ assignmentRows: [{ ...assignment, role_code: "qa" }] }).evaluatePermission({
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository({ assignmentRows: [{ ...assignment, valid_until: "2026-02-01T00:00:00.000Z" }] }).evaluatePermission({
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository().evaluatePermission({
      rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"],
      actor, permissionKind: "page", permissionCode: "unknown.permission", workspaceCode: "company-jenfu"
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
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager", "qa", "rd", "external_specialist"], permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "permission_explicit_deny" });
  });

  it("applies the configured role priority before resolving conflicting explicit grants", async () => {
    const qaAssignment = { ...assignment, assignment_id: "assignment-qa", stable_role_id: "role-qa", role_code: "qa" };
    const twoRoleCatalog: JenfuEntitlementRoleCatalog = {
      roles: [
        {
          stableRoleId: "role-rd", roleCode: "rd", displayName: "研發", assignable: true,
          risk: "normal", subjectKind: "employee", recommendationAllowed: true,
          delegationAllowed: true, allowedScopeKinds: ["workspace"], assignmentTier: "app_admin",
          permissions: [{ code: "numbering.search", kind: "page", allowed: true }], roleDefinitionHash: "rd-test"
        },
        {
          stableRoleId: "role-qa", roleCode: "qa", displayName: "品保", assignable: true,
          risk: "normal", subjectKind: "employee", recommendationAllowed: true,
          delegationAllowed: true, allowedScopeKinds: ["workspace"], assignmentTier: "app_admin",
          permissions: [{ code: "numbering.search", kind: "page", allowed: false }], roleDefinitionHash: "qa-test"
        }
      ]
    };
    await expect(repository({ assignmentRows: [assignment, qaAssignment] }, twoRoleCatalog).evaluatePermission({
      actor, rolePriority: ["qa", "rd"], permissionKind: "page", permissionCode: "numbering.search", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "permission_explicit_deny" });
    await expect(repository({ assignmentRows: [assignment, qaAssignment] }, twoRoleCatalog).evaluatePermission({
      actor, rolePriority: ["rd", "qa"], permissionKind: "page", permissionCode: "numbering.search", workspaceCode: "company-jenfu"
    })).resolves.toMatchObject({ decisionCode: "allowed", assignment: { roleCode: "rd" } });
  });

  it("fails closed if an active assignment role is absent from the priority contract", async () => {
    await expect(repository().evaluatePermission({
      actor, rolePriority: ["system_admin", "pdm_admin", "rd_manager"],
      permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
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

  it("reads one principal grant set for either verified provider alias", async () => {
    const other = { ...activeAccount, principal_issuer: "https://accounts.google.com", principal_subject: "google-001" };
    const source = repository({ activeAccountRows: [activeAccount, other], assignmentRows: [assignment] });
    const first = await source.listEffectiveAssignments(actor);
    const second = await source.listEffectiveAssignments({
      ...actor, identityIssuer: other.principal_issuer, identitySubject: other.principal_subject
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0].assignmentId).toBe(second[0].assignmentId);
  });

  it("rejects conflicting typed aliases, wrong grant subjects, and duplicate principal grants", async () => {
    const other = { ...activeAccount, principal_issuer: "https://accounts.google.com", principal_subject: "google-001" };
    const base = { activeAccountRows: [activeAccount, other] };
    await expect(repository({ ...base, activeAccountRows: [activeAccount,
      { ...other, employee_id: "different-employee" }] }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository({ ...base, assignmentRows: [{ ...assignment,
      principal_id: "different-principal" }] }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository({ ...base, assignmentRows: [assignment,
      { ...assignment, assignment_id: "duplicate" }] }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository({ ...base, assignmentRows: [{ ...assignment,
      contract_version: "jenfu.platform-entitlement.v1" }] }).listEffectiveAssignments(actor))
      .rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });

  it("rejects stale authority versions and an unverified login alias", async () => {
    await expect(repository({ assignmentRows: [{ ...assignment, authority_version: 1 }] }).evaluatePermission({
      actor, rolePriority: ["rd"], permissionKind: "page", permissionCode: "numbering.request",
      workspaceCode: "company-jenfu"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
    await expect(repository().listEffectiveAssignments({
      ...actor, identitySubject: "not-published"
    })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });
});
