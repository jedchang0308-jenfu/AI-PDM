import { drawingPreviewMimeType, resolveDrawingPreviewAsync, type DrawingPreviewSource } from "@/lib/drawing-preview-asset";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { contentDispositionHeader } from "@/lib/file-response";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { enqueuePreviewJobForSourceAsync, requestedPreviewKindForSource } from "@/lib/preview-derivatives";
import {
  numberStateFlowJson,
  requireNumberStateReadAccessAsync
} from "@/lib/number-state-flow-api";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { PdmReviewScopeError, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import type { PdmEntityKey } from "@/lib/pdm-entity-detail-contract";

export const runtime = "nodejs";

type CandidatePreviewSourceRow = DrawingPreviewSource & {
  company_id: string;
  storage_generation: string | null;
  file_size: number | string | null;
  hash_algorithm: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string; fileId: string }> }
) {
  const reviewRequestId = new URL(request.url).searchParams.get("reviewRequestId");
  let actorId: string;
  let companyId: string;
  if (reviewRequestId) {
    const authenticated = await requireAuthAsync(request);
    if (authenticated.response) return authenticated.response;
    const company = await resolveNumberingCompanyContextAsync(authenticated.user.id, requestedNumberingCompanyCodeFromRequest(request));
    if (company.response) return company.response;
    actorId = authenticated.user.id;
    companyId = company.company.companyId;
  } else {
    const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
    if (access.response) return access.response;
    actorId = access.user.id;
    companyId = access.company.companyId;
  }
  const { id: workspaceId, revisionId: candidateRevisionId, fileId: rawFileId } = await params;
  const fileId = decodeURIComponent(rawFileId);
  const client = getAsyncDatabaseClient();
  if (reviewRequestId) {
    try {
      const scope = await resolvePdmReviewScopeReceiptAsync({
        client,
        requestId: reviewRequestId,
        companyId,
        actorId,
        entityKey: `candidate:${workspaceId}` as PdmEntityKey,
        targetTypes: ["numbering_draft_workspace"],
        targetIds: [workspaceId],
        access: "review_evidence"
      });
      if (!scope) return numberStateFlowJson({ error: { code: "PDM_REVIEW_SCOPE_NOT_FOUND", message: "找不到這筆審核範圍。", retryable: false } }, { status: 404 });
    } catch (error) {
      if (error instanceof PdmReviewScopeError) {
        return numberStateFlowJson(
          { error: { code: error.code, message: error.message, retryable: false } },
          { status: error.code === "PDM_REVIEW_NOT_ASSIGNED" ? 403 : 409 }
        );
      }
      throw error;
    }
  }
  const source = await client.queryOne<CandidatePreviewSourceRow>(
    `
      SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
             asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
             asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
             file.company_id
      FROM numbering_candidate_revision_files file
      JOIN numbering_candidate_revision_drafts candidate
        ON candidate.id = file.candidate_revision_id
      JOIN numbering_draft_workspaces workspace
        ON workspace.id = candidate.workspace_id
      JOIN file_assets asset
        ON asset.id = file.source_file_asset_id
      WHERE file.id = :fileId
        AND file.candidate_revision_id = :candidateRevisionId
        AND candidate.workspace_id = :workspaceId
        AND candidate.company_id = :companyId
        AND file.company_id = :companyId
        AND file.removed_at IS NULL
        AND asset.deleted_at IS NULL
    `,
    { fileId, candidateRevisionId, workspaceId, companyId }
  );
  if (!source) return numberStateFlowJson({ error: { code: "candidate_file_not_found", message: "找不到圖面的檔案。", retryable: false } }, { status: 404 });

  const url = new URL(request.url);
  const derivativeId = url.searchParams.get("previewDerivative");
  const wantsPreview = url.searchParams.get("preview") === "1" || Boolean(derivativeId);
  try {
    const resolved = wantsPreview
      ? await resolveDrawingPreviewAsync(client, source, {
          allowFake: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1",
          derivativeId
        })
      : {
          record: source,
          fileName: source.file_name || "圖面附件",
          mimeType: source.mime_type || drawingPreviewMimeType(source.file_ext)
        };
    if (!resolved) {
      if (wantsPreview) {
        try {
          await enqueuePreviewJobForSourceAsync(client, {
            source: {
              ...source,
              storage_provider: source.storage_provider ?? "local_repository",
              company_id: source.company_id,
              linked_entity_type: "numbering_candidate_revision",
              linked_entity_id: candidateRevisionId
            },
            actorUserId: actorId,
            requestedKind: requestedPreviewKindForSource(source.file_ext),
            generatorProfile: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : undefined,
            runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1"
          });
        } catch {
          // Keep the source downloadable even if preview preparation is unavailable.
        }
      }
      return numberStateFlowJson(
        { error: { code: "PREVIEW_NOT_READY", message: "預覽正在準備；可先下載原檔。", retryable: true } },
        { status: 202, headers: { "retry-after": "2", "x-pdm-preview-state": "pending" } }
      );
    }
    const pointer = storagePointerFromRecord(resolved.record);
    const bytes = await createFileStorageServiceForPointer(pointer).readObject(pointer.key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": resolved.mimeType || "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-disposition": contentDispositionHeader(wantsPreview ? "inline" : "attachment", resolved.fileName),
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  } catch {
    return numberStateFlowJson({ error: { code: "CANDIDATE_FILE_UNAVAILABLE", message: "檔案目前無法讀取，請稍後再試。", retryable: true } }, { status: 503 });
  }
}
