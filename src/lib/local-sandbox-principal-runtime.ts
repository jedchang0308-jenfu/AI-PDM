import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import {
  assertFixtureEnvelope,
  canonicalJson,
  constantEquals,
  contractDigest,
  isLoopbackHost,
  LocalSandboxError,
  readLocalSandboxConfig,
  type LocalFixture,
  type LocalSandboxConfig,
} from "../../contracts/local-principal-sandbox/v1/protocol.mjs";
import { createLocalSandboxClient, type LocalSandboxClient } from "../../contracts/local-principal-sandbox/v1/client.mjs";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { hashJenfuPrincipalSessionId, JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import type { PlatformSessionKeyRing } from "@/lib/platform-session-v2";
import { createLocalListenerVerifier } from "./auth/local-sandbox-listener.mjs";
import { validateLocalSandboxResetTarget } from "./local-sandbox-reset-target.mjs";
import { JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION } from "@/lib/jenfu-principal-session";
import {
  LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY,
  type LocalSandboxNativeTargetReadback,
  type LocalSandboxCatalogBinding,
  type LocalSandboxPrincipalBindingPort,
  type LocalSandboxPrincipalSessionBinding,
  type LocalSandboxPrincipalSessionPorts,
} from "@/lib/local-sandbox-principal-session";

const PROFILE_VERSION = "ai-pdm.local-runtime.v1";
const PROFILE_MAX_BYTES = 64 * 1024;
const FIXTURE_MAX_BYTES = 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/u;
const SANDBOX_ID = /^[a-z][a-z0-9-]{2,63}$/u;
const LOCAL_COOKIE_PREFIX = "pdm_local_principal_";
const STATE_COOKIE = "pdm_local_principal_pkce";
const STATE_TTL_SECONDS = 5 * 60;
const LOCAL_SESSION_ISSUER = "ai-pdm-local-principal-sandbox";
const LOCAL_SESSION_AUDIENCE = "ai-pdm";
const verifyLocalListener = createLocalListenerVerifier();

type LocalCatalogBinding = LocalSandboxCatalogBinding;

type LocalRuntimeProfile = Readonly<{
  profileVersion: typeof PROFILE_VERSION;
  applicationId: "ai-pdm";
  sandboxId: string;
  origin: string;
  platformOrigin: string;
  bindHost: string;
  databaseUrl: string;
  runtimeRole: string;
  sandboxRoot: string;
  dataDirectory: string;
  repositoryDirectory: string;
  fixture: Readonly<{ version: string; hash: string; path: string }>;
  nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION;
  platformClient: Readonly<{ clientId: "ai-pdm"; key: string }>;
  principalSessionKey: Readonly<{ keyId: string; secret: string }>;
  catalogBindings: readonly LocalCatalogBinding[];
  allowSyntheticAal2?: true;
  assurancePolicyHash?: string;
}>;

export type LocalSandboxPrincipalRuntime = Readonly<{
  config: LocalSandboxConfig;
  profile: LocalRuntimeProfile;
  fixture: LocalFixture;
  target: LocalSandboxNativeTargetReadback;
  database: AsyncDatabaseClient;
  keyRing: PlatformSessionKeyRing;
  client: LocalSandboxClient;
  ports: LocalSandboxPrincipalSessionPorts;
  listenAddress: string;
  expected: Readonly<{
    applicationId: "ai-pdm";
    sandboxId: string;
    generation: string;
    fixtureVersion: string;
    fixtureHash: string;
    nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION;
    targetFingerprint: string;
    catalogBindings: readonly LocalSandboxCatalogBinding[];
    allowSyntheticAal2?: true;
    assurancePolicyHash?: string;
  }>;
}>;

function fail(code: string): never { throw new Error(code); }

function exactKeys(value: unknown, keys: readonly string[]) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key)));
}

function isBase64urlKey(value: unknown) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43,128}$/u.test(value)) return false;
  const decoded = Buffer.from(value, "base64url");
  return decoded.byteLength >= 32 && decoded.toString("base64url") === value;
}

