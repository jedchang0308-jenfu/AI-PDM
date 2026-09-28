import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  capturePrincipalOnlyCohortSource,
  type PrincipalOnlyCohortSource
} from "@/lib/jenfu-principal-only-cohort-source";
import { lockPrincipalCutoverOwnerSources } from
  "@/lib/jenfu-principal-cutover-locks";

export type PrincipalOnlyCohortOperation = {
  operationId: string;
  inputHash: string;
  cohortHash: string;
  sourceHash: string;
  firebaseProjectId: string;
  verified: PrincipalOnlyCohortSource["verified"];
  activeProfiles: PrincipalOnlyCohortSource["activeProfiles"];
};

export type PrincipalOnlyCohortResult = {
  contractVersion: "ai-pdm.principal-only-cohort-result.v1";
  operationId: string;
  inputHash: string;
  cohortHash: string;
  sourceHash: string;
  activatedAt: string;
  principalId: string;
  pdmUserId: string;
  withheldPdmUserIds: string[];
  activeBeforeCount: number;
  activatedCount: 1;
  withheldCount: number;
};

function invalid(): never {
  throw new Error("PRINCIPAL_ONLY_COHORT_OPERATION_INVALID");
}
function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}
function id(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value.length <= 255 && value.trim() === value &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}
function assertReplay(
  value: Record<string, unknown>,
  operation: PrincipalOnlyCohortOperation
): PrincipalOnlyCohortResult {
  const expectedWithheld = operation.activeProfiles
    .filter((profile) => profile.pdmUserId !== operation.verified.pdmUserId)
    .map((profile) => profile.pdmUserId);
  if (value.contractVersion !== "ai-pdm.principal-only-cohort-result.v1" ||
    value.operationId !== operation.operationId ||
    value.inputHash !== operation.inputHash ||
    value.cohortHash !== operation.cohortHash ||
    value.sourceHash !== operation.sourceHash ||
    value.principalId !== operation.verified.principalId ||
    value.pdmUserId !== operation.verified.pdmUserId ||
    !Array.isArray(value.withheldPdmUserIds) ||
    !value.withheldPdmUserIds.every(id) ||
    JSON.stringify(value.withheldPdmUserIds) !== JSON.stringify(expectedWithheld) ||
    value.withheldCount !== value.withheldPdmUserIds.length ||
    value.activeBeforeCount !== operation.activeProfiles.length ||
    value.activatedCount !== 1 ||
    typeof value.activatedAt !== "string" ||
    !Number.isFinite(Date.parse(value.activatedAt))) invalid();
  return value as PrincipalOnlyCohortResult;
}

/**
 * Internal owner-migrator primitive. The operator must separately attest the
 * immutable operation bytes, source revision, service quiescence and recovery
 * candidate before entering this READ COMMITTED write transaction.
 */
