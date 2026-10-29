import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import {
  LOCAL_IDENTITY_ISSUER,
  LOCAL_SANDBOX_VERSION,
  localJoinDigest,
  readLocalSandboxConfig,
  signLocalResponse,
  verifyLocalRequest,
  type LocalAssertion
} from '../contracts/local-principal-sandbox/v1/protocol.mjs'
import { createLocalSandboxClient } from '../contracts/local-principal-sandbox/v1/client.mjs'
import {
  isLocalSandboxPrincipalRequestAdmission,
  issueLocalSandboxPrincipalSession,
  LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY,
  resolveLocalSandboxPrincipalRequestAdmission,
  type LocalSandboxCentralRegistrationResult,
  type LocalSandboxNativeTargetReadback,
  type LocalSandboxPrincipalSessionBinding,
  type LocalSandboxPrincipalSessionExpected,
  type LocalSandboxPrincipalSessionPorts
} from '../src/lib/local-sandbox-principal-session.ts'
import { principalAssurancePolicyHash } from '../src/lib/jenfu-principal-assurance.ts'
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from '../src/lib/jenfu-principal-session.ts'
import type { AsyncDatabaseClient } from '../src/lib/db-async-provider.ts'
import { createLocalPrincipalSessionKeyRing } from '../src/lib/local-sandbox-principal-runtime.ts'

const SANDBOX_ID = 'dev126-local-sandbox'
const DATABASE_NAME = 'jenfu_local_dev126_local_sandbox'
const GENERATION = '00000000-0000-4000-8000-000000000001'
const FIXTURE_VERSION = 'principal-fixture.v1'
const FIXTURE_HASH = 'b'.repeat(64)
const TARGET_FINGERPRINT = 'a'.repeat(64)
const RESPONSE_KEY = 'Q'.repeat(43)
const KEY_RING = {
  issuer: 'ai-pdm-local-principal-sandbox', audience: 'ai-pdm', currentKeyId: 'local',
  keys: { local: 'k'.repeat(48) }
}
const NOW_MS = Date.parse('2026-10-29T12:00:00.000Z')

let tempRoot: string
let sandboxRoot: string
let dataDirectory: string
let repositoryDirectory: string
let environment: Record<string, string | undefined>

before(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'aipdm-dev126-local-session-'))
  sandboxRoot = path.join(tempRoot, 'sandbox')
  dataDirectory = path.join(sandboxRoot, 'data')
  repositoryDirectory = path.join(sandboxRoot, 'repository')
  await mkdir(sandboxRoot)
  await Promise.all([mkdir(dataDirectory), mkdir(repositoryDirectory)])
  environment = {
    NODE_ENV: 'development',
    PDM_AUTH_MODE: 'firebase_bff',
    PDM_JENFU_PLATFORM_AUTH_MODE: 'on',
    PDM_JENFU_ENTITLEMENT_MODE: 'enforce',
    PDM_LOCAL_PRINCIPAL_SANDBOX: '1',
    JENFU_LOCAL_SANDBOX_ENABLED: '1',
    JENFU_LOCAL_SANDBOX_ID: SANDBOX_ID,
    JENFU_LOCAL_SANDBOX_ORIGIN: 'http://127.0.0.1:12020',
    JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN: 'http://127.0.0.1:12000',
    JENFU_LOCAL_SANDBOX_BIND_HOST: '127.0.0.1',
    JENFU_LOCAL_SANDBOX_DATABASE_URL: `postgresql://local_runtime:fake_local_password@127.0.0.1:5432/${DATABASE_NAME}`,
    JENFU_LOCAL_SANDBOX_RUNTIME_ROLE: 'local_runtime',
    JENFU_LOCAL_SANDBOX_ROOT: sandboxRoot,
    PDM_DATA_DIR: dataDirectory,
    PDM_REPOSITORY_DIR: repositoryDirectory,
  }
})

after(async () => {
  if (!tempRoot) return
  const resolvedTemp = await realpath(tempRoot)
  const resolvedOsTemp = await realpath(os.tmpdir())
  assert.equal(path.dirname(resolvedTemp), resolvedOsTemp)
  assert.match(path.basename(resolvedTemp), /^aipdm-dev126-local-session-/)
  await rm(resolvedTemp, { recursive: true, force: true })
})