function localLaneEnabled(environment: Record<string, string | undefined>) {
  const requested = environment.PDM_LOCAL_PRINCIPAL_SANDBOX;
  if (requested === undefined || requested === "") return false;
  if (requested !== "1") fail("LOCAL_SANDBOX_PROFILE_INVALID");
  if (environment.NODE_ENV !== "development" || environment.PDM_AUTH_MODE !== "firebase_bff" ||
    environment.PDM_JENFU_PLATFORM_AUTH_MODE !== "on" || environment.PDM_JENFU_ENTITLEMENT_MODE !== "enforce" ||
    environment.K_SERVICE || environment.K_REVISION ||
    environment.FUNCTION_TARGET || environment.FUNCTION_NAME || environment.FIREBASE_CONFIG) {
    fail("LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN");
  }
  const formalIdentityKeys = ["JENFU_FIREBASE_PROJECT_ID", "JENFU_IDENTITY_ISSUER", "JENFU_IDENTITY_AUDIENCE",
    "PDM_FIREBASE_PROJECT_ID", "PDM_FIREBASE_API_KEY", "PDM_FIREBASE_AUTH_DOMAIN", "PDM_FIREBASE_APP_ID",
    "PDM_JENFU_SSO_BROKER_ORIGIN"];
  if (formalIdentityKeys.some((key) => String(environment[key] ?? "").trim()) ||
    !["", "off"].includes(String(environment.PDM_JENFU_SSO_HANDOFF_MODE ?? "").trim().toLowerCase())) {
    fail("LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN");
  }
  return true;
}

export function isLocalPrincipalSandboxRequested(environment: Record<string, string | undefined> = process.env) {
  return localLaneEnabled(environment);
}

function samePath(left: string, right: string) {
  const a = path.resolve(left), b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function within(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function absoluteDirectory(value: unknown) {
  if (typeof value !== "string" || !value || value !== value.trim() || value.includes("\0") || !path.isAbsolute(value) ||
    value.replaceAll("\\", "/").split("/").includes("..")) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  return path.resolve(value);
}

async function readRegularFileWithoutLinks(filePath: string, maxBytes: number) {
  const candidate = path.resolve(filePath);
  const { root } = path.parse(candidate);
  let current = root;
  for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = await lstat(current); }
    catch { fail("LOCAL_SANDBOX_PROFILE_UNAVAILABLE"); }
    if (stat.isSymbolicLink() || (current === candidate ? !stat.isFile() : !stat.isDirectory())) {
      fail("LOCAL_SANDBOX_PROFILE_INVALID");
    }
    let resolved;
    try { resolved = await realpath(current); }
    catch { fail("LOCAL_SANDBOX_PROFILE_UNAVAILABLE"); }
    if (!samePath(resolved, current)) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  }
  let handle;
  try { handle = await open(candidate, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)); }
  catch { fail("LOCAL_SANDBOX_PROFILE_UNAVAILABLE"); }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > maxBytes) fail("LOCAL_SANDBOX_PROFILE_INVALID");
    const data = await handle.readFile();
    if (data.byteLength > maxBytes) fail("LOCAL_SANDBOX_PROFILE_INVALID");
    return data.toString("utf8");
  } finally { await handle.close(); }
}

