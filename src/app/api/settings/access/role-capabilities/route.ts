import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { RoleCapabilityWorkspaceV2, RoleCapabilityWorkspaceV3 } from '@/lib/ai-pdm-role-capability-contract'
import { readPrivilegedRoleCapabilityWorkspace, readRoleCapabilityWorkspace } from '@/lib/ai-pdm-role-capability-service'
import { authorizePrincipalWorkspaceExternalRead } from '@/lib/principal-company-read'

export const runtime = 'nodejs'

async function readView(request: Request) {
  const selected = new URL(request.url).searchParams.get('stableRoleId')?.trim() || null
  if (selected === 'role-system-admin') return readPrivilegedRoleCapabilityWorkspace()
  const view = await readRoleCapabilityWorkspace()
  if (selected && view.roles.length && !view.roles.some((role) => role.catalogRole.stableRoleId === selected)) return null
  return { ...view, selectedRoleId: selected, roles: selected && view.roles.length ? view.roles.filter((role) => role.catalogRole.stableRoleId === selected) : view.roles } as RoleCapabilityWorkspaceV2
}

function errorResponse(error: unknown) {
  const correlationId = randomUUID();
  const safeCodes = new Set(['ORGMASTER_CATALOG_MISMATCH', 'ORGMASTER_CONTRACT_INVALID', 'ROLE_CAPABILITY_SNAPSHOT_INVALID']);
  const observedCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  console.error(JSON.stringify({ event: 'role_capability_read_failed', stage: 'display_read', correlationId,
    reason: safeCodes.has(observedCode) ? observedCode : 'UNEXPECTED_DEPENDENCY_FAILURE' }));
  return NextResponse.json({ error: "ROLE_CAPABILITY_UNAVAILABLE", correlationId },
    { status: 503, headers: { "cache-control": "no-store" } })
}

export async function GET(request: Request) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    'src/app/api/settings/access/role-capabilities/route.ts', 'settings.admin_matrix')
  if (authorization instanceof Response) return authorization
  try {
    const view = await readView(request) as RoleCapabilityWorkspaceV2 | RoleCapabilityWorkspaceV3 | null
    if (!view) return NextResponse.json({ error: 'ROLE_NOT_FOUND' }, { status: 404 })
    if (view.dataState === 'unavailable') return NextResponse.json({ ...view, error: view.dependency.decisionCode }, { status: 503, headers: { 'cache-control': 'no-store' } })
    return NextResponse.json(view, { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    return errorResponse(error)
  }
}
