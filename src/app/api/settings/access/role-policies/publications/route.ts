import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { listRolePolicyPublications } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/publications/route.ts'
export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
  return rolePolicyReadRoute(request, path, client => listRolePolicyPublications(client, limit, new URL(request.url).searchParams.get('cursor')))
}