function parseProfile(value: unknown): LocalRuntimeProfile {
  const profileKeys = ["profileVersion", "applicationId", "sandboxId", "origin", "platformOrigin", "bindHost",
    "databaseUrl", "runtimeRole", "sandboxRoot", "dataDirectory", "repositoryDirectory", "fixture",
    "nativeSessionContractVersion", "platformClient", "principalSessionKey", "catalogBindings", "allowSyntheticAal2", "assurancePolicyHash"];
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).some((key) => !profileKeys.includes(key)) ||
    profileKeys.filter((key) => key !== "allowSyntheticAal2" && key !== "assurancePolicyHash")
      .some((key) => !Object.hasOwn(value, key))) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  const profile = value as Record<string, unknown>;
  if (profile.profileVersion !== PROFILE_VERSION || profile.applicationId !== "ai-pdm" ||
    typeof profile.sandboxId !== "string" || !SANDBOX_ID.test(profile.sandboxId) ||
    typeof profile.origin !== "string" || typeof profile.platformOrigin !== "string" ||
    typeof profile.bindHost !== "string" || !isLoopbackHost(profile.bindHost) ||
    typeof profile.databaseUrl !== "string" || typeof profile.runtimeRole !== "string" ||
    typeof profile.nativeSessionContractVersion !== "string" ||
    profile.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    !profile.fixture || typeof profile.fixture !== "object" || Array.isArray(profile.fixture) ||
    !exactKeys(profile.fixture, ["version", "hash", "path"]) ||
    typeof (profile.fixture as Record<string, unknown>).version !== "string" ||
    typeof (profile.fixture as Record<string, unknown>).hash !== "string" ||
    !HASH.test((profile.fixture as Record<string, unknown>).hash as string) ||
    typeof (profile.fixture as Record<string, unknown>).path !== "string" ||
    !profile.platformClient || typeof profile.platformClient !== "object" || Array.isArray(profile.platformClient) ||
    !exactKeys(profile.platformClient, ["clientId", "key"]) ||
    (profile.platformClient as Record<string, unknown>).clientId !== "ai-pdm" ||
    !isBase64urlKey((profile.platformClient as Record<string, unknown>).key) ||
    !profile.principalSessionKey || typeof profile.principalSessionKey !== "object" || Array.isArray(profile.principalSessionKey) ||
    !exactKeys(profile.principalSessionKey, ["keyId", "secret"]) ||
    typeof (profile.principalSessionKey as Record<string, unknown>).keyId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test((profile.principalSessionKey as Record<string, unknown>).keyId as string) ||
    !isBase64urlKey((profile.principalSessionKey as Record<string, unknown>).secret) ||
    (profile.principalSessionKey as Record<string, unknown>).secret === (profile.platformClient as Record<string, unknown>).key ||
    !Array.isArray(profile.catalogBindings) || profile.catalogBindings.length < 1 || profile.catalogBindings.length > 64 ||
    profile.allowSyntheticAal2 !== undefined && profile.allowSyntheticAal2 !== true ||
    profile.assurancePolicyHash !== undefined && (typeof profile.assurancePolicyHash !== "string" || !HASH.test(profile.assurancePolicyHash))) {
    fail("LOCAL_SANDBOX_PROFILE_INVALID");
  }
  if (profile.allowSyntheticAal2 === true && !profile.assurancePolicyHash) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  if (profile.allowSyntheticAal2 !== true && profile.assurancePolicyHash !== undefined) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  const catalogBindings = (profile.catalogBindings as unknown[]).map((entry) => {
    if (!exactKeys(entry, ["catalogVersion", "catalogSha256", "stableRoleId", "roleDefinitionHash", "companyId", "scopeKind", "scopeRef"])) {
      fail("LOCAL_SANDBOX_PROFILE_INVALID");
    }
    const row = entry as Record<string, unknown>;
    for (const key of ["catalogVersion", "stableRoleId", "companyId", "scopeKind"]) {
      if (typeof row[key] !== "string" || !row[key] || (row[key] as string).length > 255) fail("LOCAL_SANDBOX_PROFILE_INVALID");
    }
    if (typeof row.catalogSha256 !== "string" || !HASH.test(row.catalogSha256) ||
      typeof row.roleDefinitionHash !== "string" || !HASH.test(row.roleDefinitionHash) ||
      !(row.scopeRef === null || typeof row.scopeRef === "string" && row.scopeRef.length <= 255)) {
      fail("LOCAL_SANDBOX_PROFILE_INVALID");
    }
    return Object.freeze(row as unknown as LocalCatalogBinding);
  });
  const fixture = profile.fixture as Record<string, unknown>;
  return Object.freeze({
    profileVersion: PROFILE_VERSION,
    applicationId: "ai-pdm",
    sandboxId: profile.sandboxId,
    origin: profile.origin,
    platformOrigin: profile.platformOrigin,
    bindHost: profile.bindHost,
    databaseUrl: profile.databaseUrl,
    runtimeRole: profile.runtimeRole,
    sandboxRoot: absoluteDirectory(profile.sandboxRoot),
    dataDirectory: absoluteDirectory(profile.dataDirectory),
    repositoryDirectory: absoluteDirectory(profile.repositoryDirectory),
    fixture: Object.freeze({ version: fixture.version as string, hash: fixture.hash as string,
      path: absoluteDirectory(fixture.path) }),
    nativeSessionContractVersion: JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION,
    platformClient: Object.freeze({ clientId: "ai-pdm", key: (profile.platformClient as Record<string, unknown>).key as string }),
    principalSessionKey: Object.freeze({
      keyId: (profile.principalSessionKey as Record<string, unknown>).keyId as string,
      secret: (profile.principalSessionKey as Record<string, unknown>).secret as string,
    }),
    catalogBindings: Object.freeze(catalogBindings),
    ...(profile.allowSyntheticAal2 === true ? { allowSyntheticAal2: true as const,
      assurancePolicyHash: profile.assurancePolicyHash as string } : {}),
  });
}

