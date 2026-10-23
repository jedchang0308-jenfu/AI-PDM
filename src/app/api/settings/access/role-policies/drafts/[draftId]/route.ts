import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { readRolePolicyDraft } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/drafts/[draftId]/route.ts'
export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  return rolePolicyReadRoute(request, path, client => readRolePolicyDraft(client, draftId))
}
