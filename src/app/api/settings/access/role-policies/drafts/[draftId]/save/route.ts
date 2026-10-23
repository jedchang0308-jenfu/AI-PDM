import { assertExactKeys } from '@/lib/role-policy-http'
import { rolePolicyWriteRoute } from '@/lib/role-policy-route'
import { saveRolePolicyDraft } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/drafts/[draftId]/save/route.ts'
export async function POST(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  return rolePolicyWriteRoute(request, path, async (client, _company, verified, body) => {
    assertExactKeys(body, ['expectedRevision', 'roleChanges', 'changes'])
    return saveRolePolicyDraft(client, verified, draftId, body)
  })
}
