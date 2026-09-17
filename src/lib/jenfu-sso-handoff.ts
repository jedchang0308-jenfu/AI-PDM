import crypto from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { NextResponse } from "next/server";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getUserByIdAsync } from "@/lib/auth-async";
import { serializeAuthUserAsync } from "@/lib/company-context";
import { registerJenfuAccountSessionAsync } from "@/lib/account-session-registry";
import { setJenfuPlatformSessionResponseCookie } from "@/lib/auth-response-cookies";
import { getGoogleWorkspaceMfaTrustPolicy, getJenfuIdentityConfig, getJenfuSsoHandoffConfig } from "@/lib/auth-config";
import { FirebasePlatformPrincipalRepository } from "@/lib/firebase-platform-principal-repository";
import { JenfuPrincipalAdmissionRepository } from "@/lib/jenfu-principal-admission-repository";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { getPlatformSessionKeyRing } from "@/lib/platform-session-key-ring";
import { issueJenfuPlatformSessionV1, verifyJenfuPlatformSessionV1 } from "@/lib/jenfu-platform-session-v1";
import { resolveJenfuAssurance } from "@/lib/jenfu-platform-identity-contract";

const COOKIE = "__Host-jenfu_sso_tx";
const MAX_RETURN_TO = 1024;
const BROKER_TIMEOUT_MS = 10_000;

type Transaction = { state: string; verifier: string; returnTo: string; issuer: string; expiresAt: number };
type Handoff = {
  contractVersion: "jenfu.sso-handoff.v1";
  issuer: string;
  audience: string;
  identity: { identityIssuer: string; identitySubject: string; principalId: string; employeeId: string };
  authorization: { applicationId: "ai-pdm"; assignmentVersion: number };
  authentication: { authenticatedAt: string; email: string; emailVerified: true; signInProvider: string; secondFactor: "totp" | null; assuranceLevel: "aal1" | "aal2" };
  authState: { authEpoch: number; revokedBefore: string | null };
  sourceSessionExpiresAt: string;
  issuedAt: string;
  expiresAt: string;
};

function secret() {
  const ring = getPlatformSessionKeyRing();
  const value = ring.keys[ring.currentKeyId];
  if (!value) throw new Error("SESSION_V2_SECRET_MISSING");
  return value;
}

function mac(value: string) { return crypto.createHmac("sha256", secret()).update("jenfu-sso-transaction-v1\0").update(value).digest("base64url"); }
function encode(value: Transaction) { const payload = Buffer.from(JSON.stringify(value), "utf8").toString("base64url"); return `${payload}.${mac(payload)}`; }
function decode(value: string | undefined): Transaction | null {
  if (!value) return null;
  const split = value.lastIndexOf(".");
  if (split <= 0) return null;
  const payload = value.slice(0, split);
  const expected = Buffer.from(mac(payload));
  const actual = Buffer.from(value.slice(split + 1));
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const result = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Transaction;
    if (!/^[A-Za-z0-9_-]{22,256}$/u.test(result.state) || !/^[A-Za-z0-9_-]{43,128}$/u.test(result.verifier) || result.issuer.length < 1 || !Number.isSafeInteger(result.expiresAt) || result.expiresAt < Date.now() || !result.returnTo.startsWith("/") || result.returnTo.startsWith("//") || result.returnTo.includes("\\") || result.returnTo.length > MAX_RETURN_TO) return null;
    return result;
  } catch { return null; }
}

function cookie(value: string, maxAge: number) { return `${COOKIE}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${process.env.PDM_PUBLIC_BASE_URL?.trim().startsWith("https://") ? "; Secure" : ""}`; }
function clearCookie() { return cookie("", 0); }
function error(code: string, status: number) { return NextResponse.json({ code }, { status, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } }); }

function exactObject(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Object.keys(object).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(object, key));
}

function callbackError(errorValue: unknown) {
  const code = errorValue instanceof Error ? errorValue.message : "";
  if (code === "HANDOFF_INVALID" || code === "HANDOFF_EXPIRED" || code === "BROKER_DENIED") return error("sso_code_invalid", 400);
  if (code === "PRINCIPAL_NOT_ACTIVE") return error("principal_not_active", 403);
  if (code === "STALE_HANDOFF") return error("sso_principal_stale", 403);
  if (code === "HANDOFF_FACTOR_INVALID" || code === "auth_token_invalid") return error("auth_token_invalid", 401);
  return error("sso_dependency_unavailable", 502);
}

