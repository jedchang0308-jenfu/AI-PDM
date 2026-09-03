import type { JenfuIdentityConfig, GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import { getGoogleWorkspaceMfaTrustPolicy, isTrustedGoogleWorkspaceEmail } from "@/lib/auth-config";
import type { DbUser } from "@/lib/db";
import { JenfuAuthEpochError } from "@/lib/jenfu-auth-epoch-repository";
import {
  JenfuPrincipalAdmissionError,
  type CanonicalJenfuPrincipalV1
} from "@/lib/jenfu-principal-admission-repository";
import {
  issueJenfuPlatformSessionV1,
  toVerifiedJenfuAppSessionV1,
  verifyJenfuPlatformSessionV1,
  type VerifiedJenfuAppSessionV1
} from "@/lib/jenfu-platform-session-v1";
import type {
  FirebaseIdentityProvider,
  PlatformIdentityPrincipal,
  PlatformIdentityRepository
} from "@/lib/platform-identity-contract";
import type { PlatformAssuranceLevel, PlatformSecondFactor, PlatformSessionKeyRing } from "@/lib/platform-session-v2";

export type JenfuAuthDecisionCode =
  | "auth_request_invalid"
  | "auth_token_invalid"
  | "auth_session_invalid"
  | "auth_epoch_stale"
  | "principal_not_active"
  | "principal_ambiguous"
  | "auth_origin_invalid"
  | "auth_contract_mismatch"
  | "auth_request_too_large"
  | "auth_json_required"
  | "auth_rate_limited"
  | "principal_directory_unavailable"
  | "auth_epoch_unavailable"
  | "auth_server_not_configured";

export class JenfuPlatformAuthError extends Error {
  constructor(
    readonly code: JenfuAuthDecisionCode,
    readonly httpStatus: number
  ) {
    super(code);
    this.name = "JenfuPlatformAuthError";
  }
}

type PrincipalAdmissionReader = {
  requireActivePrincipal(identityIssuer: string, identitySubject: string): Promise<CanonicalJenfuPrincipalV1>;
};

type AuthEpochReader = {
  readPrincipalAuthEpoch(identityIssuer: string, identitySubject: string): Promise<number>;
};

type LocalUserReader = {
  getUserById(userId: string): Promise<DbUser | null>;
};

type AccountSessionReader = {
  isActive(input: { userId: string; sessionId: string; nowMs?: number }): Promise<boolean>;
};

function translateDependencyError(error: unknown): never {
  if (error instanceof JenfuPlatformAuthError) throw error;
  if (error instanceof JenfuPrincipalAdmissionError) {
    throw new JenfuPlatformAuthError(error.code, error.httpStatus);
  }
  if (error instanceof JenfuAuthEpochError) {
    throw new JenfuPlatformAuthError(error.code, error.httpStatus);
  }
  throw error;
}

function resolveAssurance(input: {
  email: string;
  signInProvider: string;
  secondFactor: PlatformSecondFactor;
  requirePrivilegedAssurance: boolean;
  workspaceMfaTrustPolicy: GoogleWorkspaceMfaTrustPolicy;
}) {
  const trustedWorkspace =
    input.signInProvider === "google.com" &&
    isTrustedGoogleWorkspaceEmail(input.email, input.workspaceMfaTrustPolicy);
  const workspaceMfaTrusted = trustedWorkspace && input.workspaceMfaTrustPolicy.enabled;
  const secondFactor: PlatformSecondFactor = input.secondFactor ?? (workspaceMfaTrusted ? "google_workspace_mfa" : null);
  const assuranceLevel: PlatformAssuranceLevel = secondFactor ? "aal2" : "aal1";
  const privilegedAal1PilotAllowed =
    input.requirePrivilegedAssurance &&
    assuranceLevel === "aal1" &&
    trustedWorkspace &&
    input.workspaceMfaTrustPolicy.allowAal1PrivilegedPilot;
  if (input.requirePrivilegedAssurance && assuranceLevel !== "aal2" && !privilegedAal1PilotAllowed) {
    throw new JenfuPlatformAuthError("auth_token_invalid", 401);
  }
  return { assuranceLevel, secondFactor };
}

export async function exchangeFirebaseIdTokenForJenfuPlatformSession(input: {
  idToken: string;
  firebase: FirebaseIdentityProvider;
  localPrincipalRepository: Pick<PlatformIdentityRepository, "resolvePrincipal">;
  principalAdmissionRepository: PrincipalAdmissionReader;
  authEpochRepository: AuthEpochReader;
  identityConfig: JenfuIdentityConfig;
  keyRing: PlatformSessionKeyRing;
  requirePrivilegedAssurance?: boolean;
  workspaceMfaTrustPolicy?: GoogleWorkspaceMfaTrustPolicy;
  nowSeconds?: number;
}) {
  let verified;
  try {
    verified = await input.firebase.verifyIdToken(input.idToken, { checkRevoked: true });
  } catch {
    throw new JenfuPlatformAuthError("auth_token_invalid", 401);
  }
  if (
    verified.disabled ||
    !verified.emailVerified ||
    verified.identityIssuer !== input.identityConfig.identityIssuer ||
    verified.identityAudience !== input.identityConfig.identityAudience
  ) {
    throw new JenfuPlatformAuthError("auth_token_invalid", 401);
  }

  let localPrincipal: PlatformIdentityPrincipal | null;
  try {
    localPrincipal = await input.localPrincipalRepository.resolvePrincipal(verified.uid);
  } catch {
    throw new JenfuPlatformAuthError("auth_server_not_configured", 503);
  }
  if (!localPrincipal || localPrincipal.accountStatus !== "active") {
    throw new JenfuPlatformAuthError("principal_not_active", 403);
  }

  let admittedPrincipal: CanonicalJenfuPrincipalV1;
  let authEpoch: number;
  try {
    admittedPrincipal = await input.principalAdmissionRepository.requireActivePrincipal(
      verified.identityIssuer,
      verified.uid
    );
    authEpoch = await input.authEpochRepository.readPrincipalAuthEpoch(verified.identityIssuer, verified.uid);
  } catch (error) {
    translateDependencyError(error);
  }

  const assurance = resolveAssurance({
    email: verified.email,
    signInProvider: verified.signInProvider,
    secondFactor: verified.secondFactor,
    requirePrivilegedAssurance: Boolean(input.requirePrivilegedAssurance || localPrincipal.requiresPrivilegedAssurance),
    workspaceMfaTrustPolicy: input.workspaceMfaTrustPolicy ?? getGoogleWorkspaceMfaTrustPolicy()
  });
  return issueJenfuPlatformSessionV1(
    {
      identityIssuer: verified.identityIssuer,
      identityAudience: verified.identityAudience,
      identitySubject: verified.uid,
      principalId: admittedPrincipal.principalId,
      employeeId: admittedPrincipal.employeeId,
      localPrincipalId: localPrincipal.pdmUserId,
      companyId: localPrincipal.companyId,
      authEpoch,
      accountLifecycleVersion: localPrincipal.sessionVersion,
      authTime: verified.authTimeSeconds,
      assuranceLevel: assurance.assuranceLevel,
      secondFactor: assurance.secondFactor
    },
    input.keyRing,
    input.nowSeconds
  );
}

function assertLocalUserAllowed(user: DbUser | null, claims: ReturnType<typeof verifyJenfuPlatformSessionV1>, nowMs: number) {
  if (
    !user ||
    user.id !== claims.localPrincipalId ||
    user.company_id !== claims.companyId ||
    user.account_status !== "active" ||
    user.system_role_enabled === 0 ||
    user.system_role_enabled === false ||
    Number(user.account_lifecycle_version ?? 1) !== claims.accountLifecycleVersion
  ) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }
  const invalidBefore = user.session_invalid_before ? Date.parse(user.session_invalid_before) : Number.NaN;
  if (Number.isFinite(invalidBefore) && claims.issuedAt * 1000 <= invalidBefore) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }
  if (claims.issuedAt * 1000 > nowMs + 5 * 60 * 1000) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }
  return user;
}

