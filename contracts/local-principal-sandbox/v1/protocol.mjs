import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const LOCAL_SANDBOX_VERSION = 'jenfu.local-principal-sandbox.v1'
export const LOCAL_FIXTURE_VERSION = 'jenfu.local-principal-fixtures.v1'
export const LOCAL_PORTAL_COOKIE = 'jenfu_local_portal_session'
export const MAX_BODY_BYTES = 8192
export const APPLICATION_IDS = Object.freeze(['orgmaster', 'ai-pdm', 'financial-management-system'])
export const CLIENT_APPLICATIONS = Object.freeze({ orgmaster: 'orgmaster', 'ai-pdm': 'ai-pdm', fms: 'financial-management-system' })
export const LOCAL_IDENTITY_ISSUER = 'urn:jenfu:local-principal-sandbox'
const HASH = /^[a-f0-9]{64}$/
const NONCE = /^[A-Za-z0-9_-]{22,128}$/
const IDENTIFIER = /^[a-z][a-z0-9-]{2,63}$/
const LOCAL_ERROR_BRAND = Symbol.for('jenfu.local-principal-sandbox.error.v1')

export class LocalSandboxError extends Error {
  constructor(code, status = 400) {
    super(code)
    this.name = 'LocalSandboxError'
    this.code = code
    this.status = status
    Object.defineProperty(this, LOCAL_ERROR_BRAND, { value: true })
  }
  // Cached native runtimes may outlive a development module instance.
  static [Symbol.hasInstance](value) {
    return value instanceof Error && value[LOCAL_ERROR_BRAND] === true
  }
}

export function canonicalJson(value) {
  function normalize(input, depth) {
    if (depth > 24) throw new LocalSandboxError('local_contract_invalid', 409)
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (Array.isArray(input)) return input.map(entry => normalize(entry, depth + 1))
    if (input && Object.getPrototypeOf(input) === Object.prototype) {
      const result = Object.create(null)
      for (const key of Object.keys(input).sort()) result[key] = normalize(input[key], depth + 1)
      return result
    }
    throw new LocalSandboxError('local_contract_invalid', 409)
  }
  return JSON.stringify(normalize(value, 0))
}

export function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
export function contractDigest(value) { return sha256(canonicalJson(value)) }
export function constantEquals(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const a = Buffer.from(left), b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function isLoopbackHost(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(host).toLowerCase())
}
export function requireLoopbackOrigin(input) {
  let url
  try { url = new URL(input) } catch { throw new LocalSandboxError('local_origin_invalid') }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
    url.origin !== input) throw new LocalSandboxError('local_origin_invalid')
  return url.origin
}

export function readLocalSandboxConfig(environment, applicationId = 'portal') {
  if (environment.JENFU_LOCAL_SANDBOX_ENABLED !== '1') throw new LocalSandboxError('local_sandbox_disabled', 404)
  if (environment.NODE_ENV !== 'development' || environment.K_SERVICE || environment.K_REVISION ||
    environment.FUNCTION_TARGET || environment.FIREBASE_CONFIG) {
    throw new LocalSandboxError('local_sandbox_disabled', 404)
  }
  if (applicationId !== 'portal' && !APPLICATION_IDS.includes(applicationId)) throw new LocalSandboxError('local_client_invalid')
  const sandboxId = environment.JENFU_LOCAL_SANDBOX_ID
  if (!IDENTIFIER.test(sandboxId ?? '')) throw new LocalSandboxError('local_target_invalid', 503)
  const origin = requireLoopbackOrigin(environment.JENFU_LOCAL_SANDBOX_ORIGIN)
  const platformOrigin = requireLoopbackOrigin(environment.JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN)
  const bindHost = environment.JENFU_LOCAL_SANDBOX_BIND_HOST
  if (!isLoopbackHost(bindHost)) throw new LocalSandboxError('local_bind_invalid', 503)
  let database
  try { database = new URL(environment.JENFU_LOCAL_SANDBOX_DATABASE_URL) } catch { throw new LocalSandboxError('local_target_invalid', 503) }
  const databaseName = 'jenfu_local_' + sandboxId.replaceAll('-', '_')
  if (databaseName.length > 63) throw new LocalSandboxError('local_target_invalid', 503)
  if (!['postgres:', 'postgresql:'].includes(database.protocol) || !isLoopbackHost(database.hostname) ||
    database.pathname !== '/' + databaseName || database.search || database.hash ||
    !database.username || !database.password) throw new LocalSandboxError('local_target_invalid', 503)
  const runtimeRole = environment.JENFU_LOCAL_SANDBOX_RUNTIME_ROLE
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(runtimeRole ?? '') ||
    decodeURIComponent(database.username) !== runtimeRole) throw new LocalSandboxError('local_target_invalid', 503)
  return Object.freeze({ contractVersion: LOCAL_SANDBOX_VERSION, applicationId, sandboxId, origin,
    platformOrigin, bindHost, databaseName, runtimeRole, databaseUrl: database.href })
}

