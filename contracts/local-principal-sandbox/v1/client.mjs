import { randomBytes } from 'node:crypto'
import {
  CLIENT_APPLICATIONS,
  MAX_BODY_BYTES,
  LOCAL_SANDBOX_VERSION,
  LocalSandboxError,
  isLoopbackHost,
  requireLoopbackOrigin,
  signLocalRequest,
  validateLocalAssertion,
  verifyLocalResponse,
} from './protocol.mjs'

export { LocalSandboxError }

const RESPONSE_LIMIT_BYTES = 64 * 1024
const DEFAULT_TIMEOUT_MS = 5000
const MAX_TIMEOUT_MS = 15_000
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu
const HASH = /^[a-f0-9]{64}$/u
const CODE = /^[A-Za-z0-9_-]{43}$/u
const PKCE_VERIFIER = /^[A-Za-z0-9_-]{43,128}$/u
const SAFE_CODE = /^[a-z][a-z0-9_]{1,63}$/u
const CONFIG_KEYS = [
  'contractVersion', 'applicationId', 'sandboxId', 'origin', 'platformOrigin',
  'bindHost', 'databaseName', 'runtimeRole', 'databaseUrl',
]

function fail(code, status = 400) {
  throw new LocalSandboxError(code, status)
}

function unavailable() {
  return new LocalSandboxError('local_sandbox_unavailable', 503)
}

function exactRecord(value, keys, code = 'local_request_invalid') {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key))) fail(code)
}

function boundedText(value, maxLength, code = 'local_request_invalid') {
  if (typeof value !== 'string' || value.length < 1 || value.length > maxLength || /[\r\n]/u.test(value)) fail(code)
  return value
}

function validConfig(config, clientId) {
  try {
    exactRecord(config, CONFIG_KEYS, 'local_client_not_configured')
    if (!Object.isFrozen(config) || config.contractVersion !== LOCAL_SANDBOX_VERSION
      || !Object.hasOwn(CLIENT_APPLICATIONS, clientId) || CLIENT_APPLICATIONS[clientId] !== config.applicationId
      || !/^[a-z][a-z0-9-]{2,63}$/u.test(config.sandboxId)
      || requireLoopbackOrigin(config.origin) !== config.origin
      || requireLoopbackOrigin(config.platformOrigin) !== config.platformOrigin
      || !isLoopbackHost(config.bindHost)
      || config.databaseName !== `jenfu_local_${config.sandboxId.replaceAll('-', '_')}` || config.databaseName.length > 63
      || !/^[a-z][a-z0-9_]{2,62}$/u.test(config.runtimeRole)) fail('local_client_not_configured', 503)

    const database = new URL(config.databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(database.protocol)
      || !isLoopbackHost(database.hostname)
      || database.pathname !== `/${config.databaseName}`
      || database.search || database.hash
      || !database.username || !database.password
      || decodeURIComponent(database.username) !== config.runtimeRole
      || database.href !== config.databaseUrl) fail('local_client_not_configured', 503)
  } catch {
    fail('local_client_not_configured', 503)
  }
}

function expectedAssertion(input, config) {
  const requiredKeys = [
    'applicationId', 'sandboxId', 'generation', 'fixtureVersion', 'fixtureHash', 'nativeSessionContractVersion',
  ]
  const optionalKeys = ['allowSyntheticAal2', 'assurancePolicyHash']
  if (!input || Object.getPrototypeOf(input) !== Object.prototype
    || requiredKeys.some(key => !Object.hasOwn(input, key))
    || Object.keys(input).some(key => !requiredKeys.includes(key) && !optionalKeys.includes(key))) {
    fail('local_assertion_invalid', 409)
  }
  if (input.applicationId !== config.applicationId || input.sandboxId !== config.sandboxId
    || !UUID.test(input.generation) || !HASH.test(input.fixtureHash)
    || typeof input.fixtureVersion !== 'string' || !input.fixtureVersion
    || typeof input.nativeSessionContractVersion !== 'string' || !input.nativeSessionContractVersion
    || input.allowSyntheticAal2 !== undefined && typeof input.allowSyntheticAal2 !== 'boolean'
    || input.assurancePolicyHash !== undefined && !HASH.test(input.assurancePolicyHash)
    || input.allowSyntheticAal2 === true && input.assurancePolicyHash === undefined) {
    fail('local_assertion_invalid', 409)
  }
  return input
}

