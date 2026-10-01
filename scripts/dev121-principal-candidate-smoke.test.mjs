import assert from 'node:assert/strict'
import test from 'node:test'
import { runPrincipalEntrySmoke } from './lib/dev121-principal-candidate-smoke.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'

const platform = 'https://jenfu-platform-prod-9536592944.asia-east1.run.app'
const canonical = 'https://ai-pdm-prod-9536592944.asia-east1.run.app'
const tag = `candidate-${'a'.repeat(12)}`
const candidate = `https://${tag}---ai-pdm-prod-abc123.a.run.app`
const revision = `ai-pdm-prod-${'a'.repeat(12)}`
const image = `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm@sha256:${'b'.repeat(64)}`
const profile = {
  application: { id: 'ai-pdm' },
  target: { canonicalOrigin: canonical },
  artifact: { uri: 'asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm' },
  verification: {
    candidateSmokeMode: 'GITHUB_PRINCIPAL_SSO_V1', brokerOrigin: platform,
    refreshTokenEnvironmentName: 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN',
    firebaseApiKeyEnvironmentName: 'DEV012_AIPDM_FIREBASE_API_KEY',
    authModePath: '/api/auth/mode', mePath: '/api/auth/me', logoutPath: '/api/auth/logout',
    authenticatedProbes: [{ path: '/api/health/ready', method: 'GET', expectedStatus: 200 }],
    negativeProbes: [{ path: '/api/numbering/permissions', method: 'GET', expectedStatus: 401 }]
  }
}
const environment = {
  DEV012_AIPDM_FIREBASE_REFRESH_TOKEN: 'refresh-' + 'r'.repeat(80),
  DEV012_AIPDM_FIREBASE_API_KEY: 'A'.repeat(39)
}

function redirect(target, cookies = []) {
  const headers = new Headers({ location: target })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}

function fakeFlow({ badCallback = false, targetAuthRejected = false } = {}) {
  const calls = []
  let meCount = 0
  const authorize = new URL('/api/sso/authorize', platform)
  authorize.search = new URLSearchParams({ response_type: 'code', client_id: 'ai-pdm',
    redirect_uri: `${canonical}/api/auth/jenfu-sso/callback`, state: 's'.repeat(24),
    code_challenge: 'c'.repeat(43), code_challenge_method: 'S256' }).toString()
  const callback = new URL('/api/auth/jenfu-sso/callback', badCallback ? 'https://evil.example' : canonical)
  callback.search = new URLSearchParams({ code: 'd'.repeat(43), state: 's'.repeat(24), iss: `${platform}/api/sso` }).toString()
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input)
    calls.push({ origin: url.origin, path: url.pathname, cookie: init.headers?.cookie ?? null })
    if (url.hostname === 'securetoken.googleapis.com') {
      return Response.json({ id_token: 'token-' + 'x'.repeat(120), expires_in: '3600' })
    }
    if (url.origin === platform && url.pathname === '/api/auth/firebase/session') {
      assert.match(init.body, /idToken/u)
      return new Response('{}', { status: 200, headers: { 'set-cookie': `jenfu_portal_session=${'p'.repeat(43)}; HttpOnly; Secure` } })
    }
    if (url.origin === platform && url.pathname === '/api/auth/logout') {
      assert.match(init.headers.cookie, /^jenfu_portal_session=/u)
      return Response.json({ status: 'completed' })
    }
    if (url.pathname === '/api/auth/mode') return Response.json({ authMode: 'firebase_bff', ssoHandoffEnabled: true })
    if (url.pathname === '/api/auth/jenfu-sso/start') {
      return redirect(authorize, [`__Host-jenfu_sso_tx=tx.${'t'.repeat(43)}; HttpOnly; Secure`])
    }
    if (url.origin === platform && url.pathname === '/api/sso/authorize') {
      assert.match(init.headers.cookie, /^jenfu_portal_session=/u)
      return redirect(callback)
    }
    if (url.pathname === '/api/auth/jenfu-sso/callback') {
      assert.match(init.headers.cookie, /^__Host-jenfu_sso_tx=/u)
      if (targetAuthRejected) return redirect(`${canonical}/login?auth_error=auth_token_invalid`)
      return redirect(`${canonical}/`, [
        '__Host-jenfu_sso_tx=; Max-Age=0; Secure',
        '__session=opaque-cookie-secret-value; HttpOnly; Secure',
        'pdm_session=opaque-cookie-secret-value; HttpOnly; Secure'
      ])
    }
    if (url.pathname === '/api/auth/me') {
      meCount += 1
      assert.equal(init.headers.cookie, 'pdm_session=opaque-cookie-secret-value')
      return meCount === 1 ? Response.json({ session: { principalId: 'principal-one' } })
        : Response.json({ code: 'auth_session_invalid' }, { status: 401 })
    }
    if (url.pathname === '/api/health/ready') return Response.json({ status: 'ready' })
    if (url.pathname === '/api/numbering/permissions') {
      assert.equal(init.headers?.cookie, undefined)
      return Response.json({ code: 'auth_session_invalid' }, { status: 401 })
    }
    if (url.pathname === '/api/auth/logout') {
      assert.equal(init.headers.cookie, 'pdm_session=opaque-cookie-secret-value')
      return Response.json({ status: 'logged_out' })
    }
    throw new Error(`unexpected mock path ${url.pathname}`)
  }
  return { fetchImpl, calls }
}