test('local session keyring uses its dedicated synthetic profile key and rejects Platform key reuse', () => {
  const secret = Buffer.alloc(32, 17).toString('base64url')
  const platformKey = Buffer.alloc(32, 29).toString('base64url')
  const ring = createLocalPrincipalSessionKeyRing({
    principalSessionKey: { keyId: 'dev126-local', secret },
    platformClient: { clientId: 'ai-pdm', key: platformKey },
  })
  assert.deepEqual(ring, {
    issuer: 'ai-pdm-local-principal-sandbox', audience: 'ai-pdm', currentKeyId: 'dev126-local',
    keys: { 'dev126-local': secret },
  })
  assert.throws(() => createLocalPrincipalSessionKeyRing({
    principalSessionKey: { keyId: 'dev126-local', secret },
    platformClient: { clientId: 'ai-pdm', key: secret },
  }), /LOCAL_SANDBOX_SESSION_KEY_INVALID/)
})

function expected(overrides: Partial<LocalSandboxPrincipalSessionExpected> = {}): LocalSandboxPrincipalSessionExpected {
  return {
    applicationId: 'ai-pdm',
    sandboxId: SANDBOX_ID,
    generation: GENERATION,
    fixtureVersion: FIXTURE_VERSION,
    fixtureHash: FIXTURE_HASH,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
    targetFingerprint: TARGET_FINGERPRINT,
    catalogBindings: [{ catalogVersion: 'ai-pdm.role-catalog.local.v7', catalogSha256: 'c'.repeat(64),
      stableRoleId: 'role-rd', roleDefinitionHash: 'd'.repeat(64), companyId: 'company-jenfu',
      scopeKind: 'workspace', scopeRef: 'company-jenfu' }],
    ...overrides,
  }
}

function assertion(overrides: Record<string, unknown> = {}) {
  const grants = [{
    applicationId: 'ai-pdm',
    companyId: 'company-jenfu',
    stableRoleId: 'role-rd',
    catalogVersion: 'ai-pdm.role-catalog.local.v7',
    catalogSha256: 'c'.repeat(64),
    roleDefinitionHash: 'd'.repeat(64),
    scopeKind: 'workspace',
    scopeRef: 'company-jenfu',
    grantVersion: 1,
    status: 'active',
    validFrom: new Date(NOW_MS - 60_000).toISOString(),
    validUntil: null,
  }]
  const value: Record<string, unknown> = {
    contractVersion: LOCAL_SANDBOX_VERSION,
    registrationId: '00000000-0000-4000-8000-000000000101',
    portalSessionId: '00000000-0000-4000-8000-000000000102',
    sandboxId: SANDBOX_ID,
    generation: GENERATION,
    fixtureVersion: FIXTURE_VERSION,
    fixtureHash: FIXTURE_HASH,
    applicationId: 'ai-pdm',
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
    scenarioId: 'local-rd-user',
    principalId: 'local-principal-rd',
    employeeId: 'employee-local-rd',
    identityIssuer: LOCAL_IDENTITY_ISSUER,
    identitySubject: 'local-rd-user',
    accountType: 'human_personal',
    accountLifecycleVersion: 1,
    profileVersion: 1,
    grants,
    authEpoch: 0,
    sourceSessionExpiresAt: new Date(NOW_MS + 120_000).toISOString(),
    authenticatedAt: new Date(NOW_MS - 1_000).toISOString(),
    assuranceLevel: 'aal1',
    secondFactor: null,
    assurancePolicyHash: 'f'.repeat(64),
    assuranceSource: 'synthetic',
    issuedAt: new Date(NOW_MS).toISOString(),
    expiresAt: new Date(NOW_MS + 60_000).toISOString(),
    joinDigest: '',
    ...overrides,
  }
  value.joinDigest = localJoinDigest(value as unknown as LocalAssertion)
  return value
}

