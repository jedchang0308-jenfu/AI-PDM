import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { JenfuPrincipalAccountError, JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionError, JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { isDynamicRolePolicyInSnapshot, canonicalCapabilityGroups } from "@/lib/principal-resource-capability";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

/** Durable initiator data only; it cannot recreate or extend the original session. */
export type PrincipalJobInitiator = Readonly<{
  kind: "verified_principal";
  principalId: string;
  employeeId: string;
  pdmUserId: string;
  companyId: string;
  identityIssuer: string;
  identitySubject: string;
  profileVersion: number;
  accountLifecycleVersion: number;
  authEpoch: number;
  authenticatedAt: string;
  sessionIssuedAt: string;
}>;

/** Canonical entity/category/role values are resolved from owner rows by the caller. */
export type PrincipalJobCanonicalResource = Readonly<{
  linkedEntityType: string;
  documentCategory?: string | null;
  capabilityRole?: string | null;
  action?: "view" | "download" | "view_and_download";
}>;

export class PrincipalJobAuthorityError extends Error {
  constructor(readonly code: "PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE" | "PRINCIPAL_JOB_INITIATOR_REVOKED" |
    "PRINCIPAL_JOB_RESOURCE_UNAVAILABLE" | "PRINCIPAL_JOB_RESOURCE_VIEW_DENIED", readonly status: 403 | 503) {
    super(code);
    this.name = "PrincipalJobAuthorityError";
  }
  get httpStatus() { return this.status; }
}

function requiredText(value: unknown, maxLength = 255): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength &&
    value.trim() === value && /\S/u.test(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

function requiredVersion(value: unknown, allowZero = false): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= (allowZero ? 0 : 1);
}

function requiredTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && value.trim() === value &&
    Number.isFinite(Date.parse(value));
}

/** Copy only facts produced by the verified request guard. */
export function principalJobInitiatorFromVerifiedRequest(verified: VerifiedPrincipalRequest): PrincipalJobInitiator {
  return {
    kind: "verified_principal",
    principalId: verified.session.principalId,
    employeeId: verified.session.employeeId,
    pdmUserId: verified.profile.pdmUserId,
    companyId: verified.profile.companyId,
    identityIssuer: verified.session.identityIssuer,
    identitySubject: verified.session.identitySubject,
    profileVersion: verified.session.profileVersion,
    accountLifecycleVersion: verified.session.accountLifecycleVersion,
    authEpoch: verified.session.authEpoch,
    authenticatedAt: verified.session.authenticatedAt,
    sessionIssuedAt: verified.session.issuedAt
  };
}

/** PostgreSQL JSONB drivers return objects; older metadata columns may return JSON text. */
export function parsePrincipalJobInitiator(value: unknown): PrincipalJobInitiator | null {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = JSON.parse(parsed) as unknown; }
    catch { return null; }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  const expected = ["accountLifecycleVersion", "authEpoch", "authenticatedAt", "companyId",
    "employeeId", "identityIssuer", "identitySubject", "kind", "pdmUserId", "principalId",
    "profileVersion", "sessionIssuedAt"].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index]) ||
    row.kind !== "verified_principal" || !requiredText(row.principalId) || !requiredText(row.employeeId) ||
    !requiredText(row.pdmUserId) || !requiredText(row.companyId) || !requiredText(row.identityIssuer, 2048) ||
    !requiredText(row.identitySubject) || !requiredVersion(row.profileVersion) ||
    !requiredVersion(row.accountLifecycleVersion) || !requiredVersion(row.authEpoch, true) ||
    !requiredTimestamp(row.authenticatedAt) || !requiredTimestamp(row.sessionIssuedAt)) return null;
  return {
    kind: "verified_principal",
    principalId: row.principalId,
    employeeId: row.employeeId,
    pdmUserId: row.pdmUserId,
    companyId: row.companyId,
    identityIssuer: row.identityIssuer,
    identitySubject: row.identitySubject,
    profileVersion: row.profileVersion,
    accountLifecycleVersion: row.accountLifecycleVersion,
    authEpoch: row.authEpoch,
    authenticatedAt: row.authenticatedAt,
    sessionIssuedAt: row.sessionIssuedAt
  };
}

