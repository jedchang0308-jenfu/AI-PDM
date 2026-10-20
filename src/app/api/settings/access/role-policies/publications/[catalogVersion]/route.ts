import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { readRolePolicyPublication } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/publications/[catalogVersion]/route.ts'
export async function GET(request: Request, context: { params: Promise<{ catalogVersion: string }> }) {
  const { catalogVersion } = await context.params
  return rolePolicyReadRoute(request, path, client => readRolePolicyPublication(client, catalogVersion))
}
