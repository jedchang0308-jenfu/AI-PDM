import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getJenfuIdentityConfig, getJenfuPlatformAuthMode } from '../src/lib/auth-config.ts'
import { getSessionCookieToken } from '../src/lib/auth.ts'
import { JenfuAuthEpochRepository } from '../src/lib/jenfu-auth-epoch-repository.ts'
import {
  exchangeFirebaseIdTokenForJenfuPlatformSession,
  JenfuPlatformAuthError,
  verifyJenfuPlatformRequestSession,
} from '../src/lib/jenfu-platform-identity-contract.ts'
import {
  JenfuPrincipalAdmissionError,
  JenfuPrincipalAdmissionRepository,
} from '../src/lib/jenfu-principal-admission-repository.ts'
import {
  issueJenfuPlatformSessionV1,
  verifyJenfuPlatformSessionV1,
} from '../src/lib/jenfu-platform-session-v1.ts'
import { issuePlatformSessionV2, verifyPlatformSessionV2 } from '../src/lib/platform-session-v2.ts'

const CONTRACT_VERSION = 'jenfu.platform-auth.v1'
const NOW_SECONDS = 1_788_134_400
const IDENTITY_ISSUER = 'https://securetoken.google.com/jenfu-platform-fixture'
const IDENTITY_AUDIENCE = 'jenfu-platform-fixture'
const KEY_RING = {
  issuer: 'https://pdm.fixture.local',
  audience: 'ai-pdm',
  currentKeyId: 'current',
  keys: { current: 'fixture-session-secret-at-least-32-bytes-long' },
}
const cases = []