export async function applyPrincipalOnlyCohortInOwnerTransaction(
  client: AsyncDatabaseClient,
  operation: PrincipalOnlyCohortOperation
): Promise<{ replayed: boolean; result: PrincipalOnlyCohortResult }> {
  if (client.kind !== "postgres" || !operation || !id(operation.operationId) ||
    !hash(operation.inputHash) || !hash(operation.cohortHash) ||
    !hash(operation.sourceHash) ||
    operation.firebaseProjectId !== "jenfu-platform-prod" ||
    !Array.isArray(operation.activeProfiles) ||
    operation.activeProfiles.length < 1 || operation.activeProfiles.length > 32 ||
    !operation.verified || !id(operation.verified.pdmUserId) ||
    operation.activeProfiles.some((profile) => !profile || !id(profile.pdmUserId)) ||
    new Set(operation.activeProfiles.map((profile) => profile.pdmUserId)).size !==
      operation.activeProfiles.length) invalid();

  const ids = operation.activeProfiles.map((profile) => profile.pdmUserId);
  const lock = await lockPrincipalCutoverOwnerSources(
    client, operation.operationId, ids, operation.inputHash, operation.cohortHash
  );
  if (lock.status === "replayed") {
    return { replayed: true, result: assertReplay(lock.result, operation) };
  }
  const source = await capturePrincipalOnlyCohortSource(
    client, operation.verified, operation.firebaseProjectId, "locked_owner_apply"
  );
  if (source.cohortHash !== operation.cohortHash ||
    source.sourceHash !== operation.sourceHash ||
    JSON.stringify(source.activeProfiles.map((row) => row.pdmUserId)) !==
      JSON.stringify([...ids].sort()) ||
    source.verified.principalId !== operation.verified.principalId) invalid();

  const clock = await client.queryOne<{ activated_at: Date | string }>(`
    SELECT transaction_timestamp() AS activated_at
  `);
  const activatedAt = new Date(clock?.activated_at ?? "").toISOString();
  if (!Number.isFinite(Date.parse(activatedAt))) invalid();
  const verified = source.verified;
  const minimumAssurance = verified.accountType === "human_privileged" ? "aal2" : "aal1";
  const account = await client.query<{ principal_id: string }>(`
    INSERT INTO ai_pdm_core.principal_accounts
      (principal_id,pdm_user_id,company_id,employee_id,account_type,
       account_status,lifecycle_version,session_invalid_before,
       profile_version,system_role_enabled,minimum_assurance)
    VALUES (:principalId,:pdmUserId,:companyId,:employeeId,:accountType,
            'active',:lifecycleVersion,:activatedAt,1,true,:minimumAssurance)
    RETURNING principal_id
  `, { principalId: verified.principalId, pdmUserId: verified.pdmUserId,
    companyId: verified.companyId, employeeId: verified.employeeId,
    accountType: verified.accountType, lifecycleVersion: verified.lifecycleVersion,
    activatedAt, minimumAssurance });
  if (account.length !== 1 || account[0].principal_id !== verified.principalId) invalid();

  for (const profile of source.withheld) {
    const changed = await client.query<{ id: string }>(`
      UPDATE ai_pdm_core.users
      SET account_status='suspended', system_role_enabled=0,
          account_lifecycle_version=account_lifecycle_version+1,
          session_invalid_before=:activatedAt,
          account_status_changed_at=:activatedAt,
          account_status_reason='principal_only_unverified'
      WHERE id=:pdmUserId AND company_id=:companyId
        AND account_status='active'
        AND account_lifecycle_version=:lifecycleVersion
        AND system_role_enabled=:systemRoleEnabled
      RETURNING id
    `, { pdmUserId: profile.pdmUserId, companyId: profile.companyId,
      lifecycleVersion: profile.lifecycleVersion,
      systemRoleEnabled: profile.systemRoleEnabled ? 1 : 0, activatedAt });
    if (changed.length !== 1 || changed[0].id !== profile.pdmUserId) invalid();
  }
  await client.execute(`
    UPDATE ai_pdm_core.account_session_records
    SET revoked_at=:activatedAt
    WHERE user_id=ANY(:ids) AND revoked_at IS NULL
  `, { activatedAt, ids });

  const result: PrincipalOnlyCohortResult = {
    contractVersion: "ai-pdm.principal-only-cohort-result.v1",
    operationId: operation.operationId, inputHash: operation.inputHash,
    cohortHash: source.cohortHash,
    sourceHash: source.sourceHash, activatedAt,
    principalId: verified.principalId, pdmUserId: verified.pdmUserId,
    withheldPdmUserIds: source.withheld.map((profile) => profile.pdmUserId),
    activeBeforeCount: source.activeProfiles.length, activatedCount: 1,
    withheldCount: source.withheld.length
  };
  const receipt = await client.query<{ operation_id: string }>(`
    INSERT INTO ai_pdm_core.principal_identity_operations
      (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
    VALUES (:operationId,'cutover',:inputHash,:cohortHash,:resultJson::jsonb,
            :activatedAt)
    RETURNING operation_id
  `, { operationId: operation.operationId, inputHash: operation.inputHash,
    cohortHash: operation.cohortHash, resultJson: JSON.stringify(result), activatedAt });
  if (receipt.length !== 1 || receipt[0].operation_id !== operation.operationId) invalid();

  const selected = source.activeProfiles.find((profile) =>
    profile.pdmUserId === verified.pdmUserId);
  if (!selected) invalid();
  const marker = selected.markerStatus === "missing"
    ? await client.query<{ pdm_user_id: string }>(`
      INSERT INTO ai_pdm_core.principal_identity_cutovers
        (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
      VALUES (:pdmUserId,:principalId,'principal_active',:sourceHash,
              :operationId,:activatedAt)
      RETURNING pdm_user_id
    `, { pdmUserId: verified.pdmUserId, principalId: verified.principalId,
      sourceHash: source.sourceHash, operationId: operation.operationId, activatedAt })
    : await client.query<{ pdm_user_id: string }>(`
      UPDATE ai_pdm_core.principal_identity_cutovers
      SET status='principal_active',source_hash=:sourceHash,
          operation_id=:operationId,activated_at=:activatedAt,
          row_version=row_version+1
      WHERE pdm_user_id=:pdmUserId AND principal_id=:principalId
        AND status='legacy_compatible' AND row_version=:markerRowVersion
      RETURNING pdm_user_id
    `, { pdmUserId: verified.pdmUserId, principalId: verified.principalId,
      markerRowVersion: selected.markerRowVersion, sourceHash: source.sourceHash,
      operationId: operation.operationId, activatedAt });
  if (marker.length !== 1 || marker[0].pdm_user_id !== verified.pdmUserId) invalid();
  return { replayed: false, result };
}
