import crypto from "node:crypto";
import type {
  PlatformAssuranceLevel,
  PlatformSecondFactor,
  PlatformSessionKeyRing
} from "@/lib/platform-session-v2";
import { JENFU_PLATFORM_AUTH_CONTRACT_VERSION } from "@/lib/jenfu-principal-admission-repository";

export const JENFU_AI_PDM_APP_ID = "ai-pdm" as const;
export const JENFU_PLATFORM_SESSION_V1_MAX_AGE_SECONDS = 8 * 60 * 60;

export type VerifiedJenfuAppSessionV1 = {
  contractVersion: typeof JENFU_PLATFORM_AUTH_CONTRACT_VERSION;
  appId: typeof JENFU_AI_PDM_APP_ID;
  sessionId: string;
  identityIssuer: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  localPrincipalId: string;
  authEpoch: number;
  issuedAt: string;
  expiresAt: string;
  assuranceLevel: PlatformAssuranceLevel;
};

export type JenfuPlatformSessionV1Claims = {
  version: 1;
  contractVersion: typeof JENFU_PLATFORM_AUTH_CONTRACT_VERSION;
  appId: typeof JENFU_AI_PDM_APP_ID;
  tokenIssuer: string;
  tokenAudience: string;
  identityIssuer: string;
  identityAudience: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  localPrincipalId: string;
  companyId: string;
  authEpoch: number;
  accountLifecycleVersion: number;
  issuedAt: number;
  expiresAt: number;
  authTime: number;
  sessionId: string;
  assuranceLevel: PlatformAssuranceLevel;
  secondFactor: PlatformSecondFactor;
  identityProvider: "firebase";
};

type IssueJenfuPlatformSessionV1Input = {
  identityIssuer: string;
  identityAudience: string;
  identitySubject: string;
  principalId: string;
  employeeId: string;
  localPrincipalId: string;
  companyId: string;
  authEpoch: number;
  accountLifecycleVersion: number;
  authTime: number;
  assuranceLevel: PlatformAssuranceLevel;
  secondFactor?: PlatformSecondFactor;
  maxAgeSeconds?: number;
  sessionId?: string;
};

type VerifyJenfuPlatformSessionV1Policy = {
  nowSeconds?: number;
  clockSkewSeconds?: number;
};

type JenfuPlatformSessionHeader = {
  algorithm: "HS256";
  type: "JENFU-AI-PDM";
  version: 1;
  keyId: string;
};

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string): T {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    throw new Error("JENFU_SESSION_MALFORMED");
  }
}

function assertKeyRing(keyRing: PlatformSessionKeyRing) {
  if (!keyRing.issuer.trim() || !keyRing.audience.trim()) throw new Error("JENFU_SESSION_ISSUER_AUDIENCE_REQUIRED");
  const current = keyRing.keys[keyRing.currentKeyId];
  if (!current || Buffer.byteLength(current, "utf8") < 32) throw new Error("JENFU_SESSION_CURRENT_KEY_INVALID");
}

