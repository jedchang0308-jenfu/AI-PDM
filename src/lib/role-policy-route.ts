import { randomUUID } from 'node:crypto'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { PdmCompanyContext } from '@/lib/company-context'
import { requestedPdmCompanyCodeFromRequest } from '@/lib/company-context'
import { withPrincipalCompanyRead, withPrincipalCompanyWrite } from '@/lib/principal-company-read'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { resolveJenfuRoutePolicy } from '@/lib/jenfu-route-permission-map'
import { readRolePolicyJson, rolePolicyErrorResponse, RolePolicyHttpError } from '@/lib/role-policy-http'

const permission = 'settings.admin_matrix'
const headers = { 'cache-control': 'private, no-store' }
type Handler = (client: AsyncDatabaseClient, company: PdmCompanyContext,
  verified: VerifiedPrincipalRequest) => Promise<unknown>

function dataResponse(data: unknown, status = 200, correlationId = randomUUID()) {
  return Response.json({ contractVersion: 'ai-pdm.role-policy-workspace.v3', data, correlationId }, { status, headers })
}

export async function rolePolicyReadRoute(request: Request, routePath: string, handler: Handler) {
  const policy = resolveJenfuRoutePolicy(routePath, 'GET', { expectedPermissionCode: permission })
  if (policy?.authorizationMode !== 'permission' || policy.scopeResolver !== 'workspace') {
    return Response.json({ code: 'principal_route_policy_unavailable' }, { status: 503, headers })
  }
  const response = await withPrincipalCompanyRead(request, requestedPdmCompanyCodeFromRequest(request),
    [{ permissionKind: 'action', permissionCode: permission }], async (client, company, verified) => {
      try {
        const expected = request.headers.get('x-pdm-policy-principal')
        if (expected && expected !== verified.session.principalId) throw new RolePolicyHttpError('PRINCIPAL_CONTEXT_CONFLICT',409)
        return dataResponse(await handler(client, company, verified))
      }
      catch (error) { return rolePolicyErrorResponse(error) }
    })
  return response ?? Response.json({ code: 'auth_session_invalid' }, { status: 401, headers })
}

export async function rolePolicyWriteRoute(request: Request, routePath: string,
  handler: (client: AsyncDatabaseClient, company: PdmCompanyContext,
    verified: VerifiedPrincipalRequest, body: Record<string, unknown>) => Promise<unknown>, status = 200) {
  let body: Record<string, unknown>
  try { body = await readRolePolicyJson(request) } catch (error) { return rolePolicyErrorResponse(error) }
  return withPrincipalCompanyWrite(request, routePath, permission, async (client, company, verified) => {
    try {
      if (request.headers.get('x-pdm-policy-principal') !== verified.session.principalId) {
        throw new RolePolicyHttpError('PRINCIPAL_CONTEXT_CONFLICT',409)
      }
      return dataResponse(await handler(client, company, verified, body), status)
    }
    catch (error) { return rolePolicyErrorResponse(error) }
  }, { isolationLevel: 'read_committed' })
}