function assertEnvironmentMatches(profile: LocalRuntimeProfile, environment: Record<string, string | undefined>) {
  const config = readLocalSandboxConfig(environment, "ai-pdm");
  if (config.origin === config.platformOrigin) fail("LOCAL_SANDBOX_PROFILE_TARGET_MISMATCH");
  if (profile.sandboxId !== config.sandboxId || profile.origin !== config.origin ||
    profile.platformOrigin !== config.platformOrigin || profile.bindHost !== config.bindHost ||
    profile.databaseUrl !== config.databaseUrl || profile.runtimeRole !== config.runtimeRole ||
    !samePath(profile.sandboxRoot, absoluteDirectory(environment.JENFU_LOCAL_SANDBOX_ROOT)) ||
    !samePath(profile.dataDirectory, absoluteDirectory(environment.PDM_DATA_DIR)) ||
    !samePath(profile.repositoryDirectory, absoluteDirectory(environment.PDM_REPOSITORY_DIR)) ||
    environment.PDM_DB_PROVIDER?.trim().toLowerCase() !== "postgres" ||
    environment.PDM_POSTGRES_URL !== profile.databaseUrl || environment.PDM_POSTGRES_POOLER_MODE && environment.PDM_POSTGRES_POOLER_MODE !== "off") {
    fail("LOCAL_SANDBOX_PROFILE_TARGET_MISMATCH");
  }
  const expectedFixturePath = path.join(profile.sandboxRoot, "control", "fixtures.json");
  if (!samePath(profile.fixture.path, expectedFixturePath) || !within(profile.sandboxRoot, profile.fixture.path)) {
    fail("LOCAL_SANDBOX_PROFILE_INVALID");
  }
  return config;
}

async function readProfile(environment: Record<string, string | undefined>) {
  const root = absoluteDirectory(environment.JENFU_LOCAL_SANDBOX_ROOT);
  const file = path.join(root, "control", "ai-pdm-runtime.json");
  const raw = await readRegularFileWithoutLinks(file, PROFILE_MAX_BYTES);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { fail("LOCAL_SANDBOX_PROFILE_INVALID"); }
  const profile = parseProfile(value);
  if (!samePath(profile.sandboxRoot, root)) fail("LOCAL_SANDBOX_PROFILE_TARGET_MISMATCH");
  return profile;
}

async function readFixture(profile: LocalRuntimeProfile) {
  const raw = await readRegularFileWithoutLinks(profile.fixture.path, FIXTURE_MAX_BYTES);
  let value: unknown;
  try { value = JSON.parse(raw); } catch { fail("LOCAL_SANDBOX_FIXTURE_INVALID"); }
  const fixture = assertFixtureEnvelope(value);
  if (fixture.fixtureVersion !== profile.fixture.version || !constantEquals(fixture.fixtureHash, profile.fixture.hash)) {
    fail("LOCAL_SANDBOX_FIXTURE_MISMATCH");
  }
  return fixture;
}

function targetFingerprint(target: Omit<LocalSandboxNativeTargetReadback, "targetFingerprint">) {
  return contractDigest({ applicationId: target.applicationId, sandboxId: target.sandboxId,
    databaseName: target.databaseName, sandboxRoot: path.resolve(target.sandboxRoot),
    dataDirectory: path.resolve(target.dataDirectory), repositoryDirectory: path.resolve(target.repositoryDirectory),
    generation: target.generation, fixtureVersion: target.fixtureVersion, fixtureHash: target.fixtureHash,
    nativeSessionContractVersion: target.nativeSessionContractVersion });
}

type TargetMetadataRow = {
  application_id: string; sandbox_id: string; database_name: string;
  sandbox_root: string; data_directory: string; repository_directory: string;
  generation: string; fixture_version: string; fixture_hash: string;
  native_session_contract_version: string; target_fingerprint: string; status: string;
};

