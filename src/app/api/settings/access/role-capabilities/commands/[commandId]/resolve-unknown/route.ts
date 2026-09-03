import { NextResponse } from 'next/server'
import { requirePdmRouteAuthorizationAsync } from '@/lib/auth-async'
import { resolveRoleCapabilityCommandUnknown } from '@/lib/repositories/ai-pdm-role-capability-repository'

export const runtime = 'nodejs'

export async function POST(request: Request, context: { params: Promise<{ commandId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ['Admin'])
  if (auth.response || !auth.user) return auth.response
  try {
    const body = await request.json() as Record<string, unknown>
    const requestHash = String(body.requestHash ?? '').trim()
    if (!requestHash || body.action !== 'cancel_if_absent_or_expired') return NextResponse.json({ error: 'INVALID_COMMAND' }, { status: 400 })
    return NextResponse.json(await resolveRoleCapabilityCommandUnknown((await context.params).commandId, requestHash), { headers: { 'cache-control': 'no-store' } })
  } catch (error) { const code = error instanceof Error ? error.message : 'COMMAND_RESOLVE_FAILED'; return NextResponse.json({ error: code }, { status: code.includes('PROCESSING') || code.includes('CONFLICT') ? 409 : 400 }) }
}
