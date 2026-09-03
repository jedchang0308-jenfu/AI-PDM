import { NextResponse } from 'next/server'
import { requirePdmRouteAuthorizationAsync } from '@/lib/auth-async'
import { getRoleCapabilityCommandReceipt } from '@/lib/repositories/ai-pdm-role-capability-repository'

export const runtime = 'nodejs'

export async function GET(request: Request, context: { params: Promise<{ commandId: string }> }) {
  const auth = await requirePdmRouteAuthorizationAsync(request, ['Admin'])
  if (auth.response || !auth.user) return auth.response
  try { return NextResponse.json(await getRoleCapabilityCommandReceipt((await context.params).commandId), { headers: { 'cache-control': 'no-store' } }) }
  catch (error) { const code = error instanceof Error ? error.message : 'COMMAND_RECEIPT_READ_FAILED'; return NextResponse.json({ error: code }, { status: code.includes('UNAVAILABLE') ? 503 : 400 }) }
}