const setup = getJenfuSsoHandoffConfig;

async function token(audience: string) {
  const auth = new GoogleAuth();
  const client = await auth.getIdTokenClient(audience);
  return client.idTokenProvider.fetchIdToken(audience);
}

function readCookie(request: Request) {
  const value = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!value) return undefined;
  try { return decodeURIComponent(value); } catch { return undefined; }
}

export function safeJenfuSsoReturnTo(value: string | null | undefined) {
  if (!value) return "/";
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//") && !decoded.startsWith("/login") && !decoded.startsWith("/api/auth/") && !decoded.includes("\\") && !/[\u0000-\u001f\u007f]/u.test(decoded) && decoded.length <= MAX_RETURN_TO) return decoded;
  } catch { /* fixed fallback */ }
  return "/";
}

function parse(value: unknown, expected: ReturnType<typeof setup>): Handoff {
  const handoff = value as Handoff;
  if (!exactObject(handoff, ["contractVersion", "issuer", "audience", "identity", "authorization", "authentication", "authState", "sourceSessionExpiresAt", "issuedAt", "expiresAt"]) || !exactObject(handoff.identity, ["identityIssuer", "identitySubject", "principalId", "employeeId"]) || !exactObject(handoff.authorization, ["applicationId", "assignmentVersion"]) || !exactObject(handoff.authentication, ["authenticatedAt", "email", "emailVerified", "signInProvider", "secondFactor", "assuranceLevel"]) || !exactObject(handoff.authState, ["authEpoch", "revokedBefore"]) || handoff.contractVersion !== "jenfu.sso-handoff.v1" || handoff.issuer !== expected.issuer || handoff.audience !== "ai-pdm" || handoff.authorization?.applicationId !== "ai-pdm" || !handoff.identity?.identityIssuer || !handoff.identity.identitySubject || !handoff.identity.principalId || !handoff.identity.employeeId || !handoff.authentication?.authenticatedAt || !handoff.authentication.email || handoff.authentication.emailVerified !== true || !handoff.authentication.signInProvider || !handoff.sourceSessionExpiresAt || !handoff.expiresAt || !Number.isSafeInteger(handoff.authState?.authEpoch) || !Number.isSafeInteger(handoff.authorization.assignmentVersion) || !["aal1", "aal2"].includes(handoff.authentication.assuranceLevel) || (handoff.authentication.secondFactor !== null && handoff.authentication.secondFactor !== "totp")) throw new Error("HANDOFF_INVALID");
  const authenticatedAt = Date.parse(handoff.authentication.authenticatedAt);
  const sourceExpiresAt = Date.parse(handoff.sourceSessionExpiresAt);
  const expiresAt = Date.parse(handoff.expiresAt);
  if (![authenticatedAt, sourceExpiresAt, expiresAt].every(Number.isFinite) || authenticatedAt > Date.now() + 60_000 || expiresAt <= Date.now() || sourceExpiresAt <= Date.now()) throw new Error("HANDOFF_EXPIRED");
  return handoff;
}

export async function jenfuSsoStart(request: Request) {
  let config;
  try { config = setup(); } catch { return error("sso_request_invalid", 404); }
  if (request.method !== "GET") return error("sso_request_invalid", 405);
  const returnTo = safeJenfuSsoReturnTo(new URL(request.url).searchParams.get("returnTo"));
  const state = crypto.randomBytes(16).toString("base64url");
  const verifier = crypto.randomBytes(32).toString("base64url");
  const authorize = new URL("/api/sso/authorize", config.broker);
  authorize.search = new URLSearchParams({ response_type: "code", client_id: "ai-pdm", redirect_uri: config.callback, state, code_challenge: crypto.createHash("sha256").update(verifier, "ascii").digest("base64url"), code_challenge_method: "S256" }).toString();
  const response = NextResponse.redirect(authorize, 303);
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.cookies.set(COOKIE, encode({ state, verifier, returnTo, issuer: config.issuer, expiresAt: Date.now() + 300_000 }), { httpOnly: true, sameSite: "lax", secure: config.base.startsWith("https://"), path: "/", maxAge: 300 });
  return response;
}

