import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { SettingsSecretActivationIntent } from "@/lib/repositories/settings-secret-async-repository";
import { JenfuPrincipalAdmissionRepository, JenfuPrincipalAdmissionError } from "@/lib/jenfu-principal-admission-repository";
import { JenfuPrincipalAccountRepository, JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";

export class SettingsSecretActivationDenied extends Error {
  constructor(readonly code: "consent_identity_changed" | "consent_authority_revoked" | "consent_auth_barrier") {
    super(code);
  }
}

/** Durable human delegation, not a restored session or a workload acting as a human. */
export async function requireCurrentSettingsSecretActivationAuthority(
  snapshot: AsyncDatabaseClient, intent: SettingsSecretActivationIntent
) {
  try {
    const typed = await new JenfuPrincipalAdmissionRepository(snapshot)
      .requireActiveTypedPrincipal(intent.identityIssuer, intent.identitySubject);
    const account = await new JenfuPrincipalAccountRepository(snapshot).requireActive(intent.consentPrincipalId);
    const state = await new JenfuAuthEpochRepository(snapshot).readCanonicalPrincipalState(intent.consentPrincipalId);
    if (typed.principalId !== intent.consentPrincipalId || typed.employeeId !== intent.consentEmployeeId ||
      typed.accountType !== account.accountType || account.employeeId !== intent.consentEmployeeId ||
      account.pdmUserId !== intent.consentPdmUserId || account.companyId !== intent.companyId ||
      account.profileVersion !== intent.profileVersion || account.lifecycleVersion !== intent.accountLifecycleVersion ||
      state.authEpoch !== intent.authEpoch) throw new SettingsSecretActivationDenied("consent_identity_changed");
    if ((state.revokedBefore && Date.parse(intent.authenticatedAt) <= Date.parse(state.revokedBefore)) ||
      (account.sessionInvalidBefore && Date.parse(intent.sessionIssuedAt) <= Date.parse(account.sessionInvalidBefore))) {
      throw new SettingsSecretActivationDenied("consent_auth_barrier");
    }
    if (!Number.isFinite(Date.parse(intent.authenticatedAt)) || !Number.isFinite(Date.parse(intent.sessionIssuedAt))) {
      throw new SettingsSecretActivationDenied("consent_identity_changed");
    }
    await validatePrincipalPublishedGrantSnapshot(snapshot, {
      principalId: typed.principalId, employeeId: typed.employeeId,
      identityIssuer: typed.identityIssuer, identitySubject: typed.identitySubject
    });
    const [decision] = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(snapshot, {
      identityIssuer: typed.identityIssuer, identitySubject: typed.identitySubject,
      principalId: typed.principalId, employeeId: typed.employeeId,
      localPrincipalId: account.pdmUserId, companyId: account.companyId, sessionSchemaVersion: 2
    }, [{ permissionKind: "action", permissionCode: "settings.secret.manage" }]);
    if (!decision?.allowed) throw new SettingsSecretActivationDenied("consent_authority_revoked");
    return { principalId: typed.principalId, pdmUserId: account.pdmUserId, companyId: account.companyId };
  } catch (error) {
    // Only validated business denial is terminal. Failed reads roll back the owner transaction.
    if ((error instanceof JenfuPrincipalAdmissionError && ["principal_not_active","principal_ambiguous"].includes(error.code)) ||
      (error instanceof JenfuPrincipalAccountError && error.code === "principal_account_inactive") ||
      (error instanceof JenfuEntitlementRepositoryError && error.code === "permission_not_granted")) {
      throw new SettingsSecretActivationDenied("consent_authority_revoked");
    }
    throw error;
  }
}