function signedAssertion(value: Record<string, unknown>, nonce = 'n'.repeat(32)) {
  const rawBody = JSON.stringify(value)
  const audience = 'http://127.0.0.1:12000'
  const clientId = 'ai-pdm'
  return {
    expectedNonce: nonce,
    signedResponse: { rawBody, nonce, audience, clientId,
      signature: signLocalResponse({ rawBody, nonce, audience, clientId }, RESPONSE_KEY) }
  }
}

function request(method = 'POST', route = '/api/auth/local-quick-login', origin = 'http://127.0.0.1:12020') {
  return new Request(`${origin}${route}`, {
    method,
    headers: {
      host: new URL(origin).host,
      ...(method === 'POST' ? { origin, 'sec-fetch-site': 'same-origin' } : {}),
    },
    ...(method === 'POST' ? { body: '{}' } : {}),
  })
}

function harness(options: {
  registrationFailure?: boolean
  introspectionFailure?: boolean
  introspectionOverride?: Record<string, unknown>
  invalidIntrospectionSignature?: boolean
  nativeAccountLifecycleVersion?: number
  nativeProfileVersion?: number
} = {}) {
  let registeredRow: Record<string, unknown> | null = null
  const bindings = new Map<string, LocalSandboxPrincipalSessionBinding>()
  const events: string[] = []
  let database!: AsyncDatabaseClient
  database = {
    kind: 'postgres',
    query: async <T>() => [] as T[],
    queryOne: async <T>(sql: string): Promise<T | null> => {
      if (sql.includes('SELECT current_database()')) return { database_name: DATABASE_NAME } as T
      if (sql.includes('FROM ai_pdm_core.principal_session_records')) {
        events.push('native_session_readback')
        return registeredRow as T | null
      }
      return null
    },
    execute: async () => {},
    transaction: async <T>(callback: (client: AsyncDatabaseClient) => T | Promise<T>) => callback(database),
    close: async () => {},
  }
  const target: LocalSandboxNativeTargetReadback = {
    applicationId: 'ai-pdm',
    sandboxId: SANDBOX_ID,
    databaseName: DATABASE_NAME,
    sandboxRoot,
    dataDirectory,
    repositoryDirectory,
    generation: GENERATION,
    fixtureVersion: FIXTURE_VERSION,
    fixtureHash: FIXTURE_HASH,
    nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
    targetFingerprint: TARGET_FINGERPRINT,
  }
  const localConfig = readLocalSandboxConfig(environment, 'ai-pdm')
  const consumedPlatformNonces = new Set<string>()
  const platformClient = createLocalSandboxClient({
    config: localConfig,
    clientId: 'ai-pdm',
    key: RESPONSE_KEY,
    fetch: async (input, init) => {
      const platformRequest = new Request(input, init)
      const url = new URL(platformRequest.url)
      const rawRequestBody = await platformRequest.clone().text()
      const requestClientId = await verifyLocalRequest(platformRequest, rawRequestBody, {
        audience: localConfig.platformOrigin,
        resolveKey: (clientId) => clientId === 'ai-pdm' ? RESPONSE_KEY : null,
        consumeNonce: async ({ nonce }) => {
          if (consumedPlatformNonces.has(nonce)) return false
          consumedPlatformNonces.add(nonce)
          return true
        },
      })
      assert.equal(requestClientId, 'ai-pdm')
      const requestBody = JSON.parse(rawRequestBody) as Record<string, unknown>
      let responseStatus = 200
      let responseValue: Record<string, unknown>
      if (url.pathname === '/api/local-sandbox/register') {
        assert.deepEqual(Object.keys(requestBody).sort(), ['idempotencyKey', 'joinDigest', 'nativeSessionIdHash', 'registrationId'])
        assert.match(String(requestBody.idempotencyKey), /^ai-pdm-local-registration-v1_[a-f0-9]{64}$/u)
        if (options.registrationFailure) {
          responseStatus = 503
          responseValue = { code: 'local_dependency_unavailable', correlationId: 'central-register-503' }
        } else {
          responseValue = {
            active: true,
            registrationId: requestBody.registrationId,
            joinDigest: requestBody.joinDigest,
            correlationId: 'central-registration-correlation-001',
          }
        }
      } else {
        assert.equal(url.pathname, '/api/local-sandbox/introspect')
        assert.deepEqual(Object.keys(requestBody).sort(), ['joinDigest', 'nativeSessionIdHash'])
        events.push('central_introspection')
        const storedBinding = [...bindings.values()].find((binding) =>
          binding.nativeSessionIdHash === requestBody.nativeSessionIdHash)
        assert.ok(storedBinding)
        assert.equal(requestBody.joinDigest, storedBinding.joinDigest)
        if (options.introspectionFailure) {
          responseStatus = 503
          responseValue = { code: 'local_dependency_unavailable', correlationId: 'central-introspect-503' }
        } else {
          responseValue = {
            active: true,
            registrationId: storedBinding.registrationId,
            portalSessionId: storedBinding.portalSessionId,
            joinDigest: storedBinding.joinDigest,
            generation: storedBinding.generation,
            authEpoch: storedBinding.authEpoch,
            expiresAt: storedBinding.portalSessionExpiresAt,
            correlationId: 'central-introspection-correlation-001',
            ...options.introspectionOverride,
          }
        }
      }
      const rawBody = JSON.stringify(responseValue)
      const nonce = platformRequest.headers.get('x-jenfu-local-nonce')
      const signature = signLocalResponse({ rawBody, nonce: nonce!, audience: localConfig.platformOrigin,
        clientId: 'ai-pdm' }, RESPONSE_KEY) +
        (url.pathname.endsWith('/introspect') && options.invalidIntrospectionSignature ? 'x' : '')
      return new Response(rawBody, { status: responseStatus, headers: {
        'content-type': 'application/json; charset=utf-8',
        'x-jenfu-local-response-signature': signature,
      } })
    },
  })
  const ports: LocalSandboxPrincipalSessionPorts = {
    targetReader: { readCurrentTarget: async () => target },
    nativeSessionReadback: {
      hashSessionId: (sessionId) => crypto.createHash('sha256').update(`pdm-principal-session-v2:${sessionId}`).digest('hex'),
      isActive: async (_database, claims, nowMs) => {
        const row = await database.queryOne<Record<string, unknown>>(
          'SELECT * FROM ai_pdm_core.principal_session_records WHERE principal_id=:principalId'
        )
        return Boolean(row && row.principal_id === claims.principalId &&
          Number(row.principal_auth_epoch) === claims.authEpoch &&
          Number(row.lifecycle_version) === claims.accountLifecycleVersion &&
          Number(row.profile_version) === claims.profileVersion &&
          new Date(String(row.authenticated_at)).getTime() === claims.authenticatedAt * 1000 &&
          new Date(String(row.issued_at)).getTime() === claims.issuedAt * 1000 &&
          new Date(String(row.expires_at)).getTime() === claims.expiresAt * 1000 &&
          new Date(String(row.expires_at)).getTime() > nowMs && row.revoked_at === null &&
          row.assurance_level === claims.assuranceLevel && row.assurance_policy_hash === claims.assurancePolicyHash)
      },
    },
    binding: {
      writePending: async (binding) => { events.push('binding_pending'); bindings.set(binding.nativeSessionIdHash, binding) },
      readByNativeSessionIdHash: async (hash) => bindings.get(hash) ?? null,
      markCentralRegistered: async (input) => {
        events.push('binding_registered')
        const prior = bindings.get(input.nativeSessionIdHash)
        if (!prior || prior.registrationId !== input.registrationId) throw new Error('binding not found')
        bindings.set(input.nativeSessionIdHash, Object.freeze({ ...prior,
          status: 'central_registered', centralCorrelationId: input.correlationId,
          centralRegistrationObservedAt: input.observedAt }))
      },
      markRevoked: async (input) => {
        const prior = bindings.get(input.nativeSessionIdHash)
        if (!prior || prior.registrationId !== input.registrationId) throw new Error('binding not found')
        bindings.set(input.nativeSessionIdHash, Object.freeze({ ...prior, status: 'revoked' }))
      },
    },
    centralRegistration: {
      registerOrReadBack: async (binding): Promise<LocalSandboxCentralRegistrationResult> => {
        events.push('central_register')
        return await platformClient.register({ registrationId: binding.registrationId,
          nativeSessionIdHash: binding.nativeSessionIdHash, joinDigest: binding.joinDigest,
          idempotencyKey: binding.idempotencyKey }) as LocalSandboxCentralRegistrationResult
      },
    },
    centralIntrospection: platformClient,
    resolvePlatformResponseKey: async (clientId) => clientId === 'ai-pdm' ? RESPONSE_KEY : null,
    issueSessionForPrincipalHandoff: async (input) => {
      events.push('native_issue')
      assert.equal(input.expectedIdentityIssuer, LOCAL_IDENTITY_ISSUER)
      assert.equal(input.handoff.authentication.email, 'local-rd-user@local.invalid')
      assert.equal(input.handoff.authentication.emailVerified, true)
      assert.equal(input.handoff.authentication.signInProvider, 'jenfu.local.synthetic')
      assert.deepEqual(input.trustPolicy, LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY)
      const nowSeconds = Math.floor(NOW_MS / 1000)
      const token = issueJenfuPrincipalSession({
        principalId: input.handoff.identity.principalId,
        employeeId: input.handoff.identity.employeeId,
        identityIssuer: input.handoff.identity.identityIssuer,
        identitySubject: input.handoff.identity.identitySubject,
        authEpoch: input.handoff.authState.authEpoch,
        accountLifecycleVersion: options.nativeAccountLifecycleVersion ?? 1,
        profileVersion: options.nativeProfileVersion ?? 1,
        companyId: 'company-jenfu',
        authenticatedAt: Math.floor(Date.parse(input.handoff.authentication.authenticatedAt) / 1000),
        assuranceLevel: input.handoff.authentication.assuranceLevel,
        secondFactor: input.handoff.authentication.secondFactor,
        assurancePolicyHash: principalAssurancePolicyHash(LOCAL_SANDBOX_PRINCIPAL_TRUST_POLICY),
        maxAgeSeconds: 60,
      }, KEY_RING, nowSeconds)
      const claims = verifyJenfuPrincipalSession(token, KEY_RING, { nowSeconds })
      registeredRow = {
        principal_id: claims.principalId,
        principal_auth_epoch: claims.authEpoch,
        lifecycle_version: claims.accountLifecycleVersion,
        profile_version: claims.profileVersion,
        authenticated_at: new Date(claims.authenticatedAt * 1000),
        issued_at: new Date(claims.issuedAt * 1000),
        expires_at: new Date(claims.expiresAt * 1000),
        revoked_at: null,
        assurance_level: claims.assuranceLevel,
        assurance_policy_hash: claims.assurancePolicyHash,
      }
      return { token, claims }
    },
  }
  return { database, ports, events, bindings }
}

