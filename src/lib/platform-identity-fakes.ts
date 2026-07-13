import type {
  FirebaseCreatedIdentity,
  FirebaseIdentityProvider,
  InvitationMailProvider,
  InvitationSetupState,
  PlatformIdentityPrincipal,
  PlatformIdentityRepository,
  VerifiedFirebaseIdentity
} from "./platform-identity-contract.ts";

export class FakeFirebaseIdentityProvider implements FirebaseIdentityProvider {
  readonly identities = new Map<string, VerifiedFirebaseIdentity>();
  readonly operations: string[] = [];
  failPasswordLink = false;

  private findByUid(uid: string) {
    return [...this.identities.values()].find((identity) => identity.uid === uid);
  }

  async verifyIdToken(idToken: string, options: { checkRevoked: true }) {
    this.operations.push(`verify:${idToken}:revoked=${options.checkRevoked}`);
    const identity = this.identities.get(idToken);
    if (!identity) throw new Error("FAKE_FIREBASE_TOKEN_INVALID");
    return identity;
  }

  async createEmailPasswordIdentity(input: { uid: string; email: string; displayName: string; disabled: boolean }): Promise<FirebaseCreatedIdentity> {
    this.operations.push(`create:${input.uid}`);
    if (this.findByUid(input.uid)) throw new Error("FAKE_FIREBASE_UID_EXISTS");
    this.identities.set(input.uid, {
      uid: input.uid,
      email: input.email,
      emailVerified: false,
      disabled: input.disabled,
      authTimeSeconds: 0,
      secondFactor: null
    });
    return { uid: input.uid, email: input.email };
  }

  async generatePasswordSetupLink(email: string, continueUrl: string) {
    this.operations.push(`password-link:${email}`);
    if (this.failPasswordLink) throw new Error("FAKE_PASSWORD_LINK_FAILED");
    return `${continueUrl}?mode=resetPassword&oobCode=fake-redacted-code`;
  }

  async disableIdentity(uid: string) {
    this.operations.push(`disable:${uid}`);
    const identity = this.findByUid(uid);
    if (identity) identity.disabled = true;
  }

  async revokeRefreshTokens(uid: string) {
    this.operations.push(`revoke:${uid}`);
  }

  async deleteIdentity(uid: string) {
    this.operations.push(`delete:${uid}`);
    for (const [key, identity] of this.identities) {
      if (identity.uid === uid) this.identities.delete(key);
    }
  }
}

export class FakePlatformIdentityRepository implements PlatformIdentityRepository {
  readonly principals = new Map<string, PlatformIdentityPrincipal>();
  readonly invitationStates = new Map<string, InvitationSetupState[]>();
  readonly offboardOperations: string[] = [];
  failOffboard = false;

  async resolvePrincipal(firebaseUid: string) {
    return this.principals.get(firebaseUid) ?? null;
  }

  async setInvitationState(invitationId: string, state: InvitationSetupState) {
    const states = this.invitationStates.get(invitationId) ?? [];
    states.push(state);
    this.invitationStates.set(invitationId, states);
  }

  async disableBusinessAccount(input: { firebaseUid: string; pdmUserId: string; reasonCode: string; actorId: string }) {
    this.offboardOperations.push(`disable-business:${input.pdmUserId}:${input.reasonCode}:${input.actorId}`);
    if (this.failOffboard) throw new Error("FAKE_BUSINESS_DISABLE_FAILED");
    const principal = this.principals.get(input.firebaseUid);
    if (principal) principal.accountStatus = "disabled";
  }
}

export class FakeInvitationMailProvider implements InvitationMailProvider {
  readonly deliveries: Array<{ email: string; link: string; invitationId: string }> = [];
  failDelivery = false;

  async sendPasswordSetupLink(input: { email: string; link: string; invitationId: string }) {
    if (this.failDelivery) throw new Error("FAKE_INVITATION_DELIVERY_FAILED");
    this.deliveries.push(input);
  }
}
