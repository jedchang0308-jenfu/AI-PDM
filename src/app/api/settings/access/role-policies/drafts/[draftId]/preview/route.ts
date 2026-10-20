import { rolePolicyReadRoute } from '@/lib/role-policy-route'
import { previewRolePolicyDraft } from '@/lib/role-policy-service'

export const runtime = 'nodejs'
const path = 'src/app/api/settings/access/role-policies/drafts/[draftId]/preview/route.ts'
export async function GET(request: Request, context: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await context.params
  const params = new URL(request.url).searchParams
  return rolePolicyReadRoute(request, path, client => previewRolePolicyDraft(client, draftId,
    Number(params.get('expectedDraftRevision')), params.get('expectedDraftHash') ?? ''))
}