function requestBodyJson(body) {
  const rawBody = JSON.stringify(body)
  if (typeof rawBody !== 'string') fail('local_request_invalid')
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_BODY_BYTES) fail('local_request_too_large', 413)
  return rawBody
}

async function readBoundedBody(response, signal) {
  const length = response.headers.get('content-length')
  if (length !== null) {
    if (!/^\d+$/u.test(length)) fail('local_response_invalid', 503)
    if (Number(length) > RESPONSE_LIMIT_BYTES) fail('local_response_too_large', 503)
  }
  if (!response.body) fail('local_response_invalid', 503)

  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  const cancelOnAbort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancelOnAbort, { once: true })
  if (signal.aborted) cancelOnAbort()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > RESPONSE_LIMIT_BYTES) {
        try { await reader.cancel() } catch { /* Preserve the size failure. */ }
        fail('local_response_too_large', 503)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof LocalSandboxError) throw error
    fail('local_response_invalid', 503)
  } finally {
    signal.removeEventListener('abort', cancelOnAbort)
    try { reader.releaseLock() } catch { /* A cancelled pending read still owns the lock. */ }
  }
}

function parseResponseObject(rawBody) {
  let value
  try { value = JSON.parse(rawBody) } catch { fail('local_response_invalid', 503) }
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('local_response_invalid', 503)
  return value
}

function assertJsonResponse(response) {
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (mediaType !== 'application/json') fail('local_response_invalid', 503)
}

function validateTokenInput(input, config) {
  exactRecord(input, ['code', 'redirectUri', 'codeVerifier', 'expected'])
  if (!CODE.test(input.code) || !PKCE_VERIFIER.test(input.codeVerifier)) {
    fail('local_request_invalid')
  }
  boundedText(input.redirectUri, MAX_BODY_BYTES)
  let callback
  try { callback = new URL(input.redirectUri) } catch { fail('local_request_invalid') }
  if (callback.origin !== config.origin || callback.username || callback.password
    || callback.search || callback.hash
    || input.redirectUri !== `${config.origin}/api/auth/local-sandbox/callback`) fail('local_request_invalid')
  const expected = expectedAssertion(input.expected, config)
  return {
    body: {
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: input.codeVerifier,
    },
    expected,
  }
}

function validateRegistrationInput(input) {
  exactRecord(input, ['registrationId', 'nativeSessionIdHash', 'joinDigest', 'idempotencyKey'])
  if (!UUID.test(input.registrationId) || !HASH.test(input.nativeSessionIdHash) || !HASH.test(input.joinDigest)) {
    fail('local_request_invalid')
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(input.idempotencyKey)) fail('local_request_invalid')
  return {
    registrationId: input.registrationId,
    nativeSessionIdHash: input.nativeSessionIdHash,
    joinDigest: input.joinDigest,
    idempotencyKey: input.idempotencyKey,
  }
}

function validateIntrospectionInput(input) {
  exactRecord(input, ['nativeSessionIdHash', 'expectedJoinDigest'])
  if (!HASH.test(input.nativeSessionIdHash) || !HASH.test(input.expectedJoinDigest)) fail('local_request_invalid')
  return { nativeSessionIdHash: input.nativeSessionIdHash, joinDigest: input.expectedJoinDigest }
}

function validateRevokeInput(input) {
  exactRecord(input, ['nativeSessionIdHash', 'reason'])
  if (!HASH.test(input.nativeSessionIdHash)) fail('local_request_invalid')
  boundedText(input.reason, 128)
  return { nativeSessionIdHash: input.nativeSessionIdHash, reason: input.reason }
}

