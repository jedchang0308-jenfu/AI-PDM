import { NextResponse } from 'next/server'
import { getRoleCapabilityChangeFeed } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { authorizePrincipalWorkspaceExternalRead } from '@/lib/principal-company-read'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    'src/app/api/settings/access/role-capabilities/change-feed/route.ts',
    'settings.admin_matrix')
  if (authorization instanceof Response) return authorization
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
