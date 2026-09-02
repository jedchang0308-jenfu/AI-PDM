import { NextResponse } from 'next/server'
import type { RoleCapabilityWorkspaceV2 } from '@/lib/ai-pdm-role-capability-contract'
import { readRoleCapabilityWorkspace } from '@/lib/ai-pdm-role-capability-service'
import { requirePdmRouteAuthorizationAsync } from '@/lib/auth-async'

export const runtime = 'nodejs'

async function readView(request: Request) {
  const selected = new URL(request.url).searchParams.get('stableRoleId')?.trim() || null
  const view = await readRoleCapabilityWorkspace()
  if (selected && view.roles.length && !view.roles.some((role) => role.catalogRole.stableRoleId === selected)) return null
  return { ...view, selectedRoleId: selected, roles: selected && view.roles.length ? view.roles.filter((role) => role.catalogRole.stableRoleId === selected) : view.roles } as RoleCapabilityWorkspaceV2
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : 'ROLE_CAPABILITY_FAILED'
  const status = code.includes('REVISION') ? 409 : code.includes('UNAVAILABLE') ? 503 : 400
  return NextResponse.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } })
}

export async function GET(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ['Admin'])
  if (auth.response || !auth.user) return auth.response
  try {
    const view = await readView(request)
    if (!view) return NextResponse.json({ error: 'ROLE_NOT_FOUND' }, { status: 404 })
    if (view.dataState === 'unavailable') return NextResponse.json({ ...view, error: view.dependency.decisionCode }, { status: 503, headers: { 'cache-control': 'no-store' } })
    return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
