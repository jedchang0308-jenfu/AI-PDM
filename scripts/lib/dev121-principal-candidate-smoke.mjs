const PLATFORM_ORIGIN = 'https://jenfu-platform-prod-9536592944.asia-east1.run.app'
const CALLBACK_PATH = '/api/auth/jenfu-sso/callback'

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function cookiePair(response, name) {
  const headers = response.headers.getSetCookie?.() ?? []
  if (headers.length === 0) headers.push(response.headers.get('set-cookie') ?? '')
  const pattern = new RegExp(`(?:^|,\\s*)${name}=([^;,\\s]+)`, 'u')
  for (const header of headers) {
    const value = pattern.exec(header)?.[1]
    if (value) return `${name}=${value}`
  }
  fail('PRINCIPAL_SMOKE_COOKIE_INVALID')
}

function location(response, origin, pathname) {
  if (response.status !== 303) fail('PRINCIPAL_SMOKE_REDIRECT_INVALID')
  let target
  try { target = new URL(response.headers.get('location') ?? '') }
  catch { fail('PRINCIPAL_SMOKE_REDIRECT_INVALID') }
  if (target.origin !== origin || target.pathname !== pathname || target.hash) fail('PRINCIPAL_SMOKE_REDIRECT_INVALID')
  return target
}

