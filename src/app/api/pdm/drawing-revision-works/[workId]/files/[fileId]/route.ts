import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { drawingPreviewMimeType, resolveDrawingPreviewAsync, type DrawingPreviewSource } from "@/lib/drawing-preview-asset";
import { contentDispositionHeader } from "@/lib/file-response";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { dev087RouteError, resolveDev087RouteActor } from "@/lib/pdm-dev087-route";

export const runtime = "nodejs";

type WorkFileSource = DrawingPreviewSource & {
  company_id: string;
  owner_user_id: string;
  storage_generation: string | null;
  file_size: number | string | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ workId: string; fileId: string }> }) {
  const access = await resolveDev087RouteActor(request, "numbering.drawings.view");
  if (access.response || !access.actor) return access.response;
  try {
    const { workId, fileId } = await params;
    const client = getAsyncDatabaseClient();
    const url = new URL(request.url);
    const derivativeId = url.searchParams.get("previewDerivative");
    const wantsPreview = url.searchParams.get("preview") === "1" || Boolean(derivativeId);
    const source = await client.queryOne<WorkFileSource>(
      `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
              asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
              asset.mime_type, asset.file_size, asset.content_hash,
              work.company_id, work.owner_user_id
         FROM drawing_revision_work_files binding
         JOIN drawing_revision_works work ON work.id = binding.work_id
         JOIN drawing_revision_files file ON file.id = binding.file_binding_id
         JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE binding.work_id = :workId AND binding.file_binding_id = :fileId
          AND work.company_id = :companyId AND file.company_id = :companyId
          AND asset.deleted_at IS NULL`,
      { workId: decodeURIComponent(workId), fileId: decodeURIComponent(fileId), companyId: access.actor.companyId }
    );
    if (!source) {
      // A preview fetch can already be in flight when the owner cancels a
      // work. Cancellation intentionally removes the work/file binding, so
      // the late read must end as an empty terminal response instead of a
      // browser-visible 404/console error. Downloads and unknown work IDs
      // remain strict 404s.
      if (wantsPreview) {
        const reviewRequestId = url.searchParams.get("reviewRequestId");
        if (reviewRequestId && access.actor.permissions.decide) {
          return new Response(null, { status: 204, headers: { "cache-control": "private, no-store", "x-pdm-review-evidence-state": "terminal" } });
        }
        const cancelled = await client.queryOne<{ id: string }>(
          `SELECT id FROM platform_command_receipts
            WHERE company_id = :companyId
              AND command_name = 'dev087:drawing.cancel'
              AND effect_key = :effectKey
              AND command_status = 'completed'
            LIMIT 1`,
          { companyId: access.actor.companyId, effectKey: `drawing-work:${decodeURIComponent(workId)}:cancel` }
        );
        if (cancelled) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store", "x-pdm-preview-state": "cancelled" } });
      }
      return Response.json({ error: { code: "WORK_FILE_NOT_FOUND", message: "找不到這個圖面檔案。" } }, { status: 404 });
    }

    const reviewRequestId = new URL(request.url).searchParams.get("reviewRequestId");
    if (reviewRequestId) {
      const review = await client.queryOne<{ id: string }>(
        `SELECT id FROM pdm_work_review_requests
          WHERE id = :requestId AND company_id = :companyId AND work_id = :workId
            AND reviewer_user_id = :reviewerUserId AND request_status = 'pending'`,
        { requestId: reviewRequestId, companyId: access.actor.companyId, workId: decodeURIComponent(workId), reviewerUserId: access.actor.id }
      );
      if (!review || !access.actor.permissions.decide) {
        // A reviewer can still have an in-flight preview request when the
        // decision transaction has already moved the canonical work into a
        // terminal system_admin/blocked state and removed the request row.
        // Do not turn that harmless late read into a browser 404/console
        // error; return an empty terminal response without exposing bytes.
        const terminal = await client.queryOne<{ handling: string }>(
          `SELECT handling FROM canonical_workbench_states
            WHERE company_id = :companyId AND work_id = :workId
              AND handling IN ('owner', 'system_admin', 'blocked')
            LIMIT 1`,
          { companyId: access.actor.companyId, workId: decodeURIComponent(workId) }
        );
        if (terminal) return new Response(null, { status: 204, headers: { "cache-control": "private, no-store", "x-pdm-review-evidence-state": terminal.handling } });
        return Response.json({ error: { code: "WORK_FILE_NOT_FOUND", message: "找不到這個圖面檔案。" } }, { status: 404 });
      }
    } else if (source.owner_user_id !== access.actor.id && !access.actor.canEditNonOwned) {
      return Response.json({ error: { code: "WORK_FILE_NOT_FOUND", message: "找不到這個圖面檔案。" } }, { status: 404 });
    }

    const resolved = wantsPreview
      ? await resolveDrawingPreviewAsync(client, source, { allowFake: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1", derivativeId })
      : { record: source, fileName: source.file_name || "圖面附件", mimeType: source.mime_type || drawingPreviewMimeType(source.file_ext) };
    if (!resolved) {
      return Response.json(
        { error: { code: "PREVIEW_NOT_READY", message: "預覽正在準備；可先下載原檔。" } },
        { status: 202, headers: { "retry-after": "2", "cache-control": "private, no-store" } }
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
  } catch (error) {
    return dev087RouteError(error);
  }
}
