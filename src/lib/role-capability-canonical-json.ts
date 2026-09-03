export const ROLE_CAPABILITY_CANONICALIZATION_VERSION = 'jenfu.canonical-json.v1' as const

function assertNoLoneSurrogate(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) throw new Error('CANONICAL_JSON_INVALID_STRING')
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('CANONICAL_JSON_INVALID_STRING')
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean') return String(value)
  if (typeof value === 'string') { assertNoLoneSurrogate(value); return JSON.stringify(value) }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error('CANONICAL_JSON_INVALID_NUMBER')
    return Object.is(value, -0) ? '0' : String(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    return `{${entries.map(([key, entry]) => `${canonicalJson(key)}:${canonicalJson(entry)}`).join(',')}}`
  }
  throw new Error('CANONICAL_JSON_UNSUPPORTED')
}

export async function sha256CanonicalJson(value: unknown) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(value)))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
