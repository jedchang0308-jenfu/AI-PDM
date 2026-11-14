import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createJenfuVerifiedAuthorizationActor, JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION,
  type JenfuEffectiveRoleAssignment } from "@/lib/jenfu-entitlement-contract";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { AsyncAccessControlRepository } from "@/lib/repositories/access-control-async-repository";
import { JenfuEntitlementRepository, JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { requirePublishedPrincipalCatalog } from "@/lib/jenfu-principal-role-catalog";
import type { ReviewerGrant } from "@/lib/pdm-reviewer-authority";
import { principalPermissionSnapshotsEnabled } from "@/lib/principal-session-permission-snapshot";

type ReviewerCandidate = {
  principal_id: string;
  pdm_user_id: string;
  employee_id: string;
  identity_issuer: string;
  identity_subject: string;
  projected_grants?: ReviewerGrant[];
};

function projectedAssignments(row: ReviewerCandidate, decisionAt: Date): JenfuEffectiveRoleAssignment[] {
  const grants = row.projected_grants ?? [];
  if (grants.length > 32) throw new Error("PRINCIPAL_REVIEWER_CANDIDATE_LIMIT");
  const at = decisionAt.toISOString();
  return grants.map((grant, index) => {
    // The interval was selected by PostgreSQL at the exact decision instant.
    // These IDs are used internally by the shared evaluator for this selection.
    const admin = grant.stable_role_id === "role-application-system-admin";
    const assignmentId = admin ? "00000000-0000-4000-8000-000000000001" : `reviewer-grant-${index}`;
    return {
      contractVersion: JENFU_PRINCIPAL_GRANTS_CONTRACT_VERSION, applicationId: "ai-pdm",
      principalId: row.principal_id, employeeId: grant.employee_id, assignmentId,
      assignmentVersion: 1, assignmentVersionId: "reviewer-authority", publishedAt: at,
      grantKind: grant.grant_kind, delegationId: grant.grant_kind === "delegated" ? assignmentId : null,
      subjectKind: grant.subject_kind, targetPrincipalId: grant.target_principal_id,
      stableRoleId: grant.stable_role_id, roleCode: grant.role_code, catalogVersion: grant.catalog_version,
      scopeKind: grant.scope_kind, scopeKey: grant.scope_key, validFrom: at, validUntil: null,
      sourceAssignmentId: admin ? assignmentId : null, sourceGrantId: admin ? assignmentId : null,
      adminCatalogSha256: grant.admin_catalog_sha256, roleDefinitionHash: grant.role_definition_hash
    };
  });
}

const reviewerRoles = new Set(["rd_manager", "pdm_admin"]);
const reviewerPermission = { permissionKind: "action", permissionCode: "approval.request.decide" } as const;

export type PrincipalReviewerSelection = Readonly<{ principalId: string; profileId: string }>;

/** Candidate eligibility is not a login. The eventual decision route must verify its own AAL2 session. */
export async function selectPrincipalReviewerInSnapshot(
  tx: AsyncDatabaseClient,
  input: { companyId: string; ownerUserId: string; requirePublish?: boolean;
    resourceGroup?: 'drawing' | 'part' | 'transfer';
    resourceGroups?: readonly ('drawing' | 'part' | 'model' | 'transfer')[] }
): Promise<string> {
  return (await selectPrincipalReviewerIdentityInSnapshot(tx, input)).profileId;
}

/** Keep the security subject alongside the historical review/profile FK. */
export async function selectPrincipalReviewerIdentityInSnapshot(
  tx: AsyncDatabaseClient,
  input: { companyId: string; ownerUserId: string; requirePublish?: boolean;
    resourceGroup?: 'drawing' | 'part' | 'transfer';
    resourceGroups?: readonly ('drawing' | 'part' | 'model' | 'transfer')[] }
): Promise<PrincipalReviewerSelection> {
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
  const projected = principalPermissionSnapshotsEnabled();
  if (projected && !await tx.queryOne("SELECT initial_source_version FROM ai_pdm_core.reviewer_authority_state")) {
    throw new Error("PRINCIPAL_REVIEWER_PROJECTION_UNAVAILABLE");
  }
  const rows = await tx.query<ReviewerCandidate>(projected ? `
    SELECT account.principal_id,account.pdm_user_id,account.employee_id,
           'pdm-reviewer-projection' AS identity_issuer,account.principal_id AS identity_subject,
           COALESCE((SELECT jsonb_agg(grant_row.value ORDER BY grant_row.ordinality)
             FROM jsonb_array_elements(period.grants) WITH ORDINALITY grant_row(value,ordinality)
             WHERE grant_row.value->>'employee_id'=account.employee_id),'[]'::jsonb) AS projected_grants
    FROM ai_pdm_core.principal_accounts account
    JOIN ai_pdm_core.reviewer_authority authority ON authority.principal_id=account.principal_id
    JOIN ai_pdm_core.reviewer_authority_intervals period ON period.principal_id=authority.principal_id
      AND period.valid_from<=transaction_timestamp()
      AND (period.valid_until IS NULL OR period.valid_until>transaction_timestamp())
    WHERE account.company_id=:companyId AND account.account_status='active' AND account.system_role_enabled
      AND authority.pending_operation_id IS NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(period.accounts) typed(value)
        WHERE typed.value->>'employee_id'=account.employee_id AND typed.value->>'account_type'=account.account_type)
    ORDER BY account.principal_id
    LIMIT 65
  ` : `
    SELECT account.principal_id, account.pdm_user_id, account.employee_id,
           typed.principal_issuer AS identity_issuer,
           typed.principal_subject AS identity_subject
    FROM ai_pdm_core.principal_accounts account
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
  const catalog = await requirePublishedPrincipalCatalog(tx);
  const dynamic = catalog.catalogVersion?.startsWith("ai-pdm.role-policy.") === true;
  const effectivePriority = [...rolePriority];
  if (dynamic) for (const role of catalog.roles) {
    if (!effectivePriority.includes(role.roleCode)) effectivePriority.push(role.roleCode);
  }
  const entitlement = new JenfuEntitlementRepository(tx, catalog);
  const groups = new Map<string, ReviewerCandidate[]>();
  for (const row of rows) {
    if (!row.principal_id || !row.pdm_user_id || !row.employee_id ||
        !row.identity_issuer || !row.identity_subject) {
      throw new Error("PRINCIPAL_REVIEWER_CANDIDATE_INVALID");
    }
    groups.set(row.principal_id, [...(groups.get(row.principal_id) ?? []), row]);
  }
  const eligible: Array<{ profileId: string; principalId: string; rank: number }> = [];
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
      const selectedGroups = dynamic && input.resourceGroups?.length
        ? [...new Set(input.resourceGroups)] : [];
      const reviews = selectedGroups.length
        ? selectedGroups.map(group => ({ permissionKind: "action" as const,
          permissionCode: `pdm.${group}.review`, resourceGroup: group }))
        : [dynamic && input.resourceGroup
          ? { permissionKind: "action" as const, permissionCode: `pdm.${input.resourceGroup}.review` }
          : reviewerPermission];
      const publishGroup = input.resourceGroup ?? selectedGroups.find(group => group !== "model");
      const permissions = [...reviews, ...(input.requirePublish
        ? [{ permissionKind: "action" as const, permissionCode: dynamic && publishGroup
          ? `pdm.${publishGroup}.publish` : "numbering.publish" }] : [])];
      const inputs = permissions.map(permission => ({
        actor, ...permission, workspaceCode: input.companyId,
        projectCode: null, rolePriority: effectivePriority
      }));
      const results = projected
        ? entitlement.evaluatePublishedAssignments(inputs, projectedAssignments(first, decisionAt), decisionAt)
        : await entitlement.evaluatePermissions(inputs, decisionAt);
      role = results.length === permissions.length && results.every(result => result.decisionCode === "allowed")
        ? results[0].role.roleCode : null;
    } catch (error) {
      if (!(error instanceof JenfuEntitlementRepositoryError) ||
          !["entitlement_assignment_not_found", "entitlement_authority_unknown"].includes(error.code)) {
        throw error;
      }
      // A principal without published authority cannot review; it must not
      // disqualify a different principal whose authority is proved.
    }
    if (!role || (!dynamic && !reviewerRoles.has(role)) || first.pdm_user_id === input.ownerUserId) continue;
    eligible.push({ profileId: first.pdm_user_id, principalId,
      rank: effectivePriority.indexOf(role) });
  }
  eligible.sort((a, b) => a.rank - b.rank ||
    a.principalId.localeCompare(b.principalId));
  if (!eligible[0]) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "找不到可指派的審核負責人", 409);
  }
  if (projected) {
    // The prepare trigger must update this row before acknowledging removal.
    // An old repeatable-read snapshot fails serialization if prepare won.
    const locked = await tx.queryOne(`SELECT authority.principal_id FROM ai_pdm_core.reviewer_authority authority
      JOIN ai_pdm_core.principal_accounts account USING(principal_id)
      WHERE authority.principal_id=:principalId AND authority.pending_operation_id IS NULL
        AND account.account_status='active' AND account.system_role_enabled
      FOR SHARE OF authority`,
    { principalId: eligible[0].principalId });
    if (!locked) throw new Error("PRINCIPAL_REVIEWER_PROJECTION_UNAVAILABLE");
  }
  return { principalId: eligible[0].principalId, profileId: eligible[0].profileId };
}
