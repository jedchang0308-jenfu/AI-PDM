import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createJenfuVerifiedAuthorizationActor } from "@/lib/jenfu-entitlement-contract";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";
import { JenfuEntitlementRepository, JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { PrincipalLocalAclRepository } from "@/lib/repositories/principal-local-acl-repository";
import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";

type ReviewerCandidate = {
  principal_id: string;
  pdm_user_id: string;
  employee_id: string;
  identity_issuer: string;
  identity_subject: string;
};

const reviewerRoles = new Set(["rd_manager", "pdm_admin"]);
const reviewerPermission = { permissionKind: "action", permissionCode: "approval.request.decide" } as const;

/** Candidate eligibility is not a login. The eventual decision route must verify its own AAL2 session. */
export async function selectPrincipalReviewerInSnapshot(
  tx: AsyncDatabaseClient,
  input: { companyId: string; ownerUserId: string }
): Promise<string> {
  if (tx.kind !== "postgres" || tx.transactionScope !== "postgres" ||
      !input.companyId || !input.ownerUserId) {
    throw new Error("PRINCIPAL_REVIEWER_SNAPSHOT_REQUIRED");
  }
  const state = await tx.queryOne<{ isolation_level: string; decision_at: string }>(`
    SELECT current_setting('transaction_isolation') AS isolation_level,
           transaction_timestamp()::text AS decision_at
  `);
  const decisionAt = new Date(state?.decision_at ?? "");
  if (!state || !["repeatable read", "serializable"].includes(state.isolation_level) ||
      !Number.isFinite(decisionAt.getTime())) {
    throw new Error("PRINCIPAL_REVIEWER_SNAPSHOT_REQUIRED");
  }
  const rows = await tx.query<ReviewerCandidate>(`
    SELECT account.principal_id, account.pdm_user_id, account.employee_id,
           typed.principal_issuer AS identity_issuer,
           typed.principal_subject AS identity_subject
    FROM ai_pdm_core.principal_accounts account
    JOIN ai_pdm_core.principal_identity_cutovers cutover
      ON cutover.pdm_user_id = account.pdm_user_id
     AND cutover.principal_id = account.principal_id
     AND cutover.status = 'principal_active'
    JOIN orgmaster_contract.v_active_principal_accounts_v1 typed
      ON typed.principal_id = account.principal_id
     AND typed.employee_id = account.employee_id
     AND typed.account_type = account.account_type
     AND typed.contract_version = 'organization.active-principal.v1'
     AND typed.employee_status = 'active'
    WHERE account.company_id = :companyId
      AND account.account_status = 'active'
      AND account.system_role_enabled
    ORDER BY account.principal_id, typed.principal_issuer, typed.principal_subject
    LIMIT 65
  `, { companyId: input.companyId });
  if (rows.length > 64) throw new Error("PRINCIPAL_REVIEWER_CANDIDATE_LIMIT");
  const rolePriority = await new AsyncAccessControlRepository(tx)
    .getEnforcedRolePriority([...reviewerRoles]);
  const entitlement = new JenfuEntitlementRepository(tx, await requirePublishedPrincipalCatalog(tx));
  const localAcl = new PrincipalLocalAclRepository(tx);
  const groups = new Map<string, ReviewerCandidate[]>();
  for (const row of rows) {
    if (!row.principal_id || !row.pdm_user_id || !row.employee_id ||
        !row.identity_issuer || !row.identity_subject) {
      throw new Error("PRINCIPAL_REVIEWER_CANDIDATE_INVALID");
    }
    groups.set(row.principal_id, [...(groups.get(row.principal_id) ?? []), row]);
  }
  const eligible: Array<{ profileId: string; principalId: string; rank: number; owner: number }> = [];
  for (const [principalId, aliases] of groups) {
    const first = aliases[0];
    if (aliases.some((row) => row.pdm_user_id !== first.pdm_user_id ||
        row.employee_id !== first.employee_id) ||
        new Set(aliases.map((row) => `${row.identity_issuer}\0${row.identity_subject}`)).size !== aliases.length) {
      throw new Error("PRINCIPAL_REVIEWER_ALIAS_AMBIGUOUS");
    }
    // The entitlement repository checks the active aliases for admission,
    // then reads one principal-keyed grant set. Reviewer selection therefore
    // evaluates once per principal, not once per provider alias.
    const actor = createJenfuVerifiedAuthorizationActor({
      identityIssuer: first.identity_issuer, identitySubject: first.identity_subject,
      principalId, employeeId: first.employee_id,
      localPrincipalId: first.pdm_user_id, companyId: input.companyId
    });
    if (!actor) throw new Error("PRINCIPAL_REVIEWER_CANDIDATE_INVALID");
    let role: string | null = null;
    try {
      const [result] = await entitlement.evaluatePermissions([{
        actor, ...reviewerPermission, workspaceCode: input.companyId,
        projectCode: null, rolePriority
      }], decisionAt);
      if (result.decisionCode === "legacy_authority") {
        // Eligibility assumes the candidate can satisfy AAL2 when they later
        // act; it never impersonates their present session or grants access.
        const [local] = await localAcl.evaluateWorkspace({
          principalId, permissions: [reviewerPermission], rolePriority,
          decisionAt, assuranceLevel: "aal2"
        });
        role = local.allowed ? local.roleCode : null;
      } else {
        role = result.decisionCode === "allowed" ? result.role.roleCode : null;
      }
    } catch (error) {
      if (!(error instanceof JenfuEntitlementRepositoryError) ||
          !["entitlement_assignment_not_found", "entitlement_authority_unknown"].includes(error.code)) {
        throw error;
      }
      // A principal without published authority cannot review; it must not
      // disqualify a different principal whose authority is proved.
    }
    if (!role || !reviewerRoles.has(role)) continue;
    eligible.push({ profileId: first.pdm_user_id, principalId,
      rank: rolePriority.indexOf(role), owner: first.pdm_user_id === input.ownerUserId ? 1 : 0 });
  }
  eligible.sort((a, b) => a.rank - b.rank || a.owner - b.owner ||
    a.principalId.localeCompare(b.principalId));
  if (!eligible[0]) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "找不到可指派的審核負責人", 409);
  }
  return eligible[0].profileId;
}
