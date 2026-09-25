import type { GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import { resolvePrincipalHandoffAssurance } from "@/lib/jenfu-principal-assurance";
import { requiresPrincipalAal2 } from "@/lib/jenfu-principal-assurance-requirement";
import type { JenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { resolveJenfuTargetSessionExpiry } from "@/lib/jenfu-target-session-expiry";
import type { PlatformSessionKeyRing } from "@/lib/platform-session-v2";

/** No provider call or legacy UID/profile lookup occurs inside this transaction. */
export async function issueSessionForPrincipalHandoff(input: {
  handoff: JenfuPrincipalHandoff;
  database: AsyncDatabaseClient;
  expectedIdentityIssuer: string;
  keyRing: PlatformSessionKeyRing;
  trustPolicy: GoogleWorkspaceMfaTrustPolicy;
  nowMs?: number;
}) {
  const { handoff } = input;
  const nowMs = input.nowMs ?? Date.now();
  if (input.database.kind !== "postgres" || !Number.isSafeInteger(nowMs) ||
    handoff.identity.identityIssuer !== input.expectedIdentityIssuer) throw new Error("HANDOFF_INVALID");
  const authenticatedAt = Date.parse(handoff.authentication.authenticatedAt);
  const proofExpiresAt = Date.parse(handoff.expiresAt);
  if (!Number.isFinite(authenticatedAt) || authenticatedAt > nowMs + 60_000 ||
    !Number.isFinite(proofExpiresAt)) throw new Error("HANDOFF_INVALID");
  if (proofExpiresAt <= nowMs) throw new Error("HANDOFF_EXPIRED");

  return input.database.transaction(async (snapshot) => {
    await snapshot.execute("SET LOCAL statement_timeout = '5s'");
    await snapshot.execute("SET LOCAL lock_timeout = '2s'");
    const typed = await new JenfuPrincipalAdmissionRepository(snapshot)
      .requireActiveTypedPrincipal(handoff.identity.identityIssuer, handoff.identity.identitySubject);
    const state = await new JenfuAuthEpochRepository(snapshot)
      .readCanonicalPrincipalState(handoff.identity.principalId);
    const account = await new JenfuPrincipalAccountRepository(snapshot)
      .requireActive(handoff.identity.principalId);
    if (typed.principalId !== handoff.identity.principalId ||
      typed.employeeId !== handoff.identity.employeeId ||
      typed.accountType !== account.accountType ||
      account.employeeId !== handoff.identity.employeeId ||
      state.authEpoch !== handoff.authState.authEpoch ||
      (state.revokedBefore !== null && authenticatedAt <= Date.parse(state.revokedBefore)) ||
      (handoff.authState.revokedBefore !== null &&
        authenticatedAt <= Date.parse(handoff.authState.revokedBefore))) {
      throw new Error("STALE_HANDOFF");
    }
    const profile = await snapshot.queryOne<{ id: string; company_id: string }>(`
      SELECT profile.id,profile.company_id
      FROM ai_pdm_core.users profile
      JOIN ai_pdm_core.principal_accounts owner
        ON owner.pdm_user_id=profile.id AND owner.company_id=profile.company_id
       AND owner.principal_id=:principalId
      JOIN ai_pdm_core.principal_identity_cutovers cutover
        ON cutover.pdm_user_id=profile.id AND cutover.principal_id=owner.principal_id
       AND cutover.status='principal_active'
      WHERE profile.id=:pdmUserId AND profile.company_id=:companyId
    `, { pdmUserId: account.pdmUserId, companyId: account.companyId,
      principalId: account.principalId });
    if (!profile || profile.id !== account.pdmUserId ||
      profile.company_id !== account.companyId) throw new Error("PRINCIPAL_PROFILE_INVALID");

    const requiresPrivilegedRole = await requiresPrincipalAal2(snapshot, {
      identityIssuer: handoff.identity.identityIssuer,
      identitySubject: handoff.identity.identitySubject,
      principalId: handoff.identity.principalId,
      employeeId: handoff.identity.employeeId
    });
    const assurance = resolvePrincipalHandoffAssurance({
      authentication: handoff.authentication,
      account, policy: input.trustPolicy, requiresPrivilegedRole
    });
    // A proof may expire while the transaction is waiting on producer reads.
    // Test clocks stay fixed; production rechecks the wall clock before write.
    const issuanceNowMs = input.nowMs ?? Date.now();
    if (proofExpiresAt <= issuanceNowMs) throw new Error("HANDOFF_EXPIRED");
    const actualNowSeconds = Math.floor(issuanceNowMs / 1000);
    const barrierSeconds = account.sessionInvalidBefore === null
      ? actualNowSeconds : Math.max(actualNowSeconds, Math.floor(Date.parse(account.sessionInvalidBefore) / 1000) + 1);
    if (!Number.isSafeInteger(barrierSeconds) || barrierSeconds > actualNowSeconds + 1) {
      throw new Error("PRINCIPAL_SESSION_BARRIER_INVALID");
    }
    const maxExpiry = resolveJenfuTargetSessionExpiry(actualNowSeconds, handoff.sourceSessionExpiresAt);
    if (barrierSeconds >= maxExpiry) throw new Error("HANDOFF_EXPIRED");
    const token = issueJenfuPrincipalSession({
      principalId: account.principalId, employeeId: account.employeeId,
      identityIssuer: handoff.identity.identityIssuer,
      identitySubject: handoff.identity.identitySubject,
      authEpoch: state.authEpoch,
      accountLifecycleVersion: account.lifecycleVersion,
      profileVersion: account.profileVersion,
      companyId: account.companyId,
      authenticatedAt: Math.floor(authenticatedAt / 1000),
      assuranceLevel: assurance.assuranceLevel,
      secondFactor: assurance.secondFactor,
      assurancePolicyHash: assurance.assurancePolicyHash,
      maxAgeSeconds: maxExpiry - barrierSeconds
    }, input.keyRing, barrierSeconds);
    const claims = verifyJenfuPrincipalSession(token, input.keyRing, { nowSeconds: actualNowSeconds });
    await new JenfuPrincipalSessionRegistry(snapshot).register(claims);
    return { token, claims };
  }, { isolationLevel: "repeatable_read" });
}
