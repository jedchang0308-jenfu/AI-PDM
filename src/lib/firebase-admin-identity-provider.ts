import "gcp-metadata";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth, type DecodedIdToken } from "firebase-admin/auth";
import type {
  FirebaseCreatedIdentity,
  FirebaseIdentityProvider,
  VerifiedFirebaseIdentity
} from "@/lib/platform-identity-contract";

type FirebaseAdminAuthClient = Pick<
  Auth,
  | "verifyIdToken"
  | "createUser"
  | "generatePasswordResetLink"
  | "updateUser"
  | "revokeRefreshTokens"
  | "deleteUser"
>;

function firebaseProjectId() {
  const projectId = String(process.env.PDM_FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? "").trim();
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID_REQUIRED");
  return projectId;
}

function defaultFirebaseApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: firebaseProjectId() });
}

function requiredEmail(decoded: DecodedIdToken) {
  const email = String(decoded.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("FIREBASE_EMAIL_REQUIRED");
  return email;
}

export class FirebaseAdminIdentityProvider implements FirebaseIdentityProvider {
  constructor(private readonly injectedClient?: FirebaseAdminAuthClient) {}

  private client() {
    return this.injectedClient ?? getAuth(defaultFirebaseApp());
  }

  async verifyIdToken(idToken: string, options: { checkRevoked: true }): Promise<VerifiedFirebaseIdentity> {
    if (!options.checkRevoked) throw new Error("FIREBASE_REVOCATION_CHECK_REQUIRED");
    const decoded = await this.client().verifyIdToken(idToken, true);
    return {
      uid: decoded.uid,
      identityIssuer: String(decoded.iss ?? "").trim(),
      identityAudience: String(decoded.aud ?? "").trim(),
      email: requiredEmail(decoded),
      emailVerified: decoded.email_verified === true,
      disabled: false,
      authTimeSeconds: decoded.auth_time,
      signInProvider: String(decoded.firebase?.sign_in_provider ?? "").trim().toLowerCase(),
      secondFactor: decoded.firebase?.sign_in_second_factor === "totp" ? "totp" : null
    };
  }

  async createEmailPasswordIdentity(input: {
    uid: string;
    email: string;
    displayName: string;
    disabled: boolean;
  }): Promise<FirebaseCreatedIdentity> {
    const created = await this.client().createUser({
      uid: input.uid,
      email: input.email.trim().toLowerCase(),
      displayName: input.displayName.trim(),
      emailVerified: false,
      disabled: input.disabled
    });
    if (!created.email) throw new Error("FIREBASE_CREATED_EMAIL_MISSING");
    return { uid: created.uid, email: created.email };
  }

  generatePasswordSetupLink(email: string, continueUrl: string): Promise<string> {
    return this.client().generatePasswordResetLink(email.trim().toLowerCase(), { url: continueUrl, handleCodeInApp: false });
  }

  async disableIdentity(uid: string): Promise<void> {
    await this.client().updateUser(uid, { disabled: true });
  }

  revokeRefreshTokens(uid: string): Promise<void> {
    return this.client().revokeRefreshTokens(uid);
  }

  deleteIdentity(uid: string): Promise<void> {
    return this.client().deleteUser(uid);
  }
}
