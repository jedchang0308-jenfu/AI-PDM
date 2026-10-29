import { createHash } from 'node:crypto'
import {
  LOCAL_IDENTITY_ISSUER,
  assertLocalSandboxRequest,
  canonicalJson,
  constantEquals,
  isLoopbackHost,
  readLocalSandboxConfig,
  validateLocalAssertion,
  verifyLocalResponse
} from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { validateLocalSandboxResetTarget } from './local-sandbox-reset-target.mjs'
import { JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION, verifyJenfuPrincipalSession } from '@/lib/jenfu-principal-session'
import { principalAssurancePolicyHash } from '@/lib/jenfu-principal-assurance'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { JenfuPrincipalHandoff } from '@/lib/jenfu-principal-handoff'
import type { JenfuPrincipalSessionClaims } from '@/lib/jenfu-principal-session'
import type { GoogleWorkspaceMfaTrustPolicy } from '@/lib/auth-config'
import type { PlatformSessionKeyRing } from '@/lib/platform-session-v2'
import type { LocalAssertion, LocalAssertionExpectation, LocalSandboxConfig } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import type { LocalSandboxClient } from '../../contracts/local-principal-sandbox/v1/client.mjs'
import type { issueSessionForPrincipalHandoff } from '@/lib/jenfu-principal-handoff-session-service'

export const LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY: GoogleWorkspaceMfaTrustPolicy = Object.freeze({
  enabled: false,
  allowAal1PrivilegedPilot: false,
  domains: Object.freeze([]) as unknown as string[]
})

export type LocalSandboxNativeTargetReadback = Readonly<{
  applicationId: 'ai-pdm'
  sandboxId: string
  databaseName: string
  sandboxRoot: string
  dataDirectory: string
  repositoryDirectory: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  nativeSessionContractVersion: string
  targetFingerprint: string
}>

/** Must read target identity from the actual client connection and owner metadata, not echo caller inputs. */
export interface LocalSandboxNativeTargetReader {
  readCurrentTarget(database: AsyncDatabaseClient): Promise<LocalSandboxNativeTargetReadback>
}

/** Reads native session state only through the PDM-owned registry implementation. */
export interface LocalSandboxNativeSessionReadbackPort {
  hashSessionId(sessionId: string): string
  isActive(database: AsyncDatabaseClient, claims: JenfuPrincipalSessionClaims, nowMs: number): Promise<boolean>
}

export type LocalSandboxPrincipalSessionBinding = Readonly<{
  contractVersion: 'jenfu.local-sandbox-principal-binding.v1'
  status: 'pending_central_registration' | 'central_registered' | 'revoked'
  registrationId: string
  portalSessionId: string
  applicationId: 'ai-pdm'
  sandboxId: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION
  targetFingerprint: string
  joinDigest: string
  idempotencyKey: string
  scenarioId: string
  principalId: string
  employeeId: string
  identityIssuer: typeof LOCAL_IDENTITY_ISSUER
  identitySubject: string
  accountType: 'human_personal' | 'human_privileged'
  companyId: 'company-jenfu'
  nativeSessionIdHash: string
  authEpoch: number
  accountLifecycleVersion: number
  profileVersion: number
  assuranceLevel: 'aal1' | 'aal2'
  assurancePolicyHash: string
  authenticatedAt: string
  portalSessionExpiresAt: string
  issuedAt: string
  expiresAt: string
  centralCorrelationId: string | null
  /** Local observation time; the Central wire does not supply an acknowledgement timestamp. */
  centralRegistrationObservedAt: string | null
}>

export interface LocalSandboxPrincipalBindingPort {
  /** Idempotent on registrationId + nativeSessionIdHash; stores no bearer token or secret. */
  writePending(binding: LocalSandboxPrincipalSessionBinding): Promise<void>
  /** Reads by the SHA-256 native session ID hash. */
  readByNativeSessionIdHash(nativeSessionIdHash: string): Promise<LocalSandboxPrincipalSessionBinding | null>
  markCentralRegistered(input: {
    registrationId: string
    nativeSessionIdHash: string
    correlationId: string
    observedAt: string
  }): Promise<void>
  markRevoked(input: { registrationId: string; nativeSessionIdHash: string }): Promise<void>
}