/** Re-admit the durable actor and require the requested current canonical actions. */
export async function requireCurrentPrincipalJobAuthority(
  snapshot: AsyncDatabaseClient,
  initiator: PrincipalJobInitiator,
  resource: PrincipalJobCanonicalResource
): Promise<void> {
  if (snapshot.kind !== "postgres" || !parsePrincipalJobInitiator(initiator)) {
    throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE", 503);
  }
  const groups = canonicalCapabilityGroups(resource.linkedEntityType, resource.capabilityRole ?? resource.documentCategory);
  if (!groups.length) throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_RESOURCE_UNAVAILABLE", 503);
  const action = resource.action ?? "view";

  try {
    const typed = await new JenfuPrincipalAdmissionRepository(snapshot)
      .requireActiveTypedPrincipal(initiator.identityIssuer, initiator.identitySubject);
    const account = await new JenfuPrincipalAccountRepository(snapshot).requireActive(initiator.principalId);
    const state = await new JenfuAuthEpochRepository(snapshot).readCanonicalPrincipalState(initiator.principalId);
    const profile = await snapshot.queryOne<{ id: string }>(
      "SELECT id FROM ai_pdm_core.users WHERE id=:pdmUserId AND company_id=:companyId",
      { pdmUserId: initiator.pdmUserId, companyId: initiator.companyId }
    );
    if (typed.principalId !== initiator.principalId || typed.employeeId !== initiator.employeeId ||
      typed.accountType !== account.accountType || typed.identityIssuer !== initiator.identityIssuer ||
      typed.identitySubject !== initiator.identitySubject || account.principalId !== initiator.principalId ||
      account.employeeId !== initiator.employeeId || account.pdmUserId !== initiator.pdmUserId ||
      account.companyId !== initiator.companyId || account.profileVersion !== initiator.profileVersion ||
      account.lifecycleVersion !== initiator.accountLifecycleVersion || state.authEpoch !== initiator.authEpoch ||
      !profile || profile.id !== initiator.pdmUserId ||
      !Number.isFinite(Date.parse(initiator.authenticatedAt)) || !Number.isFinite(Date.parse(initiator.sessionIssuedAt)) ||
      (state.revokedBefore && Date.parse(initiator.authenticatedAt) <= Date.parse(state.revokedBefore)) ||
      (account.sessionInvalidBefore && Date.parse(initiator.sessionIssuedAt) <= Date.parse(account.sessionInvalidBefore))) {
      throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_INITIATOR_REVOKED", 403);
    }
    await validatePrincipalPublishedGrantSnapshot(snapshot, {
      principalId: typed.principalId,
      employeeId: typed.employeeId,
      identityIssuer: typed.identityIssuer,
      identitySubject: typed.identitySubject
    });
    if (await isDynamicRolePolicyInSnapshot(snapshot)) {
      const actions = action === "view_and_download" ? ["view", "download"] as const : [action];
      const permissions = groups.flatMap(group => actions.map(requiredAction => ({
        permissionKind: "action" as const, permissionCode: `pdm.${group}.${requiredAction}`
      })));
      const decisions = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(snapshot, {
        principalId: initiator.principalId,
        employeeId: initiator.employeeId,
        identityIssuer: initiator.identityIssuer,
        identitySubject: initiator.identitySubject,
        localPrincipalId: initiator.pdmUserId,
        companyId: initiator.companyId,
        sessionSchemaVersion: 2
      }, permissions, { workspaceCode: initiator.companyId });
      if (decisions.length !== permissions.length || decisions.some((decision, index) =>
        !decision || decision.principalId !== initiator.principalId ||
        decision.permissionCode !== permissions[index].permissionCode || !decision.allowed)) {
        throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_RESOURCE_VIEW_DENIED", 403);
      }
    }
  } catch (error) {
    if (error instanceof PrincipalJobAuthorityError) throw error;
    if ((error instanceof JenfuPrincipalAdmissionError && ["principal_not_active", "principal_ambiguous"].includes(error.code)) ||
      (error instanceof JenfuPrincipalAccountError && error.code === "principal_account_inactive") ||
      (error instanceof JenfuEntitlementRepositoryError && error.code === "permission_not_granted")) {
      throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_INITIATOR_REVOKED", 403);
    }
    throw new PrincipalJobAuthorityError("PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE", 503);
  }
}
