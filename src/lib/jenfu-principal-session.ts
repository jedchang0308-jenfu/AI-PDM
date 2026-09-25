import crypto from "node:crypto";
import type { PlatformAssuranceLevel, PlatformSecondFactor, PlatformSessionKeyRing } from "@/lib/platform-session-v2";

export const JENFU_PRINCIPAL_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION = "jenfu.ai-pdm-session.v2" as const;

export type JenfuPrincipalSessionClaims = {
  version: 2;
  contractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION;
  appId: "ai-pdm";
  tokenIssuer: string;
  tokenAudience: string;
  sessionId: string;
  principalId: string;
  employeeId: string;
  identityIssuer: string;
  identitySubject: string;
  epochKind: "principal";
  authEpoch: number;
  accountLifecycleVersion: number;
  profileVersion: number;
  companyId: string;
  issuedAt: number;
  expiresAt: number;
  authenticatedAt: number;
  assuranceLevel: PlatformAssuranceLevel;
  secondFactor: PlatformSecondFactor;
  assurancePolicyHash: string;
};

export type IssueJenfuPrincipalSessionInput = Omit<JenfuPrincipalSessionClaims,
  "version" | "contractVersion" | "appId" | "tokenIssuer" | "tokenAudience" |
  "epochKind" | "issuedAt" | "expiresAt" | "sessionId"> & {
    sessionId?: string;
    maxAgeSeconds?: number;
  };

type PrincipalSessionHeader = {
  algorithm: "HS256";
  type: "JENFU-AI-PDM-PRINCIPAL";
  version: 2;
  keyId: string;
};

const HEADER_KEYS = ["algorithm", "type", "version", "keyId"];
const CLAIM_KEYS = [
  "version", "contractVersion", "appId", "tokenIssuer", "tokenAudience", "sessionId",
  "principalId", "employeeId", "identityIssuer", "identitySubject", "epochKind", "authEpoch",
  "accountLifecycleVersion", "profileVersion", "companyId", "issuedAt", "expiresAt",
  "authenticatedAt", "assuranceLevel", "secondFactor", "assurancePolicyHash"
];

function exactObject(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function requiredText(value: unknown, maxLength = 255) {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength && value.trim() === value && /\S/u.test(value);
}

function encode(value: unknown) { return Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); }
function decode(value: string): unknown {
  try { return JSON.parse(Buffer.from(value, "base64url").toString("utf8")); }
  catch { throw new Error("JENFU_PRINCIPAL_SESSION_MALFORMED"); }
}
function sign(value: string, key: string) { return crypto.createHmac("sha256", key).update(value).digest("base64url"); }
function equal(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function currentKey(ring: PlatformSessionKeyRing) {
  if (!requiredText(ring.issuer) || !requiredText(ring.audience) || !requiredText(ring.currentKeyId)) {
    throw new Error("JENFU_PRINCIPAL_SESSION_KEY_INVALID");
  }
  const key = ring.keys[ring.currentKeyId];
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new Error("JENFU_PRINCIPAL_SESSION_KEY_INVALID");
  return key;
}

function assertClaims(value: unknown): asserts value is JenfuPrincipalSessionClaims {
  if (!exactObject(value, CLAIM_KEYS)) throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  const claims = value as JenfuPrincipalSessionClaims;
  if (claims.version !== 2 || claims.contractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    claims.appId !== "ai-pdm" || claims.epochKind !== "principal") throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  for (const value of [claims.tokenIssuer, claims.tokenAudience, claims.principalId, claims.employeeId,
    claims.identityIssuer, claims.identitySubject, claims.companyId]) {
    if (!requiredText(value)) throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  }
  if (!requiredText(claims.sessionId, 512) || claims.sessionId.length < 16 ||
    !/^[0-9a-f]{64}$/u.test(claims.assurancePolicyHash)) throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  for (const value of [claims.authEpoch, claims.accountLifecycleVersion, claims.profileVersion,
    claims.issuedAt, claims.expiresAt, claims.authenticatedAt]) {
    if (!Number.isSafeInteger(value)) throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  }
  if (claims.authEpoch < 0 || claims.accountLifecycleVersion < 1 || claims.profileVersion < 1 ||
    claims.issuedAt < 1 || claims.authenticatedAt < 1 || claims.expiresAt <= claims.issuedAt ||
    claims.expiresAt - claims.issuedAt > JENFU_PRINCIPAL_SESSION_MAX_AGE_SECONDS ||
    !["aal1", "aal2"].includes(claims.assuranceLevel) ||
    (claims.secondFactor !== null && claims.secondFactor !== "totp" && claims.secondFactor !== "google_workspace_mfa") ||
    (claims.assuranceLevel === "aal2" && claims.secondFactor === null)) {
    throw new Error("JENFU_PRINCIPAL_SESSION_CLAIMS_INVALID");
  }
}

export function issueJenfuPrincipalSession(
  input: IssueJenfuPrincipalSessionInput,
  ring: PlatformSessionKeyRing,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  const key = currentKey(ring);
  const maxAgeSeconds = input.maxAgeSeconds ?? JENFU_PRINCIPAL_SESSION_MAX_AGE_SECONDS;
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 1 || !Number.isSafeInteger(maxAgeSeconds) ||
    maxAgeSeconds < 1 || maxAgeSeconds > JENFU_PRINCIPAL_SESSION_MAX_AGE_SECONDS) {
    throw new Error("JENFU_PRINCIPAL_SESSION_TIME_INVALID");
  }
  const header: PrincipalSessionHeader = {
    algorithm: "HS256", type: "JENFU-AI-PDM-PRINCIPAL", version: 2, keyId: ring.currentKeyId
  };
  const claims: JenfuPrincipalSessionClaims = {
    version: 2, contractVersion: JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION, appId: "ai-pdm",
    tokenIssuer: ring.issuer, tokenAudience: ring.audience, sessionId: input.sessionId ?? crypto.randomUUID(),
    principalId: input.principalId, employeeId: input.employeeId, identityIssuer: input.identityIssuer,
    identitySubject: input.identitySubject, epochKind: "principal", authEpoch: input.authEpoch,
    accountLifecycleVersion: input.accountLifecycleVersion, profileVersion: input.profileVersion,
    companyId: input.companyId, issuedAt: nowSeconds, expiresAt: nowSeconds + maxAgeSeconds,
    authenticatedAt: input.authenticatedAt, assuranceLevel: input.assuranceLevel,
    secondFactor: input.secondFactor, assurancePolicyHash: input.assurancePolicyHash
  };
  assertClaims(claims);
  const message = `${encode(header)}.${encode(claims)}`;
  return `${message}.${sign(message, key)}`;
}

