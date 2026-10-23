import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { readRolePolicyWorkspace } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/workspace/route.ts'
export async function GET(request: Request) {
  const draftId = new URL(request.url).searchParams.get('draftId')
  return rolePolicyReadRoute(request, path, (client, _company, verified) =>
    readRolePolicyWorkspace(client, draftId, verified))
}