// listenAddress is an OS/launcher-verified bound address, never a request header or
// a caller-supplied flag. Runtime composition must provide it before using a route.
export function assertLocalSandboxRequest(request, config, { browserMutation = false, listenAddress } = {}) {
  if (!isLoopbackHost(listenAddress)) throw new LocalSandboxError('local_bind_unverified', 503)
  const url = new URL(request.url)
  if (url.origin !== config.origin || !isLoopbackHost(url.hostname)) throw new LocalSandboxError('local_origin_invalid', 403)
  const host = request.headers.get('host')
  if (host && host.toLowerCase() !== url.host.toLowerCase()) throw new LocalSandboxError('local_origin_invalid', 403)
  if (request.headers.has('forwarded')) throw new LocalSandboxError('local_proxy_not_allowed', 403)
  // Next.js supplies these even without an upstream proxy. They may agree
  // with an already verified local request; they never establish its origin.
  for (const [name, expected] of [
    ['x-forwarded-host', url.host.toLowerCase()],
    ['x-forwarded-proto', url.protocol.slice(0, -1)],
    ['x-forwarded-port', url.port || (url.protocol === 'https:' ? '443' : '80')],
  ]) {
    const value = request.headers.get(name)
    if (value !== null && value.toLowerCase() !== expected) throw new LocalSandboxError('local_proxy_not_allowed', 403)
  }
  const peer = request.headers.get('x-forwarded-for')
  if (peer !== null && !isLoopbackHost(peer) && peer !== '::ffff:127.0.0.1' && peer !== '::ffff:7f00:1') {
    throw new LocalSandboxError('local_proxy_not_allowed', 403)
  }
  if (browserMutation && request.headers.get('origin') !== config.origin) {
    throw new LocalSandboxError('local_origin_invalid', 403)
  }
  const fetchSite = request.headers.get('sec-fetch-site')
  if (browserMutation && fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new LocalSandboxError('local_origin_invalid', 403)
  }
}

export async function readLocalJsonBody(request) {
  if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('content-type') ?? '')) {
    throw new LocalSandboxError('local_json_required', 415)
  }
  const length = request.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) {
    throw new LocalSandboxError('local_request_too_large', 413)
  }
  const reader = request.body?.getReader()
  let bytes = 0
  const chunks = []
  if (!reader) throw new LocalSandboxError('local_request_invalid')
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new LocalSandboxError('local_request_too_large', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const buffer = Buffer.concat(chunks)
  let rawBody, value
  try { rawBody = new TextDecoder('utf-8', { fatal: true }).decode(buffer); value = JSON.parse(rawBody) }
  catch { throw new LocalSandboxError('local_request_invalid') }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new LocalSandboxError('local_request_invalid')
  return { rawBody, value }
}