export async function jenfuSsoCallback(request: Request) {
  let config;
  try { config = setup(); } catch { return error("sso_request_invalid", 404); }
  if (request.method !== "GET") return error("sso_request_invalid", 405);
  const params = new URL(request.url).searchParams;
  const tx = decode(readCookie(request));
  const code = params.get("code");
  if (!tx || params.get("state") !== tx.state || params.get("iss") !== tx.issuer || !code || params.getAll("code").length !== 1 || params.getAll("state").length !== 1) return NextResponse.json({ code: "sso_request_invalid" }, { status: 400, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer", "set-cookie": clearCookie() } });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BROKER_TIMEOUT_MS);
    const service = await token(config.broker);
    const brokerResponse = await fetch(`${config.broker}/api/sso/token`, { method: "POST", redirect: "error", signal: controller.signal, headers: { "content-type": "application/x-www-form-urlencoded", "x-jenfu-service-identity": `Bearer ${service}` }, body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: "ai-pdm", redirect_uri: config.callback, code_verifier: tx.verifier }) }).finally(() => clearTimeout(timeout));
    if (!brokerResponse.ok) throw new Error("BROKER_DENIED");
    const handoff = parse(await brokerResponse.json(), config);
    const client = getAsyncDatabaseClient();
    const principal = await new FirebasePlatformPrincipalRepository(client).resolvePrincipal(handoff.identity.identitySubject);
    if (!principal || principal.accountStatus !== "active") throw new Error("PRINCIPAL_NOT_ACTIVE");
    const admitted = await new JenfuPrincipalAdmissionRepository(client).requireActivePrincipal(handoff.identity.identityIssuer, handoff.identity.identitySubject);
    const state = await new JenfuAuthEpochRepository(client).readPrincipalAuthState(handoff.identity.identityIssuer, handoff.identity.identitySubject);
    if (admitted.principalId !== handoff.identity.principalId || admitted.employeeId !== handoff.identity.employeeId || admitted.mappingVersion !== handoff.authorization.assignmentVersion || state.authEpoch !== handoff.authState.authEpoch || (state.revokedBefore && Date.parse(handoff.authentication.authenticatedAt) <= Date.parse(state.revokedBefore))) throw new Error("STALE_HANDOFF");
    const assurance = resolveJenfuAssurance({ email: handoff.authentication.email, signInProvider: handoff.authentication.signInProvider, secondFactor: handoff.authentication.secondFactor, requirePrivilegedAssurance: principal.requiresPrivilegedAssurance === true, workspaceMfaTrustPolicy: getGoogleWorkspaceMfaTrustPolicy() });
    const user = await getUserByIdAsync(principal.pdmUserId);
    if (!user) throw new Error("PRINCIPAL_NOT_ACTIVE");
    const now = Math.floor(Date.now() / 1000);
    const maxExpiry = Math.min(now + 8 * 60 * 60, Math.floor(Date.parse(handoff.sourceSessionExpiresAt) / 1000), Math.floor(Date.parse(handoff.expiresAt) / 1000));
    if (!Number.isSafeInteger(maxExpiry) || maxExpiry <= now) throw new Error("HANDOFF_EXPIRED");
    const sessionToken = issueJenfuPlatformSessionV1({ identityIssuer: handoff.identity.identityIssuer, identityAudience: getJenfuIdentityConfig().identityAudience, identitySubject: handoff.identity.identitySubject, principalId: handoff.identity.principalId, employeeId: handoff.identity.employeeId, localPrincipalId: principal.pdmUserId, companyId: principal.companyId, authEpoch: handoff.authState.authEpoch, accountLifecycleVersion: principal.sessionVersion, authTime: Math.floor(Date.parse(handoff.authentication.authenticatedAt) / 1000), assuranceLevel: assurance.assuranceLevel, secondFactor: assurance.secondFactor, maxAgeSeconds: maxExpiry - now }, getPlatformSessionKeyRing(), now);
    const claims = verifyJenfuPlatformSessionV1(sessionToken, getPlatformSessionKeyRing(), { nowSeconds: now });
    await registerJenfuAccountSessionAsync({ request, claims });
    const response = NextResponse.redirect(new URL(tx.returnTo, config.base), 303);
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    response.cookies.set(COOKIE, "", { httpOnly: true, sameSite: "lax", secure: config.base.startsWith("https://"), path: "/", maxAge: 0 });
    setJenfuPlatformSessionResponseCookie(response, sessionToken);
    return response;
  } catch (errorValue) {
    const response = callbackError(errorValue);
    response.headers.set("set-cookie", clearCookie());
    return response;
  }
}
