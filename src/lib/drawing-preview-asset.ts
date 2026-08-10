import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type DrawingPreviewSource = {
  id: string;
  storage_provider: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  original_path: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  content_hash: string | null;
};

type DrawingPreviewDerivative = {
  id: string;
  storage_provider: string;
  storage_bucket: string | null;
  storage_key: string;
  original_path: string | null;
  file_name: string;
  mime_type: string;
  content_hash: string;
  source_content_hash: string;
  generator_profile: string;
  generator_version: string | null;
};

export type ResolvedDrawingPreview = {
  record: DrawingPreviewSource | DrawingPreviewDerivative;
  fileName: string;
  mimeType: string;
};

/**
 * One preview resolution rule for formal files, candidate files and review
 * evidence. The caller remains responsible for access checks and storage IO.
 */
export async function resolveDrawingPreviewAsync(
  client: AsyncDatabaseClient,
  source: DrawingPreviewSource,
  options: { allowFake?: boolean } = {}
): Promise<ResolvedDrawingPreview | null> {
  const mimeType = source.mime_type?.trim().toLowerCase() || "";
  if (mimeType === "application/pdf" || mimeType.startsWith("image/")) {
    return { record: source, fileName: source.file_name || "圖面附件", mimeType: mimeType || drawingPreviewMimeType(source.file_ext) };
  }

  const derivative = await client.queryOne<DrawingPreviewDerivative>(
    `
      SELECT id, storage_provider, storage_bucket, storage_key, original_path,
             file_name, mime_type, content_hash, source_content_hash,
             generator_profile, generator_version
      FROM file_derivatives
      WHERE source_file_asset_id = :sourceFileAssetId
        AND status = 'ready'
        AND derivative_kind IN ('model_preview_png', 'thumbnail_png', 'drawing_pdf', 'sheet_png')
        AND (:allowFake = 1 OR NOT (generator_profile = 'fake_preview_worker' AND generator_version = 'fake-local-pipeline'))
      ORDER BY CASE derivative_kind
        WHEN 'model_preview_png' THEN 0
        WHEN 'drawing_pdf' THEN 1
        WHEN 'sheet_png' THEN 2
        ELSE 3
      END, created_at DESC
      LIMIT 1
    `,
    { sourceFileAssetId: source.id, allowFake: options.allowFake ? 1 : 0 }
  );
  if (!derivative) return null;
  if (source.content_hash && derivative.source_content_hash !== source.content_hash) return null;
  return { record: derivative, fileName: derivative.file_name || source.file_name || "圖面附件", mimeType: derivative.mime_type };
}

export function drawingPreviewMimeType(extension: string) {
  const normalized = extension.trim().toLowerCase().replace(/^\./u, "");
  if (normalized === "pdf") return "application/pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(normalized)) return `image/${normalized === "jpg" ? "jpeg" : normalized}`;
  return "application/octet-stream";
}
