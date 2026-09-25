export type JenfuPrincipalHandoff = {
  contractVersion: "jenfu.sso-handoff.v2";
  issuer: string;
  audience: "ai-pdm";
  identity: {
    identityIssuer: string;
    identitySubject: string;
    principalId: string;
    employeeId: string;
  };
  authentication: {
    authenticatedAt: string;
    email: string;
    emailVerified: true;
    signInProvider: string;
    secondFactor: "totp" | null;
    assuranceLevel: "aal1" | "aal2";
  };
  authState: { authEpoch: number; revokedBefore: string | null };
  sourceSessionExpiresAt: string;
  issuedAt: string;
  expiresAt: string;
};

function exactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function boundedText(value: unknown, length: number) {
  return typeof value === "string" && value.length > 0 && value.length <= length &&
    value.trim() === value && /\S/u.test(value);
}

function instant(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(value)) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value ? parsed : NaN;
}

export function parseJenfuPrincipalHandoff(
  value: unknown,
  expectedIssuer: string,
  nowMs = Date.now()
): JenfuPrincipalHandoff {
  const fail = (): never => { throw new Error("HANDOFF_INVALID"); };
  if (!exactObject(value, ["contractVersion", "issuer", "audience", "identity",
    "authentication", "authState", "sourceSessionExpiresAt", "issuedAt", "expiresAt"]) ||
    value.contractVersion !== "jenfu.sso-handoff.v2" || value.issuer !== expectedIssuer ||
    value.audience !== "ai-pdm" ||
    !exactObject(value.identity, ["identityIssuer", "identitySubject", "principalId", "employeeId"]) ||
    !exactObject(value.authentication, ["authenticatedAt", "email", "emailVerified",
      "signInProvider", "secondFactor", "assuranceLevel"]) ||
    !exactObject(value.authState, ["authEpoch", "revokedBefore"])) fail();
  const proof = value as JenfuPrincipalHandoff;
  if (!boundedText(proof.identity.identityIssuer, 2048) ||
    !boundedText(proof.identity.identitySubject, 255) ||
    !boundedText(proof.identity.principalId, 255) ||
    !boundedText(proof.identity.employeeId, 255) ||
    !boundedText(proof.authentication.email, 320) ||
    !proof.authentication.email.includes("@") ||
    proof.authentication.emailVerified !== true ||
    !boundedText(proof.authentication.signInProvider, 128) ||
    !["aal1", "aal2"].includes(proof.authentication.assuranceLevel) ||
    (proof.authentication.secondFactor !== null && proof.authentication.secondFactor !== "totp") ||
    !Number.isSafeInteger(proof.authState.authEpoch) || proof.authState.authEpoch < 0 ||
    !Number.isSafeInteger(nowMs)) fail();
  const authenticatedAt = instant(proof.authentication.authenticatedAt);
  const issuedAt = instant(proof.issuedAt);
  const expiresAt = instant(proof.expiresAt);
  const sourceExpiresAt = instant(proof.sourceSessionExpiresAt);
  const revokedBefore = proof.authState.revokedBefore === null ? null : instant(proof.authState.revokedBefore);
  if (![authenticatedAt, issuedAt, expiresAt, sourceExpiresAt].every(Number.isFinite) ||
    (revokedBefore !== null && !Number.isFinite(revokedBefore)) ||
    authenticatedAt > issuedAt || issuedAt > nowMs + 60_000 ||
    expiresAt <= nowMs || expiresAt <= issuedAt ||
    expiresAt > issuedAt + 60_000 || expiresAt > sourceExpiresAt ||
    sourceExpiresAt <= nowMs) throw new Error("HANDOFF_EXPIRED");
  return proof;
}
