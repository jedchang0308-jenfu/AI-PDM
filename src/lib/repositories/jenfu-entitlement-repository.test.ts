import { describe, expect, it } from "vitest";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";

const actor = {
  identityIssuer: "https://securetoken.google.com/jenfu-test",
  identitySubject: "uid-001",
  principalId: "principal-001",
  employeeId: "employee-001"
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

function fakeClient(authoritySource: "legacy_authority" | "orgmaster_authority", rows = [assignment]) {
  return {
    kind: "postgres" as const,
    async query<T>(sql: string): Promise<T[]> {
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) return [{
        contract_version: "jenfu.platform-entitlement.v1",
        application_id: "ai-pdm",
        authority_source: authoritySource,
        authority_version: 2,
        employee_id: null,
        updated_at: "2026-01-01T00:00:00.000Z",
        operation_id: null
      }] as T[];
      return rows as T[];
    },
    async queryOne<T>(): Promise<T | null> { return null; },
    async execute(): Promise<void> {},
    async transaction<T>(fn: (client: any) => Promise<T> | T): Promise<T> { return fn(this); },
    async close(): Promise<void> {}
  };
}

describe("DEV-005 EntitlementRepository", () => {
  it("allows an explicit active role permission even when catalogVersion is provenance-only", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient("orgmaster_authority"));
    const result = await repository.evaluatePermission({ actor, permissionKind: "page", permissionCode: "numbering.request", workspaceCode: "workspace-1" });
    expect(result.decisionCode).toBe("allowed");
    if (result.decisionCode === "allowed") expect(result.assignment.assignmentId).toBe("assignment-1");
  });

  it("does not read effective assignments after selecting legacy authority", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient("legacy_authority"));
    const result = await repository.evaluatePermission({ actor, permissionKind: "page", permissionCode: "numbering.request" });
    expect(result.decisionCode).toBe("legacy_authority");
    expect(result.assignments).toHaveLength(0);
  });

  it("rejects duplicate stable role and scope rows instead of hiding ambiguity", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient("orgmaster_authority", [assignment, { ...assignment, assignment_id: "assignment-duplicate" }]));
    await expect(repository.listEffectiveAssignments(actor)).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });
});