export type LocalSandboxCentralRegistrationResult = Readonly<{
  active: true
  registrationId: string
  joinDigest: string
  correlationId: string
}>

export interface LocalSandboxCentralRegistrationPort {
  /** Register or read back the exact idempotent Central registration. */
  registerOrReadBack(binding: LocalSandboxPrincipalSessionBinding): Promise<LocalSandboxCentralRegistrationResult>
}

export type LocalSandboxCentralIntrospection = Readonly<{
  active: true
  registrationId: string
  portalSessionId: string
  joinDigest: string
  generation: string
  authEpoch: number
  expiresAt: string
  correlationId: string
}>

/** Must be the shared client, which signs each request with a fresh nonce and verifies Platform's signed response. */
export type LocalSandboxCentralIntrospectionPort = Pick<LocalSandboxClient, 'introspect'>

export type LocalSandboxPrincipalSessionExpected = LocalAssertionExpectation & Readonly<{
  applicationId: 'ai-pdm'
  sandboxId: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION
  targetFingerprint: string
  catalogBindings: readonly LocalSandboxCatalogBinding[]
  allowSyntheticAal2?: boolean
  assurancePolicyHash?: string
}>

export type LocalSandboxCatalogBinding = Readonly<{
  catalogVersion: string
  catalogSha256: string
  stableRoleId: string
  roleDefinitionHash: string
  companyId: string
  scopeKind: string
  scopeRef: string | null
}>

export type LocalSandboxPrincipalSessionPorts = {
  targetReader: LocalSandboxNativeTargetReader
  nativeSessionReadback: LocalSandboxNativeSessionReadbackPort
  binding: LocalSandboxPrincipalBindingPort
  centralRegistration: LocalSandboxCentralRegistrationPort
  centralIntrospection: LocalSandboxCentralIntrospectionPort
  issueSessionForPrincipalHandoff: typeof issueSessionForPrincipalHandoff
  resolvePlatformResponseKey(clientId: string): Promise<string | null>
}

export type IssueLocalSandboxPrincipalSessionInput = {
  request: Request
  environment: Record<string, string | undefined>
  /** Address verified from the bound listener by the OS/launcher; never copied from the request. */
  listenAddress: string
  /** Required on the exact GET callback path; validates state and PKCE before issuing a session. */
  verifyCallbackStateAndPkce?: (request: Request) => Promise<void>
  expected: LocalSandboxPrincipalSessionExpected
  expectedNonce: string
  signedResponse: Readonly<{ rawBody: string; nonce: string; audience: string; clientId: string; signature: string | null }>
  database: AsyncDatabaseClient
  keyRing: PlatformSessionKeyRing
  ports: LocalSandboxPrincipalSessionPorts
  nowMs?: number
}

function fail(code: string): never { throw new Error(code) }

function rejectFormalAuthLane(environment: Record<string, string | undefined>) {
  if (environment.PDM_LOCAL_PRINCIPAL_SANDBOX !== '1' || environment.PDM_AUTH_MODE !== 'firebase_bff' ||
    environment.PDM_JENFU_PLATFORM_AUTH_MODE !== 'on' || environment.PDM_JENFU_ENTITLEMENT_MODE !== 'enforce' ||
    environment.NODE_ENV !== 'development' ||
    environment.K_SERVICE || environment.K_REVISION || environment.FUNCTION_TARGET ||
    environment.FUNCTION_NAME || environment.FIREBASE_CONFIG) {
    fail('LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN')
  }
  const formalIdentityKeys = ['JENFU_FIREBASE_PROJECT_ID', 'JENFU_IDENTITY_ISSUER', 'JENFU_IDENTITY_AUDIENCE',
    'PDM_FIREBASE_PROJECT_ID', 'PDM_FIREBASE_API_KEY', 'PDM_FIREBASE_AUTH_DOMAIN', 'PDM_FIREBASE_APP_ID',
    'PDM_JENFU_SSO_BROKER_ORIGIN']
  if (formalIdentityKeys.some((key) => String(environment[key] ?? '').trim()) ||
    !['', 'off'].includes(String(environment.PDM_JENFU_SSO_HANDOFF_MODE ?? '').trim().toLowerCase())) {
    fail('LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN')
  }
}

