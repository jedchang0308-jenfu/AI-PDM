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

export interface FirebaseCreatedIdentity {
  uid: string;
  email: string;
}

export interface FirebaseIdentityProvider {
  verifyIdToken(idToken: string, options: { checkRevoked: true }): Promise<VerifiedFirebaseIdentity>;
  createEmailPasswordIdentity(input: { uid: string; email: string; displayName: string; disabled: boolean }): Promise<FirebaseCreatedIdentity>;
  generatePasswordSetupLink(email: string, continueUrl: string): Promise<string>;
  disableIdentity(uid: string): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
  deleteIdentity(uid: string): Promise<void>;
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
  setInvitationState(invitationId: string, state: InvitationSetupState, detail?: string): Promise<void>;
  disableBusinessAccount(input: { firebaseUid: string; pdmUserId: string; reasonCode: string; actorId: string }): Promise<void>;
}

export interface InvitationMailProvider {
  sendPasswordSetupLink(input: { email: string; link: string; invitationId: string }): Promise<void>;
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
  const trustedGoogleWorkspaceSignIn =
    verified.signInProvider === "google.com" &&
    isTrustedGoogleWorkspaceEmail(verified.email, workspaceMfaTrustPolicy);
  const workspaceMfaTrusted = trustedGoogleWorkspaceSignIn && workspaceMfaTrustPolicy.enabled;
  const secondFactor: PlatformSecondFactor = verified.secondFactor ?? (workspaceMfaTrusted ? "google_workspace_mfa" : null);
  const assuranceLevel: PlatformAssuranceLevel = secondFactor ? "aal2" : "aal1";
  const privilegedAssuranceRequired =
    input.requirePrivilegedAssurance ||
    principal.requiresPrivilegedAssurance;
  const privilegedAal1PilotAllowed =
    privilegedAssuranceRequired &&
    assuranceLevel === "aal1" &&
    trustedGoogleWorkspaceSignIn &&
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

export async function provisionFirebasePasswordInvitation(input: {
  invitationId: string;
  targetUid: string;
  email: string;
  displayName: string;
  continueUrl: string;
  firebase: FirebaseIdentityProvider;
  repository: PlatformIdentityRepository;
  mailer: InvitationMailProvider;
}) {
  let createdIdentity: FirebaseCreatedIdentity | null = null;
  await input.repository.setInvitationState(input.invitationId, "requested");
  try {
    createdIdentity = await input.firebase.createEmailPasswordIdentity({
      uid: input.targetUid,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      disabled: false
    });
    await input.repository.setInvitationState(input.invitationId, "identity_created");
    const link = await input.firebase.generatePasswordSetupLink(createdIdentity.email, input.continueUrl);
    await input.mailer.sendPasswordSetupLink({ email: createdIdentity.email, link, invitationId: input.invitationId });
    await input.repository.setInvitationState(input.invitationId, "password_setup_link_sent");
    return { uid: createdIdentity.uid, setupState: "password_setup_link_sent" as const };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (createdIdentity) {
      await input.firebase.disableIdentity(createdIdentity.uid).catch(() => undefined);
      await input.firebase.revokeRefreshTokens(createdIdentity.uid).catch(() => undefined);
      await input.firebase.deleteIdentity(createdIdentity.uid).catch(() => undefined);
      await input.repository.setInvitationState(input.invitationId, "compensated", detail);
    } else {
      await input.repository.setInvitationState(input.invitationId, "failed", detail);
    }
    throw error;
  }
}

export async function offboardIdentityDenyFirst(input: {
  firebaseUid: string;
  pdmUserId: string;
  reasonCode: string;
  actorId: string;
  firebase: FirebaseIdentityProvider;
  repository: PlatformIdentityRepository;
}) {
  await input.firebase.disableIdentity(input.firebaseUid);
  await input.firebase.revokeRefreshTokens(input.firebaseUid);
  try {
    await input.repository.disableBusinessAccount({
      firebaseUid: input.firebaseUid,
      pdmUserId: input.pdmUserId,
      reasonCode: input.reasonCode,
      actorId: input.actorId
    });
    return { status: "completed" as const };
  } catch (error) {
    return {
      status: "reconciliation_pending" as const,
      providerAccessDenied: true,
      detail: error instanceof Error ? error.message : String(error)
    };
  }
}