export function createLocalSandboxClient({
  config,
  clientId,
  key,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
  nonce = () => randomBytes(24).toString('base64url'),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  validConfig(config, clientId)
  if (typeof key !== 'string' || typeof fetchImpl !== 'function' || typeof now !== 'function'
    || typeof nonce !== 'function' || !Number.isSafeInteger(timeoutMs)
    || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) fail('local_client_not_configured', 503)

  async function post(path, body) {
    const rawBody = requestBodyJson(body)
    const timestamp = now()
    if (!Number.isSafeInteger(timestamp) || !/^\d{13}$/u.test(String(timestamp))) {
      fail('local_client_not_configured', 503)
    }
    const requestNonce = nonce()
    const signature = signLocalRequest({ method: 'POST', path, audience: config.platformOrigin,
      clientId, timestamp, nonce: requestNonce, rawBody }, key)
    const controller = new AbortController()
    const headers = new Headers({
      Accept: 'application/json',
      Authorization: `JenfuLocal ${signature}`,
      'Content-Type': 'application/json',
      'x-jenfu-local-client': clientId,
      'x-jenfu-local-timestamp': String(timestamp),
      'x-jenfu-local-nonce': requestNonce,
    })
    const url = new URL(path, config.platformOrigin)
    if (url.origin !== config.platformOrigin || url.search || url.hash) fail('local_client_not_configured', 503)

    let timer
    let response
    let responseBody
    const operation = Promise.resolve().then(() => fetchImpl(url, {
      method: 'POST',
      headers,
      body: rawBody,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    }))
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(unavailable())
      }, timeoutMs)
    })
    try {
      response = await Promise.race([operation, deadline])
      if (!response || typeof response.status !== 'number' || response.status >= 300 && response.status < 400) {
        throw unavailable()
      }
      responseBody = await Promise.race([readBoundedBody(response, controller.signal), deadline])
    } catch (error) {
      if (response?.status >= 500) throw unavailable()
      if (error instanceof LocalSandboxError) throw error
      throw unavailable()
    } finally {
      clearTimeout(timer)
    }

    const responseSignature = response.headers.get('x-jenfu-local-response-signature')
    try {
      verifyLocalResponse({ rawBody: responseBody, nonce: requestNonce,
        audience: config.platformOrigin, clientId }, key, responseSignature)
    } catch (error) {
      if (response.status >= 500) throw unavailable()
      throw error
    }
    if (response.status >= 500) throw unavailable()
    assertJsonResponse(response)
    const result = parseResponseObject(responseBody)

    if (!response.ok) {
      if (response.status >= 400 && response.status < 500
        && typeof result.code === 'string' && SAFE_CODE.test(result.code)) {
        throw new LocalSandboxError(result.code, response.status)
      }
      throw unavailable()
    }
    return { value: result, proof: { rawBody: responseBody, nonce: requestNonce, audience: config.platformOrigin, clientId, signature: responseSignature } }
  }

  async function token(input) {
    const { body, expected } = validateTokenInput(input, config)
    const result = await post('/api/local-sandbox/token', body)
    return validateLocalAssertion(result.value, expected, now())
  }

  async function tokenProof(input) {
    const { body, expected } = validateTokenInput(input, config)
    const result = await post('/api/local-sandbox/token', body)
    return { assertion: validateLocalAssertion(result.value, expected, now()), ...result.proof }
  }

  async function register(input) {
    return (await post('/api/local-sandbox/register', validateRegistrationInput(input))).value
  }

  async function introspect(input) {
    return (await post('/api/local-sandbox/introspect', validateIntrospectionInput(input))).value
  }

  async function revoke(input) {
    return (await post('/api/local-sandbox/revoke', validateRevokeInput(input))).value
  }

  return Object.freeze({ token, tokenProof, register, introspect, revoke })
}