async function assertCurrentTarget(input: {
  environment: Record<string, string | undefined>
  config: LocalSandboxConfig
  database: AsyncDatabaseClient
  expected: LocalSandboxPrincipalSessionExpected
  targetReader: LocalSandboxNativeTargetReader
}) {
  const { environment, config, database, expected } = input
  if (database.kind !== 'postgres' || database.transactionScope === 'postgres') fail('LOCAL_SANDBOX_STORE_UNAVAILABLE')
  const connected = await database.queryOne<{ database_name: string }>(
    'SELECT current_database() AS database_name'
  )
  if (connected?.database_name !== config.databaseName) fail('LOCAL_SANDBOX_STORE_TARGET_MISMATCH')

  const observed = await input.targetReader.readCurrentTarget(database)
  if (observed.applicationId !== 'ai-pdm' || observed.sandboxId !== config.sandboxId ||
    observed.databaseName !== config.databaseName || observed.generation !== expected.generation ||
    observed.fixtureVersion !== expected.fixtureVersion ||
    !constantEquals(observed.fixtureHash, expected.fixtureHash) ||
    observed.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    expected.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION) {
    fail('LOCAL_SANDBOX_STORE_TARGET_MISMATCH')
  }
  const canonicalTarget = await validateLocalSandboxResetTarget({
    environment,
    sandboxRoot: observed.sandboxRoot,
    dataDirectory: observed.dataDirectory,
    repositoryDirectory: observed.repositoryDirectory,
    sandboxId: observed.sandboxId,
    databaseName: observed.databaseName,
    expectedTargetFingerprint: expected.targetFingerprint,
    observedTargetFingerprint: observed.targetFingerprint,
    expectedGeneration: expected.generation,
    generation: observed.generation,
  })
  return { observed, canonicalTarget }
}

function assertNativeClaims(claims: JenfuPrincipalSessionClaims, assertion: LocalAssertion,
  targetFingerprint: string, nowMs: number) {
  const nativeAssurancePolicyHash = principalAssurancePolicyHash(LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY)
  if (claims.contractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION || claims.appId !== 'ai-pdm' ||
    claims.identityIssuer !== LOCAL_IDENTITY_ISSUER || claims.identitySubject !== assertion.identitySubject ||
    claims.principalId !== assertion.principalId || claims.employeeId !== assertion.employeeId ||
    claims.authEpoch !== assertion.authEpoch || claims.accountLifecycleVersion !== assertion.accountLifecycleVersion ||
    claims.profileVersion !== assertion.profileVersion || claims.companyId !== 'company-jenfu' ||
    claims.assuranceLevel !== assertion.assuranceLevel || claims.secondFactor !== assertion.secondFactor ||
    claims.assurancePolicyHash !== nativeAssurancePolicyHash || claims.expiresAt <= Math.floor(nowMs / 1000) ||
    !/^[a-f0-9]{64}$/u.test(targetFingerprint)) fail('LOCAL_SANDBOX_NATIVE_SESSION_MISMATCH')
}

function bindingFrom(assertion: LocalAssertion, claims: JenfuPrincipalSessionClaims, targetFingerprint: string,
  nativeSessionIdHash: string): LocalSandboxPrincipalSessionBinding {
  return Object.freeze({
    contractVersion: 'jenfu.local-sandbox-principal-binding.v1',
    status: 'pending_central_registration',
    registrationId: assertion.registrationId,
    portalSessionId: assertion.portalSessionId,
    applicationId: 'ai-pdm',
    sandboxId: assertion.sandboxId,
    generation: assertion.generation,
    fixtureVersion: assertion.fixtureVersion,
    fixtureHash: assertion.fixtureHash,
    nativeSessionContractVersion: JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION,
    targetFingerprint,
    joinDigest: assertion.joinDigest,
    idempotencyKey: localRegistrationIdempotencyKey(assertion.registrationId, assertion.joinDigest),
    scenarioId: assertion.scenarioId,
    principalId: claims.principalId,
    employeeId: claims.employeeId,
    identityIssuer: LOCAL_IDENTITY_ISSUER,
    identitySubject: claims.identitySubject,
    accountType: assertion.accountType,
    companyId: 'company-jenfu',
    nativeSessionIdHash,
    authEpoch: claims.authEpoch,
    accountLifecycleVersion: claims.accountLifecycleVersion,
    profileVersion: claims.profileVersion,
    assuranceLevel: claims.assuranceLevel,
    assurancePolicyHash: claims.assurancePolicyHash,
    authenticatedAt: new Date(claims.authenticatedAt * 1000).toISOString(),
    portalSessionExpiresAt: assertion.sourceSessionExpiresAt,
    issuedAt: new Date(claims.issuedAt * 1000).toISOString(),
    expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
    centralCorrelationId: null,
    centralRegistrationObservedAt: null,
  })
}

