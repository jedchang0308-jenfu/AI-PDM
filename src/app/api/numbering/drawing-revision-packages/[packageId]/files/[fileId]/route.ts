import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { contentDispositionHeader } from "@/lib/file-response";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { drawingPreviewMimeType, resolveDrawingPreviewAsync, type DrawingPreviewSource } from "@/lib/drawing-preview-asset";
import { enqueuePreviewJobForSourceAsync } from "@/lib/preview-derivatives";
import { requireNumberingPageAsync } from "@/lib/numbering-permission-guard";
import { requireAuthAsync } from "@/lib/auth-async";
import { requestedNumberingCompanyCodeFromRequest, resolveNumberingCompanyContextAsync } from "@/lib/numbering-company-context";
import { PdmReviewScopeError, resolvePdmReviewScopeReceiptAsync } from "@/lib/pdm-review-scope";
import type { PdmEntityKey } from "@/lib/pdm-entity-detail-contract";

export const runtime = "nodejs";

type PackagePreviewSourceRow = DrawingPreviewSource & {
  company_id: string;
  storage_generation: string | null;
  file_size: number | string | null;
  hash_algorithm: string;
  drawing_number_id: string;
  part_root_id: string;
  source_submission_id: string | null;
};

export async function GET(request: Request, { params }: { params: Promise<{ packageId: string; fileId: string }> }) {
  const reviewRequestId = new URL(request.url).searchParams.get("reviewRequestId");
  const auth = reviewRequestId ? await requireAuthAsync(request) : await requireNumberingPageAsync(request, "numbering.drawings.view");
  if (auth.response) return auth.response;
  const companyResult = await resolveNumberingCompanyContextAsync(auth.user.id, requestedNumberingCompanyCodeFromRequest(request));
  if (companyResult.response) return companyResult.response;
  const { packageId, fileId } = await params;
  const decodedPackageId = decodeURIComponent(packageId);
  const client = getAsyncDatabaseClient();
  const source = await client.queryOne<PackagePreviewSourceRow>(
    `SELECT asset.id, asset.storage_provider, asset.storage_bucket, asset.storage_key,
            asset.original_path, asset.storage_generation, asset.file_name, asset.file_ext,
            asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
            revision_package.company_id AS company_id,
            revision_package.drawing_number_id,
            revision_package.source_submission_id,
            drawing_number.part_root_id
       FROM drawing_revision_package_files package_file
        JOIN drawing_revision_packages revision_package ON revision_package.id = package_file.package_id
        JOIN drawing_numbers drawing_number ON drawing_number.id = revision_package.drawing_number_id
       JOIN file_assets asset ON asset.id = package_file.source_file_asset_id
      WHERE package_file.package_id = :packageId AND package_file.id = :fileId
         AND revision_package.company_id = :companyId
        AND asset.deleted_at IS NULL`,
    { packageId: decodedPackageId, fileId: decodeURIComponent(fileId), companyId: companyResult.company.companyId }
  );
  if (!source) return Response.json({ error: "PACKAGE_FILE_NOT_FOUND" }, { status: 404 });
  if (reviewRequestId) {
    try {
      const linkedParts = await client.query<{ part_number_id: string }>(
        `SELECT part_number_id
           FROM drawing_part_links
          WHERE drawing_number_id = :drawingNumberId`,
        { drawingNumberId: source.drawing_number_id }
      );
      const scope = await resolvePdmReviewScopeReceiptAsync({
        client,
        requestId: reviewRequestId,
        companyId: companyResult.company.companyId,
        actorId: auth.user.id,
        entityKey: `drawing:${source.drawing_number_id}` as PdmEntityKey,
        targetRefs: [
          { type: "drawing_revision_package", id: decodedPackageId },
          { type: "drawing_number", id: source.drawing_number_id },
          { type: "part_root", id: source.part_root_id },
          ...linkedParts.map((part) => ({ type: "part_number", id: part.part_number_id })),
          ...(source.source_submission_id ? [{ type: "submission", id: source.source_submission_id }] : [])
        ],
        access: "review_evidence"
      });
      if (!scope) return Response.json({ error: "PDM_REVIEW_SCOPE_NOT_FOUND" }, { status: 404 });
    } catch (error) {
      if (error instanceof PdmReviewScopeError) {
        return Response.json(
          { error: { code: error.code, message: error.message } },
          { status: error.code === "PDM_REVIEW_NOT_ASSIGNED" ? 403 : 409 }
        );
      }
      throw error;
    }
  }
  const searchParams = new URL(request.url).searchParams;
  const derivativeId = searchParams.get("previewDerivative");
  const wantsPreview = searchParams.get("preview") === "1" || Boolean(derivativeId);
  try {
    const resolved = wantsPreview
      ? await resolveDrawingPreviewAsync(client, source, {
          allowFake: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1",
          derivativeId
        })
      : { record: source, fileName: source.file_name || "圖面附件", mimeType: source.mime_type || drawingPreviewMimeType(source.file_ext) };
    if (!resolved) {
      if (wantsPreview) {
        await enqueuePreviewJobForSourceAsync(client, { source: { ...source, storage_provider: source.storage_provider ?? "local_repository", linked_entity_type: "drawing_revision_package", linked_entity_id: decodedPackageId }, actorUserId: auth.user.id, requestedKind: source.file_ext.toLowerCase().replace(/^\./u, "") === "slddrw" ? "drawing_pdf" : "native_thumbnail_png", generatorProfile: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : undefined, runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" });
      }
      return Response.json(
        { error: "PREVIEW_NOT_READY", message: "預覽正在準備；可先下載原檔。" },
        { status: 202, headers: { "retry-after": "2", "x-pdm-preview-state": "pending" } }
      );
    }
    const pointer = storagePointerFromRecord(resolved.record);
    const bytes = await createFileStorageServiceForPointer(pointer).readObject(pointer.key);
    return new Response(new Uint8Array(bytes), { headers: { "content-type": resolved.mimeType || "application/octet-stream", "content-length": String(bytes.byteLength), "content-disposition": contentDispositionHeader(wantsPreview ? "inline" : "attachment", resolved.fileName), "x-content-type-options": "nosniff", "cache-control": "private, no-store" } });
  } catch {
    return Response.json({ error: "PACKAGE_FILE_UNAVAILABLE", message: "檔案目前無法讀取，請稍後再試。" }, { status: 503 });
  }
}