function issueInput(value: Record<string, unknown>, expectedPins = expected(), setup = harness()) {
  return {
    request: request(),
    environment,
    listenAddress: '127.0.0.1',
    expected: expectedPins,
    ...signedAssertion(value),
    database: setup.database,
    keyRing: KEY_RING,
    ports: setup.ports,
    nowMs: NOW_MS,
  }
}

test('issues only after assertion verification, actual target checks, native commit readback, binding readback, and central registration', async () => {
  const setup = harness()
  const result = await issueLocalSandboxPrincipalSession(issueInput(assertion(), expected(), setup))
  assert.equal(environment.JENFU_LOCAL_SANDBOX_ORIGIN, 'http://127.0.0.1:12020')
  assert.equal(environment.JENFU_LOCAL_SANDBOX_PLATFORM_ORIGIN, 'http://127.0.0.1:12000')
  assert.equal(result.claims.identityIssuer, LOCAL_IDENTITY_ISSUER)
  assert.equal(result.claims.companyId, 'company-jenfu')
  assert.ok(result.binding)
  assert.equal(result.binding.status, 'central_registered')
  assert.equal(result.binding.joinDigest, assertion().joinDigest)
  assert.match(result.binding.idempotencyKey, /^ai-pdm-local-registration-v1_[a-f0-9]{64}$/u)
  assert.equal(result.binding.centralCorrelationId, 'central-registration-correlation-001')
  assert.equal(result.binding.centralRegistrationObservedAt, new Date(NOW_MS).toISOString())
  assert.ok(setup.events.indexOf('native_session_readback') < setup.events.indexOf('central_register'))
  assert.ok(setup.events.indexOf('central_register') < setup.events.indexOf('binding_registered'))
  assert.equal(setup.bindings.size, 1)
  const replay = await issueLocalSandboxPrincipalSession(issueInput(assertion(), expected(), setup))
  assert.equal(replay.binding.idempotencyKey, result.binding.idempotencyKey)

  const admission = await resolveLocalSandboxPrincipalRequestAdmission({
    request: request('GET'), token: result.token, environment, listenAddress: '127.0.0.1',
    expected: expected(), database: setup.database, keyRing: KEY_RING,
    targetReader: setup.ports.targetReader, nativeSessionReadback: setup.ports.nativeSessionReadback,
    binding: setup.ports.binding, centralIntrospection: setup.ports.centralIntrospection,
    nowMs: NOW_MS + 20,
  })
  assert.equal(isLocalSandboxPrincipalRequestAdmission(admission, result.token), true)
  assert.equal(isLocalSandboxPrincipalRequestAdmission(admission, `${result.token}x`), false)
  await resolveLocalSandboxPrincipalRequestAdmission({
    request: request('GET'), token: result.token, environment, listenAddress: '127.0.0.1',
    expected: expected(), database: setup.database, keyRing: KEY_RING,
    targetReader: setup.ports.targetReader, nativeSessionReadback: setup.ports.nativeSessionReadback,
    binding: setup.ports.binding, centralIntrospection: setup.ports.centralIntrospection,
    nowMs: NOW_MS + 30,
  })
  assert.equal(setup.events.filter((event) => event === 'central_introspection').length, 2)
})

