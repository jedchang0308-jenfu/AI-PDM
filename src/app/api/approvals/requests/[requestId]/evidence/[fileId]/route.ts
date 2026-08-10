import { NextResponse } from "next/server";
import { requireRoleAsync } from "@/lib/auth-async";
import { getApprovalPlatformRequestDetailForCompanyAsync } from "@/lib/approval-platform";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";
import { contentDispositionFilename } from "@/lib/file-response";
import { enqueuePreviewJobForSourceAsync } from "@/lib/preview-derivatives";
import { drawingPreviewMimeType, resolveDrawingPreviewAsync } from "@/lib/drawing-preview-asset";

export const runtime = "nodejs";

const reviewerRoles = ["R&D Manager", "Admin"] as const;

type FileAssetRow = {
  id: string;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  storage_generation: string | null;
  original_path: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  hash_algorithm: string;
  linked_entity_type: string;
  linked_entity_id: string;
  deleted_at: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ requestId: string; fileId: string }> }
) {
  const auth = await requireRoleAsync(request, [...reviewerRoles]);
  if (auth.response) return auth.response;

  const { requestId: rawRequestId, fileId } = await params;
  const requestId = decodeURIComponent(rawRequestId);
  const sourceFileAssetId = decodeURIComponent(fileId);
  const detail = await getApprovalPlatformRequestDetailForCompanyAsync(requestId, auth.user.company_id);
  if (!detail) return NextResponse.json({ error: "找不到這筆審核案件。" }, { status: 404 });
  if (!evidenceBelongsToRequest(detail, sourceFileAssetId)) {
    return NextResponse.json({ error: "這個檔案不屬於目前審核案件。" }, { status: 404 });
  }

  const client = getAsyncDatabaseClient();
  const source = await client.queryOne<FileAssetRow>(
    `
      SELECT id, storage_provider, storage_bucket, storage_key, storage_generation, original_path,
             file_name, file_ext, mime_type, file_size, content_hash, hash_algorithm,
             linked_entity_type, linked_entity_id, deleted_at
      FROM file_assets
      WHERE id = :sourceFileAssetId AND deleted_at IS NULL
    `,
    { sourceFileAssetId }
  );
  if (!source) {
    return NextResponse.json({ error: "檔案不存在或已被移除。" }, { status: 404 });
  }

  const wantsPreview = new URL(request.url).searchParams.get("preview") === "1";
  try {
    const resolved = wantsPreview
      ? await resolveDrawingPreviewAsync(client, source, { allowFake: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" })
      : await resolveSource(source);
    if (!resolved) {
      if (wantsPreview) {
        try {
          await enqueuePreviewJobForSourceAsync(client, {
            source: {
              ...source,
              company_id: detail.companyId,
              storage_provider: source.storage_provider ?? "local_repository"
            },
            actorUserId: auth.user.id,
            requestedKind: source.file_ext.trim().toLowerCase().replace(/^\./u, "") === "slddrw"
              ? "drawing_pdf"
              : "native_thumbnail_png",
            generatorProfile: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" ? "fake_preview_worker" : undefined,
            runFakeWorker: process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1"
          });
        } catch {
          // The source remains downloadable even when the preview worker is unavailable.
        }
      }
      return wantsPreview
        ? NextResponse.json(
            { code: "PREVIEW_NOT_READY", error: "預覽正在準備，請稍後再試；也可以先下載原檔。" },
            { status: 409 }
          )
        : NextResponse.json(
            { code: "EVIDENCE_FILE_UNAVAILABLE", error: "原檔目前無法下載，請稍後再試。" },
            { status: 503 }
          );
    }
    const pointer = storagePointerFromRecord(resolved.record);
    const bytes = await createFileStorageServiceForPointer(pointer).readObject(pointer.key);
    const contentType = resolved.mimeType || "application/octet-stream";
    const disposition = wantsPreview ? "inline" : "attachment";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": contentType,
        "content-length": String(bytes.byteLength),
        "content-disposition": `${disposition}; filename="${contentDispositionFilename(resolved.fileName)}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json(
      { code: "EVIDENCE_FILE_UNAVAILABLE", error: "檔案目前無法讀取，請稍後再試或下載原檔。" },
      { status: 503 }
    );
  }
}

function evidenceBelongsToRequest(detail: {
  actionCode: string;
  impactSnapshots: Array<{ snapshot: Record<string, unknown> }>;
}, sourceFileAssetId: string) {
  if (detail.actionCode !== "numbering.candidate_bundle_review") return false;
  for (const impact of detail.impactSnapshots) {
    const snapshot = impact.snapshot;
    const candidates = Array.isArray(snapshot.candidateRevisions) ? snapshot.candidateRevisions : [];
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
      const files = (candidate as Record<string, unknown>).files;
      if (!Array.isArray(files)) continue;
      if (files.some((file) => {
        if (!file || typeof file !== "object" || Array.isArray(file)) return false;
        return (file as Record<string, unknown>).sourceFileAssetId === sourceFileAssetId;
      })) return true;
    }
  }
  return false;
}

function resolveSource(source: FileAssetRow) {
  if (!source.storage_key && !source.original_path) return null;
  return {
    record: source,
    fileName: source.file_name || "審核附件",
    mimeType: source.mime_type || drawingPreviewMimeType(source.file_ext)
  };
}
