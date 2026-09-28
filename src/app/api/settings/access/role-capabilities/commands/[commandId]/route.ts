import { NextResponse } from 'next/server'
import { authorizePrincipalWorkspaceExternalRead } from '@/lib/principal-company-read'
import { getRoleCapabilityCommandReceipt } from '@/lib/repositories/ai-pdm-role-capability-repository'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ commandId: string }> }) {
  const authorization = await authorizePrincipalWorkspaceExternalRead(request,
    'src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts',
    'settings.admin_matrix')
  if (authorization instanceof Response) return authorization
  try { return NextResponse.json(await getRoleCapabilityCommandReceipt((await context.params).commandId), { headers: { 'cache-control': 'no-store' } }) }
  catch (error) { const code = error instanceof Error ? error.message : 'COMMAND_RECEIPT_READ_FAILED'; return NextResponse.json({ error: code }, { status: code.includes('UNAVAILABLE') ? 503 : 400 }) }
}
