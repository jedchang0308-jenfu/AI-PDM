import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'node:crypto'
import http from 'node:http'

export const REAUTH_SCHEMA = 'jenfu.dev121.smoke-credential-reauth.v1'
export const REAUTH_SCOPE = 'APP_SMOKE_CREDENTIAL_REAUTH'
export const EXPECTED = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  repository: 'jedchang0308-jenfu/AI-PDM',
  githubEnvironment: 'production',
  githubSecretName: 'DEV012_AIPDM_FIREBASE_REFRESH_TOKEN',
  secretId: 'aipdm-prod-smoke-firebase-refresh-token',
  oldSecretVersion: '4',
  newSecretVersion: '5',
  issuer: 'https://securetoken.google.com/jenfu-platform-prod',
  canonicalOrigin: 'https://jenfu-platform-prod-9536592944.asia-east1.run.app',
  maxAuthAgeSeconds: 300,
})

export class ReauthError extends Error {
  constructor(code) { super(code); this.code = code }
}
function fail(code) { throw new ReauthError(code) }
const H64 = /^[a-f0-9]{64}$/u
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u
const SECRET_VERSION = /^[1-9][0-9]*$/u

export function resolveVersionBinding(previousVersion = EXPECTED.oldSecretVersion, newVersion = EXPECTED.newSecretVersion) {
  if (typeof previousVersion !== 'string' || typeof newVersion !== 'string' ||
      !SECRET_VERSION.test(previousVersion) || !SECRET_VERSION.test(newVersion)) fail('SECRET_VERSION_BINDING_INVALID')
  const previousNumber = Number(previousVersion)
  const newNumber = Number(newVersion)
  if (!Number.isSafeInteger(previousNumber) || !Number.isSafeInteger(newNumber) ||
      previousNumber >= Number.MAX_SAFE_INTEGER || newNumber !== previousNumber + 1) fail('SECRET_VERSION_BINDING_INVALID')
  return { previousVersion, newVersion }
}