function signingMessage({ method, path, audience, clientId, timestamp, nonce, rawBody }) {
  if (!['POST', 'GET'].includes(method) || !/^\/api\/local-sandbox\/[a-z-]+$/.test(path) ||
    !/^[a-z][a-z0-9-]{1,63}$/.test(clientId) || !Number.isSafeInteger(timestamp) || !NONCE.test(nonce) ||
    Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) throw new LocalSandboxError('local_request_invalid')
  requireLoopbackOrigin(audience)
  return [LOCAL_SANDBOX_VERSION, audience, method, path, sha256(rawBody), clientId, timestamp, nonce].join('\n')
}
function validKey(key) {
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/.test(key) || Buffer.from(key, 'base64url').byteLength < 32) {
    throw new LocalSandboxError('local_client_not_configured', 503)
  }
  return key
}
export function signLocalRequest(input, key) {
  return createHmac('sha256', Buffer.from(validKey(key), 'base64url')).update(signingMessage(input)).digest('hex')
}
export async function verifyLocalRequest(request, rawBody, { audience, resolveKey, consumeNonce, nowMs = Date.now() }) {
  const clientId = request.headers.get('x-jenfu-local-client') ?? ''
  const timestampText = request.headers.get('x-jenfu-local-timestamp') ?? ''
  const nonce = request.headers.get('x-jenfu-local-nonce') ?? ''
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^\d{13}$/.test(timestampText) || !Number.isSafeInteger(nowMs) ||
    Math.abs(nowMs - Number(timestampText)) > 30_000 || !authorization.startsWith('JenfuLocal ')) {
    throw new LocalSandboxError('local_client_invalid', 401)
  }
  const supplied = authorization.slice('JenfuLocal '.length)
  if (!HASH.test(supplied)) throw new LocalSandboxError('local_client_invalid', 401)
  const url = new URL(request.url)
  if (url.origin !== audience || url.search) throw new LocalSandboxError('local_client_invalid', 401)
  const key = await resolveKey(clientId)
  if (!key) throw new LocalSandboxError('local_client_invalid', 401)
  let expected
  try { expected = signLocalRequest({ method: request.method, path: url.pathname, audience,
    clientId, timestamp: Number(timestampText), nonce, rawBody }, key) }
  catch (error) { if (error instanceof LocalSandboxError && error.status === 503) throw error; throw new LocalSandboxError('local_client_invalid', 401) }
  if (!constantEquals(supplied, expected)) throw new LocalSandboxError('local_client_invalid', 401)
  if (!await consumeNonce({ clientId, nonce, expiresAt: new Date(nowMs + 60_000).toISOString() })) {
    throw new LocalSandboxError('local_request_replayed', 409)
  }
  return clientId
}

