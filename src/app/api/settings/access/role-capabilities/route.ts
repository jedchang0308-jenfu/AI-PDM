import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { readPublishedRoleCapabilityWorkspace } from '@/lib/ai-pdm-published-role-capability-workspace'
import { withPrincipalCompanyRead } from '@/lib/principal-company-read'
import { requestedPdmCompanyCodeFromRequest } from '@/lib/company-context'
import { resolveJenfuRoutePolicy } from '@/lib/jenfu-route-permission-map'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const policy = resolveJenfuRoutePolicy('src/app/api/settings/access/role-capabilities/route.ts', 'GET',
    { expectedPermissionCode: 'settings.admin_matrix' })
  if (request.method !== 'GET' || policy?.authorizationMode !== 'permission' || policy.scopeResolver !== 'workspace') {
    return NextResponse.json({ code: 'principal_route_policy_unavailable' }, { status: 503 })
  }
  const selected = new URL(request.url).searchParams.get('stableRoleId')?.trim() || null
  const response = await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: 'action', permissionCode: 'settings.admin_matrix' }], async (snapshot, company) => {
      try {
        const view = await readPublishedRoleCapabilityWorkspace(snapshot, company.companyId, selected)
        return view ? NextResponse.json(view, { headers: { 'cache-control': 'no-store' } })
          : NextResponse.json({ error: 'ROLE_NOT_FOUND' }, { status: 404, headers: { 'cache-control': 'no-store' } })
      } catch {
        const correlationId = randomUUID()
        console.error(JSON.stringify({ event: 'role_capability_read_failed', stage: 'published_contract_read',
          correlationId, reason: 'PUBLISHED_CONTRACT_UNAVAILABLE' }))
        return NextResponse.json({ error: 'ROLE_CAPABILITY_UNAVAILABLE', correlationId },
          { status: 503, headers: { 'cache-control': 'no-store' } })
      }
    })
  return response ?? NextResponse.json({ code: 'auth_session_invalid' },
    { status: 401, headers: { 'cache-control': 'no-store' } })
}
