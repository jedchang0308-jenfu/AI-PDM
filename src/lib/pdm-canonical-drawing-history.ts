import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";

export class CanonicalDrawingHistoryError extends Error {
  constructor(public readonly code: "HISTORY_DRAWING_NOT_FOUND" | "HISTORY_REVISION_NOT_FOUND" | "HISTORY_REVISION_NOT_READABLE" | "HISTORY_REVISION_FILE_UNAVAILABLE", message: string) {
    super(message);
    this.name = "CanonicalDrawingHistoryError";
  }
}

export async function readCanonicalDrawingHistoryRevision(input: { companyId: string; drawingId: string; revisionId: string; client?: AsyncDatabaseClient }) {
  const client = input.client ?? getAsyncDatabaseClient();
  const drawing = await client.queryOne<{ id: string; drawing_number: string | null; purpose_code: string | null; purpose_description: string | null }>(
    `SELECT id, drawing_number, purpose_code, purpose_description
       FROM drawings WHERE id = :drawingId AND company_id = :companyId`,
    { companyId: input.companyId, drawingId: input.drawingId }
  );
  if (!drawing) throw new CanonicalDrawingHistoryError("HISTORY_DRAWING_NOT_FOUND", "圖號資料不存在");
  const revision = await client.queryOne<{ id: string; revision: string; lifecycle_state: string; policy_snapshot_json: string }>(
    `SELECT id, revision, lifecycle_state, policy_snapshot_json
       FROM drawing_revisions
      WHERE id = :revisionId AND drawing_id = :drawingId AND company_id = :companyId`,
    { companyId: input.companyId, drawingId: input.drawingId, revisionId: input.revisionId }
  );
  if (!revision) throw new CanonicalDrawingHistoryError("HISTORY_REVISION_NOT_FOUND", "指定版次不存在");
  const readable = ["released", "superseded", "rd_controlled"].includes(revision.lifecycle_state);
  const branchReference = await client.queryOne<{ id: string }>(
    `SELECT id FROM drawing_rd_branches
      WHERE company_id = :companyId AND drawing_id = :drawingId AND latest_approved_revision_id = :revisionId
      LIMIT 1`,
    { companyId: input.companyId, drawingId: input.drawingId, revisionId: input.revisionId }
  );
  if (!readable && !branchReference) throw new CanonicalDrawingHistoryError("HISTORY_REVISION_NOT_READABLE", "指定版次尚未形成可讀的歷史資料");

  const [bindingCount, files] = await Promise.all([
    client.queryOne<{ count: number | string }>(
      `SELECT COUNT(*) AS count
         FROM drawing_revision_files file
        WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId
          AND file.removed_at IS NULL`,
      { companyId: input.companyId, revisionId: input.revisionId }
    ),
    client.query<Record<string, unknown>>(
    `SELECT file.id, file.role, file.display_name, file.description, file.is_primary,
            asset.id AS asset_id, asset.file_name, asset.mime_type, asset.file_size, asset.content_hash
       FROM drawing_revision_files file
       JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId
        AND file.removed_at IS NULL AND asset.deleted_at IS NULL
      ORDER BY file.sort_order, file.id`,
    { companyId: input.companyId, revisionId: input.revisionId }
    )
  ]);
  if (Number(bindingCount?.count ?? 0) !== files.length) {
    throw new CanonicalDrawingHistoryError("HISTORY_REVISION_FILE_UNAVAILABLE", "指定版次有檔案已遺失或不可讀，系統不會改用其他版次。");
  }
  return {
    data: {
      drawingId: drawing.id,
      revisionId: revision.id,
      identity: { code: drawing.drawing_number, purpose: drawing.purpose_code, purposeDescription: drawing.purpose_description },
      revision: { revision: revision.revision, lifecycleState: revision.lifecycle_state },
      files: files.map((file) => ({
        id: String(file.id),
        role: String(file.role ?? ""),
        displayName: String(file.display_name ?? file.file_name ?? ""),
        description: String(file.description ?? ""),
        isPrimary: Number(file.is_primary ?? 0) === 1,
        fileName: String(file.file_name ?? ""),
        mimeType: String(file.mime_type ?? ""),
        fileSize: Number(file.file_size ?? 0),
        contentHash: String(file.content_hash ?? ""),
        downloadHref: pdmFileReadHref({ fileAssetId: String(file.asset_id), context: "drawing_revision", contextId: revision.id, bindingId: String(file.id) })
      }))
    },
    meta: { readOnly: true }
  };
}