async function readTarget(database: AsyncDatabaseClient, config: LocalSandboxConfig, profile: LocalRuntimeProfile) {
  if (database.kind !== "postgres" || database.transactionScope === "postgres") fail("LOCAL_SANDBOX_STORE_UNAVAILABLE");
  const connection = await database.queryOne<{ database_name: string; runtime_role: string }>(
    "SELECT current_database() AS database_name,current_user AS runtime_role");
  if (connection?.database_name !== config.databaseName || connection.runtime_role !== profile.runtimeRole) {
    fail("LOCAL_SANDBOX_STORE_TARGET_MISMATCH");
  }
  const row = await database.queryOne<TargetMetadataRow>(`
    SELECT application_id,sandbox_id,database_name,sandbox_root,data_directory,repository_directory,
           generation,fixture_version,fixture_hash,native_session_contract_version,target_fingerprint,status
    FROM ai_pdm_core.local_sandbox_target_metadata
    WHERE application_id='ai-pdm' AND sandbox_id=:sandboxId
  `, { sandboxId: config.sandboxId });
  if (!row || row.status !== "ready" || row.application_id !== "ai-pdm" || row.sandbox_id !== config.sandboxId ||
    row.database_name !== config.databaseName || !HASH.test(row.fixture_hash) || !HASH.test(row.target_fingerprint) ||
    row.fixture_version !== profile.fixture.version || !constantEquals(row.fixture_hash, profile.fixture.hash) ||
    row.native_session_contract_version !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    !samePath(row.sandbox_root, profile.sandboxRoot) || !samePath(row.data_directory, profile.dataDirectory) ||
    !samePath(row.repository_directory, profile.repositoryDirectory) ||
    targetFingerprint({ applicationId: "ai-pdm", sandboxId: row.sandbox_id, databaseName: row.database_name,
      sandboxRoot: row.sandbox_root, dataDirectory: row.data_directory, repositoryDirectory: row.repository_directory,
      generation: row.generation, fixtureVersion: row.fixture_version, fixtureHash: row.fixture_hash,
      nativeSessionContractVersion: row.native_session_contract_version }) !== row.target_fingerprint) {
    fail("LOCAL_SANDBOX_STORE_TARGET_MISMATCH");
  }
  return Object.freeze({ applicationId: "ai-pdm" as const, sandboxId: row.sandbox_id,
    databaseName: row.database_name, sandboxRoot: row.sandbox_root, dataDirectory: row.data_directory,
    repositoryDirectory: row.repository_directory, generation: row.generation, fixtureVersion: row.fixture_version,
    fixtureHash: row.fixture_hash, nativeSessionContractVersion: row.native_session_contract_version,
    targetFingerprint: row.target_fingerprint });
}

type BindingRow = Record<string, unknown>;
const BINDING_COLUMNS = `contract_version,status,registration_id,portal_session_id,application_id,sandbox_id,generation,
  fixture_version,fixture_hash,native_session_contract_version,target_fingerprint,join_digest,idempotency_key,
  scenario_id,principal_id,employee_id,identity_issuer,identity_subject,account_type,company_id,native_session_id_hash,
  auth_epoch,account_lifecycle_version,profile_version,assurance_level,assurance_policy_hash,authenticated_at,
  portal_session_expires_at,issued_at,
  expires_at,central_correlation_id,central_registration_observed_at`;

function dateValue(value: unknown, nullable = false): string | null {
  if (value === null && nullable) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) fail("LOCAL_SANDBOX_BINDING_READBACK_FAILED");
  return date.toISOString();
}

function bindingFromRow(row: BindingRow | null): LocalSandboxPrincipalSessionBinding | null {
  if (!row) return null;
  const status = row.status;
  if (status !== "pending_central_registration" && status !== "central_registered" && status !== "revoked" &&
    status !== "registration_abandoned") fail("LOCAL_SANDBOX_BINDING_READBACK_FAILED");
  return Object.freeze({
    contractVersion: row.contract_version as LocalSandboxPrincipalSessionBinding["contractVersion"],
    status,
    registrationId: String(row.registration_id), portalSessionId: String(row.portal_session_id),
    applicationId: "ai-pdm", sandboxId: String(row.sandbox_id), generation: String(row.generation),
    fixtureVersion: String(row.fixture_version), fixtureHash: String(row.fixture_hash),
    nativeSessionContractVersion: row.native_session_contract_version as LocalSandboxPrincipalSessionBinding["nativeSessionContractVersion"],
    targetFingerprint: String(row.target_fingerprint), joinDigest: String(row.join_digest), idempotencyKey: String(row.idempotency_key),
    scenarioId: String(row.scenario_id), principalId: String(row.principal_id), employeeId: String(row.employee_id),
    identityIssuer: row.identity_issuer as LocalSandboxPrincipalSessionBinding["identityIssuer"],
    identitySubject: String(row.identity_subject), accountType: row.account_type as LocalSandboxPrincipalSessionBinding["accountType"],
    companyId: "company-jenfu", nativeSessionIdHash: String(row.native_session_id_hash),
    authEpoch: Number(row.auth_epoch), accountLifecycleVersion: Number(row.account_lifecycle_version),
    profileVersion: Number(row.profile_version), assuranceLevel: row.assurance_level as LocalSandboxPrincipalSessionBinding["assuranceLevel"],
    assurancePolicyHash: String(row.assurance_policy_hash), authenticatedAt: dateValue(row.authenticated_at)!,
    portalSessionExpiresAt: dateValue(row.portal_session_expires_at)!,
    issuedAt: dateValue(row.issued_at)!, expiresAt: dateValue(row.expires_at)!,
    centralCorrelationId: row.central_correlation_id === null ? null : String(row.central_correlation_id),
    centralRegistrationObservedAt: dateValue(row.central_registration_observed_at, true),
  });
}