export async function verifyJenfuPlatformRequestSession(input: {
  token: string;
  keyRing: PlatformSessionKeyRing;
  identityConfig: JenfuIdentityConfig;
  localUserRepository: LocalUserReader;
  accountSessionRegistry: AccountSessionReader;
  principalAdmissionRepository: PrincipalAdmissionReader;
  authEpochRepository: AuthEpochReader;
  nowSeconds?: number;
}): Promise<{ user: DbUser; session: VerifiedJenfuAppSessionV1 }> {
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  let claims;
  try {
    claims = verifyJenfuPlatformSessionV1(input.token, input.keyRing, { nowSeconds });
  } catch {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }
  if (
    claims.identityIssuer !== input.identityConfig.identityIssuer ||
    claims.identityAudience !== input.identityConfig.identityAudience
  ) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }

  const user = assertLocalUserAllowed(
    await input.localUserRepository.getUserById(claims.localPrincipalId),
    claims,
    nowSeconds * 1000
  );
  if (!(await input.accountSessionRegistry.isActive({
    userId: claims.localPrincipalId,
    sessionId: claims.sessionId,
    nowMs: nowSeconds * 1000
  }))) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }

  let admittedPrincipal: CanonicalJenfuPrincipalV1;
  let currentEpoch: number;
  try {
    admittedPrincipal = await input.principalAdmissionRepository.requireActivePrincipal(
      claims.identityIssuer,
      claims.identitySubject
    );
    currentEpoch = await input.authEpochRepository.readPrincipalAuthEpoch(
      claims.identityIssuer,
      claims.identitySubject
    );
  } catch (error) {
    translateDependencyError(error);
  }
  if (
    admittedPrincipal.principalId !== claims.principalId ||
    admittedPrincipal.employeeId !== claims.employeeId
  ) {
    throw new JenfuPlatformAuthError("auth_session_invalid", 401);
  }
  if (currentEpoch !== claims.authEpoch) throw new JenfuPlatformAuthError("auth_epoch_stale", 401);
  return { user, session: toVerifiedJenfuAppSessionV1(claims) };
}

export function normalizeJenfuPlatformAuthError(error: unknown) {
  if (error instanceof JenfuPlatformAuthError) return error;
  if (error instanceof JenfuPrincipalAdmissionError) {
    return new JenfuPlatformAuthError(error.code, error.httpStatus);
  }
  if (error instanceof JenfuAuthEpochError) return new JenfuPlatformAuthError(error.code, error.httpStatus);
  const message = error instanceof Error ? error.message : String(error);
  if (/^(?:JENFU_|SESSION_V2_CONFIG_|SESSION_V2_SECRET_)/u.test(message)) {
    return new JenfuPlatformAuthError("auth_server_not_configured", 503);
  }
  return new JenfuPlatformAuthError("auth_token_invalid", 401);
}