function localRegistrationIdempotencyKey(registrationId: string, joinDigest: string) {
  return `ai-pdm-local-registration-v1_${createHashHex(canonicalJson({ applicationId: 'ai-pdm', registrationId, joinDigest }))}`
}

function sameRecord(left: unknown, right: unknown) {
  try { return constantEquals(canonicalJson(left), canonicalJson(right)) } catch { return false }
}

function createHashHex(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function assertRegistrationResult(result: LocalSandboxCentralRegistrationResult,
  binding: LocalSandboxPrincipalSessionBinding) {
  if (!result || result.active !== true || result.registrationId !== binding.registrationId ||
    result.joinDigest !== binding.joinDigest || typeof result.correlationId !== 'string' ||
    !result.correlationId.trim() || result.correlationId.length > 512) {
    fail('LOCAL_SANDBOX_CENTRAL_REGISTRATION_MISMATCH')
  }
}

function parseCentralIntrospection(value: unknown): LocalSandboxCentralIntrospection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('LOCAL_SANDBOX_CENTRAL_INTROSPECTION_INVALID')
  const response = value as Record<string, unknown>
  if (response.active !== true || typeof response.registrationId !== 'string' ||
    typeof response.portalSessionId !== 'string' || typeof response.joinDigest !== 'string' ||
    typeof response.generation !== 'string' || !Number.isSafeInteger(response.authEpoch) ||
    typeof response.expiresAt !== 'string' || typeof response.correlationId !== 'string' ||
    !response.correlationId.trim() || response.correlationId.length > 512) {
    fail('LOCAL_SANDBOX_CENTRAL_INTROSPECTION_INVALID')
  }
  return response as unknown as LocalSandboxCentralIntrospection
}

function assertIntrospectionMatches(binding: LocalSandboxPrincipalSessionBinding,
  response: LocalSandboxCentralIntrospection) {
  if (response.registrationId !== binding.registrationId ||
    response.portalSessionId !== binding.portalSessionId || response.joinDigest !== binding.joinDigest ||
    response.generation !== binding.generation || response.authEpoch !== binding.authEpoch ||
    response.expiresAt !== binding.portalSessionExpiresAt) fail('LOCAL_SANDBOX_CENTRAL_INTROSPECTION_MISMATCH')
}

