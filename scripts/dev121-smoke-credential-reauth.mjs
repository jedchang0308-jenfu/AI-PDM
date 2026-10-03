#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import {
  EXPECTED, ReauthError, runReauthentication, startLocalReauthPage, verifyFirebaseIdToken,
} from './lib/dev121-smoke-credential-reauth.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROFILE = path.join(ROOT, 'config/release/dev117-ai-pdm-independent-production-v3.json')
const API_TIMEOUT_MS = 15000
function fail(code) { throw new ReauthError(code) }
function command(file, args, options = {}) {
  const result = spawnSync(file, args, {
    cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024,
    input: options.input, stdio: options.input === undefined ? ['ignore', 'pipe', 'ignore'] : ['pipe', 'pipe', 'ignore'],
  })
  if (result.error || result.status !== 0) fail(options.code ?? 'LOCAL_PROVIDER_COMMAND_FAILED')
  return String(result.stdout ?? '').trim()
}
function gcloudToken() {
  const exe = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin', 'gcloud.cmd')
    : 'gcloud'
  let token
  try { if (process.platform === 'win32') token = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '& $env:DEV012_GCLOUD auth print-access-token'], { encoding: 'utf8', windowsHide: true, timeout: API_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, DEV012_GCLOUD: exe } }).trim(); else token = execFileSync(exe, ['auth', 'print-access-token'], { encoding: 'utf8', windowsHide: true, timeout: API_TIMEOUT_MS, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { fail('GOOGLE_AUTH_REQUIRED') }
  if (token.length < 20) fail('GOOGLE_AUTH_REQUIRED')
  return token
}
function api(fetchImpl, token) {
  return async (url, options = {}) => {
    let response
    try {
      response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(API_TIMEOUT_MS), ...options,
        headers: { authorization: 'Bearer ' + token, ...(options.headers ?? {}) } })
    } catch { fail('PROVIDER_TRANSPORT_FAILED') }
    if (!response.ok) fail('PROVIDER_REQUEST_FAILED')
    try { return await response.json() } catch { fail('PROVIDER_RESPONSE_INVALID') }
  }
}
export function firebaseApi(fetchImpl, apiKey) {
  const post = async (url, body, contentType) => {
    let response
    try {
      response = await fetchImpl(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(API_TIMEOUT_MS),
        headers: { 'content-type': contentType }, body }) } catch { fail('FIREBASE_REQUEST_FAILED') }
    if (!response.ok) fail('FIREBASE_REQUEST_FAILED')
    try { return await response.json() } catch { fail('FIREBASE_RESPONSE_INVALID') }
  }
  const lookup = async (idToken) => {
    const result = await post('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(apiKey),
      JSON.stringify({ idToken }), 'application/json')
    if (!Array.isArray(result?.users) || result.users.length !== 1) fail('FIREBASE_ACCOUNT_LOOKUP_INVALID')
    return result.users[0]
  }
  return {
    lookup,
    refresh: async (refreshToken) => {
      const result = await post('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey),
        new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
        'application/x-www-form-urlencoded')
      if (typeof result.id_token !== 'string' || typeof result.refresh_token !== 'string') fail('FIREBASE_REFRESH_INVALID')
      return { idToken: result.id_token, refreshToken: result.refresh_token }
    },
    signIn: async (email, password) => {
      const result = await post('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(apiKey),
        JSON.stringify({ email, password, returnSecureToken: true }), 'application/json')
      if (typeof result.idToken !== 'string' || typeof result.refreshToken !== 'string') fail('PASSWORD_SIGN_IN_INVALID')
      return { idToken: result.idToken, refreshToken: result.refreshToken, localId: result.localId }
    },
  }
}
export async function secretVersion(call, version) {
  const name = 'projects/9536592944/secrets/' + EXPECTED.secretId + '/versions/' + version
  const meta = await call('https://secretmanager.googleapis.com/v1/' + name)
  const numeric = /\/versions\/([1-9][0-9]*)$/u.exec(meta?.name ?? '')?.[1]
  if (!numeric || !meta.name.startsWith('projects/9536592944/secrets/' + EXPECTED.secretId + '/versions/') ||
      (version !== 'latest' && numeric !== version) || !['ENABLED', 'DISABLED', 'DESTROYED'].includes(meta.state)) fail('SECRET_VERSION_METADATA_INVALID')
  return { ...meta, version: numeric }
}
async function readSecretVersion(call, version) {
  const meta = await secretVersion(call, version)
  if (meta.state !== 'ENABLED') fail('SECRET_VERSION_NOT_ENABLED')
  const result = await call('https://secretmanager.googleapis.com/v1/projects/9536592944/secrets/' + EXPECTED.secretId + '/versions/' + version + ':access')
  if (typeof result.payload?.data !== 'string') fail('SECRET_PAYLOAD_INVALID')
  const bytes = Buffer.from(result.payload.data, 'base64')
  if (bytes.length < 20 || bytes.length > 4096 || bytes.toString('base64') !== result.payload.data) { bytes.fill(0); fail('SECRET_PAYLOAD_INVALID') }
  return { state: meta.state, bytes }
}
async function verifyOldPair({ firebase, oldBytes, nowMs }) {
  let refreshed
  let oldRefreshToken = oldBytes.toString('utf8')
  try {
    refreshed = await firebase.refresh(oldRefreshToken)
    const claims = await verifyFirebaseIdToken(refreshed.idToken, { fetchImpl: fetch, nowMs })
    if (claims.iss !== EXPECTED.issuer || claims.firebase?.sign_in_provider !== 'password') fail('PRIOR_CREDENTIAL_IDENTITY_INVALID')
    const account = await firebase.lookup(refreshed.idToken)
    if (account.localId !== claims.sub || account.disabled !== false || account.emailVerified !== true) fail('PRIOR_CREDENTIAL_ACCOUNT_INVALID')
    return { issuer: claims.iss, subject: claims.sub }
  } finally {
    oldRefreshToken = ''
    if (refreshed) { refreshed.idToken = ''; refreshed.refreshToken = '' }
  }
}
async function main() {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--commit')) fail('USAGE')
  const commit = args[0] === '--commit'
  const profile = JSON.parse(await fs.readFile(PROFILE, 'utf8'))
  if (profile.application?.id !== EXPECTED.ownerApplicationId || profile.target?.projectId !== EXPECTED.projectId ||
      profile.target?.canonicalOrigin !== 'https://ai-pdm-prod-9536592944.asia-east1.run.app' ||
      profile.verification?.firebaseApiKeyEnvironmentName !== 'DEV012_AIPDM_FIREBASE_API_KEY' ||
      profile.artifact?.releaseBucket !== 'jenfu-platform-prod-aipdm-release') fail('AI_OWNER_PROFILE_MISMATCH')
  const sourceRevision = command('git', ['rev-parse', 'HEAD'])
  const status = command('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  const branch = command('git', ['branch', '--show-current'])
  const remote = command('git', ['remote', 'get-url', 'origin'])
  const remoteHead = command('git', ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/u)[0]
  if (branch !== 'main' || status !== '' || remoteHead !== sourceRevision || !/(?:github\.com[:/])jedchang0308-jenfu\/AI-PDM(?:\.git)?$/iu.test(remote)) fail('OWNER_SOURCE_NOT_FROZEN')
  const token = gcloudToken()
  const call = api(fetch, token)
  const firebaseKey = process.env.DEV012_AIPDM_FIREBASE_API_KEY
  if (typeof firebaseKey !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/u.test(firebaseKey)) fail('FIREBASE_API_KEY_REQUIRED')
  const firebase = firebaseApi(fetch, firebaseKey)
  const latest = await secretVersion(call, 'latest')
  if (!latest.name.endsWith('/versions/' + EXPECTED.oldSecretVersion) || latest.state !== 'ENABLED') fail('PRIOR_SECRET_VERSION_MISMATCH')
  const prior = await readSecretVersion(call, EXPECTED.oldSecretVersion)
  let expected
  try { expected = await verifyOldPair({ firebase, oldBytes: prior.bytes, nowMs: Date.now() }) } finally { prior.bytes.fill(0) }
  const ghList = () => JSON.parse(command('gh', ['secret', 'list', '--env', EXPECTED.githubEnvironment, '--repo', EXPECTED.repository, '--json', 'name,updatedAt'], { code: 'GITHUB_SECRET_READBACK_FAILED' }))
  if (!ghList().some((row) => row.name === EXPECTED.githubSecretName)) fail('GITHUB_SECRET_NOT_PRESENT')
  const transport = createOwnerTransport({ token })
  const adapter = {
    signIn: firebase.signIn,
    verifyIdToken: (value, nowMs) => verifyFirebaseIdToken(value, { fetchImpl: fetch, nowMs }),
    lookupAccount: firebase.lookup,
    createPlatformSession: async (idToken) => {
      let response
      try {
        response = await fetch(new URL('/api/auth/firebase/session', EXPECTED.canonicalOrigin), {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(API_TIMEOUT_MS),
          headers: { origin: EXPECTED.canonicalOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ idToken }),
        })
      } catch { fail('PLATFORM_SESSION_CREATE_FAILED') }
      const setCookie = response.headers.get('set-cookie')
      if (!response.ok || !setCookie || response.headers.has('location')) fail('PLATFORM_SESSION_CREATE_FAILED')
      return { status: response.status, cookie: setCookie.split(';', 1)[0] }
    },
    me: async (cookie) => {
      let response
      try { response = await fetch(new URL('/api/auth/me', EXPECTED.canonicalOrigin), { redirect: 'manual', signal: AbortSignal.timeout(API_TIMEOUT_MS), headers: { cookie } }) } catch { fail('PLATFORM_ME_FAILED') }
      if (response.status === 401) return { status: 401 }
      if (!response.ok || response.headers.has('location')) fail('PLATFORM_ME_FAILED')
      let value
      try { value = await response.json() } catch { fail('PLATFORM_ME_FAILED') }
      return { status: response.status, value }
    },
    logout: async (cookie) => {
      let response
      try {
        response = await fetch(new URL('/api/auth/logout', EXPECTED.canonicalOrigin), {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(API_TIMEOUT_MS),
          headers: { origin: EXPECTED.canonicalOrigin, cookie, 'content-type': 'application/json' }, body: '{}',
        })
      } catch { fail('PLATFORM_LOGOUT_FAILED') }
      return { status: response.status }
    },
    latestSecretVersion: async () => {
      const meta = await secretVersion(call, 'latest')
      return { version: meta.name.split('/').at(-1), state: meta.state }
    },
    addSecretVersion: async (refreshToken) => {
      const url = 'https://secretmanager.googleapis.com/v1/projects/9536592944/secrets/' + EXPECTED.secretId + ':addVersion'
      const payloadBytes = Buffer.from(refreshToken, 'utf8')
      let payloadBase64 = ''
      try {
        payloadBase64 = payloadBytes.toString('base64')
        const result = await call(url, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ payload: { data: payloadBase64 } }) })
        const match = /\/versions\/([1-9][0-9]*)$/u.exec(result.name ?? '')
        if (!match) fail('SECRET_VERSION_CREATE_INVALID')
        return { version: match[1] }
      } finally { payloadBytes.fill(0); payloadBase64 = '' }
    },
    readSecretVersion: (version) => readSecretVersion(call, version),
    refreshSecret: (refreshToken) => firebase.refresh(refreshToken),
    setGithubSecret: async (bytes) => {
      const result = spawnSync('gh', ['secret', 'set', EXPECTED.githubSecretName, '--env', EXPECTED.githubEnvironment, '--repo', EXPECTED.repository],
        { input: bytes, windowsHide: true, timeout: API_TIMEOUT_MS, stdio: ['pipe', 'ignore', 'ignore'] })
      if (result.error || result.status !== 0) fail('GITHUB_SECRET_WRITE_FAILED')
    },
    githubSecretPresent: async () => ghList().some((row) => row.name === EXPECTED.githubSecretName),
    writeReceipt: async (receipt) => {
      const name = 'receipts/credential-reauth/' + new Date().toISOString().replaceAll(':', '-') + '-' + randomBytes(8).toString('hex') + '.json'
      const uri = 'gs://' + profile.artifact.releaseBucket + '/' + name
      const result = await transport.putJson(uri, receipt, { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
      return result.ref
    },
    writePartialReceipt: async (receipt) => {
      const name = 'receipts/credential-reauth/partial-' + Date.now() + '-' + randomBytes(8).toString('hex') + '.json'
      const result = await transport.putJson('gs://' + profile.artifact.releaseBucket + '/' + name, receipt,
        { bucket: profile.artifact.releaseBucket, prefix: 'receipts' })
      return result.ref
    },
  }
  const started = Date.now()
  let finish
  const completed = new Promise((resolve) => { finish = resolve })
  const page = await startLocalReauthPage({
    ttlMs: 900000,
    onSubmit: async ({ email, password }) => {
      let submittedEmail = email
      let submittedPassword = password
      try {
        const result = await runReauthentication({ adapter, email: submittedEmail, password: submittedPassword, expected, sourceRevision, commit })
        finish(result)
        return result
      } catch (error) {
        finish({ status: 'FAILED', code: error?.code ?? 'REAUTH_FAILED' })
        throw error
      } finally { submittedEmail = ''; submittedPassword = '' }
    },
  })
  process.stdout.write(JSON.stringify({ status: 'READY', url: page.url, expiresInSeconds: 900 }) + '\n')
  let expiryTimer
  const expired = new Promise((resolve) => { expiryTimer = setTimeout(() => resolve({ status: 'EXPIRED' }), 900000) })
  let result
  try { result = await Promise.race([completed, expired]) }
  finally { clearTimeout(expiryTimer); await page.close() }
  process.stdout.write(JSON.stringify({ status: result.status, evidenceScope: result.evidenceScope ?? null, ref: result.ref ?? result.partialRef ?? null,
    code: result.code ?? null, durationSeconds: Math.round((Date.now() - started) / 1000) }) + '\n')
  if (!['VERIFIED_ONLY', 'COMMITTED'].includes(result.status)) process.exitCode = 2
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write((error?.code ?? 'REAUTH_OPERATOR_FAILED') + '\n'); process.exitCode = 1 })
}
