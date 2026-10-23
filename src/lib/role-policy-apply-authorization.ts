import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import { JenfuAuthEpochRepository } from '@/lib/jenfu-auth-epoch-repository'
import { JenfuPrincipalAccountError, JenfuPrincipalAccountRepository } from '@/lib/jenfu-principal-account-repository'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { hashJenfuPrincipalSessionId } from '@/lib/jenfu-principal-session-registry'
import { RolePolicyHttpError } from '@/lib/role-policy-http'

/** Policy writes use READ COMMITTED. Hold owner fences through commit, then
 * recheck the signed identity, current account/session/epoch and exact manager. */
export async function lockAndRevalidateRolePolicyApply(client: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, requestId: string, draftId: string) {
  if (client.kind !== 'postgres' || client.transactionScope !== 'postgres') {
    throw new RolePolicyHttpError('ROLE_POLICY_TRANSACTION_UNAVAILABLE', 503)
  }
  const claims = verified.session
  const sessionHash = hashJenfuPrincipalSessionId(claims.sessionId)
  await client.query(`SELECT ai_pdm_core.role_policy_lock_apply_v1(
    CAST(:requestId AS uuid),CAST(:draftId AS uuid),:principalId,:sessionHash)`,
  { requestId, draftId, principalId: claims.principalId, sessionHash })

  await revalidateRolePolicyManager(client, verified)
}

/** Recheck after a create/save row or advisory lock wait as well. */
export async function revalidateRolePolicyManager(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  const claims = verified.session
  const sessionHash = hashJenfuPrincipalSessionId(claims.sessionId)
  // The preceding statement may have waited. These statements use new snapshots.
  let account
  try { account = await new JenfuPrincipalAccountRepository(client).requireActive(claims.principalId) }
  catch (error) {
    if (error instanceof JenfuPrincipalAccountError &&
        (error.code === 'principal_account_inactive' || error.code === 'principal_account_missing')) {
      throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
    }
    throw error
  }
  const session = await client.queryOne<{
    principal_auth_epoch: string | number; lifecycle_version: string | number; profile_version: string | number;
    expires_at: string | Date; issued_at: string | Date; authenticated_at: string | Date;
    assurance_level: string; revoked_at: string | Date | null
  }>(`SELECT principal_auth_epoch,lifecycle_version,profile_version,expires_at,issued_at,
      authenticated_at,assurance_level,revoked_at FROM ai_pdm_core.principal_session_records
    WHERE principal_id=:principalId AND session_id_hash=:sessionHash`,
  { principalId: claims.principalId, sessionHash })
  const epoch = await new JenfuAuthEpochRepository(client).readCanonicalPrincipalState(claims.principalId)
  const now = Date.now()
  if (claims.assuranceLevel !== 'aal2' || account.accountType !== 'human_privileged' ||
      account.employeeId !== claims.employeeId || account.pdmUserId !== verified.profile.pdmUserId ||
      account.companyId !== verified.profile.companyId || account.lifecycleVersion !== claims.accountLifecycleVersion ||
      account.profileVersion !== claims.profileVersion ||
      (account.sessionInvalidBefore && Date.parse(claims.issuedAt) <= Date.parse(account.sessionInvalidBefore)) ||
      epoch.authEpoch !== claims.authEpoch ||
      (epoch.revokedBefore && Date.parse(claims.authenticatedAt) <= Date.parse(epoch.revokedBefore)) ||
      !session || session.revoked_at !== null || session.assurance_level !== 'aal2' ||
      Number(session.principal_auth_epoch) !== claims.authEpoch ||
      Number(session.lifecycle_version) !== claims.accountLifecycleVersion || Number(session.profile_version) !== claims.profileVersion ||
      new Date(session.issued_at).getTime() !== Date.parse(claims.issuedAt) ||
      new Date(session.authenticated_at).getTime() !== Date.parse(claims.authenticatedAt) ||
      new Date(session.expires_at).getTime() !== Date.parse(claims.expiresAt) ||
      !Number.isFinite(Date.parse(claims.expiresAt)) || Date.parse(claims.expiresAt) <= now) {
    throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
  }
  const eligible = await client.queryOne<{ eligible: boolean }>(`
    SELECT orgmaster_contract.ai_pdm_role_policy_manager_eligible_v1(
      :principalId,:employeeId,:issuer,:subject) AS eligible`, {
    principalId: claims.principalId, employeeId: claims.employeeId,
    issuer: claims.identityIssuer, subject: claims.identitySubject
  })
  if (eligible?.eligible !== true) throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
}