export async function runPrincipalEntrySmoke({ profile, origin, candidateTag, candidateRevision,
  artifactDigest, environment, fetchImpl }) {
  const definition = profile?.verification
  let target
  try { target = new URL(origin) } catch { fail('PRINCIPAL_SMOKE_PROFILE_INVALID') }
  const isCandidate = candidateTag !== undefined
  if (definition?.candidateSmokeMode !== 'GITHUB_PRINCIPAL_SSO_V1' ||
      definition.brokerOrigin !== PLATFORM_ORIGIN ||
      definition.refreshTokenEnvironmentName !== 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN' ||
      definition.firebaseApiKeyEnvironmentName !== 'DEV012_AIPDM_FIREBASE_API_KEY' ||
      profile?.target?.canonicalOrigin !== 'https://ai-pdm-prod-9536592944.asia-east1.run.app' ||
      target.protocol !== 'https:' || target.pathname !== '/' || target.search || target.hash ||
      (isCandidate ? (!/^candidate-[a-f0-9]{12}$/u.test(candidateTag) ||
        candidateRevision !== `ai-pdm-prod-${candidateTag.slice('candidate-'.length)}` ||
        !target.hostname.startsWith(`${candidateTag}---ai-pdm-prod-`) ||
        !target.hostname.endsWith('.a.run.app') ||
        !artifactDigest?.startsWith(`${profile.artifact?.uri}@sha256:`))
        : target.origin !== profile.target.canonicalOrigin)) fail('PRINCIPAL_SMOKE_PROFILE_INVALID')

  const refreshToken = environment[definition.refreshTokenEnvironmentName]
  const apiKey = environment[definition.firebaseApiKeyEnvironmentName]
  if (typeof refreshToken !== 'string' || refreshToken.length < 20 || refreshToken.length > 4096 ||
      typeof apiKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/u.test(apiKey)) fail('PRINCIPAL_SMOKE_CREDENTIAL_MISSING')

  const call = async (url, init = {}) => {
    try { return await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), ...init }) }
    catch { fail('PRINCIPAL_SMOKE_REQUEST_FAILED') }
  }
  const refreshed = await call(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString()
  })
  if (refreshed.status !== 200) fail('PRINCIPAL_SMOKE_TOKEN_REFRESH_FAILED')
  let token
  try { token = await refreshed.json() } catch { fail('PRINCIPAL_SMOKE_TOKEN_REFRESH_FAILED') }
  if (typeof token.id_token !== 'string' || token.id_token.length < 100 || token.id_token.length > 16384 ||
      !Number.isFinite(Number(token.expires_in)) || Number(token.expires_in) < 300) fail('PRINCIPAL_SMOKE_TOKEN_REFRESH_FAILED')

  const mode = await call(new URL(definition.authModePath, target))
  const modeBody = await mode.json().catch(() => null)
  if (mode.status !== 200 || modeBody?.authMode !== 'firebase_bff' ||
      modeBody.ssoHandoffEnabled !== true) fail('PRINCIPAL_SMOKE_MODE_INVALID')

  const portal = await call(`${PLATFORM_ORIGIN}/api/auth/firebase/session`, {
    method: 'POST', headers: { origin: PLATFORM_ORIGIN, 'content-type': 'application/json' },
    body: JSON.stringify({ idToken: token.id_token })
  })
  if (portal.status !== 200) fail('PRINCIPAL_SMOKE_PORTAL_LOGIN_FAILED')
  const portalCookie = cookiePair(portal, 'jenfu_portal_session')

  try {
  const start = await call(new URL('/api/auth/jenfu-sso/start', target))
  const authorize = location(start, PLATFORM_ORIGIN, '/api/sso/authorize')
  if (authorize.searchParams.get('client_id') !== 'ai-pdm' ||
      authorize.searchParams.get('redirect_uri') !== `${profile.target.canonicalOrigin}${CALLBACK_PATH}`) {
    fail('PRINCIPAL_SMOKE_REDIRECT_INVALID')
  }
  const transactionCookie = cookiePair(start, '__Host-jenfu_sso_tx')
  const authorized = await call(authorize, { headers: { cookie: portalCookie } })
  const callback = location(authorized, profile.target.canonicalOrigin, CALLBACK_PATH)
  if (!callback.searchParams.get('code') || callback.searchParams.get('state') !== authorize.searchParams.get('state') ||
      callback.searchParams.get('iss') !== `${PLATFORM_ORIGIN}/api/sso`) fail('PRINCIPAL_SMOKE_REDIRECT_INVALID')

  // The broker registers the canonical callback. Only the owner smoke replays its one-time
  // code and transaction cookie to the exact candidate tag to exercise candidate auth.
  // This is an HTTP candidate probe; browser-origin behavior is verified after activation.
  const targetCallback = new URL(`${callback.pathname}${callback.search}`, target)
  const exchanged = await call(targetCallback, { headers: { cookie: transactionCookie } })
  location(exchanged, profile.target.canonicalOrigin, '/')
  const targetCookie = cookiePair(exchanged, 'pdm_session')
  const me = await call(new URL(definition.mePath, target), { headers: { cookie: targetCookie } })
  if (me.status !== 200 || typeof (await me.json().catch(() => null))?.session?.principalId !== 'string') {
    fail('PRINCIPAL_SMOKE_TARGET_SESSION_INVALID')
  }

  const probe = definition.authenticatedProbes?.[0]
  const negative = definition.negativeProbes?.[0]
  if (!probe || !negative || probe.method !== 'GET' || negative.method !== 'GET' ||
      probe.path !== '/api/health/ready' || negative.path !== '/api/numbering/permissions' ||
      definition.authModePath !== '/api/auth/mode' || definition.mePath !== '/api/auth/me' ||
      definition.logoutPath !== '/api/auth/logout') fail('PRINCIPAL_SMOKE_PROFILE_INVALID')
  const authenticated = await call(new URL(probe.path, target), { headers: { cookie: targetCookie } })
  if (authenticated.status !== probe.expectedStatus) fail('PRINCIPAL_SMOKE_AUTHENTICATED_PROBE_FAILED')
  const unauthenticated = await call(new URL(negative.path, target))
  if (unauthenticated.status !== 401 || negative.expectedStatus !== 401) fail('PRINCIPAL_SMOKE_UNAUTHENTICATED_PROBE_FAILED')

  const logout = await call(new URL(definition.logoutPath, target), {
    method: 'POST', headers: { origin: profile.target.canonicalOrigin, cookie: targetCookie, 'content-type': 'application/json' }, body: '{}'
  })
  if (logout.status !== 200) fail('PRINCIPAL_SMOKE_LOGOUT_FAILED')
  const revoked = await call(new URL(definition.mePath, target), { headers: { cookie: targetCookie } })
  if (revoked.status !== 401) fail('PRINCIPAL_SMOKE_REVOCATION_FAILED')

  return {
    schemaVersion: 'jenfu.dev121.principal-candidate-smoke.v1', ownerApplicationId: 'ai-pdm',
    ...(isCandidate ? { candidateRevision, artifactDigest } : {}), tokenSource: 'GITHUB_PRODUCTION_SECRET',
    tokenExpiresInSeconds: Number(token.expires_in),
    observations: [
      { id: 'auth-mode', status: mode.status }, { id: 'platform-session', status: portal.status },
      { id: 'sso-start', status: start.status }, { id: 'sso-authorize', status: authorized.status },
      { id: 'sso-callback', status: exchanged.status }, { id: 'target-session', status: me.status },
      { id: 'authenticated-probe', status: authenticated.status },
      { id: 'unauthenticated-probe', status: unauthenticated.status },
      { id: 'session-revoked', status: revoked.status }
    ], status: 'PASS'
  }
  } finally {
    const portalLogout = await call(`${PLATFORM_ORIGIN}/api/auth/logout`, {
      method: 'POST', headers: { origin: PLATFORM_ORIGIN, cookie: portalCookie, 'content-type': 'application/json' },
      body: '{}'
    })
    if (portalLogout.status !== 200) fail('PRINCIPAL_SMOKE_PORTAL_LOGOUT_FAILED')
  }
}
