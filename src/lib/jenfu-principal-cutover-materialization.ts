import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  requireTrustedCurrentPrincipalCutoverSource,
  type CurrentPrincipalCutoverSource
} from "@/lib/jenfu-principal-cutover-source-gate";
import { requirePrincipalCutoverSourceLocks } from
  "@/lib/jenfu-principal-cutover-locks";

type InsertedId = { id: string };

function invalid(): never { throw new Error("PRINCIPAL_CUTOVER_MATERIALIZATION_INVALID"); }
function sha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}
function member(value: Record<string, unknown>, key: string) {
  return value[key] === undefined ? null : value[key];
}

/**
 * One-transaction owner migrator DML primitive. The public owner command must
 * first run source, provider-attestation and behavioral-shadow gates; this
 * primitive alone is never a cutover authorization or application API.
 */
export async function materializePrincipalCutoverInOwnerTransaction(
  client: AsyncDatabaseClient,
  input: CurrentPrincipalCutoverSource
) {
  requireTrustedCurrentPrincipalCutoverSource(client, input);
  if (client.kind !== "postgres" || !input.source ||
    !Array.isArray(input.source.accounts) || input.source.accounts.length < 1 ||
    input.source.accounts.length > 32 || !sha(input.seal?.cohortHash) ||
    !sha(input.seal?.sourceHash) || !sha(input.seal?.inputHash) ||
    typeof input.operationId !== "string" || input.operationId.length < 1 ||
    input.operationId.length > 255) invalid();
  await requirePrincipalCutoverSourceLocks(client);
  const assurance = new Map(input.source.plan.accountAssurance.map((row) =>
    [row.principalId, row.minimumAssurance]));
  if (assurance.size !== input.source.accounts.length ||
    input.source.accounts.some((row) => !assurance.has(row.principalId))) invalid();
  const now = await client.queryOne<{ activated_at: string }>(`
    SELECT transaction_timestamp()::text AS activated_at
  `);
  if (!now?.activated_at || !Number.isFinite(Date.parse(now.activated_at))) invalid();
  const activatedAt = new Date(now.activated_at).toISOString();
  const ids: string[] = [];
  for (const account of input.source.accounts) {
    const invalidBefore = account.sessionInvalidBefore &&
      Date.parse(account.sessionInvalidBefore) > Date.parse(activatedAt)
      ? account.sessionInvalidBefore : activatedAt;
    const rows = await client.query<{ principal_id: string }>(`
      INSERT INTO ai_pdm_core.principal_accounts
        (principal_id,pdm_user_id,company_id,employee_id,account_type,
         account_status,lifecycle_version,session_invalid_before,
         profile_version,system_role_enabled,minimum_assurance)
      VALUES (:principalId,:pdmUserId,:companyId,:employeeId,:accountType,
              :accountStatus,:lifecycleVersion,:invalidBefore,
              1,:systemRoleEnabled,:minimumAssurance)
      RETURNING principal_id
    `, { ...account, invalidBefore,
      minimumAssurance: assurance.get(account.principalId) });
    if (rows.length !== 1 || rows[0].principal_id !== account.principalId) invalid();
    ids.push(account.pdmUserId);
  }
  const assignmentRows = input.source.plan.principalAssignments.map((row) => ({
    id: member(row, "id"), principal_id: member(row, "principalId"),
    role_id: member(row, "roleId"),
    source_assignment_id: member(row, "sourceAssignmentId"),
    origin: member(row, "origin"), reason: member(row, "reason"),
    scope_template: member(row, "scopeTemplate"),
    named_scope: member(row, "namedScope"),
    sponsor_principal_id: member(row, "sponsorPrincipalId"),
    starts_at: member(row, "startsAt"), review_due_at: member(row, "reviewDueAt"),
    hard_ends_at: member(row, "hardEndsAt"), assigned_at: member(row, "assignedAt"),
    revoked_at: member(row, "revokedAt"),
    assigned_by_principal_id: member(row, "assignedByPrincipalId"),
    revoked_by_principal_id: member(row, "revokedByPrincipalId"),
    legacy_assigned_by_user_id: member(row, "legacyAssignedByUserId"),
    legacy_revoked_by_user_id: member(row, "legacyRevokedByUserId")
  }));
  const insertedAssignments = await client.query<InsertedId>(`
    INSERT INTO ai_pdm_core.principal_role_assignments
      (id,principal_id,role_id,source_assignment_id,origin,reason,
       scope_template,named_scope,sponsor_principal_id,starts_at,
       review_due_at,hard_ends_at,assigned_at,revoked_at,
       assigned_by_principal_id,revoked_by_principal_id,
       legacy_assigned_by_user_id,legacy_revoked_by_user_id)
    SELECT row.* FROM jsonb_to_recordset(:rows::jsonb) AS row(
      id text,principal_id text,role_id text,source_assignment_id text,
      origin text,reason text,scope_template text,named_scope text,
      sponsor_principal_id text,starts_at timestamptz,review_due_at timestamptz,
      hard_ends_at timestamptz,assigned_at timestamptz,revoked_at timestamptz,
      assigned_by_principal_id text,revoked_by_principal_id text,
      legacy_assigned_by_user_id text,legacy_revoked_by_user_id text)
    RETURNING id
  `, { rows: JSON.stringify(assignmentRows) });
  if (insertedAssignments.length !== assignmentRows.length ||
    new Set(insertedAssignments.map((row) => row.id)).size !== assignmentRows.length) invalid();

  const delegationRows = input.source.plan.principalDelegations.map((row) => ({
    id: member(row, "id"), source_delegation_id: member(row, "sourceDelegationId"),
    from_principal_id: member(row, "fromPrincipalId"),
    to_principal_id: member(row, "toPrincipalId"),
    project_code: member(row, "projectCode"), action_code: member(row, "actionCode"),
    starts_at: member(row, "startsAt"), ends_at: member(row, "endsAt"),
    reason: member(row, "reason"), created_at: member(row, "createdAt"),
    revoked_at: member(row, "revokedAt"),
    created_by_principal_id: member(row, "createdByPrincipalId"),
    revoked_by_principal_id: member(row, "revokedByPrincipalId"),
    legacy_created_by_user_id: member(row, "legacyCreatedByUserId"),
    legacy_revoked_by_user_id: member(row, "legacyRevokedByUserId")
  }));
  const insertedDelegations = await client.query<InsertedId>(`
    INSERT INTO ai_pdm_core.principal_approval_delegations
      (id,source_delegation_id,from_principal_id,to_principal_id,
       project_code,action_code,starts_at,ends_at,reason,created_at,
       revoked_at,created_by_principal_id,revoked_by_principal_id,
       legacy_created_by_user_id,legacy_revoked_by_user_id)
    SELECT row.* FROM jsonb_to_recordset(:rows::jsonb) AS row(
      id text,source_delegation_id text,from_principal_id text,
      to_principal_id text,project_code text,action_code text,
      starts_at timestamptz,ends_at timestamptz,reason text,
      created_at timestamptz,revoked_at timestamptz,
      created_by_principal_id text,revoked_by_principal_id text,
      legacy_created_by_user_id text,legacy_revoked_by_user_id text)
    RETURNING id
  `, { rows: JSON.stringify(delegationRows) });
  if (insertedDelegations.length !== delegationRows.length ||
    new Set(insertedDelegations.map((row) => row.id)).size !== delegationRows.length) invalid();

  await client.execute(`
    UPDATE ai_pdm_core.account_session_records
    SET revoked_at=:activatedAt
    WHERE user_id=ANY(:ids) AND revoked_at IS NULL
  `, { activatedAt, ids });
  const result = { contractVersion: "ai-pdm.principal-cutover-result.v1",
    operationId: input.operationId, cohortHash: input.seal.cohortHash,
    sourceHash: input.seal.sourceHash, activatedAt,
    principals: input.source.accounts.map((row) => row.principalId).sort(),
    accountCount: input.source.accounts.length,
    assignmentCount: insertedAssignments.length,
    delegationCount: insertedDelegations.length };
  const receipt = await client.query<{ operation_id: string }>(`
    INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
    VALUES (:operationId,'cutover',:inputHash,:cohortHash,:resultJson::jsonb,:activatedAt)
    RETURNING operation_id
  `, { operationId: input.operationId, inputHash: input.seal.inputHash,
    cohortHash: input.seal.cohortHash, resultJson: JSON.stringify(result), activatedAt });
  if (receipt.length !== 1 || receipt[0].operation_id !== input.operationId) invalid();
  for (const account of input.source.accounts) {
    const marker = await client.query<{ pdm_user_id: string }>(`
      UPDATE ai_pdm_core.principal_identity_cutovers
      SET status='principal_active',source_hash=:sourceHash,
          operation_id=:operationId,activated_at=:activatedAt,
          row_version=row_version+1
      WHERE pdm_user_id=:pdmUserId AND principal_id=:principalId
        AND status='legacy_compatible' AND row_version=:markerRowVersion
      RETURNING pdm_user_id
    `, { pdmUserId: account.pdmUserId, principalId: account.principalId,
      markerRowVersion: account.markerRowVersion, sourceHash: input.seal.sourceHash,
      operationId: input.operationId, activatedAt });
    if (marker.length !== 1 || marker[0].pdm_user_id !== account.pdmUserId) invalid();
  }
  return result;
}
