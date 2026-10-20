import { randomUUID } from 'node:crypto'
import { isAllowedRequestOrigin } from '@/lib/request-origin'
import { rolePolicyRegistry } from '@/lib/role-policy-editor'

export class RolePolicyHttpError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
}

function assertNoDuplicateObjectKeys(raw: string) {
  const stack: Array<{ kind: 'object'; keys: Set<string>; expectingKey: boolean } | { kind: 'array' }> = []
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index]
    if (/\s/u.test(token)) continue
    if (token === '{') { stack.push({ kind: 'object', keys: new Set(), expectingKey: true }); continue }
    if (token === '[') { stack.push({ kind: 'array' }); continue }
    if (token === '}' || token === ']') { stack.pop(); continue }
    if (token === ',') {
      const top = stack.at(-1)
      if (top?.kind === 'object') top.expectingKey = true
      continue
    }
    if (token !== '"') continue
    const start = index
    index += 1
    for (; index < raw.length; index += 1) {
      if (raw[index] === '\\') { index += 1; continue }
      if (raw[index] === '"') break
    }
    if (index >= raw.length) throw new RolePolicyHttpError('INVALID_JSON')
    const top = stack.at(-1)
    if (top?.kind !== 'object' || !top.expectingKey) continue
    let next = index + 1
    while (next < raw.length && /\s/u.test(raw[next])) next += 1
    if (raw[next] !== ':') continue
    const key = JSON.parse(raw.slice(start, index + 1)) as string
    if (top.keys.has(key)) throw new RolePolicyHttpError('DUPLICATE_JSON_KEY')
    top.keys.add(key); top.expectingKey = false
  }
}

export async function readRolePolicyJson(request: Request) {
  if (!isAllowedRequestOrigin(request)) throw new RolePolicyHttpError('REQUEST_ORIGIN_INVALID', 403)
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw new RolePolicyHttpError('CONTENT_TYPE_INVALID', 415)
  }
  const announced = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(announced) && announced > rolePolicyRegistry.limits.maxRequestBytes) {
    throw new RolePolicyHttpError('REQUEST_TOO_LARGE', 413)
  }
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > rolePolicyRegistry.limits.maxRequestBytes) throw new RolePolicyHttpError('REQUEST_TOO_LARGE', 413)
  assertNoDuplicateObjectKeys(raw)
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new RolePolicyHttpError('INVALID_JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RolePolicyHttpError('INVALID_JSON')
  return parsed as Record<string, unknown>
}

export function assertExactKeys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  const allowed = new Set([...required, ...optional])
  if (Object.keys(value).some(key => !allowed.has(key)) || required.some(key => !(key in value))) {
    throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  }
}

export function rolePolicyErrorResponse(error: unknown, correlationId = randomUUID()) {
  if (error instanceof RolePolicyHttpError) return Response.json({ code: error.code, correlationId },
    { status: error.status, headers: { 'cache-control': 'private, no-store' } })
  const code = error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : 'ROLE_POLICY_DEPENDENCY_UNAVAILABLE'
  const status = code.includes('CONFLICT') || code === 'REQUEST_ID_REUSE' ? 409
    : code.includes('NOT_READY') || code.includes('NOT_ENABLED') || code.includes('PAUSED') || code.includes('UNAVAILABLE') ? 503
      : code.includes('LIMIT') || code.includes('INVALID') || code.includes('UNKNOWN') || code.includes('READONLY') || code.includes('UNSUPPORTED') ? 422 : 500
  return Response.json({ code, correlationId }, { status, headers: { 'cache-control': 'private, no-store' } })
}