function signature(signingInput: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function validRequiredText(value: unknown, maxLength = 255) {
  return typeof value === "string" && value.length >= 1 && value.length <= maxLength && /\S/u.test(value);
}

function assertClaimsShape(claims: JenfuPlatformSessionV1Claims) {
  if (
    claims.version !== 1 ||
    claims.contractVersion !== JENFU_PLATFORM_AUTH_CONTRACT_VERSION ||
    claims.appId !== JENFU_AI_PDM_APP_ID ||
    claims.identityProvider !== "firebase"
  ) {
    throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  }
  for (const value of [
    claims.identityIssuer,
    claims.identityAudience,
    claims.identitySubject,
    claims.principalId,
    claims.employeeId,
    claims.localPrincipalId,
    claims.companyId
  ]) {
    if (!validRequiredText(value)) throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  }
  if (!validRequiredText(claims.sessionId, 512) || claims.sessionId.length < 16) throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  if (!Number.isSafeInteger(claims.authEpoch) || claims.authEpoch < 0) throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  if (!Number.isSafeInteger(claims.accountLifecycleVersion) || claims.accountLifecycleVersion < 1) {
    throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  }
  if (
    !Number.isSafeInteger(claims.issuedAt) ||
    !Number.isSafeInteger(claims.expiresAt) ||
    !Number.isSafeInteger(claims.authTime) ||
    claims.issuedAt < 1 ||
    claims.expiresAt <= claims.issuedAt ||
    claims.authTime < 1
  ) {
    throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  }
  if (claims.assuranceLevel !== "aal1" && claims.assuranceLevel !== "aal2") throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  if (claims.secondFactor !== null && claims.secondFactor !== "totp" && claims.secondFactor !== "google_workspace_mfa") {
    throw new Error("JENFU_SESSION_CLAIMS_INVALID");
  }
  if (claims.assuranceLevel === "aal2" && !claims.secondFactor) throw new Error("JENFU_SESSION_AAL2_INVALID");
}

export function issueJenfuPlatformSessionV1(
  input: IssueJenfuPlatformSessionV1Input,
  keyRing: PlatformSessionKeyRing,
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  assertKeyRing(keyRing);
  const maxAgeSeconds = input.maxAgeSeconds ?? JENFU_PLATFORM_SESSION_V1_MAX_AGE_SECONDS;
  if (
    !Number.isInteger(maxAgeSeconds) ||
    maxAgeSeconds <= 0 ||
    maxAgeSeconds > JENFU_PLATFORM_SESSION_V1_MAX_AGE_SECONDS
  ) {
    throw new Error("JENFU_SESSION_MAX_AGE_EXCEEDED");
  }
  const header: JenfuPlatformSessionHeader = {
    algorithm: "HS256",
    type: "JENFU-AI-PDM",
    version: 1,
    keyId: keyRing.currentKeyId
  };
  const claims: JenfuPlatformSessionV1Claims = {
    version: 1,
    contractVersion: JENFU_PLATFORM_AUTH_CONTRACT_VERSION,
    appId: JENFU_AI_PDM_APP_ID,
    tokenIssuer: keyRing.issuer,
    tokenAudience: keyRing.audience,
    identityIssuer: input.identityIssuer,
    identityAudience: input.identityAudience,
    identitySubject: input.identitySubject,
    principalId: input.principalId,
    employeeId: input.employeeId,
    localPrincipalId: input.localPrincipalId,
    companyId: input.companyId,
    authEpoch: input.authEpoch,
    accountLifecycleVersion: input.accountLifecycleVersion,
    issuedAt: nowSeconds,
    expiresAt: nowSeconds + maxAgeSeconds,
    authTime: input.authTime,
    sessionId: input.sessionId ?? crypto.randomUUID(),
    assuranceLevel: input.assuranceLevel,
    secondFactor: input.secondFactor ?? null,
    identityProvider: "firebase"
  };
  assertClaimsShape(claims);
  const signingInput = `${encodeJson(header)}.${encodeJson(claims)}`;
  return `${signingInput}.${signature(signingInput, keyRing.keys[keyRing.currentKeyId])}`;
}

export function verifyJenfuPlatformSessionV1(
  token: string,
  keyRing: PlatformSessionKeyRing,
  policy: VerifyJenfuPlatformSessionV1Policy = {}
): JenfuPlatformSessionV1Claims {
  assertKeyRing(keyRing);
  const [encodedHeader, encodedClaims, receivedSignature, extra] = token.split(".");
  if (!encodedHeader || !encodedClaims || !receivedSignature || extra) throw new Error("JENFU_SESSION_MALFORMED");
  const header = decodeJson<JenfuPlatformSessionHeader>(encodedHeader);
  if (header.algorithm !== "HS256" || header.type !== "JENFU-AI-PDM" || header.version !== 1) {
    throw new Error("JENFU_SESSION_HEADER_INVALID");
  }
  const key = keyRing.keys[header.keyId];
  if (!key || Buffer.byteLength(key, "utf8") < 32) throw new Error("JENFU_SESSION_UNKNOWN_KEY");
  const signingInput = `${encodedHeader}.${encodedClaims}`;
  if (!secureEqual(signature(signingInput, key), receivedSignature)) throw new Error("JENFU_SESSION_SIGNATURE_INVALID");

  const claims = decodeJson<JenfuPlatformSessionV1Claims>(encodedClaims);
  assertClaimsShape(claims);
  if (claims.tokenIssuer !== keyRing.issuer || claims.tokenAudience !== keyRing.audience) {
    throw new Error("JENFU_SESSION_ISSUER_AUDIENCE_INVALID");
  }
  const nowSeconds = policy.nowSeconds ?? Math.floor(Date.now() / 1000);
  const clockSkewSeconds = policy.clockSkewSeconds ?? 60;
  if (
    claims.issuedAt > nowSeconds + clockSkewSeconds ||
    claims.authTime > nowSeconds + clockSkewSeconds ||
    claims.expiresAt <= nowSeconds ||
    claims.expiresAt - claims.issuedAt > JENFU_PLATFORM_SESSION_V1_MAX_AGE_SECONDS
  ) {
    throw new Error("JENFU_SESSION_TIME_INVALID");
  }
  return claims;
}

export function toVerifiedJenfuAppSessionV1(claims: JenfuPlatformSessionV1Claims): VerifiedJenfuAppSessionV1 {
  return {
    contractVersion: JENFU_PLATFORM_AUTH_CONTRACT_VERSION,
    appId: JENFU_AI_PDM_APP_ID,
    sessionId: claims.sessionId,
    identityIssuer: claims.identityIssuer,
    identitySubject: claims.identitySubject,
    principalId: claims.principalId,
    employeeId: claims.employeeId,
    localPrincipalId: claims.localPrincipalId,
    authEpoch: claims.authEpoch,
    issuedAt: new Date(claims.issuedAt * 1000).toISOString(),
    expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    assuranceLevel: claims.assuranceLevel
  };
}
