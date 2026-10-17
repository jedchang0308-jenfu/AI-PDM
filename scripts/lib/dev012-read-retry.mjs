import { setTimeout as sleepDefault } from 'node:timers/promises'

const TRANSIENT = new Set(['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET'])

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
      if (caught?.name === 'TimeoutError' || TRANSIENT.has(caught?.cause?.code ?? caught?.code)) delay = 500 * 2 ** attempt
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
