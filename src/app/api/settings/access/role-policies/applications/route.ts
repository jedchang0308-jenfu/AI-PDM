import { assertExactKeys } from '@/lib/role-policy-http'
import { rolePolicyWriteRoute } from '@/lib/role-policy-route'
import { applyRolePolicy } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/applications/route.ts'
export async function POST(request: Request) {
  return rolePolicyWriteRoute(request, path, async (client, _company, verified, body) => {
    assertExactKeys(body, ['requestId', 'confirmation', 'reason'])
    return applyRolePolicy(client, verified, body)
  })
}