test('candidate and canonical Principal SSO smoke use the same verified redirect chain without returning credentials', async () => {
  for (const origin of [candidate, canonical]) {
    const fake = fakeFlow()
    const result = await runPrincipalEntrySmoke({ profile, origin, fetchImpl: fake.fetchImpl, environment,
      ...(origin === candidate ? { candidateTag: tag, candidateRevision: revision, artifactDigest: image } : {}) })
    assert.equal(result.status, 'PASS')
    assert.equal(result.observations.length, 9)
    assert.deepEqual(result.observations.map((item) => item.status), [200, 200, 303, 303, 303, 200, 200, 401, 401])
    assert.equal(fake.calls.filter((call) => call.path === '/api/auth/me').length, 2)
    assert.equal(fake.calls.filter((call) => call.origin === platform && call.path === '/api/auth/logout').length, 1)
    assert.doesNotMatch(JSON.stringify(result), /refresh-r{4}|token-x{4}|opaque-cookie-secret-value|principal-one|jenfu_portal_session/u)
  }
})

test('Principal smoke refuses a callback redirect outside the registered AI-PDM origin', async () => {
  const fake = fakeFlow({ badCallback: true })
  await assert.rejects(runPrincipalEntrySmoke({ profile, origin: candidate, candidateTag: tag,
    candidateRevision: revision, artifactDigest: image, fetchImpl: fake.fetchImpl, environment }),
  { code: 'PRINCIPAL_SMOKE_REDIRECT_INVALID' })
  assert.equal(fake.calls.some((call) => call.origin === 'https://evil.example'), false)
  assert.equal(fake.calls.filter((call) => call.origin === platform && call.path === '/api/auth/logout').length, 1)
})

test('owner verify dispatches Principal SSO against the provider-readback candidate tag', async () => {
  const fake = fakeFlow()
  const source = { ...profile,
    target: { ...profile.target, projectId: 'jenfu-platform-prod', projectNumber: '9536592944',
      region: 'asia-east1', serviceName: 'ai-pdm-prod' } }
  const fetchImpl = async (url, init) => String(url).startsWith('https://run.googleapis.com/v2/')
    ? Response.json({ uri: 'https://ai-pdm-prod-abc123.a.run.app' })
    : fake.fetchImpl(url, init)
  const transport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl })
  const smoke = await transport.runInternalCandidateSmoke({ profile: source,
    origin: `https://${tag}---ai-pdm-prod-9536592944.asia-east1.run.app`,
    candidateTag: tag, candidateRevision: revision, artifactDigest: image,
    deadlineAt: '2999-01-01T00:00:00.000Z', environment })
  assert.equal(smoke.schemaVersion, 'jenfu.dev121.principal-candidate-smoke.v1')
  assert.equal(smoke.origin, `https://${tag}---ai-pdm-prod-9536592944.asia-east1.run.app`)
  assert.ok(fake.calls.some((call) => call.origin === candidate && call.path === '/api/auth/me'))
  assert.doesNotMatch(JSON.stringify(smoke), /refresh-r{4}|token-x{4}|opaque-cookie-secret-value|principal-one/u)

  const canonicalFlow = fakeFlow()
  const canonicalTransport = createOwnerTransport({ token: 'x'.repeat(32), fetchImpl: canonicalFlow.fetchImpl })
  const canonicalSmoke = await canonicalTransport.runAuthenticatedSmoke({ profile: source, origin: canonical, environment })
  assert.equal(canonicalSmoke.status, 'PASS')
  assert.equal(canonicalFlow.calls.filter((call) => call.origin === canonical &&
    call.path === '/api/auth/firebase/session').length, 0)
})

test('target token rejection is distinct from redirect drift and always closes the portal session', async () => {
  for (const origin of [candidate, canonical]) {
    const fake = fakeFlow({ targetAuthRejected: true })
    await assert.rejects(runPrincipalEntrySmoke({ profile, origin, fetchImpl: fake.fetchImpl, environment,
      ...(origin === candidate ? { candidateTag: tag, candidateRevision: revision, artifactDigest: image } : {}) }),
      { code: 'PRINCIPAL_SMOKE_TARGET_AUTH_TOKEN_INVALID' })
    assert.equal(fake.calls.filter((call) => call.origin === platform && call.path === '/api/auth/logout').length, 1)
    assert.equal(fake.calls.some((call) => call.path === '/api/auth/me'), false)
  }
})