export async function issueLocalSandboxPrincipalSession(input: IssueLocalSandboxPrincipalSessionInput) {
  const nowMs = input.nowMs ?? Date.now()
  if (!Number.isSafeInteger(nowMs) || !isLoopbackHost(input.listenAddress) ||
    input.database.kind !== 'postgres' || input.database.transactionScope === 'postgres') {
    fail('LOCAL_SANDBOX_REQUEST_INVALID')
  }
  rejectFormalAuthLane(input.environment)
  const config = readLocalSandboxConfig(input.environment, 'ai-pdm')
  const requestUrl = new URL(input.request.url)
  const quickLogin = input.request.method === 'POST' && requestUrl.pathname === '/api/auth/local-quick-login'
  const callback = input.request.method === 'GET' && requestUrl.pathname === '/api/auth/local-sandbox/callback'
  if (!quickLogin && !callback) fail('LOCAL_SANDBOX_REQUEST_INVALID')
  assertLocalSandboxRequest(input.request, config, {
    browserMutation: quickLogin,
    listenAddress: input.listenAddress,
  })
  if (callback) {
    if (!input.verifyCallbackStateAndPkce) fail('LOCAL_SANDBOX_CALLBACK_STATE_INVALID')
    await input.verifyCallbackStateAndPkce(input.request)
  }
  if (input.expected.applicationId !== 'ai-pdm' ||
    input.expected.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION) {
    fail('LOCAL_SANDBOX_EXPECTATION_INVALID')
  }
  const { observed, canonicalTarget } = await assertCurrentTarget({
    environment: input.environment,
    config,
    database: input.database,
    expected: input.expected,
    targetReader: input.ports.targetReader,
  })

  const signed = input.signedResponse
  if (signed.clientId !== 'ai-pdm' || signed.audience !== config.platformOrigin || signed.nonce !== input.expectedNonce) {
    fail('LOCAL_SANDBOX_ASSERTION_RESPONSE_INVALID')
  }
  const responseKey = await input.ports.resolvePlatformResponseKey(signed.clientId)
  if (!responseKey) fail('LOCAL_SANDBOX_ASSERTION_KEY_UNAVAILABLE')
  verifyLocalResponse({ rawBody: signed.rawBody, nonce: signed.nonce, audience: signed.audience,
    clientId: signed.clientId }, responseKey, signed.signature)
  let assertionValue: unknown
  try { assertionValue = JSON.parse(signed.rawBody) } catch { fail('LOCAL_SANDBOX_ASSERTION_RESPONSE_INVALID') }

  const assertionPolicyHash = input.expected.assurancePolicyHash
  const isSyntheticAal2 = Boolean(assertionValue && typeof assertionValue === 'object' &&
    !Array.isArray(assertionValue) && (assertionValue as { assuranceLevel?: unknown }).assuranceLevel === 'aal2')
  if (isSyntheticAal2 && (input.expected.allowSyntheticAal2 !== true || !assertionPolicyHash)) {
    fail('LOCAL_SANDBOX_SYNTHETIC_AAL2_NOT_ALLOWED')
  }
  const assertionExpected: LocalAssertionExpectation = {
    applicationId: input.expected.applicationId,
    sandboxId: input.expected.sandboxId,
    generation: input.expected.generation,
    fixtureVersion: input.expected.fixtureVersion,
    fixtureHash: input.expected.fixtureHash,
    nativeSessionContractVersion: input.expected.nativeSessionContractVersion,
    ...(input.expected.allowSyntheticAal2 === true ? { allowSyntheticAal2: true } : {}),
    ...(assertionPolicyHash ? { assurancePolicyHash: assertionPolicyHash } : {}),
  }
  const assertion = validateLocalAssertion(assertionValue, assertionExpected, nowMs)
  if (assertion.identityIssuer !== LOCAL_IDENTITY_ISSUER) fail('LOCAL_SANDBOX_ASSERTION_IDENTITY_INVALID')
  if (!Array.isArray(input.expected.catalogBindings) || input.expected.catalogBindings.length < 1 ||
    assertion.grants.some((grant) => !input.expected.catalogBindings.some((pin) =>
      pin.catalogVersion === grant.catalogVersion && pin.catalogSha256 === grant.catalogSha256 &&
      pin.stableRoleId === grant.stableRoleId && pin.roleDefinitionHash === grant.roleDefinitionHash &&
      pin.companyId === grant.companyId && pin.scopeKind === grant.scopeKind && pin.scopeRef === grant.scopeRef))) {
    fail('LOCAL_SANDBOX_CATALOG_BINDING_MISMATCH')
  }

  const handoff: JenfuPrincipalHandoff = {
    contractVersion: 'jenfu.sso-handoff.v2',
    issuer: LOCAL_IDENTITY_ISSUER,
    audience: 'ai-pdm',
    identity: {
      identityIssuer: assertion.identityIssuer,
      identitySubject: assertion.identitySubject,
      principalId: assertion.principalId,
      employeeId: assertion.employeeId,
    },
    authentication: {
      authenticatedAt: assertion.authenticatedAt,
      email: `${assertion.scenarioId}@local.invalid`,
      emailVerified: true,
      signInProvider: 'jenfu.local.synthetic',
      secondFactor: assertion.secondFactor,
      assuranceLevel: assertion.assuranceLevel,
    },
    authState: { authEpoch: assertion.authEpoch, revokedBefore: null },
    sourceSessionExpiresAt: assertion.sourceSessionExpiresAt,
    issuedAt: assertion.issuedAt,
    expiresAt: assertion.expiresAt,
  }
  const issued = await input.ports.issueSessionForPrincipalHandoff({
    handoff,
    database: input.database,
    expectedIdentityIssuer: LOCAL_IDENTITY_ISSUER,
    keyRing: input.keyRing,
    trustPolicy: LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY,
    nowMs,
  })
  assertNativeClaims(issued.claims, assertion, canonicalTarget.targetFingerprint, nowMs)
  const sessionIsActive = await input.ports.nativeSessionReadback.isActive(input.database, issued.claims, nowMs)
  if (!sessionIsActive) fail('LOCAL_SANDBOX_NATIVE_COMMIT_READBACK_FAILED')

  const pendingBinding = bindingFrom(assertion, issued.claims, canonicalTarget.targetFingerprint,
    input.ports.nativeSessionReadback.hashSessionId(issued.claims.sessionId))
  await input.ports.binding.writePending(pendingBinding)
  const persistedPending = await input.ports.binding.readByNativeSessionIdHash(pendingBinding.nativeSessionIdHash)
  if (!sameRecord(persistedPending, pendingBinding)) fail('LOCAL_SANDBOX_BINDING_READBACK_FAILED')

  // The port must use the stable idempotency key and provider-read back an
  // unknown write result before returning the registration state.
  const registration = await input.ports.centralRegistration.registerOrReadBack(pendingBinding)
  assertRegistrationResult(registration, pendingBinding)
  const registrationObservedAt = new Date(nowMs).toISOString()
  const registeredBinding: LocalSandboxPrincipalSessionBinding = Object.freeze({
    ...pendingBinding,
    status: 'central_registered',
    centralCorrelationId: registration.correlationId,
    centralRegistrationObservedAt: registrationObservedAt,
  })
  await input.ports.binding.markCentralRegistered({
    registrationId: pendingBinding.registrationId,
    nativeSessionIdHash: pendingBinding.nativeSessionIdHash,
    correlationId: registration.correlationId,
    observedAt: registrationObservedAt,
  })
  const persistedRegistered = await input.ports.binding.readByNativeSessionIdHash(pendingBinding.nativeSessionIdHash)
  if (!persistedRegistered || !sameRecord(persistedRegistered, registeredBinding)) {
    fail('LOCAL_SANDBOX_BINDING_REGISTRATION_READBACK_FAILED')
  }

  // The caller may set the cookie only after this resolves.
  return Object.freeze({ token: issued.token, claims: issued.claims, binding: persistedRegistered })
}