export class LocalSandboxPrincipalBindingRepository implements LocalSandboxPrincipalBindingPort {
  constructor(private readonly database: AsyncDatabaseClient) {}

  async writePending(binding: LocalSandboxPrincipalSessionBinding) {
    if (this.database.kind !== "postgres") fail("LOCAL_SANDBOX_STORE_UNAVAILABLE");
    await this.database.execute(`
      INSERT INTO ai_pdm_core.local_sandbox_principal_session_bindings
        (${BINDING_COLUMNS})
      VALUES
        (:contractVersion,:status,:registrationId,:portalSessionId,:applicationId,:sandboxId,:generation,
         :fixtureVersion,:fixtureHash,:nativeSessionContractVersion,:targetFingerprint,:joinDigest,:idempotencyKey,
         :scenarioId,:principalId,:employeeId,:identityIssuer,:identitySubject,:accountType,:companyId,:nativeSessionIdHash,
         :authEpoch,:accountLifecycleVersion,:profileVersion,:assuranceLevel,:assurancePolicyHash,:authenticatedAt,
         :portalSessionExpiresAt,:issuedAt,
         :expiresAt,:centralCorrelationId,:centralRegistrationObservedAt)
      ON CONFLICT (registration_id,native_session_id_hash) DO NOTHING
    `, binding as unknown as Record<string, unknown>);
  }

  async readByNativeSessionIdHash(nativeSessionIdHash: string) {
    if (this.database.kind !== "postgres" || !HASH.test(nativeSessionIdHash)) fail("LOCAL_SANDBOX_STORE_UNAVAILABLE");
    const row = await this.database.queryOne<BindingRow>(`
      SELECT ${BINDING_COLUMNS} FROM ai_pdm_core.local_sandbox_principal_session_bindings
      WHERE native_session_id_hash=:nativeSessionIdHash
    `, { nativeSessionIdHash });
    return bindingFromRow(row);
  }

  async markCentralRegistered(input: { registrationId: string; nativeSessionIdHash: string; correlationId: string; observedAt: string }) {
    if (this.database.kind !== "postgres" || !HASH.test(input.nativeSessionIdHash) ||
      !input.registrationId || !input.correlationId || !Number.isFinite(Date.parse(input.observedAt))) {
      fail("LOCAL_SANDBOX_STORE_UNAVAILABLE");
    }
    await this.database.execute(`
      UPDATE ai_pdm_core.local_sandbox_principal_session_bindings
      SET status='central_registered',central_correlation_id=:correlationId,
          central_registration_observed_at=:observedAt
      WHERE registration_id=:registrationId AND native_session_id_hash=:nativeSessionIdHash
        AND status='pending_central_registration'
    `, input);
  }

  async markRevoked(input: { registrationId: string; nativeSessionIdHash: string }) {
    if (this.database.kind !== "postgres" || !HASH.test(input.nativeSessionIdHash) || !input.registrationId) {
      fail("LOCAL_SANDBOX_STORE_UNAVAILABLE");
    }
    await this.database.execute(`
      UPDATE ai_pdm_core.local_sandbox_principal_session_bindings
      SET status='revoked'
      WHERE registration_id=:registrationId AND native_session_id_hash=:nativeSessionIdHash
        AND status='central_registered'
    `, input);
  }
}

