import crypto from "node:crypto";

export const PLATFORM_SESSION_V2_MAX_AGE_SECONDS = 8 * 60 * 60;
export type PlatformAssuranceLevel = "aal1" | "aal2";
export type PlatformSecondFactor = "totp" | "google_workspace_mfa" | null;

export interface PlatformSessionKeyRing {
  issuer: string;
  audience: string;
  currentKeyId: string;
  keys: Record<string, string>;
}

export interface PlatformSessionV2Claims {
  version: 2;
  issuer: string;
  audience: string;
  subject: string;
  pdmUserId: string;
  companyId: string;
  issuedAt: number;
  expiresAt: number;
  authTime: number;
  sessionId: string;
  sessionVersion: number;
  assuranceLevel: PlatformAssuranceLevel;
  secondFactor: PlatformSecondFactor;
  identityProvider: "firebase";
}

export interface IssuePlatformSessionV2Input {
  subject: string;
  pdmUserId: string;
  companyId: string;
  authTime: number;
  sessionVersion: number;
  assuranceLevel: PlatformAssuranceLevel;
  secondFactor?: PlatformSecondFactor;
  maxAgeSeconds?: number;
  sessionId?: string;
}

export interface VerifyPlatformSessionV2Policy {
  nowSeconds?: number;
  requiredAssuranceLevel?: PlatformAssuranceLevel;
  currentSessionVersion?: number;
  revokedSessionIds?: ReadonlySet<string>;
  providerUserDisabled?: boolean;
  clockSkewSeconds?: number;
}

interface PlatformSessionHeader {
  algorithm: "HS256";
  type: "PDM-BFF";
  version: 2;
  keyId: string;
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function assertKeyRing(keyRing: PlatformSessionKeyRing) {
  if (!keyRing.issuer.trim() || !keyRing.audience.trim()) throw new Error("SESSION_V2_ISSUER_AUDIENCE_REQUIRED");
  const current = keyRing.keys[keyRing.currentKeyId];
  if (!current || Buffer.byteLength(current, "utf8") < 32) throw new Error("SESSION_V2_CURRENT_KEY_TOO_SHORT");
}

function signature(signingInput: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

export function issuePlatformSessionV2(
  input: IssuePlatformSessionV2Input,
  keyRing: PlatformSessionKeyRing,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  assertKeyRing(keyRing);
  const maxAgeSeconds = input.maxAgeSeconds ?? PLATFORM_SESSION_V2_MAX_AGE_SECONDS;
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0 || maxAgeSeconds > PLATFORM_SESSION_V2_MAX_AGE_SECONDS) {
    throw new Error("SESSION_V2_MAX_AGE_EXCEEDED");
  }
  if (!Number.isInteger(input.sessionVersion) || input.sessionVersion < 1) throw new Error("SESSION_V2_VERSION_INVALID");
  if (input.assuranceLevel === "aal2" && !input.secondFactor) throw new Error("SESSION_V2_AAL2_REQUIRES_RECOGNIZED_MFA");

  const header: PlatformSessionHeader = {
    algorithm: "HS256",
    type: "PDM-BFF",
    version: 2,
    keyId: keyRing.currentKeyId
  };
  const claims: PlatformSessionV2Claims = {
    version: 2,
    issuer: keyRing.issuer,
    audience: keyRing.audience,
    subject: input.subject,
    pdmUserId: input.pdmUserId,
    companyId: input.companyId,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + maxAgeSeconds,
    authTime: input.authTime,
    sessionId: input.sessionId ?? crypto.randomUUID(),
    sessionVersion: input.sessionVersion,
    assuranceLevel: input.assuranceLevel,
    secondFactor: input.secondFactor ?? null,
    identityProvider: "firebase"
  };
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  return `${signingInput}.${signature(signingInput, keyRing.keys[keyRing.currentKeyId])}`;
}

export function verifyPlatformSessionV2(
  token: string,
  keyRing: PlatformSessionKeyRing,
  policy: VerifyPlatformSessionV2Policy = {}
): PlatformSessionV2Claims {
  assertKeyRing(keyRing);
  const [encodedHeader, encodedClaims, receivedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedClaims || !receivedSignature || extra) throw new Error("SESSION_V2_MALFORMED");

  const header = decodeJson<PlatformSessionHeader>(encodedHeader);
  if (header.algorithm !== "HS256" || header.type !== "PDM-BFF" || header.version !== 2) throw new Error("SESSION_V2_HEADER_INVALID");
  const key = keyRing.keys[header.keyId];
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new Error("SESSION_V2_UNKNOWN_KEY");
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  if (!secureEqual(signature(signingInput, key), receivedSignature)) throw new Error("SESSION_V2_SIGNATURE_INVALID");

  const claims = decodeJson<PlatformSessionV2Claims>(encodedClaims);
  const nowSeconds = policy.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockSkewSeconds = policy.clockSkewSeconds ?? 60;
  if (claims.version !== 2 || claims.identityProvider !== "firebase") throw new Error("SESSION_V2_CLAIMS_INVALID");
  if (claims.secondFactor !== null && claims.secondFactor !== "totp" && claims.secondFactor !== "google_workspace_mfa") {
    throw new Error("SESSION_V2_SECOND_FACTOR_INVALID");
  }
  if (claims.assuranceLevel === "aal2" && !claims.secondFactor) throw new Error("SESSION_V2_AAL2_REQUIRES_RECOGNIZED_MFA");
  if (claims.issuer !== keyRing.issuer) throw new Error("SESSION_V2_ISSUER_INVALID");
  if (claims.audience !== keyRing.audience) throw new Error("SESSION_V2_AUDIENCE_INVALID");
  if (claims.issuedAt > nowSeconds + clockSkewSeconds || claims.authTime > nowSeconds + clockSkewSeconds) throw new Error("SESSION_V2_FUTURE_TIMESTAMP");
  if (claims.expiresAt <= nowSeconds) throw new Error("SESSION_V2_EXPIRED");
  if (claims.expiresAt - claims.issuedAt > PLATFORM_SESSION_V2_MAX_AGE_SECONDS) throw new Error("SESSION_V2_MAX_AGE_EXCEEDED");
  if (policy.providerUserDisabled) throw new Error("SESSION_V2_PROVIDER_DISABLED");
  if (policy.currentSessionVersion !== undefined && claims.sessionVersion !== policy.currentSessionVersion) throw new Error("SESSION_V2_REVOKED_BY_VERSION");
  if (policy.revokedSessionIds?.has(claims.sessionId)) throw new Error("SESSION_V2_REVOKED_SESSION");
  if (policy.requiredAssuranceLevel === "aal2" && (claims.assuranceLevel !== "aal2" || !claims.secondFactor)) {
    throw new Error("SESSION_V2_AAL2_REQUIRED");
  }
  return claims;
}

export class InMemoryPrivilegedReplayGuard {
  private readonly consumed = new Map<string, number>();

  consume(sessionId: string, nonce: string, nowSeconds = Math.floor(Date.now() / 1000), ttlSeconds = 5 * 60) {
    if (!sessionId.trim() || !/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) throw new Error("PRIVILEGED_NONCE_INVALID");
    for (const [key, expiresAt] of this.consumed) {
      if (expiresAt <= nowSeconds) this.consumed.delete(key);
    }
    const key = `${sessionId}:${nonce}`;
    if (this.consumed.has(key)) throw new Error("PRIVILEGED_NONCE_REPLAYED");
    this.consumed.set(key, nowSeconds + ttlSeconds);
  }
}