export function assertExactKeys(value, keys, code = 'local_contract_invalid') {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Object.keys(value).length !== keys.length ||
    !keys.every(key => Object.hasOwn(value, key))) throw new LocalSandboxError(code, code === 'local_request_invalid' ? 400 : 409)
}
export function assertFixtureEnvelope(fixture) {
  assertExactKeys(fixture, ['contractVersion', 'fixtureVersion', 'fixtureHash', 'scenarios'])
  if (fixture.contractVersion !== LOCAL_FIXTURE_VERSION || typeof fixture.fixtureVersion !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(fixture.fixtureVersion) || !HASH.test(fixture.fixtureHash) ||
    !Array.isArray(fixture.scenarios) || fixture.scenarios.length < 1 || fixture.scenarios.length > 128) {
    throw new LocalSandboxError('local_fixture_invalid', 409)
  }
  const { fixtureHash, ...payload } = fixture
  if (!constantEquals(contractDigest(payload), fixtureHash)) throw new LocalSandboxError('local_fixture_mismatch', 409)
  const seen = new Set()
  for (const scenario of fixture.scenarios) {
    assertExactKeys(scenario, ['scenarioId', 'label', 'principalId', 'employeeId', 'identityIssuer', 'identitySubject',
      'accountType', 'principalStatus', 'employeeStatus', 'accountLifecycleVersion', 'profileVersion', 'grants'])
    if (!IDENTIFIER.test(scenario.scenarioId) || seen.has(scenario.scenarioId) ||
      !/^local-[a-z0-9-]{1,100}$/.test(scenario.principalId) || !/^employee-local-[a-z0-9-]{1,100}$/.test(scenario.employeeId) ||
      scenario.identityIssuer !== LOCAL_IDENTITY_ISSUER || !/^local-[a-z0-9-]{1,100}$/.test(scenario.identitySubject) ||
      !['human_personal', 'human_privileged'].includes(scenario.accountType) ||
      !['active', 'disabled', 'revoked'].includes(scenario.principalStatus) ||
      !['active', 'inactive'].includes(scenario.employeeStatus) ||
      typeof scenario.label !== 'string' || scenario.label.length < 1 || scenario.label.length > 120 ||
      !Number.isSafeInteger(scenario.accountLifecycleVersion) || scenario.accountLifecycleVersion < 1 ||
      !Number.isSafeInteger(scenario.profileVersion) || scenario.profileVersion < 1 ||
      !Array.isArray(scenario.grants) || scenario.grants.length > 32) throw new LocalSandboxError('local_fixture_invalid', 409)
    seen.add(scenario.scenarioId)
    for (const grant of scenario.grants) {
      assertExactKeys(grant, ['applicationId', 'companyId', 'stableRoleId', 'catalogVersion', 'catalogSha256',
        'roleDefinitionHash', 'scopeKind', 'scopeRef', 'grantVersion', 'status', 'validFrom', 'validUntil'])
      if (!APPLICATION_IDS.includes(grant.applicationId) || ![grant.companyId, grant.stableRoleId, grant.catalogVersion, grant.scopeKind].every(x => typeof x === 'string' && x.length > 0 && x.length <= 255) ||
        !HASH.test(grant.catalogSha256) || !HASH.test(grant.roleDefinitionHash) ||
        !(grant.scopeRef === null || typeof grant.scopeRef === 'string' && grant.scopeRef.length <= 255) ||
        !Number.isSafeInteger(grant.grantVersion) || grant.grantVersion < 1 || !['active', 'revoked'].includes(grant.status) ||
        !Number.isFinite(Date.parse(grant.validFrom)) || !(grant.validUntil === null || Number.isFinite(Date.parse(grant.validUntil))) ||
        grant.validUntil !== null && Date.parse(grant.validUntil) <= Date.parse(grant.validFrom)) {
        throw new LocalSandboxError('local_fixture_invalid', 409)
      }
    }
  }
  return fixture
}
export function activeScenarioGrants(fixture, scenarioId, applicationId, nowMs = Date.now()) {
  assertFixtureEnvelope(fixture)
  if (!APPLICATION_IDS.includes(applicationId) || !Number.isSafeInteger(nowMs)) throw new LocalSandboxError('local_contract_invalid', 409)
  const scenario = fixture.scenarios.find(x => x.scenarioId === scenarioId)
  if (!scenario || scenario.principalStatus !== 'active' || scenario.employeeStatus !== 'active') {
    throw new LocalSandboxError('local_principal_inactive', 403)
  }
  const grants = scenario.grants.filter(x => x.applicationId === applicationId && x.status === 'active' &&
    Date.parse(x.validFrom) <= nowMs && (x.validUntil === null || Date.parse(x.validUntil) > nowMs))
  if (!grants.length) throw new LocalSandboxError('local_access_denied', 403)
  return { scenario, grants }
}