test('requires the explicit local lane, rejects formal identity configuration, target drift, and unpinned synthetic AAL2', async () => {
  const setup = harness()
  await assert.rejects(issueLocalSandboxPrincipalSession({
    ...issueInput(assertion(), expected(), setup),
    environment: { ...environment, PDM_LOCAL_PRINCIPAL_SANDBOX: undefined },
  }), /LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN/)
  await assert.rejects(issueLocalSandboxPrincipalSession({
    ...issueInput(assertion(), expected(), setup),
    environment: { ...environment, JENFU_IDENTITY_ISSUER: 'https://securetoken.google.com/formal-project' },
  }), /LOCAL_SANDBOX_FORMAL_AUTH_FORBIDDEN/)

  const originalTargetReader = setup.ports.targetReader
  setup.ports.targetReader = { readCurrentTarget: async () => ({
    ...await originalTargetReader.readCurrentTarget(setup.database), targetFingerprint: 'c'.repeat(64)
  }) }
  await assert.rejects(issueLocalSandboxPrincipalSession(issueInput(assertion(), expected(), setup)),
    /local_reset_target_invalid/)

  const aal2 = assertion({ assuranceLevel: 'aal2', secondFactor: 'totp' })
  const signedAal2 = issueInput(aal2, expected(), harness())
  await assert.rejects(issueLocalSandboxPrincipalSession(signedAal2), /LOCAL_SANDBOX_SYNTHETIC_AAL2_NOT_ALLOWED/)
})

