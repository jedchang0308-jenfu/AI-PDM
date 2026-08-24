import { requireAuthAsync, requireRoleAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailForCompanyAsync } from "@/lib/approval-platform";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { drawingPreviewMimeType, resolveDrawingPreviewAsync, type DrawingPreviewSource } from "@/lib/drawing-preview-asset";
import { contentDispositionHeader } from "@/lib/file-response";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { isPdmFileReadContext, type PdmFileReadContext } from "@/lib/pdm-file-read-contract";
import type { PdmEntityKey } from "@/lib/pdm-entity-detail-contract";
import { PdmReviewScopeError, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import { enqueuePreviewJobForSourceAsync, requestedPreviewKindForSource } from "@/lib/preview-derivatives";
import { resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

type CanonicalFileSource = DrawingPreviewSource & {
  company_id: string;
  storage_generation: string | null;
  file_size: number | string | null;
  hash_algorithm: string;
  linked_entity_type: string;
  linked_entity_id: string;
  workspace_id: string | null;
  drawing_number_id: string | null;
  part_root_id: string | null;
  source_submission_id: string | null;
  owner_user_id: string | null;
  work_id: string | null;
};

type FileReadAccess =
  | { actorId: string; companyId: string; canEditNonOwned: boolean; canDecide: boolean; response: null }
  | { actorId: null; companyId: null; canEditNonOwned: false; canDecide: false; response: Response };

function jsonError(code: string, message: string, status: number) {
  return Response.json(
    { error: { code, message, retryable: false } },
    { status, headers: { "cache-control": "private, no-store" } }
  );
}

async function resolveAccess(
  request: Request,
  context: PdmFileReadContext,
  reviewRequestId: string | null
): Promise<FileReadAccess> {
  if (context === "approval_evidence") {
    const auth = await requireRoleAsync(request, ["R&D Manager", "Admin"]);
    if (auth.response) return { actorId: null, companyId: null, canEditNonOwned: false, canDecide: false, response: auth.response };
    return { actorId: auth.user.id, companyId: auth.user.company_id, canEditNonOwned: false, canDecide: true, response: null };
  }
  if (context === "drawing_revision_work") {
    const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
    if (access.response || !access.actor) return { actorId: null, companyId: null, canEditNonOwned: false, canDecide: false, response: access.response ?? jsonError("READ_ACCESS_REQUIRED", "沒有讀取權限。", 403) };
    return { actorId: access.actor.id, companyId: access.actor.companyId, canEditNonOwned: access.actor.canEditNonOwned, canDecide: access.actor.permissions.decide, response: null };
  }
  if (reviewRequestId) {
    const auth = await requireAuthAsync(request);
    if (auth.response || !auth.user) {
      return {
        actorId: null,
        companyId: null,
        canEditNonOwned: false, canDecide: false, response: auth.response ?? jsonError("AUTH_REQUIRED", "請先登入。", 401)
      };
    }
    const company = await resolveNumberingCompanyContextAsync(
      auth.user.id,
      requestedNumberingCompanyCodeFromRequest(request)
    );
    if (company.response || !company.company) {
      return {
        actorId: null,
        companyId: null,
        canEditNonOwned: false, canDecide: false, response: company.response ?? jsonError("COMPANY_CONTEXT_REQUIRED", "無法確認公司範圍。", 403)
      };
    }
    return { actorId: auth.user.id, companyId: company.company.companyId, canEditNonOwned: false, canDecide: false, response: null };
  }
  const auth = await requireNumberingPageAsync(request, context === "part_attachment" ? "numbering.search" : "numbering.drawings.view");
  if (auth.response || !auth.user) {
    return {
      actorId: null,
      companyId: null,
      canEditNonOwned: false, canDecide: false, response: auth.response ?? jsonError("AUTH_REQUIRED", "請先登入。", 401)
    };
  }
  const company = await resolveNumberingCompanyContextAsync(
    auth.user.id,
    requestedNumberingCompanyCodeFromRequest(request)
  );
  if (company.response || !company.company) {
    return {
      actorId: null,
      companyId: null,
      canEditNonOwned: false, canDecide: false, response: company.response ?? jsonError("COMPANY_CONTEXT_REQUIRED", "無法確認公司範圍。", 403)
    };
  }
  return { actorId: auth.user.id, companyId: company.company.companyId, canEditNonOwned: false, canDecide: false, response: null };
}

async function resolveSource(input: {
  client: AsyncDatabaseClient;
  context: PdmFileReadContext;
  contextId: string;
  bindingId: string;
  fileAssetId: string;
  companyId: string;
}) {
  if (input.context === "candidate_revision") {
    return input.client.queryOne<CanonicalFileSource>(
      `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
              asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
              asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
              revision.company_id, 'drawing_revision' AS linked_entity_type,
              revision.id AS linked_entity_id, NULL AS workspace_id,
              revision.drawing_id AS drawing_number_id, drawing.part_root_id, NULL AS source_submission_id,
              work.owner_user_id, work.id AS work_id
         FROM drawing_revision_files file
         JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
         JOIN drawings drawing ON drawing.id = revision.drawing_id
         LEFT JOIN canonical_workbench_states state ON state.company_id=revision.company_id
           AND state.entity_type='drawing' AND state.revision_id=revision.id AND state.data_layer='drawing_rd'
         LEFT JOIN drawing_revision_works work ON work.id=state.work_id AND work.company_id=state.company_id
         JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE revision.id = :contextId AND file.id = :bindingId AND asset.id = :fileAssetId
          AND revision.company_id = :companyId AND file.company_id = :companyId
          AND drawing.company_id = :companyId AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,
      input
    );
  }
  if (input.context === "drawing_revision" || input.context === "drawing_revision_work") {
    const workJoin = input.context === "drawing_revision_work"
      ? "JOIN drawing_revision_work_files work_file ON work_file.file_binding_id = file.id AND work_file.work_id = :contextId JOIN drawing_revision_works work ON work.id = work_file.work_id"
      : "LEFT JOIN drawing_revision_works work ON 1 = 0";
    const contextPredicate = input.context === "drawing_revision_work"
      ? "work.id = :contextId"
      : "revision.id = :contextId";
    return input.client.queryOne<CanonicalFileSource>(
      `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
              asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
              asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
              revision.company_id, '${input.context}' AS linked_entity_type,
              revision.id AS linked_entity_id, NULL AS workspace_id,
              revision.drawing_id AS drawing_number_id, drawing.part_root_id,
              NULL AS source_submission_id, work.owner_user_id, work.id AS work_id
         FROM drawing_revision_files file
         JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
         JOIN drawings drawing ON drawing.id = revision.drawing_id
         ${workJoin}
         JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE ${contextPredicate} AND file.id = :bindingId AND asset.id = :fileAssetId
          AND revision.company_id = :companyId AND file.company_id = :companyId
          AND drawing.company_id = :companyId AND file.removed_at IS NULL AND asset.deleted_at IS NULL`,
      input
    );
  }
  if (input.context === "drawing_attachment" || input.context === "part_attachment") {
    const entityType = input.context === "drawing_attachment" ? "drawing_number" : "part_number";
    const entityTable = input.context === "drawing_attachment" ? "drawing_numbers" : "part_numbers";
    const entityAlias = input.context === "drawing_attachment" ? "drawing" : "part";
    return input.client.queryOne<CanonicalFileSource>(
      `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
              asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
              asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
              ${entityAlias}.company_id, '${entityType}' AS linked_entity_type,
              ${entityAlias}.id AS linked_entity_id, NULL AS workspace_id,
              ${input.context === "drawing_attachment" ? `${entityAlias}.id` : "NULL"} AS drawing_number_id,
              ${input.context === "drawing_attachment" ? `${entityAlias}.part_root_id` : `${entityAlias}.part_root_id`} AS part_root_id,
              NULL AS source_submission_id, NULL AS owner_user_id, NULL AS work_id
         FROM file_assets asset
         JOIN ${entityTable} ${entityAlias} ON ${entityAlias}.id = asset.linked_entity_id
        WHERE asset.id = :fileAssetId AND asset.id = :bindingId
          AND asset.linked_entity_type = '${entityType}' AND asset.linked_entity_id = :contextId
          AND ${entityAlias}.company_id = :companyId AND asset.deleted_at IS NULL`,
      input
    );
  }
  if (input.context === "approval_evidence") {
    return input.client.queryOne<CanonicalFileSource>(
      `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
              asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
              asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
              :companyId AS company_id, asset.linked_entity_type, asset.linked_entity_id,
              NULL AS workspace_id, NULL AS drawing_number_id, NULL AS part_root_id,
              NULL AS source_submission_id, NULL AS owner_user_id, NULL AS work_id
         FROM file_assets asset
        WHERE asset.id = :fileAssetId AND asset.id = :bindingId AND asset.deleted_at IS NULL`,
      input
    );
  }
  return input.client.queryOne<CanonicalFileSource>(
    `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
            asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
            asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
            revision_package.company_id, 'drawing_revision_package' AS linked_entity_type,
            revision_package.id AS linked_entity_id, NULL AS workspace_id,
            revision_package.drawing_number_id, drawing_number.part_root_id,
            revision_package.source_submission_id, NULL AS owner_user_id, NULL AS work_id
       FROM drawing_revision_package_files file
       JOIN drawing_revision_packages revision_package ON revision_package.id = file.package_id
       JOIN drawing_numbers drawing_number ON drawing_number.id = revision_package.drawing_number_id
       JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE revision_package.id = :contextId AND file.id = :bindingId AND asset.id = :fileAssetId
        AND revision_package.company_id = :companyId AND drawing_number.company_id = :companyId
        AND asset.deleted_at IS NULL`,
    input
  );
}

async function verifyReviewScope(input: {
  client: AsyncDatabaseClient;
  source: CanonicalFileSource;
  context: PdmFileReadContext;
  contextId: string;
  reviewRequestId: string;
  companyId: string;
  actorId: string;
}) {
  if (input.context === "candidate_revision") {
    if (!input.source.work_id) return null;
    return input.client.queryOne<{ id: string }>(
      `SELECT id FROM pdm_work_review_requests
        WHERE id=:requestId AND company_id=:companyId AND work_id=:workId
          AND reviewer_user_id=:actorId AND request_status='pending'`,
      { requestId: input.reviewRequestId, companyId: input.companyId, workId: input.source.work_id, actorId: input.actorId }
    );
  }
  if (input.context === "drawing_revision_work") {
    return input.client.queryOne<{ id: string }>(
      `SELECT id FROM pdm_work_review_requests
        WHERE id = :requestId AND company_id = :companyId AND work_id = :workId
          AND reviewer_user_id = :actorId AND request_status = 'pending'`,
      { requestId: input.reviewRequestId, companyId: input.companyId, workId: input.contextId, actorId: input.actorId }
    );
  }
  if (input.context === "approval_evidence") return { id: input.reviewRequestId };
  const linkedParts = input.source.drawing_number_id
    ? await input.client.query<{ part_number_id: string }>(
        "SELECT part_number_id FROM drawing_part_links WHERE drawing_number_id = :drawingNumberId",
        { drawingNumberId: input.source.drawing_number_id }
      )
    : [];
  return resolvePdmReviewScopeReceiptAsync({
    client: input.client,
    requestId: input.reviewRequestId,
    companyId: input.companyId,
    actorId: input.actorId,
    entityKey: `${input.context === "part_attachment" ? "part" : "drawing"}:${input.source.drawing_number_id ?? input.source.linked_entity_id}` as PdmEntityKey,
    targetRefs: [
      { type: input.source.linked_entity_type, id: input.contextId },
      ...(input.source.drawing_number_id ? [{ type: "drawing_number", id: input.source.drawing_number_id }] : []),
      ...(input.source.part_root_id ? [{ type: "part_root", id: input.source.part_root_id }] : []),
      ...linkedParts.map((part) => ({ type: "part_number", id: part.part_number_id })),
      ...(input.source.source_submission_id
        ? [{ type: "submission", id: input.source.source_submission_id }]
        : [])
    ],
    access: "review_evidence"
  });
}

function evidenceBelongsToRequest(detail: {
  actionCode: string;
  impactSnapshots: Array<{ snapshot: Record<string, unknown> }>;
}, sourceFileAssetId: string) {
  const isCandidateBundle = detail.actionCode === "numbering.candidate_bundle_review";
  const isDrawingRevision = detail.actionCode === "numbering.drawing_revision_impact_review"
    || detail.actionCode === "numbering.drawing_revision_lifecycle_review";
  if (!isCandidateBundle && !isDrawingRevision) return false;
  for (const impact of detail.impactSnapshots) {
    const snapshot = impact.snapshot;
    if (isCandidateBundle) {
      const candidates = Array.isArray(snapshot.candidateRevisions) ? snapshot.candidateRevisions : [];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
        const files = (candidate as Record<string, unknown>).files;
        if (Array.isArray(files) && files.some((file) => snapshotFileMatches(file, sourceFileAssetId))) return true;
      }
    }
    if (isDrawingRevision) {
      const files = Array.isArray(snapshot.files) ? snapshot.files : [];
      if (files.some((file) => snapshotFileMatches(file, sourceFileAssetId))) return true;
    }
  }
  return false;
}

function snapshotFileMatches(file: unknown, sourceFileAssetId: string) {
  if (!file || typeof file !== "object" || Array.isArray(file)) return false;
  const value = file as Record<string, unknown>;
  return value.sourceFileAssetId === sourceFileAssetId || value.assetId === sourceFileAssetId;
}

export async function GET(request: Request, { params }: { params: Promise<{ fileAssetId: string }> }) {
  const url = new URL(request.url);
  const context = url.searchParams.get("context");
  const contextId = url.searchParams.get("contextId")?.trim() ?? "";
  const bindingId = url.searchParams.get("bindingId")?.trim() ?? "";
  const reviewRequestId = url.searchParams.get("reviewRequestId")?.trim() || null;
  if (!isPdmFileReadContext(context) || !contextId || !bindingId) {
    return jsonError("PDM_FILE_CONTEXT_INVALID", "檔案讀取上下文不完整。", 400);
  }

  const access = await resolveAccess(request, context, reviewRequestId);
  if (access.response || !access.actorId || !access.companyId) return access.response;
  const { fileAssetId: rawFileAssetId } = await params;
  const fileAssetId = decodeURIComponent(rawFileAssetId);
  const client = getAsyncDatabaseClient();
  if (context === "approval_evidence") {
    const detail = await getApprovalPlatformRequestDetailForCompanyAsync(contextId, access.companyId);
    if (!detail || !evidenceBelongsToRequest(detail, fileAssetId)) {
      return jsonError("PDM_FILE_NOT_FOUND", "這個檔案不屬於目前審核案件。", 404);
    }
  }
  const source = await resolveSource({
    client,
    context,
    contextId,
    bindingId,
    fileAssetId,
    companyId: access.companyId
  });
  const derivativeId = url.searchParams.get("previewDerivative");
  const wantsPreview = url.searchParams.get("preview") === "1" || Boolean(derivativeId);
  if (!source) {
    if (context === "drawing_revision_work" && wantsPreview) {
      const terminal = await client.queryOne<{ handling: string }>(
        `SELECT handling FROM canonical_workbench_states
          WHERE company_id = :companyId AND work_id = :workId
            AND handling IN ('owner', 'system_admin', 'blocked') LIMIT 1`,
        { companyId: access.companyId, workId: contextId }
      );
      if (terminal) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store", "x-pdm-preview-state": terminal.handling } });
      const cancelled = await client.queryOne<{ id: string }>(
        `SELECT id FROM platform_command_receipts
          WHERE company_id = :companyId AND command_name = 'dev087:drawing.cancel'
            AND effect_key = :effectKey AND command_status = 'completed' LIMIT 1`,
        { companyId: access.companyId, effectKey: `drawing-work:${contextId}:cancel` }
      );
      if (cancelled) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store", "x-pdm-preview-state": "cancelled" } });
    }
    return jsonError("PDM_FILE_NOT_FOUND", "找不到圖面的檔案。", 404);
  }

  if (context === "drawing_revision_work") {
    if (reviewRequestId) {
      if (!access.canDecide) return jsonError("PDM_FILE_NOT_FOUND", "找不到圖面的檔案。", 404);
    } else if (source.owner_user_id !== access.actorId && !access.canEditNonOwned) {
      return jsonError("PDM_FILE_NOT_FOUND", "找不到圖面的檔案。", 404);
    }
  }

  if (reviewRequestId) {
    try {
      const scope = await verifyReviewScope({
        client,
        source,
        context,
        contextId,
        reviewRequestId,
        companyId: access.companyId,
        actorId: access.actorId
      });
      if (!scope) return jsonError("PDM_REVIEW_SCOPE_NOT_FOUND", "找不到這筆審核範圍。", 404);
    } catch (error) {
      if (error instanceof PdmReviewScopeError) {
        return jsonError(error.code, error.message, error.code === "PDM_REVIEW_NOT_ASSIGNED" ? 403 : 409);
      }
      throw error;
    }
  }

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
      try {
        await enqueuePreviewJobForSourceAsync(client, {
          source: {
            ...source,
            storage_provider: source.storage_provider ?? "local_repository",
            linked_entity_type: source.linked_entity_type,
            linked_entity_id: source.linked_entity_id
          },
          actorUserId: access.actorId,
          requestedKind: requestedPreviewKindForSource(source.file_ext),
          generatorProfile:
            process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : undefined,
          runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1"
        });
      } catch {
        // Read remains available while preview preparation retries independently.
      }
      return Response.json(
        { error: { code: "PREVIEW_NOT_READY", message: "預覽正在準備；可先下載原檔。", retryable: true } },
        {
          status: 202,
          headers: {
            "retry-after": "2",
            "x-pdm-preview-state": "pending",
            "cache-control": "private, no-store"
          }
        }
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
    return jsonError("PDM_FILE_UNAVAILABLE", "檔案目前無法讀取，請稍後再試。", 503);
  }
}
