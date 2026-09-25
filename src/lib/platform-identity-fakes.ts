import type {
  FirebaseIdentityProvider,
  PlatformIdentityPrincipal,
  PlatformIdentityRepository,
  VerifiedFirebaseIdentity
} from "./platform-identity-contract.ts";

export class FakeFirebaseIdentityProvider implements FirebaseIdentityProvider {
  readonly identities = new Map<string, VerifiedFirebaseIdentity>();
  readonly operations: string[] = [];

  async verifyIdToken(idToken: string, options: { checkRevoked: true }) {
    this.operations.push(`verify:${idToken}:revoked=${options.checkRevoked}`);
    const identity = this.identities.get(idToken);
    if (!identity) throw new Error("FAKE_FIREBASE_TOKEN_INVALID");
    return identity;
  }

}

export class FakePlatformIdentityRepository implements PlatformIdentityRepository {
  readonly principals = new Map<string, PlatformIdentityPrincipal>();

  async resolvePrincipal(firebaseUid: string) {
    return this.principals.get(firebaseUid) ?? null;
  }

}
