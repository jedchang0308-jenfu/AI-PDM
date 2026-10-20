import { setTimeout as sleepDefault } from 'node:timers/promises'

const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])

function transient(error) {
  return error?.name === 'TimeoutError' || TRANSIENT.has(error?.cause?.code ?? error?.code)
}

function bodyError(code) {
  return Object.assign(new Error(code), { code })
}

async function readResponseBytes(response, signal, maxBytes) {
  if (!response?.ok || !response.body || typeof response.body.getReader !== 'function') throw bodyError('PROVIDER_READ_BODY_INVALID')
  const declared = response.headers?.get('content-length')
  if (declared != null && (!/^[0-9]+$/u.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > maxBytes)) throw bodyError('PROVIDER_READ_BODY_LIMIT')
  const reader = response.body.getReader(), chunks = []
  let length = 0
  try {
    while (true) {
      signal.throwIfAborted()
      let abort
      const aborted = new Promise((_, reject) => {
        abort = () => reject(signal.reason ?? new DOMException('Provider read deadline exceeded', 'TimeoutError'))
        signal.addEventListener('abort', abort, { once: true })
      })
      let part
      try { part = await Promise.race([reader.read(), aborted]) }
      finally { signal.removeEventListener('abort', abort) }
      if (part.done) break
      if (!(part.value instanceof Uint8Array) || length + part.value.byteLength > maxBytes) throw bodyError('PROVIDER_READ_BODY_LIMIT')
      length += part.value.byteLength
      chunks.push(Buffer.from(part.value))
    }
    return Buffer.concat(chunks, length)
  } catch (error) {
    chunks.length = 0
    try { void reader.cancel(error).catch(() => {}) } catch { /* retain original failure */ }
    throw error
  } finally {
    try { reader.releaseLock() } catch { /* canceled pending stream */ }
  }
}

// Shared by provider reads only. Caller-owned writes and unknown write outcomes
// never enter this helper. One deadline covers attempts AND backoff.
export async function fetchProviderRead(url, options = {}, { fetchImpl = fetch, sleep = sleepDefault, now = Date.now, timeoutMs = 30_000, onRetry = () => {} } = {}) {
  if ((options.method ?? 'GET') !== 'GET' || options.body != null) throw new Error('PROVIDER_READ_ONLY_REQUIRED')
  const deadline = now() + timeoutMs
  for (let attempt = 0; attempt < 3; attempt += 1) {
    options.signal?.throwIfAborted()
    const remaining = deadline - now()
    if (remaining <= 0) throw new DOMException('Provider read deadline exceeded', 'TimeoutError')
    let response, error, delay = null
    try {
      const timeout = AbortSignal.timeout(Math.ceil(remaining))
      response = await fetchImpl(url, { ...options, method: 'GET', signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout })
    } catch (caught) {
      error = caught
      if (transient(caught)) delay = 500 * 2 ** attempt
    }
    if (response?.ok) return response
    if (response && [429, 500, 502, 503, 504].includes(response.status)) {
      const header = response.headers?.get('retry-after')
      if (header != null) {
        const parsed = /^\d+$/u.test(header) ? Number(header) * 1000 : Date.parse(header) - now()
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 5000) delay = Math.max(500, parsed)
      } else if (response.status !== 429) delay = 500 * 2 ** attempt
    }
    if (attempt === 2 || delay == null || now() + delay >= deadline || options.signal?.aborted) {
      if (error) throw error
      return response
    }
    try { await response?.body?.cancel() } catch { /* preserve original failure */ }
    onRetry({ attempt: attempt + 1, status: response?.status ?? null })
    await sleep(delay, undefined, { signal: options.signal })
  }
}

// Complete-body reads retry only safe GET transport failures. Each attempt owns
// a fresh response stream, so partial bytes can never be joined to a later read.
export async function fetchProviderBytes(url, options = {}, {
  fetchImpl = fetch, sleep = sleepDefault, now = Date.now, timeoutMs = 120_000,
  attemptTimeoutMs = 60_000, maxBytes = 256 * 1024 * 1024, attempts = 2,
  onRetry = () => {},
} = {}) {
  if ((options.method ?? 'GET') !== 'GET' || options.body != null) throw new Error('PROVIDER_READ_ONLY_REQUIRED')
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(attemptTimeoutMs) || attemptTimeoutMs <= 0 ||
      !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || !Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3) throw bodyError('PROVIDER_READ_BODY_OPTIONS_INVALID')
  const deadline = now() + timeoutMs
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    options.signal?.throwIfAborted()
    const remaining = deadline - now()
    if (remaining <= 0) throw new DOMException('Provider read deadline exceeded', 'TimeoutError')
    const timeout = AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(attemptTimeoutMs, remaining))))
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    let response, error, delay = null
    try {
      response = await fetchImpl(url, { ...options, method: 'GET', signal })
      if (response?.ok) {
        try { return { response, bytes: await readResponseBytes(response, signal, maxBytes) } }
        catch (caught) {
          error = caught
          if (!options.signal?.aborted && (timeout.aborted || transient(caught))) delay = 500 * 2 ** attempt
        }
      }
    } catch (caught) {
      error = caught
      if (!options.signal?.aborted && (timeout.aborted || transient(caught))) delay = 500 * 2 ** attempt
    }
    if (response && !response.ok && [429, 500, 502, 503, 504].includes(response.status)) {
      const header = response.headers?.get('retry-after')
      if (header != null) {
        const parsed = /^\d+$/u.test(header) ? Number(header) * 1000 : Date.parse(header) - now()
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 5000) delay = Math.max(500, parsed)
      } else if (response.status !== 429) delay = 500 * 2 ** attempt
    }
    if (attempt + 1 >= attempts || delay == null || now() + delay >= deadline || options.signal?.aborted) {
      if (error) throw error
      return { response, bytes: null }
    }
    try { await response?.body?.cancel() } catch { /* preserve original failure */ }
    onRetry({ attempt: attempt + 1, status: response?.status ?? null })
    await sleep(delay, undefined, { signal: options.signal })
  }
}
