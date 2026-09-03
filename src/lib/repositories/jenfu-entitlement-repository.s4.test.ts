import { describe, expect, it } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";

const identityIssuer = "https://securetoken.google.com/jenfu-dev009";
const dailyActor = { identityIssuer, identitySubject: "uid-daily", principalId: "principal-daily", employeeId: "employee-001" };
const privilegedActor = { identityIssuer, identitySubject: "uid-privileged", principalId: "principal-privileged", employeeId: "employee-001" };
const permissionInput = { permissionKind: "action" as const, permissionCode: "settings.admin_matrix" };

function privilegedAssignment(actor = privilegedActor) {
  return {
    contract_version: "jenfu.platform-entitlement.v1",
    assignment_version_id: "assignment-version-privileged-1",
    assignment_version: 1,
    assignment_id: "assignment-system-admin-1",
    grant_kind: "direct" as const,
    delegation_id: null,
    application_id: "ai-pdm",
    identity_issuer: actor.identityIssuer,
    identity_subject: actor.identitySubject,
    principal_id: actor.principalId,
    employee_id: actor.employeeId,
    subject_kind: "principal" as const,
    target_principal_id: actor.principalId,
    stable_role_id: "role-system-admin",
    role_code: "system_admin",
    catalog_version: "ai-pdm.role-catalog.2026-09-02.v2",
    scope_kind: "global" as const,
    scope_key: null,
    valid_from: "2026-01-01T00:00:00.000Z",
    valid_until: null,
    published_at: "2026-01-01T00:00:00.000Z",
    authority_version: 2
  };
}

function fakeClient(input: { assignmentsByPrincipal?: Record<string, unknown[]>; unavailable?: boolean } = {}) {
  const assignmentsByPrincipal = input.assignmentsByPrincipal ?? { [privilegedActor.principalId]: [privilegedAssignment()] };
  return {
    kind: "postgres" as const,
    async query<T>(sql: string, params?: unknown): Promise<T[]> {
      if (input.unavailable) throw new Error("ORGMASTER_AUTHORITY_OFFLINE");
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) return [{
        contract_version: "jenfu.platform-entitlement.v1",
        application_id: "ai-pdm",
        authority_source: "orgmaster_authority",
        authority_version: 2,
        employee_id: null,
        updated_at: "2026-09-02T00:05:00.000Z",
        operation_id: null
      }] as T[];
      const values = params && typeof params === "object" && !Array.isArray(params) ? params as Record<string, unknown> : {};
      return (assignmentsByPrincipal[String(values.principalId ?? "")] ?? []) as T[];
    },
    async queryOne<T>(): Promise<T | null> { return null; },
    async execute(): Promise<void> {},
    async transaction<T>(fn: (client: AsyncDatabaseClient) => Promise<T> | T): Promise<T> { return fn(this as unknown as AsyncDatabaseClient); },
    async close(): Promise<void> {}
  } as unknown as AsyncDatabaseClient;
}

describe("DEV-009 S4 cross-repo request enforcement adapter", () => {
  it("[QA-009-S4-01] denies daily, shared, service and inactive principals", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient({ assignmentsByPrincipal: {} }));
    for (const principalId of ["principal-daily", "principal-shared", "principal-service", "principal-inactive"]) {
      await expect(repository.evaluatePermission({ actor: { ...dailyActor, principalId, identitySubject: `uid-${principalId}` }, ...permissionInput })).rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
    }
  });

  it("[QA-009-S4-02] allows only the exact active privileged principal", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient());
    const result = await repository.evaluatePermission({ actor: privilegedActor, ...permissionInput });
    expect(result.decisionCode).toBe("allowed");
    if (result.decisionCode === "allowed") {
      expect(result.assignment.stableRoleId).toBe("role-system-admin");
      expect(result.assignment.targetPrincipalId).toBe(privilegedActor.principalId);
    }
  });

  it("[QA-009-S4-03] denies the next protected request immediately after revoke", async () => {
    const assignmentsByPrincipal: Record<string, unknown[]> = { [privilegedActor.principalId]: [privilegedAssignment()] };
    const repository = new JenfuEntitlementRepository(fakeClient({ assignmentsByPrincipal }));
    await expect(repository.evaluatePermission({ actor: privilegedActor, ...permissionInput })).resolves.toMatchObject({ decisionCode: "allowed" });
    assignmentsByPrincipal[privilegedActor.principalId] = [];
    await expect(repository.evaluatePermission({ actor: privilegedActor, ...permissionInput })).rejects.toMatchObject({ code: "entitlement_assignment_not_found" });
  });

  it("[QA-009-S4-04] fails closed when OrgMaster authority is unavailable", async () => {
    const repository = new JenfuEntitlementRepository(fakeClient({ unavailable: true }));
    await expect(repository.evaluatePermission({ actor: privilegedActor, ...permissionInput })).rejects.toMatchObject({ code: "entitlement_authority_unavailable" });
  });

  it("rejects an employee-wide system_admin row instead of grandfathering it", async () => {
    const invalid = { ...privilegedAssignment(), subject_kind: "employee" as const, target_principal_id: null };
    const repository = new JenfuEntitlementRepository(fakeClient({ assignmentsByPrincipal: { [privilegedActor.principalId]: [invalid] } }));
    await expect(repository.evaluatePermission({ actor: privilegedActor, ...permissionInput })).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });
});
