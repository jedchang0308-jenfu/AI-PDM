import {
  issuePlatformSessionV2,
  type PlatformAssuranceLevel,
  type PlatformSecondFactor,
  type PlatformSessionKeyRing
} from "./platform-session-v2.ts";
import {
  getGoogleWorkspaceMfaTrustPolicy,
  isTrustedGoogleWorkspaceEmail,
  type GoogleWorkspaceMfaTrustPolicy
} from "./auth-config.ts";

export interface VerifiedFirebaseIdentity {
  uid: string;
  identityIssuer: string;
  identityAudience: string;
  email: string;
  emailVerified: boolean;
  disabled: boolean;
  authTimeSeconds: number;
  signInProvider: string;
  secondFactor: PlatformSecondFactor;
}

export interface FirebaseIdentityProvider {
  verifyIdToken(idToken: string, options: { checkRevoked: true }): Promise<VerifiedFirebaseIdentity>;
}

export interface PlatformIdentityPrincipal {
  firebaseUid: string;
  pdmUserId: string;
  companyId: string;
  sessionVersion: number;
  accountStatus: "active" | "disabled";
  requiresPrivilegedAssurance?: boolean;
}

export type InvitationSetupState =
  | "requested"
  | "identity_created"
  | "password_setup_link_sent"
  | "active"
  | "compensated"
  | "failed";

export interface PlatformIdentityRepository {
  resolvePrincipal(firebaseUid: string): Promise<PlatformIdentityPrincipal | null>;
}

export async function exchangeFirebaseIdTokenForPlatformSession(input: {
  idToken: string;
  firebase: FirebaseIdentityProvider;
  repository: Pick<PlatformIdentityRepository, "resolvePrincipal">;
  keyRing: PlatformSessionKeyRing;
  requirePrivilegedAssurance?: boolean;
  workspaceMfaTrustPolicy?: GoogleWorkspaceMfaTrustPolicy;
  nowSeconds?: number;
}) {
  const verified = await input.firebase.verifyIdToken(input.idToken, { checkRevoked: true });
  if (verified.disabled) throw new Error("FIREBASE_IDENTITY_DISABLED");
  if (!verified.emailVerified) throw new Error("FIREBASE_EMAIL_NOT_VERIFIED");
  const principal = await input.repository.resolvePrincipal(verified.uid);
  if (!principal || principal.accountStatus !== "active") throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");
  const workspaceMfaTrustPolicy = input.workspaceMfaTrustPolicy ?? getGoogleWorkspaceMfaTrustPolicy();
  const trustedWorkspaceEmail = isTrustedGoogleWorkspaceEmail(verified.email, workspaceMfaTrustPolicy);
  const trustedGoogleWorkspaceSignIn =
    verified.signInProvider === "google.com" && trustedWorkspaceEmail;
  const trustedPrivilegedAal1Provider =
    verified.signInProvider === "google.com" || verified.signInProvider === "password";
  const workspaceMfaTrusted = trustedGoogleWorkspaceSignIn && workspaceMfaTrustPolicy.enabled;
  const secondFactor: PlatformSecondFactor = verified.secondFactor ?? (workspaceMfaTrusted ? "google_workspace_mfa" : null);
  const assuranceLevel: PlatformAssuranceLevel = secondFactor ? "aal2" : "aal1";
  const privilegedAssuranceRequired =
    input.requirePrivilegedAssurance ||
    principal.requiresPrivilegedAssurance;
  const privilegedAal1PilotAllowed =
    privilegedAssuranceRequired &&
    assuranceLevel === "aal1" &&
    trustedWorkspaceEmail &&
    trustedPrivilegedAal1Provider &&
    workspaceMfaTrustPolicy.allowAal1PrivilegedPilot;
  if (privilegedAssuranceRequired && assuranceLevel !== "aal2" && !privilegedAal1PilotAllowed) {
    throw new Error("FIREBASE_PRIVILEGED_ASSURANCE_REQUIRED");
  }
  return issuePlatformSessionV2(
    {
      subject: verified.uid,
      pdmUserId: principal.pdmUserId,
      companyId: principal.companyId,
      authTime: verified.authTimeSeconds,
      sessionVersion: principal.sessionVersion,
      assuranceLevel,
      secondFactor
    },
    input.keyRing,
    input.nowSeconds
  );
}
