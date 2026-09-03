import { NextResponse } from 'next/server'
import type { RoleCapabilityMutationInput } from '@/lib/ai-pdm-role-capability-contract'
import { previewRoleCapabilityChange } from '@/lib/repositories/ai-pdm-role-capability-repository'
import { requirePdmRouteAuthorizationAsync } from '@/lib/auth-async'

export const runtime = 'nodejs'

function parseBody(body: Record<string, unknown>): RoleCapabilityMutationInput {
  const operation = body.operation
  if (operation !== 'set_position_adoptions' && operation !== 'set_assignment_sources') throw new Error('ROLE_CAPABILITY_OPERATION_INVALID')
  const stableRoleId = String(body.stableRoleId ?? '').trim()
  const result: RoleCapabilityMutationInput = { stableRoleId, operation, baseProjectionCursor: Number(body.baseProjectionCursor), reason: String(body.reason ?? ''), expectedCatalogVersion: String(body.expectedCatalogVersion ?? ''), expectedCatalogPayloadHash: String(body.expectedCatalogPayloadHash ?? ''), expectedGovernanceRevision: String(body.expectedGovernanceRevision ?? ''), expectedOrganizationRevision: String(body.expectedOrganizationRevision ?? ''), requestHash: body.requestHash === undefined ? undefined : String(body.requestHash) }
  if (operation === 'set_position_adoptions') {
    if (!Array.isArray(body.adoptedPositionIds)) throw new Error('ADOPTED_POSITION_IDS_REQUIRED')
    result.adoptedPositionIds = body.adoptedPositionIds.map((value) => String(value))
  } else {
    if (!Array.isArray(body.changes)) throw new Error('ASSIGNMENT_SOURCE_CHANGES_REQUIRED')
    result.changes = body.changes.map((value) => {
      if (!value || typeof value !== 'object') throw new Error('ASSIGNMENT_SOURCE_CHANGE_INVALID')
      const item = value as Record<string, unknown>
      return { employeeId: String(item.employeeId ?? ''), positionId: String(item.positionId ?? ''), selected: item.selected === true }
    })
  }
  return result
}

export async function POST(request: Request) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ['Admin'])
  if (auth.response || !auth.user) return auth.response
  try {
    const body = await request.json() as Record<string, unknown>
    const parsed = parseBody(body)
    if (!parsed.expectedCatalogVersion || !parsed.expectedCatalogPayloadHash || !parsed.expectedGovernanceRevision || !parsed.expectedOrganizationRevision) return NextResponse.json({ error: 'REVISION_CONFLICT' }, { status: 409, headers: { 'cache-control': 'no-store' } })
    return NextResponse.json(await previewRoleCapabilityChange(parsed), { headers: { 'cache-control': 'no-store' } })
  } catch (error) {
    const code = error instanceof Error ? error.message : 'ROLE_CAPABILITY_PREVIEW_FAILED'
    return NextResponse.json({ error: code }, { status: code.includes('REVISION') || code.includes('CONFLICT') ? 409 : code.includes('UNAVAILABLE') ? 503 : 400 })
  }
}
