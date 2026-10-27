import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { DrawingRecognitionError, type DrawingRecognitionImpactChange } from '@/lib/drawing-recognition-contract'
import { authorizeDynamicResourceCapabilityInSnapshot, canonicalCapabilityGroups,
  isDynamicRolePolicyInSnapshot, type PrincipalCapabilityGroup } from '@/lib/principal-resource-capability'
import { parsePrincipalJobInitiator, requireCurrentPrincipalJobAuthority } from '@/lib/principal-job-authority'

export async function requireRecognitionJobAuthority(snapshot: AsyncDatabaseClient, session: {
  id: string; company_id: string; created_by: string; initiator_principal_id?: string | null;
  initiator_authority_json?: unknown
}, options: { requireCurrentPolicy?: boolean } = {}) {
  if (!options.requireCurrentPolicy && !await isDynamicRolePolicyInSnapshot(snapshot)) return false
  const initiator = parsePrincipalJobInitiator(session.initiator_authority_json)
  if (!initiator || initiator.principalId !== session.initiator_principal_id ||
      initiator.pdmUserId !== session.created_by || initiator.companyId !== session.company_id) {
    throw new DrawingRecognitionError('RECOGNITION_INITIATOR_RETRY_REQUIRED', '此工作缺少可確認的發起者資料，請重新啟動辨識。', 403)
  }
  const sources = await snapshot.query<{ source_role: string; document_category: string; linked_entity_type: string }>(
    `SELECT source.source_role,asset.document_category,asset.linked_entity_type FROM ai_pdm_core.drawing_recognition_sources source
       JOIN ai_pdm_core.file_assets asset ON asset.id=source.file_asset_id AND asset.deleted_at IS NULL
      WHERE source.session_id=:sessionId AND source.company_id=:companyId`,
    { sessionId: session.id, companyId: session.company_id })
  if (!sources.length) throw new DrawingRecognitionError('RECOGNITION_SOURCE_SCOPE_INVALID', '找不到可授權的辨識來源。', 404)
  if (sources.some(source => !canonicalCapabilityGroups(source.linked_entity_type, source.source_role || source.document_category).length)) {
    throw new DrawingRecognitionError('RECOGNITION_SOURCE_SCOPE_INVALID', '辨識來源範圍無法確認。', 503)
  }
  try {
    // User-owned Windows parsers receive originals, so view alone cannot grant
    // local CAD access. Recheck both actions for every actual source group.
    await requireCurrentPrincipalJobAuthority(snapshot, initiator, { linkedEntityType: 'drawing_revision', action: 'view_and_download' })
    for (const source of sources) await requireCurrentPrincipalJobAuthority(snapshot, initiator,
      { linkedEntityType: source.linked_entity_type, documentCategory: source.source_role || source.document_category, action: 'view_and_download' })
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 503
    throw new DrawingRecognitionError('RECOGNITION_INITIATOR_AUTHORITY_DENIED', '辨識發起者的授權已失效，請重新確認角色後再試。', status === 403 ? 403 : 503)
  }
  return true
}

export async function requireRecognitionSourceCapabilities(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, sessionId: string, action: 'view' | 'download' | 'edit', sourceId?: string) {
  if (!await isDynamicRolePolicyInSnapshot(snapshot)) return
  const sources = await snapshot.query<{ linked_entity_type: string; document_category: string; source_role: string }>(
    `SELECT asset.linked_entity_type,asset.document_category,source.source_role
       FROM ai_pdm_core.drawing_recognition_sessions session
       JOIN ai_pdm_core.drawing_recognition_sources source
         ON source.session_id=CASE WHEN session.session_purpose='amendment'
           THEN COALESCE(session.evidence_origin_session_id,session.id) ELSE session.id END
         AND source.company_id=session.company_id
       JOIN ai_pdm_core.file_assets asset ON asset.id=source.file_asset_id AND asset.deleted_at IS NULL
      WHERE session.id=:sessionId AND session.company_id=:companyId
        AND (CAST(:sourceId AS text) IS NULL OR source.id=CAST(:sourceId AS text))`,
    { sessionId, sourceId: sourceId ?? null, companyId: verified.profile.companyId })
  if (!sources.length) throw new DrawingRecognitionError('RECOGNITION_SOURCE_SCOPE_INVALID', '找不到可授權的辨識來源。', 404)
  const groups: PrincipalCapabilityGroup[] = ['drawing']
  for (const source of sources) {
    const member = canonicalCapabilityGroups(source.linked_entity_type, source.source_role || source.document_category)
    if (!member.length) throw new DrawingRecognitionError('RECOGNITION_SOURCE_SCOPE_INVALID', '辨識來源範圍無法確認。', 503)
    groups.push(...member)
  }
  const failure = await authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, groups, action)
  if (failure) throw new DrawingRecognitionError('RECOGNITION_PERMISSION_DENIED', '目前帳號沒有此辨識來源操作權限。', failure.status)
}

/** Use the server-resolved impact after target validation/locking, before adoption. */
export async function requireRecognitionImpactCapabilities(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, changes: readonly DrawingRecognitionImpactChange[]) {
  if (!await isDynamicRolePolicyInSnapshot(snapshot) || !changes.length) return
  const groups: PrincipalCapabilityGroup[] = []
  for (const change of changes) {
    const target = canonicalCapabilityGroups(change.targetType)
    if (!target.length) throw new DrawingRecognitionError('RECOGNITION_TARGET_SCOPE_INVALID', '辨識寫入目標範圍無法確認。', 503)
    groups.push(...target)
  }
  const failure = await authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, groups, 'edit')
  if (failure) throw new DrawingRecognitionError('RECOGNITION_PERMISSION_DENIED', '目前帳號沒有此辨識寫入目標權限。', failure.status)
}
