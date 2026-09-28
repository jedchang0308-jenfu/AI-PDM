import { isTrustedGoogleWorkspaceEmail, type GoogleWorkspaceMfaTrustPolicy } from "@/lib/auth-config";
import type { PlatformAssuranceLevel, PlatformSecondFactor } from "@/lib/platform-session-v2";

/** Provider facts only; no local user, UID mapping, or authorization lookup. */
export function resolveJenfuAssuranceFacts(input: {
  email: string;
  signInProvider: string;
  secondFactor: PlatformSecondFactor;
  requirePrivilegedAssurance: boolean;
  workspaceMfaTrustPolicy: GoogleWorkspaceMfaTrustPolicy;
}) {
  const trustedWorkspaceEmail = isTrustedGoogleWorkspaceEmail(input.email, input.workspaceMfaTrustPolicy);
  const trustedGoogleWorkspaceSignIn = input.signInProvider === "google.com" && trustedWorkspaceEmail;
  const trustedPrivilegedAal1Provider =
    input.signInProvider === "google.com" || input.signInProvider === "password";
  const workspaceMfaTrusted = trustedGoogleWorkspaceSignIn && input.workspaceMfaTrustPolicy.enabled;
  const secondFactor: PlatformSecondFactor = input.secondFactor ?? (workspaceMfaTrusted ? "google_workspace_mfa" : null);
  const assuranceLevel: PlatformAssuranceLevel = secondFactor ? "aal2" : "aal1";
  const privilegedAal1PilotAllowed =
    input.requirePrivilegedAssurance &&
    assuranceLevel === "aal1" &&
    trustedWorkspaceEmail &&
    trustedPrivilegedAal1Provider &&
    input.workspaceMfaTrustPolicy.allowAal1PrivilegedPilot;
  if (input.requirePrivilegedAssurance && assuranceLevel !== "aal2" && !privilegedAal1PilotAllowed) {
    throw new Error("auth_token_invalid");
  }
  return { assuranceLevel, secondFactor };
}