export type LocalSandboxPrincipalRequestExpected = Readonly<{
  applicationId: 'ai-pdm'
  sandboxId: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION
  targetFingerprint: string
}>

export type LocalSandboxPrincipalRequestAdmission = Readonly<{
  sessionToken: string
  sandboxId: string
  generation: string
  fixtureVersion: string
  fixtureHash: string
  targetFingerprint: string
  nativeSessionContractVersion: typeof JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION
}>

const admittedLocalRequestTokens = new WeakMap<object, string>()

function createAdmission(token: string, expected: LocalSandboxPrincipalRequestExpected): LocalSandboxPrincipalRequestAdmission {
  const admission = Object.freeze({
    sessionToken: token,
    sandboxId: expected.sandboxId,
    generation: expected.generation,
    fixtureVersion: expected.fixtureVersion,
    fixtureHash: expected.fixtureHash,
    targetFingerprint: expected.targetFingerprint,
    nativeSessionContractVersion: expected.nativeSessionContractVersion,
  })
  admittedLocalRequestTokens.set(admission, token)
  return admission
}

export function isLocalSandboxPrincipalRequestAdmission(value: unknown, token: string): value is LocalSandboxPrincipalRequestAdmission {
  return Boolean(value && typeof value === 'object' && admittedLocalRequestTokens.get(value) === token)
}

export type ResolveLocalSandboxPrincipalRequestAdmissionInput = {
  request: Request
  token: string
  environment: Record<string, string | undefined>
  listenAddress: string
  expected: LocalSandboxPrincipalRequestExpected
  database: AsyncDatabaseClient
  keyRing: PlatformSessionKeyRing
  targetReader: LocalSandboxNativeTargetReader
  nativeSessionReadback: LocalSandboxNativeSessionReadbackPort
  binding: LocalSandboxPrincipalBindingPort
  centralIntrospection: LocalSandboxCentralIntrospectionPort
  nowMs?: number
}