function parseCookies(header: string | null) {
  const values = new Map<string, string[]>();
  for (const part of (header ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const entry = values.get(name) ?? [];
    entry.push(part.slice(index + 1).trim());
    values.set(name, entry);
  }
  return values;
}

export function localPrincipalSessionCookieName(sandboxId: string) {
  if (!SANDBOX_ID.test(sandboxId)) fail("LOCAL_SANDBOX_PROFILE_INVALID");
  return LOCAL_COOKIE_PREFIX + sandboxId.replaceAll("-", "_");
}

export function readLocalPrincipalSessionCookie(request: Request, sandboxId: string) {
  const values = parseCookies(request.headers.get("cookie")).get(localPrincipalSessionCookieName(sandboxId));
  if (!values || values.length !== 1) return null;
  try {
    const value = decodeURIComponent(values[0]);
    return value.length <= 8192 && value.split(".").length === 3 ? value : null;
  } catch { return null; }
}

export function createLocalPrincipalSessionCookie(token: string, sandboxId: string, expiresAt: string, origin: string) {
  const maxAge = Math.max(0, Math.min(8 * 60 * 60, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000)));
  if (maxAge < 1 || token.length > 8192 || !token.split(".").every(Boolean)) fail("LOCAL_SANDBOX_NATIVE_SESSION_INVALID");
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  return `${localPrincipalSessionCookieName(sandboxId)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearLocalPrincipalSessionCookie(sandboxId: string, origin: string) {
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  return `${localPrincipalSessionCookieName(sandboxId)}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function createLocalSandboxLoginState(platformKey: string, origin: string) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const expiresAt = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS;
  const payload = Buffer.from(canonicalJson({ version: 1, state, verifier, expiresAt, origin })).toString("base64url");
  const signature = createHmac("sha256", Buffer.from(platformKey, "base64url")).update(payload).digest("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return { state, verifier, challenge, cookieValue: `${payload}.${signature}`, expiresAt };
}

export function verifyLocalSandboxLoginState(cookieValue: string | null, suppliedState: string, platformKey: string,
  origin: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!cookieValue || cookieValue.length > 2048 || !Number.isSafeInteger(nowSeconds)) fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
  const [payload, signature, extra] = cookieValue.split(".");
  if (!payload || !signature || extra || !/^[A-Za-z0-9_-]{43}$/u.test(signature)) fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
  const expected = createHmac("sha256", Buffer.from(platformKey, "base64url")).update(payload).digest("base64url");
  const supplied = Buffer.from(signature), expectedBytes = Buffer.from(expected);
  if (supplied.length !== expectedBytes.length || !timingSafeEqual(supplied, expectedBytes)) fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID"); }
  if (!exactKeys(value, ["version", "state", "verifier", "expiresAt", "origin"])) fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
  const state = value as { version: number; state: string; verifier: string; expiresAt: number; origin: string };
  if (state.version !== 1 || state.state !== suppliedState || !/^[A-Za-z0-9_-]{43}$/u.test(state.state) ||
    !/^[A-Za-z0-9_-]{43}$/u.test(state.verifier) || state.expiresAt <= nowSeconds || state.expiresAt > nowSeconds + STATE_TTL_SECONDS ||
    state.origin !== origin) fail("LOCAL_SANDBOX_CALLBACK_STATE_INVALID");
  return Object.freeze({ verifier: state.verifier, challenge: createHash("sha256").update(state.verifier, "ascii").digest("base64url") });
}

export function createLocalPrincipalSessionKeyRing(profile: Pick<LocalRuntimeProfile, "principalSessionKey" | "platformClient">): PlatformSessionKeyRing {
  const { keyId, secret } = profile.principalSessionKey;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u.test(keyId) || !isBase64urlKey(secret) ||
    !isBase64urlKey(profile.platformClient.key) || secret === profile.platformClient.key) {
    fail("LOCAL_SANDBOX_SESSION_KEY_INVALID");
  }
  return Object.freeze({ issuer: LOCAL_SESSION_ISSUER, audience: LOCAL_SESSION_AUDIENCE,
    currentKeyId: keyId, keys: Object.freeze({ [keyId]: secret }) });
}

function bindingPorts(database: AsyncDatabaseClient): LocalSandboxPrincipalBindingPort {
  return new LocalSandboxPrincipalBindingRepository(database);
}