test('rejects native session claims whose account lifecycle or profile version differs from the signed assertion', async () => {
  for (const value of [
    assertion({ accountLifecycleVersion: 2 }),
    assertion({ profileVersion: 2 }),
  ]) {
    const setup = harness()
    await assert.rejects(issueLocalSandboxPrincipalSession(issueInput(value, expected(), setup)),
      /LOCAL_SANDBOX_NATIVE_SESSION_MISMATCH/)
    assert.equal(setup.events.includes('central_register'), false)
  }
})

test('requires assertion grants to match the private AI-PDM catalog binding before native issue', async () => {
  const setup = harness()
  const mismatchedCatalog = expected({ catalogBindings: [{ catalogVersion: 'ai-pdm.role-catalog.local.v7',
    catalogSha256: '9'.repeat(64), stableRoleId: 'role-rd', roleDefinitionHash: 'd'.repeat(64),
    companyId: 'company-jenfu', scopeKind: 'workspace', scopeRef: 'company-jenfu' }] })
  await assert.rejects(issueLocalSandboxPrincipalSession(issueInput(assertion(), mismatchedCatalog, setup)),
    /LOCAL_SANDBOX_CATALOG_BINDING_MISMATCH/)
  assert.equal(setup.events.includes('native_issue'), false)
  assert.equal(setup.events.includes('central_register'), false)
})