export async function resolveLocalSandboxPrincipalRequestAdmission(
  input: ResolveLocalSandboxPrincipalRequestAdmissionInput,
): Promise<LocalSandboxPrincipalRequestAdmission> {
  const nowMs = input.nowMs ?? Date.now()
  if (!Number.isSafeInteger(nowMs) || !isLoopbackHost(input.listenAddress) ||
    input.database.kind !== 'postgres' || input.database.transactionScope === 'postgres' ||
    input.expected.applicationId !== 'ai-pdm' ||
    input.expected.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION) {
    fail('LOCAL_SANDBOX_REQUEST_INVALID')
  }
  rejectFormalAuthLane(input.environment)
  const config = readLocalSandboxConfig(input.environment, 'ai-pdm')
  const browserMutation = !['GET', 'HEAD', 'OPTIONS'].includes(input.request.method.toUpperCase())
  assertLocalSandboxRequest(input.request, config, { browserMutation, listenAddress: input.listenAddress })
  const { observed, canonicalTarget } = await assertCurrentTarget({
    environment: input.environment,
    config,
    database: input.database,
    expected: input.expected as LocalSandboxPrincipalSessionExpected,
    targetReader: input.targetReader,
  })
  if (observed.targetFingerprint !== input.expected.targetFingerprint) fail('LOCAL_SANDBOX_STORE_TARGET_MISMATCH')

  let claims: JenfuPrincipalSessionClaims
  try { claims = verifyJenfuPrincipalSession(input.token, input.keyRing, { nowSeconds: Math.floor(nowMs / 1000) }) }
  catch { fail('LOCAL_SANDBOX_NATIVE_SESSION_INVALID') }
  if (claims.identityIssuer !== LOCAL_IDENTITY_ISSUER || claims.contractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    claims.appId !== 'ai-pdm' || claims.companyId !== 'company-jenfu') fail('LOCAL_SANDBOX_NATIVE_SESSION_INVALID')
  const nativeSessionIdHash = input.nativeSessionReadback.hashSessionId(claims.sessionId)
  const [sessionIsActive, binding] = await Promise.all([
    input.nativeSessionReadback.isActive(input.database, claims, nowMs),
    input.binding.readByNativeSessionIdHash(nativeSessionIdHash),
  ])
  if (!sessionIsActive || !binding || binding.status !== 'central_registered' ||
    !binding.centralCorrelationId || !binding.centralRegistrationObservedAt ||
    binding.nativeSessionIdHash !== nativeSessionIdHash || binding.applicationId !== 'ai-pdm' ||
    binding.idempotencyKey !== localRegistrationIdempotencyKey(binding.registrationId, binding.joinDigest) ||
    binding.sandboxId !== config.sandboxId || binding.generation !== input.expected.generation ||
    binding.fixtureVersion !== input.expected.fixtureVersion || !constantEquals(binding.fixtureHash, input.expected.fixtureHash) ||
    binding.nativeSessionContractVersion !== JENFU_PRINCIPAL_SESSION_CONTRACT_VERSION ||
    binding.targetFingerprint !== canonicalTarget.targetFingerprint ||
    binding.identityIssuer !== claims.identityIssuer || binding.identitySubject !== claims.identitySubject ||
    binding.principalId !== claims.principalId || binding.employeeId !== claims.employeeId ||
    binding.companyId !== claims.companyId || binding.authEpoch !== claims.authEpoch ||
    binding.accountLifecycleVersion !== claims.accountLifecycleVersion || binding.profileVersion !== claims.profileVersion ||
    binding.assurancePolicyHash !== claims.assurancePolicyHash ||
    binding.authenticatedAt !== new Date(claims.authenticatedAt * 1000).toISOString() ||
    binding.issuedAt !== new Date(claims.issuedAt * 1000).toISOString() ||
    binding.expiresAt !== new Date(claims.expiresAt * 1000).toISOString()) {
    fail('LOCAL_SANDBOX_REQUEST_BINDING_INVALID')
  }
  const introspectionValue = await input.centralIntrospection.introspect({
    nativeSessionIdHash: binding.nativeSessionIdHash,
    expectedJoinDigest: binding.joinDigest,
  })
  const introspection = parseCentralIntrospection(introspectionValue)
  assertIntrospectionMatches(binding, introspection)
  return createAdmission(input.token, input.expected)
}
