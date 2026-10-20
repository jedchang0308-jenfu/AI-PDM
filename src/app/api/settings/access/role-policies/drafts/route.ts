import { assertExactKeys } from '@/lib/role-policy-http'
import { rolePolicyReadRoute, rolePolicyWriteRoute } from '@/lib/role-policy-route'
import { createRolePolicyDraft, listRolePolicyDrafts } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/drafts/route.ts'
export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
  return rolePolicyReadRoute(request, path, client => listRolePolicyDrafts(client, limit))
}
export async function POST(request: Request) {
  return rolePolicyWriteRoute(request, path, async (client, _company, verified, body) => {
    assertExactKeys(body, ['requestId', 'expectedActive'], ['sourceHistoryVersion'])
    return createRolePolicyDraft(client, verified, body)
  }, 201)
}
