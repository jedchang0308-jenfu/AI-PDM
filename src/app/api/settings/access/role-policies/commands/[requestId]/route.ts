import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { readRolePolicyCommand } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/commands/[requestId]/route.ts'
export async function GET(request: Request, context: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await context.params
  return rolePolicyReadRoute(request, path, (client, _company, verified) =>
    readRolePolicyCommand(client, requestId, verified))
}