export function parseReauthArguments(args) {
  if (!Array.isArray(args)) fail('USAGE')
  let commit = false
  let previousVersion
  let newVersion
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--commit') {
      if (commit) fail('USAGE')
      commit = true
    } else if (arg === '--previous-version' || arg === '--new-version') {
      const value = args[index + 1]
      if (typeof value !== 'string' || value.startsWith('--')) fail('USAGE')
      index += 1
      if (arg === '--previous-version') {
        if (previousVersion !== undefined) fail('USAGE')
        previousVersion = value
      } else {
        if (newVersion !== undefined) fail('USAGE')
        newVersion = value
      }
    } else {
      fail('USAGE')
    }
  }
  if ((previousVersion === undefined) !== (newVersion === undefined)) fail('USAGE')
  const binding = previousVersion === undefined
    ? resolveVersionBinding()
    : resolveVersionBinding(previousVersion, newVersion)
  return { commit, ...binding }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonicalize(value[key])).join(',') + '}'
  return JSON.stringify(value)
}
export function sha256(value) {
  return createHash('sha256').update(Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : canonicalize(value)).digest('hex')
}
export function identityPairHash(issuer, subject) {
  if (typeof issuer !== 'string' || typeof subject !== 'string' || subject.length < 20 || subject.length > 128) fail('IDENTITY_PAIR_INVALID')
  return sha256(issuer + '\0' + subject)
}
function decodePart(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) } catch { fail('FIREBASE_TOKEN_INVALID') }
}
export async function verifyFirebaseIdToken(token, { projectId = EXPECTED.projectId, fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (typeof token !== 'string' || token.length < 100 || token.length > 16384) fail('FIREBASE_TOKEN_INVALID')
  const parts = token.split('.')
  if (parts.length !== 3) fail('FIREBASE_TOKEN_INVALID')
  const header = decodePart(parts[0])
  const claims = decodePart(parts[1])
  if (header?.alg !== 'RS256' || header?.typ !== 'JWT' || typeof header.kid !== 'string' || !claims || typeof claims !== 'object') fail('FIREBASE_TOKEN_INVALID')
  let response
  try { response = await fetchImpl('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com', { redirect: 'error', signal: AbortSignal.timeout(10000) }) } catch { fail('FIREBASE_CERT_READ_FAILED') }
  if (!response.ok) fail('FIREBASE_CERT_READ_FAILED')
  const certificates = await response.json()
  if (!certificates || typeof certificates !== 'object' || typeof certificates[header.kid] !== 'string') fail('FIREBASE_CERT_KEY_MISSING')
  let valid = false
  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(parts[0] + '.' + parts[1])
    verifier.end()
    valid = verifier.verify(createPublicKey(certificates[header.kid]), Buffer.from(parts[2], 'base64url'))
  } catch { fail('FIREBASE_TOKEN_INVALID') }
  if (!valid) fail('FIREBASE_TOKEN_SIGNATURE_INVALID')
  const nowSeconds = Math.floor(nowMs / 1000)
  if (claims.aud !== projectId || claims.iss !== 'https://securetoken.google.com/' + projectId ||
      typeof claims.sub !== 'string' || claims.sub.length < 20 || claims.sub.length > 128 ||
      !Number.isInteger(claims.exp) || claims.exp <= nowSeconds ||
      !Number.isInteger(claims.iat) || claims.iat > nowSeconds + 60 ||
      !Number.isInteger(claims.auth_time) || claims.auth_time > nowSeconds + 60 ||
      claims.email_verified !== true || typeof claims.firebase?.sign_in_provider !== 'string') fail('FIREBASE_TOKEN_CLAIMS_INVALID')
  return claims
}
export function assertExpectedPair(claims, expected) {
  if (!claims || claims.iss !== expected?.issuer || claims.sub !== expected?.subject ||
      claims.aud !== EXPECTED.projectId || claims.email_verified !== true ||
      claims.firebase?.sign_in_provider !== 'password') fail('PROVIDER_PAIR_OR_METHOD_MISMATCH')
  return true
}
export function assertFreshAuthTime(claims, nowMs = Date.now(), maxAgeSeconds = EXPECTED.maxAuthAgeSeconds) {
  const nowSeconds = Math.floor(nowMs / 1000)
  if (!Number.isInteger(claims?.auth_time) || claims.auth_time > nowSeconds + 30 ||
      nowSeconds - claims.auth_time < 0 || nowSeconds - claims.auth_time > maxAgeSeconds) fail('PASSWORD_AUTH_TIME_STALE')
  return true
}
export function assertAccountLookup(account, expectedSubject) {
  if (!account || account.localId !== expectedSubject || account.disabled !== false || account.emailVerified !== true) fail('FIREBASE_ACCOUNT_STATE_INVALID')
  return true
}
export function assertPlatformMe(result) {
  const user = result?.value?.user
  const assurance = result?.value?.assuranceLevel ?? result?.value?.session?.assuranceLevel
  if (result?.status !== 200 || !IDENTIFIER.test(user?.principalId ?? '') ||
      !IDENTIFIER.test(user?.employeeId ?? '') || assurance !== 'aal1') fail('PLATFORM_PRINCIPAL_SESSION_INVALID')
  return { principalId: user.principalId, employeeId: user.employeeId, assuranceLevel: assurance }
}
export function assertStablePlatformMe(first, next) {
  const a = assertPlatformMe(first)
  const b = assertPlatformMe(next)
  if (a.principalId !== b.principalId || a.employeeId !== b.employeeId || a.assuranceLevel !== b.assuranceLevel) fail('PLATFORM_PRINCIPAL_CHANGED')
  return a
}
export function assertLoggedOut(result) {
  if (result?.status !== 401) fail('PLATFORM_LOGOUT_REVOCATION_FAILED')
  return true
}
function receiptCore(receipt) {
  const { receiptSha256, ...core } = receipt ?? {}
  return core
}
export function buildReauthReceipt({ sourceRevision, expected, authTime, authenticatedAt, principal, previousVersion, newVersion, observedAt, status = 'PASS', mutation = null }) {
  if (!/^[a-f0-9]{40}$/u.test(sourceRevision ?? '') || expected?.issuer !== EXPECTED.issuer ||
      !/^[A-Za-z0-9_-]{20,128}$/u.test(expected?.subject ?? '') || !principal ||
      !IDENTIFIER.test(principal.principalId ?? '') || !IDENTIFIER.test(principal.employeeId ?? '') ||
      !Number.isFinite(Date.parse(authenticatedAt)) || !Number.isFinite(Date.parse(observedAt))) fail('REAUTH_RECEIPT_INPUT_INVALID')
  const core = {
    schemaVersion: REAUTH_SCHEMA,
    ownerApplicationId: EXPECTED.ownerApplicationId,
    projectId: EXPECTED.projectId,
    sourceRevision,
    identityIssuer: expected.issuer,
    identityPairSha256: identityPairHash(expected.issuer, expected.subject),
    principalId: principal.principalId,
    employeeId: principal.employeeId,
    passwordAuthenticated: true,
    emailVerified: true,
    assuranceLevel: 'aal1',
    authTime,
    authenticatedAt,
    sessionReloaded: true,
    logoutRevoked: true,
    results: { providerPairVerified: true, accountEnabled: true, sessionCreated: true, principalReloaded: true, logoutRevoked: true },
    secret: { id: EXPECTED.secretId, previousVersion: String(previousVersion), newVersion: String(newVersion), state: status === 'PASS' ? 'ENABLED' : 'UNKNOWN' },
    github: { repository: EXPECTED.repository, environment: EXPECTED.githubEnvironment, secretName: EXPECTED.githubSecretName, configured: status === 'PASS' },
    ...(mutation ? { mutation: { secretVersionCreated: mutation.secretVersionCreated === true, githubSecretConfigured: mutation.githubSecretConfigured === true } } : {}),
    status,
    releaseAuthority: false,
    evidenceScope: REAUTH_SCOPE,
    credentialMaterialPresent: false,
    observedAt,
  }
  return { ...core, receiptSha256: sha256(core) }
}
export function validateReauthReceipt(receipt, {
  sourceRevision, expectedPreviousVersion = EXPECTED.oldSecretVersion,
  expectedNewVersion = EXPECTED.newSecretVersion, nowMs = Date.now(),
} = {}) {
  try { resolveVersionBinding(expectedPreviousVersion, expectedNewVersion) } catch { fail('REAUTH_RECEIPT_INVALID') }
  if (!receipt || receipt.schemaVersion !== REAUTH_SCHEMA || receipt.ownerApplicationId !== EXPECTED.ownerApplicationId ||
      receipt.projectId !== EXPECTED.projectId || receipt.sourceRevision !== sourceRevision ||
      receipt.status !== 'PASS' || receipt.releaseAuthority !== false || receipt.evidenceScope !== REAUTH_SCOPE ||
      receipt.credentialMaterialPresent !== false || receipt.passwordAuthenticated !== true ||
      receipt.emailVerified !== true || receipt.assuranceLevel !== 'aal1' || receipt.sessionReloaded !== true ||
      receipt.logoutRevoked !== true || receipt.results?.providerPairVerified !== true ||
      receipt.results?.accountEnabled !== true || receipt.results?.sessionCreated !== true ||
      receipt.results?.principalReloaded !== true || receipt.results?.logoutRevoked !== true ||
      receipt.identityIssuer !== EXPECTED.issuer || !H64.test(receipt.identityPairSha256 ?? '') ||
      !IDENTIFIER.test(receipt.principalId ?? '') || !IDENTIFIER.test(receipt.employeeId ?? '') ||
      receipt.secret?.id !== EXPECTED.secretId || receipt.secret?.previousVersion !== expectedPreviousVersion ||
      receipt.secret?.newVersion !== expectedNewVersion || !SECRET_VERSION.test(receipt.secret?.previousVersion ?? '') ||
      !SECRET_VERSION.test(receipt.secret?.newVersion ?? '') ||
      receipt.secret?.state !== 'ENABLED' ||
      receipt.github?.repository !== EXPECTED.repository || receipt.github?.environment !== EXPECTED.githubEnvironment ||
      receipt.github?.secretName !== EXPECTED.githubSecretName || receipt.github?.configured !== true ||
      !Number.isInteger(receipt.authTime) || !Number.isFinite(Date.parse(receipt.authenticatedAt)) ||
      !Number.isFinite(Date.parse(receipt.observedAt)) || !H64.test(receipt.receiptSha256 ?? '') ||
      sha256(receiptCore(receipt)) !== receipt.receiptSha256) fail('REAUTH_RECEIPT_INVALID')
  const nowSeconds = Math.floor(nowMs / 1000)
  const authAge = nowSeconds - receipt.authTime
  if (authAge < -30 || authAge > EXPECTED.maxAuthAgeSeconds ||
      Date.parse(receipt.authenticatedAt) - receipt.authTime * 1000 < -30000 ||
      Date.parse(receipt.authenticatedAt) - receipt.authTime * 1000 > EXPECTED.maxAuthAgeSeconds * 1000 ||
      Date.parse(receipt.observedAt) < Date.parse(receipt.authenticatedAt) ||
      Date.parse(receipt.observedAt) - Date.parse(receipt.authenticatedAt) > 120000) fail('REAUTH_RECEIPT_FRESHNESS_INVALID')
  const allowedKeys = ['assuranceLevel', 'authTime', 'authenticatedAt', 'credentialMaterialPresent', 'employeeId', 'emailVerified',
    'evidenceScope', 'github', 'identityIssuer', 'identityPairSha256', 'logoutRevoked', 'observedAt', 'ownerApplicationId',
    'passwordAuthenticated', 'principalId', 'projectId', 'receiptSha256', 'releaseAuthority', 'results', 'schemaVersion',
    'secret', 'sessionReloaded', 'sourceRevision', 'status']
  if (Object.keys(receipt).sort().join(',') !== allowedKeys.sort().join(',') ||
      Object.keys(receipt.github ?? {}).sort().join(',') !== ['configured', 'environment', 'repository', 'secretName'].sort().join(',') ||
      Object.keys(receipt.secret ?? {}).sort().join(',') !== ['id', 'newVersion', 'previousVersion', 'state'].sort().join(',') ||
      Object.keys(receipt.results ?? {}).sort().join(',') !== ['accountEnabled', 'logoutRevoked', 'principalReloaded', 'providerPairVerified', 'sessionCreated'].sort().join(',')) fail('REAUTH_RECEIPT_SHAPE_INVALID')
  return true
}
export function localRequestDenial({ host, expectedHost, path, expectedPath, method, origin, expectedOrigin, contentType,
  csrfToken, expectedCsrf, submitted, busy, lastSubmitAt = 0, nowMs = Date.now(), contentLength }) {
  if (host !== expectedHost) return 400
  if (path !== expectedPath) return 404
  if (method === 'GET') return null
  if (method !== 'POST' || origin !== expectedOrigin || contentType !== 'application/x-www-form-urlencoded' ||
      csrfToken !== expectedCsrf || submitted || busy || nowMs - lastSubmitAt < 2000) return 403
  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > 8192) return 413
  return null
}
export function admitLocalRequest(input, state) {
  const nowMs = input.nowMs ?? Date.now()
  const denial = localRequestDenial({ ...input, submitted: state.submitted, busy: state.busy, lastSubmitAt: state.lastSubmitAt, nowMs })
  if (denial !== null) return denial
  if (input.method === 'POST') {
    state.busy = true
    state.lastSubmitAt = nowMs
  }
  return null
}
export function localPageSecurityHeaders(nonce) {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'nonce-" + nonce + "'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  }
}
function safeCookie(value) {
  if (typeof value !== 'string' || value.length < 10 || value.length > 8192 || /[\r\n]/u.test(value)) fail('PLATFORM_SESSION_COOKIE_INVALID')
  return value
}
export async function runReauthentication({
  adapter, email, password, expected, sourceRevision, commit = false,
  previousVersion, newVersion, now = () => Date.now(),
}) {
  if ((previousVersion === undefined) !== (newVersion === undefined)) fail('SECRET_VERSION_BINDING_INVALID')
  const versionBinding = previousVersion === undefined
    ? resolveVersionBinding()
    : resolveVersionBinding(previousVersion, newVersion)
  if (typeof email !== 'string' || email.length < 3 || email.length > 320 ||
      typeof password !== 'string' || password.length < 1 || password.length > 1024 ||
      expected?.issuer !== EXPECTED.issuer || typeof expected?.subject !== 'string') fail('REAUTH_INPUT_INVALID')
  let sessionCookie = null
  let logoutComplete = false
  let mutationStarted = false
  let secretVersionCreated = false
  let githubSecretConfigured = false
  let identity
  let authTime
  let authenticatedAt
  let signedIn = null
  let refreshedToken = null
  let transientSecretBytes = null
  let observedNewVersion = versionBinding.previousVersion
  try {
    signedIn = await adapter.signIn(email, password)
  if (typeof signedIn?.idToken !== 'string' || typeof signedIn?.refreshToken !== 'string' ||
        signedIn.localId !== expected.subject) fail('PASSWORD_SIGN_IN_INVALID')
    const claims = await adapter.verifyIdToken(signedIn.idToken, now())
    assertExpectedPair(claims, expected)
    assertFreshAuthTime(claims, now())
    authTime = claims.auth_time
    authenticatedAt = new Date(now()).toISOString()
    assertAccountLookup(await adapter.lookupAccount(signedIn.idToken), expected.subject)
    const created = await adapter.createPlatformSession(signedIn.idToken)
    if (created?.status !== 200) fail('PLATFORM_SESSION_CREATE_FAILED')
    sessionCookie = safeCookie(created.cookie)
    const first = await adapter.me(sessionCookie)
    const second = await adapter.me(sessionCookie)
    identity = assertStablePlatformMe(first, second)
    const loggedOut = await adapter.logout(sessionCookie)
    if (loggedOut?.status !== 200) fail('PLATFORM_LOGOUT_FAILED')
    logoutComplete = true
    assertLoggedOut(await adapter.me(sessionCookie))
    if (!commit) return { status: 'VERIFIED_ONLY', evidenceScope: REAUTH_SCOPE }
    const current = await adapter.latestSecretVersion()
    if (current?.version !== versionBinding.previousVersion || current?.state !== 'ENABLED') fail('SECRET_VERSION_CHANGED')
    mutationStarted = true
    const added = await adapter.addSecretVersion(signedIn.refreshToken)
    const version = String(added?.version ?? '')
    if (SECRET_VERSION.test(version) && Number.isSafeInteger(Number(version))) { observedNewVersion = version; secretVersionCreated = true }
    if (version !== versionBinding.newVersion) fail('SECRET_VERSION_NONMONOTONIC')
    const latestAfterWrite = await adapter.latestSecretVersion()
    if (latestAfterWrite?.version !== versionBinding.newVersion || latestAfterWrite?.state !== 'ENABLED') fail('SECRET_VERSION_RACE')
    const readback = await adapter.readSecretVersion(version)
    transientSecretBytes = readback?.bytes ?? null
    if (readback?.state !== 'ENABLED' || !Buffer.isBuffer(readback.bytes)) fail('SECRET_VERSION_READBACK_MISMATCH')
    let readbackRefreshToken = readback.bytes.toString('utf8')
    let expectedRefreshBytes
    try { expectedRefreshBytes = Buffer.from(signedIn.refreshToken, 'utf8') } catch { readbackRefreshToken = ''; fail('SECRET_VERSION_READBACK_MISMATCH') }
    let exactReadback = false
    try { exactReadback = readback.bytes.length === expectedRefreshBytes.length && timingSafeEqual(readback.bytes, expectedRefreshBytes) }
    finally { expectedRefreshBytes.fill(0) }
    if (!exactReadback) { readbackRefreshToken = ''; fail('SECRET_VERSION_READBACK_MISMATCH') }
    try { refreshedToken = await adapter.refreshSecret(readbackRefreshToken) }
    finally { readbackRefreshToken = '' }
    const refreshedClaims = await adapter.verifyIdToken(refreshedToken.idToken, now())
    assertExpectedPair(refreshedClaims, expected)
    assertAccountLookup(await adapter.lookupAccount(refreshedToken.idToken), expected.subject)
    await adapter.setGithubSecret(readback.bytes)
    const githubReady = await adapter.githubSecretPresent()
    if (githubReady !== true) fail('GITHUB_SECRET_READBACK_FAILED')
    githubSecretConfigured = true
    const observedAt = new Date(now()).toISOString()
    const receipt = buildReauthReceipt({
      sourceRevision, expected, authTime, authenticatedAt, principal: identity,
      previousVersion: versionBinding.previousVersion, newVersion: versionBinding.newVersion, observedAt,
    })
    validateReauthReceipt(receipt, {
      sourceRevision, expectedPreviousVersion: versionBinding.previousVersion,
      expectedNewVersion: versionBinding.newVersion, nowMs: now(),
    })
    const ref = await adapter.writeReceipt(receipt)
    return { status: 'COMMITTED', evidenceScope: REAUTH_SCOPE, ref }
  } catch (error) {
    if (sessionCookie && !logoutComplete) {
      try { await adapter.logout(sessionCookie); logoutComplete = true } catch {}
    }
    if (mutationStarted) {
      const partial = buildReauthReceipt({
        sourceRevision, expected, authTime: Number.isInteger(authTime) ? authTime : Math.floor(now() / 1000),
        authenticatedAt: authenticatedAt ?? new Date(now()).toISOString(),
        principal: identity,
        previousVersion: versionBinding.previousVersion, newVersion: observedNewVersion,
        observedAt: new Date(now()).toISOString(), status: 'PARTIAL',
        mutation: { secretVersionCreated, githubSecretConfigured },
      })
      const partialRef = await adapter.writePartialReceipt(partial)
      return { status: 'PARTIAL', code: error?.code ?? 'REAUTH_FAILED', evidenceScope: REAUTH_SCOPE, partialRef }
    }
    throw error instanceof ReauthError ? error : new ReauthError('REAUTH_FAILED')
  } finally {
    sessionCookie = null
    password = ''
    email = ''
    transientSecretBytes?.fill(0)
    if (signedIn) { signedIn.idToken = ''; signedIn.refreshToken = '' }
    if (refreshedToken) { refreshedToken.idToken = ''; refreshedToken.refreshToken = '' }
  }
}
function pageHtml(capability, csrf) {
  const nonce = randomBytes(18).toString('base64url')
  const page = '<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Smoke 憑證重新驗證</title><body><main><h1>Smoke 憑證重新驗證</h1><p>請輸入先前在本機 smoke 憑證設定頁為此帳號設定的既有密碼。這不是 gcloud 或 Google 密碼。本操作不建立帳號、不重設密碼、不發送驗證 email，也不變更綁定或授權。</p><form id="form" method="post" action="/' + capability + '"><input type="hidden" name="csrf" value="' + csrf + '"><label>Email <input name="email" type="email" autocomplete="username" required maxlength="320"></label><label>既有密碼 <input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button type="submit">重新驗證</button></form><output id="status" aria-live="polite"></output></main><script nonce="' + nonce + '">const f=document.getElementById("form"),o=document.getElementById("status");f.addEventListener("submit",async e=>{e.preventDefault();const fd=new FormData(f),d=new URLSearchParams(fd);let payload=d.toString();d.delete("email");d.delete("password");fd.delete("email");fd.delete("password");f.querySelector("[name=password]").value="";f.querySelector("[name=email]").value="";f.querySelector("button").disabled=true;try{const r=await fetch(location.pathname,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded","x-csrf-token":d.get("csrf")},body:payload,credentials:"omit"});const v=await r.json();o.textContent=v.status||"FAILED"}catch{o.textContent="FAILED"}finally{payload="";d.delete("csrf")}});</script></body></html>'
  return { html: page, nonce }
}
export async function startLocalReauthPage({ onSubmit, host = '127.0.0.1', ttlMs = 900000 }) {
  if (host !== '127.0.0.1' || typeof onSubmit !== 'function' || ttlMs < 1000 || ttlMs > 900000) fail('LOCAL_PAGE_CONFIGURATION_INVALID')
  const capability = randomBytes(24).toString('base64url')
  const csrf = randomBytes(24).toString('base64url')
  const requestState = { submitted: false, busy: false, lastSubmitAt: 0 }
  let server
  const html = pageHtml(capability, csrf)
  server = http.createServer(async (request, response) => {
    for (const [name, value] of Object.entries(localPageSecurityHeaders(html.nonce))) response.setHeader(name, value)
    const port = server.address()?.port
    const expectedHost = '127.0.0.1:' + port
    const target = '/' + capability
    const denial = admitLocalRequest({
      host: request.headers.host, expectedHost, path: request.url, expectedPath: target, method: request.method,
      origin: request.headers.origin, expectedOrigin: 'http://' + expectedHost,
      contentType: request.headers['content-type']?.split(';')[0], csrfToken: request.headers['x-csrf-token'],
      expectedCsrf: csrf, nowMs: Date.now(),
      contentLength: Number(request.headers['content-length'] ?? 0),
    }, requestState)
    if (denial !== null) { response.writeHead(denial, { 'content-type': 'application/json' }); response.end(denial === 404 ? '' : '{"status":"DENIED"}'); return }
    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end(html.html)
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk) => { body += chunk; if (Buffer.byteLength(body) > 8192) request.destroy() })
    request.on('end', async () => {
      requestState.submitted = true
      try {
        const form = new URLSearchParams(body)
        if (form.get('csrf') !== csrf) fail('CSRF_INVALID')
        let email = form.get('email') ?? ''
        let password = form.get('password') ?? ''
        form.delete('email')
        form.delete('password')
        let result
        try { result = await onSubmit({ email, password }) }
        finally { email = ''; password = ''; body = '' }
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ status: result?.status ?? 'FAILED', ref: result?.ref ?? null }))
      } catch (error) {
        response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        response.end(JSON.stringify({ status: error?.code ?? 'REAUTH_FAILED' }))
      } finally { body = '' }
    })
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.keepAliveTimeout = 1000
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve) })
  const address = server.address()
  const timer = setTimeout(() => server.close(), ttlMs)
  timer.unref()
  return {
    url: 'http://127.0.0.1:' + address.port + '/' + capability,
    close: () => new Promise((resolve) => { clearTimeout(timer); server.close(() => resolve()) }),
  }
}
