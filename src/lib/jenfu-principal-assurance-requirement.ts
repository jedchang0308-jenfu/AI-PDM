import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { validateEffectiveRoleAssignment } from "@/lib/jenfu-entitlement-contract";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";

const PRIVILEGED_ROLES = new Set(["system_admin", "pdm_admin", "rd_manager"]);

/** The selected authority alone determines the principal's effective AAL2 requirement. */
export async function requiresPrincipalAal2(client: AsyncDatabaseClient, input: {
  principalId: string;
  employeeId: string;
  identityIssuer: string;
  identitySubject: string;
}) {
  if (client.kind !== "postgres") throw new Error("PRINCIPAL_ASSURANCE_SOURCE_UNAVAILABLE");
  const entitlement = new JenfuEntitlementRepository(client);
  const authority = await entitlement.resolveAuthority({ employeeId: input.employeeId });
  if (authority.authoritySource === "orgmaster_authority") {
    const times = await client.query<{ decision_at: string }>("SELECT transaction_timestamp()::text AS decision_at");
    const decisionAt = times.length === 1 ? new Date(times[0].decision_at) : new Date(Number.NaN);
    if (!Number.isFinite(decisionAt.getTime())) throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
    const assignments = await entitlement.listEffectiveAssignments(input);
    if (assignments.some((assignment) => assignment.authorityVersion !== authority.authorityVersion ||
      validateEffectiveRoleAssignment(assignment, input, decisionAt).length !== 0)) {
      throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
    }
    return assignments.some((assignment) => PRIVILEGED_ROLES.has(assignment.roleCode));
  }
  if (authority.authoritySource !== "legacy_authority") {
    throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
  }
  const row = await client.queryOne<{ privileged: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM ai_pdm_core.principal_role_assignments assignment
      JOIN ai_pdm_core.roles role ON role.id=assignment.role_id
      WHERE assignment.principal_id=:principalId AND assignment.revoked_at IS NULL
        AND assignment.assigned_at <= transaction_timestamp()
        AND (assignment.starts_at IS NULL OR assignment.starts_at <= transaction_timestamp())
        AND (assignment.hard_ends_at IS NULL OR assignment.hard_ends_at > transaction_timestamp())
        AND role.enabled=1 AND role.role_code IN ('system_admin','pdm_admin','rd_manager')
    ) AS privileged
  `, { principalId: input.principalId });
  if (!row || typeof row.privileged !== "boolean") throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
  return row.privileged;
}