async function check(id, operation) {
  try {
    await operation()
    cases.push({ id, status: 'PASS' })
  } catch (error) {
    cases.push({ id, status: 'FAIL', detail: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

function activePrincipal() {
  return {
    contract_version: 'organization.active-principal.v1',
    principal_issuer: IDENTITY_ISSUER,
    principal_subject: 'fixtureUidCaseSensitive001',
    principal_id: 'principal-fixture-001',
    employee_id: 'employee-fixture-001',
    employee_status: 'active',
    mapping_version: '7',
    published_at: '2026-08-31T00:00:00.000Z',
  }
}

function identityEnvironment(mode = 'on') {
  return {
    PDM_AUTH_MODE: 'firebase_bff',
    PDM_JENFU_PLATFORM_AUTH_MODE: mode,
    PDM_FIREBASE_PROJECT_ID: IDENTITY_AUDIENCE,
    JENFU_FIREBASE_PROJECT_ID: IDENTITY_AUDIENCE,
    JENFU_IDENTITY_ISSUER: IDENTITY_ISSUER,
    JENFU_IDENTITY_AUDIENCE: IDENTITY_AUDIENCE,
  }
}

function jenfuToken(authEpoch = 0) {
  return issueJenfuPlatformSessionV1({
    identityIssuer: IDENTITY_ISSUER,
    identityAudience: IDENTITY_AUDIENCE,
    identitySubject: 'fixtureUidCaseSensitive001',
    principalId: 'principal-fixture-001',
    employeeId: 'employee-fixture-001',
    localPrincipalId: 'pdm-user-fixture-001',
    companyId: 'company-jenfu',
    authEpoch,
    accountLifecycleVersion: 3,
    authTime: NOW_SECONDS - 60,
    assuranceLevel: 'aal1',
    sessionId: 'fixture-ai-pdm-session-id-001',
  }, KEY_RING, NOW_SECONDS)
}

function localUser() {
  return {
    id: 'pdm-user-fixture-001',
    display_name: 'Fixture User',
    email: 'redacted@example.invalid',
    role: 'Engineer',
    company_id: 'company-jenfu',
    account_status: 'active',
    session_invalid_before: null,
    account_lifecycle_version: 3,
    system_role_enabled: 1,
    account_status_changed_at: null,
    account_status_changed_by: null,
    account_status_reason: null,
  }
}

async function main() {
  await check('DEV004-S2-CONFIG-001', () => {
    assert.equal(getJenfuPlatformAuthMode({}), 'off')
    assert.equal(getJenfuPlatformAuthMode({ PDM_JENFU_PLATFORM_AUTH_MODE: 'off' }), 'off')
  })

  await check('DEV004-S2-CONFIG-002', () => {
    assert.deepEqual(getJenfuIdentityConfig(identityEnvironment()), {
      firebaseProjectId: IDENTITY_AUDIENCE,
      identityIssuer: IDENTITY_ISSUER,
      identityAudience: IDENTITY_AUDIENCE,
    })
    assert.throws(() => getJenfuIdentityConfig({ ...identityEnvironment(), PDM_FIREBASE_PROJECT_ID: 'wrong' }))
  })

  await check('DEV004-S2-COOKIE-001', () => {
    const bearerOnly = new Request('https://pdm.fixture.local/api/protected', {
      headers: { authorization: 'Bearer firebase-provider-token' },
    })
    assert.equal(getSessionCookieToken(bearerOnly), null)
    const cookieRequest = new Request('https://pdm.fixture.local/api/protected', {
      headers: { cookie: '__session=app-local-token' },
    })
    assert.equal(getSessionCookieToken(cookieRequest), 'app-local-token')
  })

  await check('DEV004-S2-SESSION-001', () => {
    const sharedToken = jenfuToken()
    const legacyToken = issuePlatformSessionV2({
      subject: 'fixtureUidCaseSensitive001',
      pdmUserId: 'pdm-user-fixture-001',
      companyId: 'company-jenfu',
      authTime: NOW_SECONDS - 60,
      sessionVersion: 3,
      assuranceLevel: 'aal1',
    }, KEY_RING, NOW_SECONDS)
    assert.throws(() => verifyPlatformSessionV2(sharedToken, KEY_RING, { nowSeconds: NOW_SECONDS }))
    assert.throws(() => verifyJenfuPlatformSessionV1(legacyToken, KEY_RING, { nowSeconds: NOW_SECONDS }))
  })

  await check('DEV004-S2-SESSION-002', () => {
    const validToken = jenfuToken()
    const tamperedToken = `${validToken.slice(0, -1)}${validToken.endsWith('a') ? 'b' : 'a'}`
    assert.throws(() => verifyJenfuPlatformSessionV1(tamperedToken, KEY_RING, { nowSeconds: NOW_SECONDS }))
    const expiredToken = issueJenfuPlatformSessionV1({
      identityIssuer: IDENTITY_ISSUER,
      identityAudience: IDENTITY_AUDIENCE,
      identitySubject: 'fixtureUidCaseSensitive001',
      principalId: 'principal-fixture-001',
      employeeId: 'employee-fixture-001',
      localPrincipalId: 'pdm-user-fixture-001',
      companyId: 'company-jenfu',
      authEpoch: 0,
      accountLifecycleVersion: 3,
      authTime: NOW_SECONDS - 29_000,
      assuranceLevel: 'aal1',
      sessionId: 'fixture-expired-session-id-001',
    }, KEY_RING, NOW_SECONDS - 28_801)
    assert.throws(() => verifyJenfuPlatformSessionV1(expiredToken, KEY_RING, { nowSeconds: NOW_SECONDS }))
  })

  await check('DEV004-S2-PRINCIPAL-001', async () => {
    let observedSql = ''
    const repository = new JenfuPrincipalAdmissionRepository({
      kind: 'postgres',
      async query(sql) {
        observedSql = sql
        return [activePrincipal()]
      },
    })
    const principal = await repository.requireActivePrincipal(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001')
    assert.equal(principal.contractVersion, CONTRACT_VERSION)
    assert.equal(principal.employeeId, 'employee-fixture-001')
    assert.match(observedSql, /FETCH FIRST 2 ROWS ONLY/u)
    assert.doesNotMatch(observedSql, /LIMIT 1/u)
  })

  await check('DEV004-S2-PRINCIPAL-002', async () => {
    for (const [rows, expectedCode] of [
      [[], 'principal_not_active'],
      [[activePrincipal(), { ...activePrincipal(), principal_id: 'collision' }], 'principal_ambiguous'],
    ]) {
      const repository = new JenfuPrincipalAdmissionRepository({ kind: 'postgres', async query() { return rows } })
      await assert.rejects(
        repository.requireActivePrincipal(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001'),
        (error) => error instanceof JenfuPrincipalAdmissionError && error.code === expectedCode,
      )
    }
  })

  await check('DEV004-S2-PRINCIPAL-003', async () => {
    const repository = new JenfuPrincipalAdmissionRepository({ kind: 'sqlite', async query() { return [] } })
    await assert.rejects(
      repository.requireActivePrincipal(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001'),
      (error) => error instanceof JenfuPrincipalAdmissionError && error.code === 'principal_directory_unavailable',
    )
  })

  await check('DEV004-S2-EPOCH-001', async () => {
    let reads = 0
    const repository = new JenfuAuthEpochRepository({
      kind: 'postgres',
      async queryOne() {
        reads += 1
        return { auth_epoch: String(reads - 1) }
      },
    })
    assert.equal(await repository.readPrincipalAuthEpoch(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001'), 0)
    assert.equal(await repository.readPrincipalAuthEpoch(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001'), 1)
    assert.equal(reads, 2)
  })

  await check('DEV004-S2-EPOCH-002', async () => {
    const repository = new JenfuAuthEpochRepository({ kind: 'sqlite', async queryOne() { return { auth_epoch: 0 } } })
    await assert.rejects(repository.readPrincipalAuthEpoch(IDENTITY_ISSUER, 'fixtureUidCaseSensitive001'))
  })

  await check('DEV004-S2-EXCHANGE-001', async () => {
    const firebase = {
      async verifyIdToken(_token, options) {
        assert.equal(options.checkRevoked, true)
        return {
          uid: 'fixtureUidCaseSensitive001',
          identityIssuer: IDENTITY_ISSUER,
          identityAudience: IDENTITY_AUDIENCE,
          email: 'redacted@example.invalid',
          emailVerified: true,
          disabled: false,
          authTimeSeconds: NOW_SECONDS - 60,
          signInProvider: 'password',
          secondFactor: null,
        }
      },
    }
    const token = await exchangeFirebaseIdTokenForJenfuPlatformSession({
      idToken: 'redacted-provider-token',
      firebase,
      localPrincipalRepository: { async resolvePrincipal() {
        return {
          firebaseUid: 'fixtureUidCaseSensitive001',
          pdmUserId: 'pdm-user-fixture-001',
          companyId: 'company-jenfu',
          sessionVersion: 3,
          accountStatus: 'active',
          requiresPrivilegedAssurance: false,
        }
      } },
      principalAdmissionRepository: { async requireActivePrincipal() {
        return {
          contractVersion: CONTRACT_VERSION,
          directoryContractVersion: 'organization.active-principal.v1',
          identityIssuer: IDENTITY_ISSUER,
          identitySubject: 'fixtureUidCaseSensitive001',
          principalId: 'principal-fixture-001',
          employeeId: 'employee-fixture-001',
          mappingVersion: 7,
          publishedAt: '2026-08-31T00:00:00.000Z',
        }
      } },
      authEpochRepository: { async readPrincipalAuthEpoch() { return 0 } },
      identityConfig: getJenfuIdentityConfig(identityEnvironment()),
      keyRing: KEY_RING,
      workspaceMfaTrustPolicy: { enabled: false, allowAal1PrivilegedPilot: false, domains: ['jenfu.com.tw'] },
      nowSeconds: NOW_SECONDS,
    })
    const claims = verifyJenfuPlatformSessionV1(token, KEY_RING, { nowSeconds: NOW_SECONDS })
    assert.equal(claims.identitySubject, 'fixtureUidCaseSensitive001')
    assert.equal(claims.localPrincipalId, 'pdm-user-fixture-001')
    assert.equal(claims.employeeId, 'employee-fixture-001')
  })

  await check('DEV004-S2-EXCHANGE-002', async () => {
    const common = {
      idToken: 'redacted-provider-token',
      localPrincipalRepository: { async resolvePrincipal() { throw new Error('must not be called') } },
      principalAdmissionRepository: { async requireActivePrincipal() { throw new Error('must not be called') } },
      authEpochRepository: { async readPrincipalAuthEpoch() { throw new Error('must not be called') } },
      identityConfig: getJenfuIdentityConfig(identityEnvironment()),
      keyRing: KEY_RING,
      nowSeconds: NOW_SECONDS,
    }
    await assert.rejects(
      exchangeFirebaseIdTokenForJenfuPlatformSession({
        ...common,
        firebase: { async verifyIdToken() {
          return {
            uid: 'fixtureUidCaseSensitive001',
            identityIssuer: 'https://securetoken.google.com/wrong-project',
            identityAudience: IDENTITY_AUDIENCE,
            email: 'redacted@example.invalid',
            emailVerified: true,
            disabled: false,
            authTimeSeconds: NOW_SECONDS - 60,
            signInProvider: 'password',
            secondFactor: null,
          }
        } },
      }),
      (error) => error instanceof JenfuPlatformAuthError && error.code === 'auth_token_invalid',
    )
    await assert.rejects(
      exchangeFirebaseIdTokenForJenfuPlatformSession({
        ...common,
        firebase: { async verifyIdToken() { throw new Error('provider token revoked') } },
      }),
      (error) => error instanceof JenfuPlatformAuthError && error.code === 'auth_token_invalid',
    )
  })

  await check('DEV004-S2-REQUEST-001', async () => {
    let principalReads = 0
    let epochReads = 0
    let currentEpoch = 0
    const input = {
      token: jenfuToken(),
      keyRing: KEY_RING,
      identityConfig: getJenfuIdentityConfig(identityEnvironment()),
      localUserRepository: { async getUserById() { return localUser() } },
      accountSessionRegistry: { async isActive() { return true } },
      principalAdmissionRepository: { async requireActivePrincipal() {
        principalReads += 1
        return {
          contractVersion: CONTRACT_VERSION,
          directoryContractVersion: 'organization.active-principal.v1',
          identityIssuer: IDENTITY_ISSUER,
          identitySubject: 'fixtureUidCaseSensitive001',
          principalId: 'principal-fixture-001',
          employeeId: 'employee-fixture-001',
          mappingVersion: 7,
          publishedAt: '2026-08-31T00:00:00.000Z',
        }
      } },
      authEpochRepository: { async readPrincipalAuthEpoch() {
        epochReads += 1
        return currentEpoch
      } },
      nowSeconds: NOW_SECONDS,
    }
    assert.equal((await verifyJenfuPlatformRequestSession(input)).session.employeeId, 'employee-fixture-001')
    assert.equal((await verifyJenfuPlatformRequestSession(input)).user.id, 'pdm-user-fixture-001')
    currentEpoch = 1
    await assert.rejects(
      verifyJenfuPlatformRequestSession(input),
      (error) => error instanceof JenfuPlatformAuthError && error.code === 'auth_epoch_stale',
    )
    assert.equal(principalReads, 3)
    assert.equal(epochReads, 3)
  })

  await check('DEV004-S2-REQUEST-002', async () => {
    await assert.rejects(
      verifyJenfuPlatformRequestSession({
        token: jenfuToken(),
        keyRing: KEY_RING,
        identityConfig: getJenfuIdentityConfig(identityEnvironment()),
        localUserRepository: { async getUserById() { return localUser() } },
        accountSessionRegistry: { async isActive() { return false } },
        principalAdmissionRepository: { async requireActivePrincipal() { throw new Error('must not be called') } },
        authEpochRepository: { async readPrincipalAuthEpoch() { throw new Error('must not be called') } },
        nowSeconds: NOW_SECONDS,
      }),
      (error) => error instanceof JenfuPlatformAuthError && error.code === 'auth_session_invalid',
    )
  })

  const failed = cases.filter((item) => item.status !== 'PASS')
  const runId = process.env.PDM_QC_RUN_ID?.trim() || `DEV004-S2-${new Date().toISOString().replace(/[-:.]/gu, '')}`
  const evidenceDir = resolve('output', 'qa', 'dev-004', runId)
  mkdirSync(evidenceDir, { recursive: true })
  const result = {
    devId: 'DEV-004',
    slice: '004-S2',
    environment: 'local-isolated',
    contractVersion: CONTRACT_VERSION,
    status: failed.length === 0 ? 'PASS' : 'FAIL',
    cases,
    redaction: { providerTokenStored: false, cookieValueStored: false, fullIdentityStored: false },
  }
  writeFileSync(join(evidenceDir, 'runtime-results.json'), `${JSON.stringify(result, null, 2)}\n`)
  writeFileSync(join(evidenceDir, 'manifest.json'), `${JSON.stringify({
    devId: result.devId,
    slice: result.slice,
    environment: result.environment,
    contractVersion: result.contractVersion,
    scope: 'focused-contract-and-runtime',
    status: result.status,
    overallSliceStatus: 'LOCAL_IMPLEMENTED_EXIT_GATE_OPEN',
    caseCount: cases.length,
    generatedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ status: result.status, cases: cases.length, evidenceDir })}\n`)
  if (failed.length > 0) process.exitCode = 1
}

main().catch((error) => {
  process.stderr.write(`DEV-004 AI-PDM runtime check failed: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
