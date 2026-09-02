import { NextResponse } from 'next/server'
import { getRoleCapabilityChangeFeed } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { requirePdmRouteAuthorizationAsync } from '@/lib/auth-async'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ['Admin'])
  if (auth.response || !auth.user) return auth.response
  const url = new URL(request.url)
  const after = Number(url.searchParams.get('after') ?? 0)
  const limit = Number(url.searchParams.get('limit') ?? 100)
  try {
    return NextResponse.json(await getRoleCapabilityChangeFeed(Number.isFinite(after) ? after : 0, Number.isFinite(limit) ? limit : 100), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ROLE_CAPABILITY_CHANGE_FEED_FAILED'
    const status = code === 'CHANGE_CURSOR_EXPIRED' ? 410 : code.includes('UNAVAILABLE') ? 503 : 400
    return NextResponse.json({ error: code }, { status })
  }
}