export async function getLocalSandboxPrincipalRuntime(environment: Record<string, string | undefined> = process.env): Promise<LocalSandboxPrincipalRuntime> {
  if (!localLaneEnabled(environment)) fail("LOCAL_SANDBOX_DISABLED");
  const profile = await readProfile(environment);
  const config = assertEnvironmentMatches(profile, environment);
  const listenAddress = await verifyLocalListener(config);
  const fixture = await readFixture(profile);
  const database = getAsyncDatabaseClient();
  const target = await readTarget(database, config, profile);
  const canonicalTargetFingerprint = targetFingerprint(target);
  if (canonicalTargetFingerprint !== target.targetFingerprint) fail("LOCAL_SANDBOX_STORE_TARGET_MISMATCH");
  await validateLocalSandboxResetTarget({
    environment, sandboxRoot: target.sandboxRoot, dataDirectory: target.dataDirectory,
    repositoryDirectory: target.repositoryDirectory, sandboxId: target.sandboxId,
    databaseName: target.databaseName, expectedTargetFingerprint: target.targetFingerprint,
    observedTargetFingerprint: target.targetFingerprint, expectedGeneration: target.generation,
    generation: target.generation,
  });
  const client = createLocalSandboxClient({ config, clientId: "ai-pdm", key: profile.platformClient.key });
  const ports: LocalSandboxPrincipalSessionPorts = {
    targetReader: { readCurrentTarget: (currentDatabase) => readTarget(currentDatabase, config, profile) },
    nativeSessionReadback: {
      hashSessionId: hashJenfuPrincipalSessionId,
      isActive: (currentDatabase, claims, nowMs) => new JenfuPrincipalSessionRegistry(currentDatabase).isActive(claims, nowMs),
    },
    binding: bindingPorts(database),
    centralRegistration: {
      async registerOrReadBack(binding) {
        const input = { registrationId: binding.registrationId,
          nativeSessionIdHash: binding.nativeSessionIdHash, joinDigest: binding.joinDigest,
          idempotencyKey: binding.idempotencyKey };
        let value: Record<string, unknown>;
        try { value = await client.register(input); }
        catch (error) {
          // The Central endpoint is idempotent on this persisted key. A 503 is
          // an unknown result, so repeat only the identical request once; the
          // endpoint either reads the active registration back or creates it.
          if (!(error instanceof LocalSandboxError) || error.status !== 503) throw error;
          value = await client.register(input);
        }
        if (!value || typeof value !== "object") fail("LOCAL_SANDBOX_CENTRAL_REGISTRATION_MISMATCH");
        return value as { active: true; registrationId: string; joinDigest: string; correlationId: string };
      },
    },
    centralIntrospection: { introspect: client.introspect },
    issueSessionForPrincipalHandoff: (await import("@/lib/jenfu-principal-handoff-session-service")).issueSessionForPrincipalHandoff,
    resolvePlatformResponseKey: async (clientId) => clientId === "ai-pdm" ? profile.platformClient.key : null,
  };
  const keyRing = createLocalPrincipalSessionKeyRing(profile);
  return Object.freeze({ config, profile, fixture, target, database, keyRing, client, ports, listenAddress,
    expected: Object.freeze({ applicationId: "ai-pdm", sandboxId: config.sandboxId,
      generation: target.generation, fixtureVersion: target.fixtureVersion, fixtureHash: target.fixtureHash,
      nativeSessionContractVersion: JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION,
      targetFingerprint: target.targetFingerprint, catalogBindings: profile.catalogBindings,
      ...(profile.allowSyntheticAal2 ? { allowSyntheticAal2: true as const,
        assurancePolicyHash: profile.assurancePolicyHash! } : {}) }) });
}

export function createLocalStateCookie(value: string, origin: string, expiresAtSeconds: number) {
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  const maxAge = Math.max(1, Math.min(STATE_TTL_SECONDS, expiresAtSeconds - Math.floor(Date.now() / 1000)));
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/local-sandbox; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearLocalStateCookie(origin: string) {
  const secure = new URL(origin).protocol === "https:" ? "; Secure" : "";
  return `${STATE_COOKIE}=; Path=/api/auth/local-sandbox; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function localStateCookieValue(request: Request) {
  const values = parseCookies(request.headers.get("cookie")).get(STATE_COOKIE);
  if (!values || values.length !== 1) return null;
  try { return decodeURIComponent(values[0]); } catch { return null; }
}
