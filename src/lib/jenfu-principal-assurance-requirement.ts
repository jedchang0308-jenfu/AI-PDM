import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { validateEffectiveRoleAssignment } from "@/lib/jenfu-entitlement-contract";
import { JenfuEntitlementRepository } from "@/lib/repositories/jenfu-entitlement-repository";

const PRIVILEGED_ROLES = new Set(["system_admin", "pdm_admin", "rd_manager"]);

/** One published Principal grant version determines the effective AAL2 requirement. */
export async function requiresPrincipalAal2(client: AsyncDatabaseClient, input: {
  principalId: string;
  employeeId: string;
  identityIssuer: string;
  identitySubject: string;
}) {
  if (client.kind !== "postgres") throw new Error("PRINCIPAL_ASSURANCE_SOURCE_UNAVAILABLE");
  const entitlement = new JenfuEntitlementRepository(client);
  const times = await client.query<{ decision_at: string }>("SELECT transaction_timestamp()::text AS decision_at");
  const decisionAt = times.length === 1 ? new Date(times[0].decision_at) : new Date(Number.NaN);
  if (!Number.isFinite(decisionAt.getTime())) throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
  const assignments = await entitlement.listEffectiveAssignments(input);
  if (assignments.length === 0 || assignments.some((assignment) =>
    assignment.assignmentVersionId !== assignments[0].assignmentVersionId ||
    assignment.assignmentVersion !== assignments[0].assignmentVersion ||
    assignment.publishedAt !== assignments[0].publishedAt ||
    validateEffectiveRoleAssignment(assignment, input, decisionAt).length !== 0)) {
    throw new Error("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
  }
  return assignments.some((assignment) => PRIVILEGED_ROLES.has(assignment.roleCode));
}
