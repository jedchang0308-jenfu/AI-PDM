import { createHash, createHmac } from "node:crypto";
import type { AsyncDatabaseClient, AsyncDatabaseTransactionOptions } from "@/lib/db-async-provider";
import type { PrincipalRequestInput, VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession, type JenfuPrincipalSessionClaims } from "@/lib/jenfu-principal-session";
import { JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import { JenfuPrincipalAccountRepository } from "@/lib/jenfu-principal-account-repository";
import { getLocalSandboxPrincipalRuntime, isLocalPrincipalSandboxRequested } from "@/lib/local-sandbox-principal-runtime";
import { LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY } from "@/lib/local-sandbox-principal-session";
import type { PlatformSessionKeyRing } from "@/lib/platform-session-v2";
import { assertLocalSandboxRequest, isLoopbackHost, readLocalJsonBody, LocalSandboxError } from "../../contracts/local-principal-sandbox/v1/protocol.mjs";

/** This subject belongs only to a verified disposable PDM development target. */
export const LOCAL_TEST_ADMIN_IDENTITY = Object.freeze({
  principalId: "pdm-local-test-admin", employeeId: "pdm-local-test-employee",
  pdmUserId: "pdm-local-test-admin-user", companyId: "company-jenfu",
  identityIssuer: "urn:ai-pdm:local-test-admin", identitySubject: "pdm-local-test-admin",
});
const ASSURANCE_HASH = createHash("sha256").update("ai-pdm.local-test-admin.synthetic-aal1.v1").digest("hex");
// An enumerable private Symbol deliberately survives server-side object spread.
// The opaque proof reference, never any public identity field, carries authority.
const INPUT_PROOF = Symbol("ai-pdm.local-test-admin.request-proof");
const inputContexts = new WeakMap<object, { request: Request; token: string; database: AsyncDatabaseClient }>();
type VerificationScope = { snapshot: AsyncDatabaseClient; active: boolean };
const verifiedScopes = new WeakMap<object, VerificationScope>();
function fail(): never { throw new JenfuPrincipalRequestError("auth_session_invalid"); }

export function isLocalTestAdminRequested(environment: Record<string, string | undefined> = process.env): boolean {
  if (environment.PDM_LOCAL_TEST_ADMIN !== "1") return false;
  if (environment.NODE_ENV !== "development" || environment.K_SERVICE || environment.K_REVISION ||
    environment.FUNCTION_TARGET || environment.FUNCTION_NAME || environment.FIREBASE_CONFIG ||
    !isLocalPrincipalSandboxRequested(environment)) {
    throw new Error("LOCAL_TEST_ADMIN_DEVELOPMENT_SANDBOX_REQUIRED");
  }
  return true;
}

export function isLocalTestAdminAvailable(request: Request): boolean {
  try { return isLocalTestAdminRequested() && isLoopbackHost(new URL(request.url).hostname); }
  catch { return false; }
}

function cookieName(sandboxId = process.env.JENFU_LOCAL_SANDBOX_ID ?? "") {
  if (!/^[a-z][a-z0-9-]{2,63}$/u.test(sandboxId)) fail();
  return `pdm_local_test_admin_${sandboxId}`;
}

export function readLocalTestAdminCookie(request: Request): string | null {
  if (!isLocalTestAdminAvailable(request)) return null;
  const name = cookieName();
  const values = (request.headers.get("cookie") ?? "").split(";").map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  if (values.length !== 1) return null;
  try {
    const token = decodeURIComponent(values[0].slice(name.length + 1));
    return token.length <= 8192 && token.split(".").length === 3 ? token : null;
  } catch { return null; }
}

export async function getLocalTestAdminRuntime(request: Request, options: { browserMutation?: boolean } = {}) {
  if (!isLocalTestAdminAvailable(request)) fail();
  // This loader verifies profile/fixture, OS listener, actual DB role and isolated target.
  // Its Platform ports are never invoked in this authentication lane.
  const runtime = await getLocalSandboxPrincipalRuntime();
  assertLocalSandboxRequest(request, runtime.config, {
    browserMutation: options.browserMutation ?? !["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase()),
    listenAddress: runtime.listenAddress,
  });
  const guard = await runtime.database.queryOne<{ target_valid: boolean }>(`
    SELECT (current_database()=:databaseName AND current_user=:runtimeRole
      AND COALESCE(host(inet_server_addr()),'') IN ('127.0.0.1','::1')
      AND pg_catalog.shobj_description((SELECT oid FROM pg_catalog.pg_database
        WHERE datname=current_database()),'pg_database')=:marker
      AND EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=current_user
        AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls)
      AND NOT pg_catalog.pg_has_role(current_user,'jenfu_ai_pdm_migrator','MEMBER')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datname=current_database()
        AND datdba=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user))
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname IN ('ai_pdm_core','ai_pdm_contract')
        AND nspowner=(SELECT oid FROM pg_catalog.pg_roles WHERE rolname=current_user))) AS target_valid`, {
    databaseName: runtime.target.databaseName, runtimeRole: runtime.config.runtimeRole,
    marker: `jenfu.local-principal-bootstrap.v1:${runtime.config.sandboxId}:${runtime.target.generation}`,
  });
  if (guard?.target_valid !== true) throw new JenfuPrincipalRequestError("principal_dependency_unavailable");
  const binding = JSON.stringify({ version: 1, sandboxId: runtime.config.sandboxId,
    generation: runtime.target.generation, fixtureHash: runtime.target.fixtureHash,
    targetFingerprint: runtime.target.targetFingerprint });
  const bindingHash = createHash("sha256").update(binding).digest("hex");
  const key = createHmac("sha256", runtime.profile.principalSessionKey.secret)
    .update(`ai-pdm.local-test-admin.key.v1\n${binding}`).digest("base64url");
  const keyRing: PlatformSessionKeyRing = Object.freeze({
    issuer: `ai-pdm-local-test-admin:${bindingHash}`, audience: "ai-pdm-local-test-admin",
    currentKeyId: "pdm-local-test-admin-v1", keys: Object.freeze({ "pdm-local-test-admin-v1": key }),
  });
  return { ...runtime, keyRing };
}

function targetParameters(runtime: Awaited<ReturnType<typeof getLocalTestAdminRuntime>>) {
  return { sandboxId: runtime.config.sandboxId, generation: runtime.target.generation,
    fixtureHash: runtime.target.fixtureHash, targetFingerprint: runtime.target.targetFingerprint };
}

function fixedClaims(claims: JenfuPrincipalSessionClaims) {
  const identity = LOCAL_TEST_ADMIN_IDENTITY;
  if (claims.principalId !== identity.principalId || claims.employeeId !== identity.employeeId ||
    claims.identityIssuer !== identity.identityIssuer || claims.identitySubject !== identity.identitySubject ||
    claims.companyId !== identity.companyId || claims.authEpoch !== 0 ||
    claims.assuranceLevel !== "aal1" || claims.secondFactor !== null ||
    claims.assurancePolicyHash !== ASSURANCE_HASH) fail();
}

async function requireAccount(snapshot: AsyncDatabaseClient) {
  const identity = LOCAL_TEST_ADMIN_IDENTITY;
  const account = await new JenfuPrincipalAccountRepository(snapshot).requireActive(identity.principalId);
  if (account.pdmUserId !== identity.pdmUserId || account.employeeId !== identity.employeeId ||
    account.companyId !== identity.companyId || account.accountType !== "human_personal") fail();
  const profile = await snapshot.queryOne<{ id: string; company_id: string; account_status: string; role: string; system_role_enabled: number }>(
    "SELECT id,company_id,account_status,role,system_role_enabled FROM ai_pdm_core.users WHERE id=:pdmUserId", identity);
  if (!profile || profile.id !== identity.pdmUserId || profile.company_id !== identity.companyId ||
    profile.account_status !== "active" || profile.role !== "Admin" || profile.system_role_enabled !== 1) fail();
  return account;
}

function sessionCookie(token: string, sandboxId: string, secure: boolean, maxAge = 3600) {
  return `${cookieName(sandboxId)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export async function issueLocalTestAdminSession(request: Request) {
  if (request.method !== "POST") fail();
  const runtime = await getLocalTestAdminRuntime(request, { browserMutation: true });
  const { value: body } = await readLocalJsonBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 0) {
    throw new LocalSandboxError("local_test_admin_request_invalid", 400);
  }
  const issued = await runtime.database.transaction(async snapshot => {
    await snapshot.query("SELECT ai_pdm_core.ensure_local_test_admin_v1(:sandboxId,:generation::uuid,:fixtureHash,:targetFingerprint)", targetParameters(runtime));
    const account = await requireAccount(snapshot);
    const now = Math.floor(Date.now() / 1000);
    if (account.sessionInvalidBefore && now * 1000 <= Date.parse(account.sessionInvalidBefore)) fail();
    const token = issueJenfuPrincipalSession({ ...LOCAL_TEST_ADMIN_IDENTITY,
      authEpoch: 0, accountLifecycleVersion: account.lifecycleVersion, profileVersion: account.profileVersion,
      authenticatedAt: now, assuranceLevel: "aal1", secondFactor: null, assurancePolicyHash: ASSURANCE_HASH,
      maxAgeSeconds: 3600,
    }, runtime.keyRing, now);
    const claims = verifyJenfuPrincipalSession(token, runtime.keyRing, { nowSeconds: now });
    await new JenfuPrincipalSessionRegistry(snapshot).register(claims);
    if (!await new JenfuPrincipalSessionRegistry(snapshot).isActive(claims, now * 1000)) fail();
    return { token, claims };
  }, { isolationLevel: "serializable" });
  return { ...issued, cookie: sessionCookie(issued.token, runtime.config.sandboxId, new URL(runtime.config.origin).protocol === "https:") };
}

export async function resolveLocalTestAdminRequestInput(token: string, request: Request): Promise<PrincipalRequestInput> {
  const runtime = await getLocalTestAdminRuntime(request);
  if (readLocalTestAdminCookie(request) !== token) fail();
  const claims = verifyJenfuPrincipalSession(token, runtime.keyRing);
  fixedClaims(claims);
  const proof = Object.freeze({});
  const input: PrincipalRequestInput = Object.freeze({ token, keyRing: runtime.keyRing,
    identityIssuer: LOCAL_TEST_ADMIN_IDENTITY.identityIssuer,
    trustPolicy: LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY, database: runtime.database,
    [INPUT_PROOF]: proof });
  inputContexts.set(proof, { request, token, database: runtime.database });
  return input;
}

function inputContext(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const proof: unknown = Object.getOwnPropertyDescriptor(input, INPUT_PROOF)?.value;
  return proof && typeof proof === "object" ? inputContexts.get(proof) : undefined;
}

export function isLocalTestAdminRequestInput(input: unknown): boolean {
  return Boolean(inputContext(input));
}

export function isVerifiedLocalTestAdmin(value: unknown, snapshot?: AsyncDatabaseClient): boolean {
  if (!value || typeof value !== "object") return false;
  const scope = verifiedScopes.get(value);
  return Boolean(scope?.active && (!snapshot || scope.snapshot === snapshot));
}

/** Preserve provenance when a verified request is converted to an authorization actor. */
export function bindLocalTestAdminActor<T extends object>(verified: VerifiedPrincipalRequest, actor: T, snapshot?: AsyncDatabaseClient): T {
  const scope = verifiedScopes.get(verified);
  if (!scope?.active || (snapshot && scope.snapshot !== snapshot)) fail();
  const candidate = actor as Record<string, unknown>;
  const identity = LOCAL_TEST_ADMIN_IDENTITY;
  if (candidate.principalId !== identity.principalId || candidate.employeeId !== identity.employeeId ||
    candidate.identityIssuer !== identity.identityIssuer || candidate.identitySubject !== identity.identitySubject ||
    candidate.localPrincipalId !== identity.pdmUserId || candidate.companyId !== identity.companyId) fail();
  Object.freeze(actor);
  verifiedScopes.set(actor, scope);
  return actor;
}

export async function withVerifiedLocalTestAdminRequest<TResult>(input: PrincipalRequestInput,
  evaluate: (snapshot: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) => Promise<TResult>,
  options: AsyncDatabaseTransactionOptions = {}): Promise<TResult> {
  const context = inputContext(input);
  if (!context) fail();
  // Re-read actual target immediately before admission; cached input cannot survive reset.
  const runtime = await getLocalTestAdminRuntime(context.request);
  if (input.token !== context.token || input.database !== context.database ||
    readLocalTestAdminCookie(context.request) !== input.token || input.database !== runtime.database ||
    input.keyRing.issuer !== runtime.keyRing.issuer) fail();
  const claims = verifyJenfuPrincipalSession(input.token, runtime.keyRing);
  fixedClaims(claims);
  return runtime.database.transaction(async snapshot => {
    const target = await snapshot.queryOne<{ generation: string; fixture_hash: string; target_fingerprint: string; status: string }>(
      "SELECT generation::text,fixture_hash,target_fingerprint,status FROM ai_pdm_core.local_sandbox_target_metadata WHERE application_id='ai-pdm' AND sandbox_id=:sandboxId" +
        (options.readOnly === false ? " FOR SHARE" : ""), targetParameters(runtime));
    if (!target || target.status !== "ready" || target.generation !== runtime.target.generation ||
      target.fixture_hash !== runtime.target.fixtureHash || target.target_fingerprint !== runtime.target.targetFingerprint) fail();
    const account = await requireAccount(snapshot);
    if (account.lifecycleVersion !== claims.accountLifecycleVersion || account.profileVersion !== claims.profileVersion ||
      (account.sessionInvalidBefore && claims.issuedAt * 1000 <= Date.parse(account.sessionInvalidBefore)) ||
      !await new JenfuPrincipalSessionRegistry(snapshot).isActive(claims)) fail();
    const verified: VerifiedPrincipalRequest = Object.freeze({
      profile: Object.freeze({ pdmUserId: account.pdmUserId, companyId: account.companyId }),
      session: Object.freeze({ contractVersion: claims.contractVersion, appId: claims.appId,
        sessionId: claims.sessionId, identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject,
        principalId: claims.principalId, employeeId: claims.employeeId, authEpoch: claims.authEpoch,
        profileVersion: claims.profileVersion, accountLifecycleVersion: claims.accountLifecycleVersion,
        authenticatedAt: new Date(claims.authenticatedAt * 1000).toISOString(),
        issuedAt: new Date(claims.issuedAt * 1000).toISOString(), expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
        assuranceLevel: claims.assuranceLevel }),
    });
    const scope: VerificationScope = { snapshot, active: true };
    verifiedScopes.set(verified, scope);
    verifiedScopes.set(verified.session, scope);
    try { return await evaluate(snapshot, verified); }
    finally { scope.active = false; }
  }, { isolationLevel: options.isolationLevel ?? "repeatable_read", readOnly: options.readOnly !== false });
}

export async function logoutLocalTestAdmin(request: Request): Promise<Response> {
  if (request.method !== "POST") fail();
  const runtime = await getLocalTestAdminRuntime(request, { browserMutation: true });
  const token = readLocalTestAdminCookie(request);
  if (token) {
    const claims = verifyJenfuPrincipalSession(token, runtime.keyRing);
    fixedClaims(claims);
    await new JenfuPrincipalSessionRegistry(runtime.database).revoke(claims, "local_test_admin_logout");
    if (await new JenfuPrincipalSessionRegistry(runtime.database).isActive(claims)) fail();
  }
  return Response.json({ authenticated: false }, { headers: { "cache-control": "no-store",
    "set-cookie": sessionCookie("", runtime.config.sandboxId, new URL(runtime.config.origin).protocol === "https:", 0) } });
}