export function localJoinDigest(assertion) {
  const { issuedAt, expiresAt, joinDigest, ...binding } = assertion
  return contractDigest(binding)
}
export function validateLocalAssertion(assertion, expected, nowMs = Date.now()) {
  assertExactKeys(assertion, ['contractVersion', 'registrationId', 'portalSessionId', 'sandboxId', 'generation',
    'fixtureVersion', 'fixtureHash', 'applicationId', 'nativeSessionContractVersion', 'scenarioId',
    'principalId', 'employeeId', 'identityIssuer', 'identitySubject', 'accountType',
    'accountLifecycleVersion', 'profileVersion', 'grants', 'authEpoch', 'sourceSessionExpiresAt',
    'authenticatedAt', 'assuranceLevel', 'secondFactor', 'assurancePolicyHash', 'assuranceSource',
    'issuedAt', 'expiresAt', 'joinDigest'])
  if (assertion.contractVersion !== LOCAL_SANDBOX_VERSION || assertion.applicationId !== expected.applicationId ||
    assertion.sandboxId !== expected.sandboxId || assertion.fixtureVersion !== expected.fixtureVersion ||
    !constantEquals(assertion.fixtureHash, expected.fixtureHash) ||
    assertion.generation !== expected.generation || assertion.nativeSessionContractVersion !== expected.nativeSessionContractVersion ||
    !/^[a-f0-9-]{36}$/.test(assertion.registrationId) || !/^[a-f0-9-]{36}$/.test(assertion.portalSessionId) ||
    !/^[a-f0-9-]{36}$/.test(assertion.generation) ||
    !Number.isSafeInteger(assertion.authEpoch) || assertion.authEpoch < 0 ||
    !Number.isSafeInteger(nowMs) || assertion.assuranceSource !== 'synthetic' ||
    !((assertion.assuranceLevel === 'aal1' && assertion.secondFactor === null) ||
      (assertion.assuranceLevel === 'aal2' && assertion.secondFactor === 'totp' &&
        expected.allowSyntheticAal2 === true && expected.assurancePolicyHash === assertion.assurancePolicyHash)) ||
    // Enabling one explicit synthetic AAL2 policy still admits the shared
    // default AAL1 policy. Any other policy hash remains an exact binding.
    expected.assurancePolicyHash !== undefined && expected.assurancePolicyHash !== assertion.assurancePolicyHash &&
      !(expected.allowSyntheticAal2 === true && assertion.assuranceLevel === 'aal1' &&
        assertion.assurancePolicyHash === contractDigest({ profile: LOCAL_SANDBOX_VERSION, assurance: 'synthetic-aal1' })) ||
    !HASH.test(assertion.assurancePolicyHash) || !HASH.test(assertion.joinDigest)) {
    throw new LocalSandboxError('local_assertion_invalid', 409)
  }
  const scenario = { scenarioId: assertion.scenarioId, label: 'local assertion',
    principalId: assertion.principalId, employeeId: assertion.employeeId,
    identityIssuer: assertion.identityIssuer, identitySubject: assertion.identitySubject,
    accountType: assertion.accountType, principalStatus: 'active', employeeStatus: 'active',
    accountLifecycleVersion: assertion.accountLifecycleVersion, profileVersion: assertion.profileVersion, grants: assertion.grants }
  const payload = { contractVersion: LOCAL_FIXTURE_VERSION, fixtureVersion: assertion.fixtureVersion, scenarios: [scenario] }
  activeScenarioGrants({ ...payload, fixtureHash: contractDigest(payload) }, assertion.scenarioId, assertion.applicationId, nowMs)
  if (assertion.grants.some(x => x.applicationId !== assertion.applicationId)) throw new LocalSandboxError('local_assertion_invalid', 409)
  const issuedAt = Date.parse(assertion.issuedAt), expiresAt = Date.parse(assertion.expiresAt)
  const authenticatedAt = Date.parse(assertion.authenticatedAt), parentExpires = Date.parse(assertion.sourceSessionExpiresAt)
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || !Number.isFinite(authenticatedAt) ||
    !Number.isFinite(parentExpires) || issuedAt > nowMs + 30_000 || expiresAt <= nowMs ||
    expiresAt <= issuedAt || expiresAt - issuedAt > 60_000 || expiresAt > parentExpires ||
    authenticatedAt > issuedAt || !constantEquals(localJoinDigest(assertion), assertion.joinDigest)) {
    throw new LocalSandboxError('local_assertion_invalid', 409)
  }
  return assertion
}
export function signLocalResponse({ rawBody, nonce, audience, clientId }, key) {
  if (!NONCE.test(nonce) || typeof clientId !== 'string' || !/^[a-z][a-z0-9-]{1,63}$/.test(clientId) ||
    typeof rawBody !== 'string' || Buffer.byteLength(rawBody, 'utf8') > 65536) throw new LocalSandboxError('local_response_invalid', 503)
  requireLoopbackOrigin(audience)
  return createHmac('sha256', Buffer.from(validKey(key), 'base64url'))
    .update([LOCAL_SANDBOX_VERSION, 'response', audience, clientId, nonce, sha256(rawBody)].join('\n')).digest('hex')
}
export function verifyLocalResponse(input, key, signature) {
  if (!HASH.test(signature ?? '') || !constantEquals(signLocalResponse(input, key), signature)) {
    throw new LocalSandboxError('local_response_invalid', 503)
  }
}
