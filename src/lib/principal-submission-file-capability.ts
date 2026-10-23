import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { authorizeDynamicResourceCapabilityInSnapshot, canonicalCapabilityGroups,
  isDynamicRolePolicyInSnapshot, type PrincipalCapabilityGroup } from '@/lib/principal-resource-capability'

export type SubmissionFileCapabilitySource = {
  id: string; file_role: string; sha256?: string; source_entity_type: string | null;
  linked_entity_type: string | null; document_category: string | null;
}

/** Historical file_role is persisted lineage, never a caller's filename. Unknown
 * unlinked legacy files need human source repair before dynamic byte delivery. */
export function submissionFileCapabilityGroups(row: SubmissionFileCapabilitySource): PrincipalCapabilityGroup[] {
  const parent = canonicalCapabilityGroups(row.source_entity_type ?? '')
  const linked = canonicalCapabilityGroups(row.linked_entity_type ?? '', row.document_category)
  const legacy: PrincipalCapabilityGroup[] = ['sldprt', 'sldasm'].includes(row.file_role) ? ['model']
    : ['slddrw', 'pdf', 'dwg'].includes(row.file_role) ? ['drawing'] : []
  if ((row.source_entity_type != null && !parent.length) || (row.linked_entity_type != null && !linked.length) ||
      (!linked.length && !legacy.length)) return []
  return [...new Set([...parent, ...(linked.length ? linked : legacy)])]
}

/** All actual members of a ZIP require download; no partial or filename-based
 * authorization. For a single original/inline PDF, constrain the exact file ID. */
export async function authorizeSubmissionOriginalsInSnapshot(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, submissionId: string, fileId?: string, manifestJson?: string) {
  if (!await isDynamicRolePolicyInSnapshot(snapshot)) return null
  const rows = await snapshot.query<SubmissionFileCapabilitySource>(
    `SELECT f.id,f.file_role,f.sha256,s.source_entity_type,a.linked_entity_type,a.document_category
       FROM ai_pdm_core.submission_files f
       JOIN ai_pdm_core.submissions s ON s.id=f.submission_id AND s.company_id=:companyId
       LEFT JOIN ai_pdm_core.file_assets a
         ON a.id=COALESCE(f.source_file_asset_id,f.source_master_attachment_id)
      WHERE f.submission_id=:submissionId AND (CAST(:fileId AS text) IS NULL OR f.id=CAST(:fileId AS text))
      ORDER BY f.id`,
    { companyId: verified.profile.companyId, submissionId, fileId: fileId ?? null })
  const project = await snapshot.queryOne<{ project_code: string }>(
    'SELECT project_code FROM ai_pdm_core.submissions WHERE id=:submissionId AND company_id=:companyId',
    { submissionId, companyId: verified.profile.companyId })
  if (!rows.length || !project || (fileId && (rows.length !== 1 || rows[0].id !== fileId)) ||
      rows.some(row => !submissionFileCapabilityGroups(row).length)) {
    return Response.json({ code: 'principal_resource_group_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } })
  }
  if (manifestJson !== undefined) {
    let manifest: { schema?: string; submission?: { id?: string }; files?: Array<{ id?: string; sha256?: string; file_role?: string }> }
    try { manifest = JSON.parse(manifestJson) } catch { manifest = {} }
    const files = manifest?.files
    if (manifest?.schema !== 'ai-pdm-release-package.v1' || manifest.submission?.id !== submissionId ||
        !Array.isArray(files) || files.length !== rows.length || new Set(files.map(file => file?.id)).size !== rows.length ||
        rows.some(row => !files.some(file => file?.id === row.id && file.sha256 === row.sha256 && file.file_role === row.file_role))) {
      return Response.json({ code: 'principal_release_membership_unavailable' },
        { status: 503, headers: { 'cache-control': 'private, no-store' } })
    }
  }
  const groups = [...new Set(rows.flatMap(submissionFileCapabilityGroups))]
  return authorizeDynamicResourceCapabilityInSnapshot(snapshot, verified, groups, 'download',
    { projectCode: project.project_code.trim() || null })
}
