import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import type { ReadonlyShare, SubmissionDetail } from '@/lib/types'
import { resolveDrawingPreviewAsync, type DrawingPreviewSource } from '@/lib/drawing-preview-asset'
import { releaseManifestMatchesSubmissionFiles } from '@/lib/principal-submission-file-capability'
import { assertStoredFileIntegrity, createFileStorageServiceForPointer, storagePointerFromRecord } from '@/lib/file-storage'
import { protectedFileResponseHeaders } from '@/lib/file-response'
import { auditStorageAccess, resolveStorageAccessAuditProvenance } from '@/lib/storage-access-audit'
import { normalizeMediaType } from '@/lib/media-type'

type AuthorizedShare = { share: ReadonlyShare; submission: SubmissionDetail;
  externalProjectContext?: { originalAssignmentId: string; projectScopeKey: string } }
const safeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp'])
const unavailable = () => Response.json({ code: 'safe_preview_unavailable' },
  { status: 404, headers: { 'cache-control': 'private, no-store' } })

export async function resolvePrincipalSharePreviewInSnapshot(snapshot: AsyncDatabaseClient,
  verified: VerifiedPrincipalRequest, authorized: AuthorizedShare, fileId: string) {
  const { share, submission } = authorized
  const file = submission.files.find(item => item.id === fileId)
  if (!file || !submission.release_package || !releaseManifestMatchesSubmissionFiles(
    submission.release_package.manifest_json, submission.id, submission.files)) return unavailable()
  // Only the exact delivered member's bound source may supply an existing
  // derivative. Never follow a caller's asset ID or fall back to original bytes.
  const source = await snapshot.queryOne<DrawingPreviewSource>(`
    SELECT a.id,s.company_id,a.storage_provider,a.storage_bucket,a.storage_key,a.original_path,
           a.file_name,a.file_ext,a.mime_type,a.content_hash,a.file_size
      FROM ai_pdm_core.submission_files f
      JOIN ai_pdm_core.submissions s ON s.id=f.submission_id AND s.company_id=:companyId
      JOIN ai_pdm_core.file_assets a ON a.id=COALESCE(f.source_file_asset_id,f.source_master_attachment_id)
        AND a.deleted_at IS NULL
     WHERE f.id=:fileId AND f.submission_id=:submissionId AND f.sha256=:sourceHash AND a.content_hash=f.sha256`,
    { companyId: verified.profile.companyId, submissionId: submission.id, fileId, sourceHash: file.sha256 })
  if (!source || !/^[a-f0-9]{64}$/iu.test(source.content_hash ?? '')) return unavailable()
  const preview = await resolveDrawingPreviewAsync(snapshot, source, { requireDerivative: true })
  const mimeType = normalizeMediaType(preview?.mimeType)
  if (!preview || preview.record.id === source.id || !safeTypes.has(mimeType)) return unavailable()
  return { principalId: verified.session.principalId, profileId: verified.profile.pdmUserId,
    companyId: verified.profile.companyId, submissionId: submission.id, shareId: share.id,
    externalAssignmentId: authorized.externalProjectContext?.originalAssignmentId ?? null,
    projectScopeKey: authorized.externalProjectContext?.projectScopeKey ?? null,
    packageId: submission.release_package.id, packageHash: submission.release_package.sha256,
    fileId, sourceId: source.id, sourceHash: source.content_hash!, preview: { ...preview, mimeType } }
}

type AuthorizedPreview = Exclude<Awaited<ReturnType<typeof resolvePrincipalSharePreviewInSnapshot>>, Response>

/** Storage IO is outside the authorization transaction; delivery rechecks the
 * same live share, session, policy, binding and derivative after the read. */
export async function deliverPrincipalSharePreview(request: Request,
  readAuthorized: () => Promise<Response | AuthorizedPreview>): Promise<Response> {
  const selected = await readAuthorized()
  if (selected instanceof Response) return selected
  try {
    const pointer = storagePointerFromRecord(selected.preview.record)
    const storage = createFileStorageServiceForPointer(pointer)
    const bytes = await storage.readObject(pointer.key)
    assertStoredFileIntegrity(bytes, selected.preview.record)
    const fresh = await readAuthorized()
    if (fresh instanceof Response) return fresh
    if (JSON.stringify(fresh) !== JSON.stringify(selected)) return Response.json({ code: 'principal_resource_changed' },
      { status: 409, headers: { 'cache-control': 'private, no-store' } })
    const access = await storage.createDownloadUrl({ key: pointer.key, filename: selected.preview.fileName, purpose: 'preview' })
    await auditStorageAccess({ principalId: selected.principalId, historicalProfileId: selected.profileId,
      companyId: selected.companyId, submissionId: selected.submissionId, shareId: selected.shareId,
      accessKind: 'canonical_file_preview', fileId: selected.fileId, filename: selected.preview.fileName,
      bytes: bytes.length, disposition: 'inline', provider: access.provider, storageKey: pointer.key,
      bucket: access.bucket, generation: pointer.generation, access, externalAccess: true,
      route: '/api/public/shares/[token]', provenance: resolveStorageAccessAuditProvenance(request.headers),
      resourceContext: { context: 'public_share', contextId: selected.shareId, bindingId: selected.fileId,
        derivativeId: selected.preview.record.id } })
    return new Response(new Uint8Array(bytes), { headers: {
      'content-type': selected.preview.mimeType, 'content-length': String(bytes.length),
      ...protectedFileResponseHeaders('inline', selected.preview.fileName, selected.preview.mimeType) } })
  } catch {
    return Response.json({ code: 'safe_preview_unavailable' },
      { status: 503, headers: { 'cache-control': 'private, no-store' } })
  }
}