test('permits synthetic AAL2 only with the exact expected policy hash and explicit local allow', async () => {
  const expectedPolicyHash = 'f'.repeat(64)
  const setup = harness()
  const result = await issueLocalSandboxPrincipalSession(issueInput(
    assertion({ assuranceLevel: 'aal2', secondFactor: 'totp' }),
    expected({ allowSyntheticAal2: true, assurancePolicyHash: expectedPolicyHash }), setup,
  ))
  assert.equal(result.claims.assuranceLevel, 'aal2')
  assert.equal(result.claims.secondFactor, 'totp')
})

test('does not return a session token when central registration fails', async () => {
  const setup = harness({ registrationFailure: true })
  await assert.rejects(issueLocalSandboxPrincipalSession(issueInput(assertion(), expected(), setup)), /local_sandbox_unavailable/)
  assert.equal(setup.events.includes('native_session_readback'), true)
  assert.equal(setup.events.includes('central_register'), true)
  assert.equal(setup.events.includes('binding_registered'), false)
  assert.equal([...setup.bindings.values()][0]?.status, 'pending_central_registration')
})

test('requires a fresh signed central introspection on every admission and fails closed on bad status or signature', async () => {
  for (const setup of [
    harness({ introspectionFailure: true }),
    harness({ introspectionOverride: { active: false } }),
    harness({ introspectionOverride: { generation: 'stale-generation' } }),
    harness({ invalidIntrospectionSignature: true }),
  ]) {
    const result = await issueLocalSandboxPrincipalSession(issueInput(assertion(), expected(), setup))
    await assert.rejects(resolveLocalSandboxPrincipalRequestAdmission({
      request: request('GET'), token: result.token, environment, listenAddress: '127.0.0.1',
      expected: expected(), database: setup.database, keyRing: KEY_RING,
      targetReader: setup.ports.targetReader, nativeSessionReadback: setup.ports.nativeSessionReadback,
      binding: setup.ports.binding, centralIntrospection: setup.ports.centralIntrospection,
      nowMs: NOW_MS + 20,
    }))
    assert.equal(setup.events.includes('central_introspection'), true)
  }
})

test('accepts only the exact callback GET after caller state and PKCE verification; quick login remains same-origin POST', async () => {
  const setup = harness()
  const events = setup.events
  let callbackVerified = false
  const input = issueInput(assertion(), expected(), setup)
  const result = await issueLocalSandboxPrincipalSession({
    ...input,
    request: request('GET', '/api/auth/local-sandbox/callback'),
    verifyCallbackStateAndPkce: async (callbackRequest) => {
      assert.equal(callbackRequest.method, 'GET')
      callbackVerified = true
      events.push('callback_state_pkce_verified')
    },
  })
  assert.ok(result.token)
  assert.ok(events.indexOf('callback_state_pkce_verified') < events.indexOf('native_issue'))

  await assert.rejects(issueLocalSandboxPrincipalSession({
    ...input,
    request: request('GET', '/api/auth/other-callback'),
    verifyCallbackStateAndPkce: async () => { throw new Error('must not run') },
  }), /LOCAL_SANDBOX_REQUEST_INVALID/)
  await assert.rejects(issueLocalSandboxPrincipalSession({
    ...input,
    request: request('GET', '/api/auth/local-sandbox/callback'),
  }), /LOCAL_SANDBOX_CALLBACK_STATE_INVALID/)
  await assert.rejects(issueLocalSandboxPrincipalSession({
    ...input,
    request: new Request('http://127.0.0.1:12020/api/auth/local-quick-login', {
      method: 'POST', headers: { host: '127.0.0.1:12020', origin: 'http://evil.example', 'sec-fetch-site': 'cross-site' }, body: '{}'
    }),
  }), /local_origin_invalid/)
  assert.equal(callbackVerified, true)
})