export function verifyJenfuPrincipalSession(
  token: string,
  ring: PlatformSessionKeyRing,
  policy: { nowSeconds?: number; clockSkewSeconds?: number } = {}
): JenfuPrincipalSessionClaims {
  currentKey(ring);
  const [encodedHeader, encodedClaims, receivedMac, extra] = token.split(".");
  if (!encodedHeader || !encodedClaims || !receivedMac || extra) throw new Error("JENFU_PRINCIPAL_SESSION_MALFORMED");
  const header = decode(encodedHeader);
  if (!exactObject(header, HEADER_KEYS)) throw new Error("JENFU_PRINCIPAL_SESSION_HEADER_INVALID");
  const parsedHeader = header as PrincipalSessionHeader;
  if (parsedHeader.algorithm !== "HS256" || parsedHeader.type !== "JENFU-AI-PDM-PRINCIPAL" ||
    parsedHeader.version !== 2 || !requiredText(parsedHeader.keyId)) throw new Error("JENFU_PRINCIPAL_SESSION_HEADER_INVALID");
  const key = ring.keys[parsedHeader.keyId];
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new Error("JENFU_PRINCIPAL_SESSION_KEY_INVALID");
  const message = `${encodedHeader}.${encodedClaims}`;
  if (!equal(sign(message, key), receivedMac)) throw new Error("JENFU_PRINCIPAL_SESSION_SIGNATURE_INVALID");
  const claims = decode(encodedClaims);
  assertClaims(claims);
  if (claims.tokenIssuer !== ring.issuer || claims.tokenAudience !== ring.audience) {
    throw new Error("JENFU_PRINCIPAL_SESSION_ISSUER_AUDIENCE_INVALID");
  }
  const now = policy.nowSeconds ?? Math.floor(Date.now() / 1000);
  const skew = policy.clockSkewSeconds ?? 60;
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(skew) || skew < 0 || skew > 300 ||
    claims.issuedAt > now + skew || claims.authenticatedAt > now + skew || claims.expiresAt <= now) {
    throw new Error("JENFU_PRINCIPAL_SESSION_TIME_INVALID");
  }
  return claims;
}
