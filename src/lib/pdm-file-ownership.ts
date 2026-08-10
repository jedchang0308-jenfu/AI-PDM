import crypto from "node:crypto";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createFileStorageServiceForPointer, storagePointerFromRecord } from "@/lib/file-storage";

export const requiredDrawing2dExtensions = new Set(["slddrw"]);
export const requiredDrawing3dExtensions = new Set(["sldprt", "sldasm"]);
const drawingPdfExtensions = new Set(["pdf"]);
const drawingExchangeExtensions = new Set(["dwg", "dxf"]);
const drawingIntermediateExtensions = new Set(["step", "stp", "iges", "igs", "igf", "x_t", "x_b", "sat", "stl", "jt"]);

export type RequiredDrawingFileRole = "drawing_2d" | "cad_3d";
export type DrawingUploadFileRole = RequiredDrawingFileRole | "intermediate" | "pdf" | "dwg";

export type RequiredDrawingFileInput = {
  id?: string;
  fileName: string;
  fileExt?: string | null;
  fileSize?: number | string | null;
  contentHash?: string | null;
  role?: string | null;
  isPrimary?: boolean | number | string | null;
};

export type RequiredDrawingFileReadiness = {
  ready: boolean;
  primary2d: RequiredDrawingFileInput[];
  primary3d: RequiredDrawingFileInput[];
  blockers: Array<{
    code: "DRAWING_2D_REQUIRED" | "DRAWING_3D_REQUIRED" | "DRAWING_2D_PRIMARY_REQUIRED" | "DRAWING_3D_PRIMARY_REQUIRED" | "DRAWING_ROLE_EXTENSION_MISMATCH";
    message: string;
    fileIds?: string[];
  }>;
};

export function extensionOfFileName(fileName: string, fileExt?: string | null) {
  const explicit = String(fileExt ?? "").trim().toLowerCase().replace(/^\./u, "");
  if (explicit) return explicit;
  const normalized = String(fileName ?? "").trim().toLowerCase();
  const dot = normalized.lastIndexOf(".");
  return dot >= 0 ? normalized.slice(dot + 1) : "";
}

export function requiredDrawingRoleForExtension(fileName: string, fileExt?: string | null): RequiredDrawingFileRole | null {
  const extension = extensionOfFileName(fileName, fileExt);
  if (requiredDrawing2dExtensions.has(extension)) return "drawing_2d";
  if (requiredDrawing3dExtensions.has(extension)) return "cad_3d";
  return null;
}

export function drawingUploadRoleForExtension(fileName: string, fileExt?: string | null): DrawingUploadFileRole | null {
  const extension = extensionOfFileName(fileName, fileExt);
  const requiredRole = requiredDrawingRoleForExtension(fileName, fileExt);
  if (requiredRole) return requiredRole;
  if (drawingPdfExtensions.has(extension)) return "pdf";
  if (drawingExchangeExtensions.has(extension)) return "dwg";
  if (drawingIntermediateExtensions.has(extension)) return "intermediate";
  return null;
}

export function isPrimaryFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

export function evaluateRequiredDrawingFiles(files: RequiredDrawingFileInput[]): RequiredDrawingFileReadiness {
  const primary2d = files.filter((file) => {
    const role = requiredDrawingRoleForExtension(file.fileName, file.fileExt);
    return role === "drawing_2d" && isPrimaryFlag(file.isPrimary ?? true);
  });
  const primary3d = files.filter((file) => {
    const role = requiredDrawingRoleForExtension(file.fileName, file.fileExt);
    return role === "cad_3d" && isPrimaryFlag(file.isPrimary ?? true);
  });
  const blockers: RequiredDrawingFileReadiness["blockers"] = [];
  const roleMismatches = files.filter((file) => {
    const extensionRole = requiredDrawingRoleForExtension(file.fileName, file.fileExt);
    return extensionRole && file.role && file.role !== extensionRole;
  });
  if (roleMismatches.length > 0) {
    blockers.push({
      code: "DRAWING_ROLE_EXTENSION_MISMATCH",
      message: "2D／3D 檔案類別必須由副檔名決定，不能手動改成其他角色。",
      fileIds: roleMismatches.map((file) => file.id).filter((id): id is string => Boolean(id))
    });
  }
  if (primary2d.length === 0) {
    blockers.push({ code: "DRAWING_2D_REQUIRED", message: "必須提供 1 個 2D 原始檔（.SLDDRW）。" });
  }
  if (primary3d.length === 0) {
    blockers.push({ code: "DRAWING_3D_REQUIRED", message: "必須提供 1 個 3D CAD（.SLDPRT 或 .SLDASM）。" });
  }
  if (primary2d.length > 1) {
    blockers.push({
      code: "DRAWING_2D_PRIMARY_REQUIRED",
      message: "2D 原始檔只能指定 1 個主檔。",
      fileIds: primary2d.map((file) => file.id).filter((id): id is string => Boolean(id))
    });
  }
  if (primary3d.length > 1) {
    blockers.push({
      code: "DRAWING_3D_PRIMARY_REQUIRED",
      message: "3D CAD 只能指定 1 個主檔。",
      fileIds: primary3d.map((file) => file.id).filter((id): id is string => Boolean(id))
    });
  }
  return { ready: blockers.length === 0, primary2d, primary3d, blockers };
}

export function assertRequiredDrawingFiles(files: RequiredDrawingFileInput[]) {
  const readiness = evaluateRequiredDrawingFiles(files);
  if (!readiness.ready) {
    const error = new Error(readiness.blockers.map((blocker) => blocker.message).join(" ")) as Error & {
      code?: string;
      details?: RequiredDrawingFileReadiness["blockers"];
    };
    error.code = readiness.blockers[0]?.code ?? "DRAWING_FILE_READINESS_FAILED";
    error.details = readiness.blockers;
    throw error;
  }
  return readiness;
}

export function sha256Bytes(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export type ReusableCadAsset = {
  id: string;
  storage_provider: string;
  original_path: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  storage_generation: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  linked_entity_type: string;
  linked_entity_id: string;
};

export async function findReusableCadAsset(
  client: AsyncDatabaseClient,
  input: { companyId: string; ownerId: string | null; contentHash: string; fileSize: number }
) {
  if (!input.ownerId) return null;
  return client.queryOne<ReusableCadAsset>(
    `
    SELECT fa.*
    FROM file_assets fa
    JOIN shared_cad_model_versions smv ON smv.source_file_asset_id = fa.id
    WHERE smv.company_id = :companyId
      AND smv.owner_scope = 'part_root'
      AND smv.owner_id = :ownerId
      AND smv.content_hash = :contentHash
      AND smv.status <> 'Obsolete'
      AND fa.deleted_at IS NULL
      AND COALESCE(fa.file_size, -1) = :fileSize
    ORDER BY CASE smv.status WHEN 'Released' THEN 0 WHEN 'Pending' THEN 1 ELSE 2 END,
             smv.created_at ASC,
             fa.created_at ASC,
             fa.id ASC
    LIMIT 1
    `,
    input
  );
}

export async function findOwnerPartRootForDrawing(client: AsyncDatabaseClient, input: { companyId: string; drawingNumberId: string }) {
  const row = await client.queryOne<{ part_root_id: string | null }>(
    `
    SELECT part_root_id
    FROM drawing_numbers
    WHERE id = :drawingNumberId AND company_id = :companyId
    LIMIT 1
    `,
    input
  );
  return row?.part_root_id ?? null;
}

export async function findOwnerPartRootForCandidate(client: AsyncDatabaseClient, input: { companyId: string; candidateRevisionId: string }) {
  const row = await client.queryOne<{ source_root_id: string | null }>(
    `
    SELECT workspace.source_root_id
    FROM numbering_candidate_revision_drafts candidate
    JOIN numbering_draft_workspaces workspace ON workspace.id = candidate.workspace_id
    WHERE candidate.company_id = :companyId
      AND candidate.id = :candidateRevisionId
    LIMIT 1
    `,
    input
  );
  return row?.source_root_id ?? null;
}

export async function registerDrawingCadAssetForReuse(
  client: AsyncDatabaseClient,
  input: {
    companyId: string;
    drawingNumberId: string;
    assetId: string;
    contentHash: string;
    fileSize: number;
    revision: string;
    actorId: string;
  }
) {
  return client.transaction(async (transactionClient) => {
    const ownerId = await findOwnerPartRootForDrawing(transactionClient, {
      companyId: input.companyId,
      drawingNumberId: input.drawingNumberId
    });
    if (!ownerId) return { ownerId: null, canonicalAssetId: input.assetId, reused: false };

    const reusable = await findReusableCadAsset(transactionClient, {
      companyId: input.companyId,
      ownerId,
      contentHash: input.contentHash,
      fileSize: input.fileSize
    });
    if (reusable) return { ownerId, canonicalAssetId: reusable.id, reused: reusable.id !== input.assetId };

    await transactionClient.execute(
      `
      INSERT INTO shared_cad_model_versions (
        id, company_id, owner_scope, owner_id, part_root_id, source_file_asset_id,
        model_revision, content_hash, hash_algorithm, status, created_by, created_at
      ) VALUES (
        :id, :companyId, 'part_root', :ownerId, :ownerId, :assetId,
        :revision, :contentHash, 'SHA-256', 'Pending', :actorId, :createdAt
      )
      ON CONFLICT DO NOTHING
      `,
      {
        id: `SMV-${crypto.randomUUID()}`,
        companyId: input.companyId,
        ownerId,
        assetId: input.assetId,
        revision: input.revision || "unlabeled",
        contentHash: input.contentHash,
        actorId: input.actorId,
        createdAt: new Date().toISOString()
      }
    );

    const winner = await findReusableCadAsset(transactionClient, {
      companyId: input.companyId,
      ownerId,
      contentHash: input.contentHash,
      fileSize: input.fileSize
    });
    if (!winner) throw new Error("DRAWING_CAD_REUSE_CANONICAL_ASSET_MISSING");
    return { ownerId, canonicalAssetId: winner.id, reused: winner.id !== input.assetId };
  });
}

type CadAssetStorageRow = {
  id: string;
  storage_provider: string;
  original_path: string | null;
  storage_key: string | null;
  storage_bucket: string | null;
  storage_generation: string | null;
  storage_metageneration: string | null;
};

/**
 * Preserve the per-version upload receipt while converging its pointer to the
 * canonical object selected by the scoped reuse transaction. A losing race may
 * already have written a temporary physical object, so remove that object only
 * after the receipt points at the canonical object and only when no other live
 * asset references the old pointer.
 */
export async function reconcileDrawingCadAssetPointer(
  client: AsyncDatabaseClient,
  input: { assetId: string; canonicalAssetId: string }
) {
  if (input.assetId === input.canonicalAssetId) return { reconciled: false, removedObject: false };

  const [asset, canonical] = await Promise.all([
    client.queryOne<CadAssetStorageRow>(
      `SELECT id, storage_provider, original_path, storage_key, storage_bucket, storage_generation, storage_metageneration FROM file_assets WHERE id = :id LIMIT 1`,
      { id: input.assetId }
    ),
    client.queryOne<CadAssetStorageRow>(
      `SELECT id, storage_provider, original_path, storage_key, storage_bucket, storage_generation, storage_metageneration FROM file_assets WHERE id = :id LIMIT 1`,
      { id: input.canonicalAssetId }
    )
  ]);
  if (!asset || !canonical) throw new Error("DRAWING_CAD_REUSE_ASSET_POINTER_MISSING");

  const currentPointer = storagePointerFromRecord(asset);
  const canonicalPointer = storagePointerFromRecord(canonical);
  const samePointer = currentPointer.provider === canonicalPointer.provider
    && currentPointer.bucket === canonicalPointer.bucket
    && currentPointer.key === canonicalPointer.key;
  if (samePointer) return { reconciled: false, removedObject: false };

  const sharedCurrentPointerCount = await client.queryOne<{ count: number | string }>(
    `
    SELECT COUNT(*) AS count
    FROM file_assets
    WHERE id <> :assetId
      AND deleted_at IS NULL
      AND storage_provider = :storageProvider
      AND COALESCE(storage_bucket, '') = COALESCE(:storageBucket, '')
      AND storage_key = :storageKey
    `,
    {
      assetId: input.assetId,
      storageProvider: asset.storage_provider,
      storageBucket: asset.storage_bucket,
      storageKey: asset.storage_key
    }
  );
  const canRemoveCurrentObject = Number(sharedCurrentPointerCount?.count ?? 0) === 0;

  await client.transaction(async (transactionClient) => {
    await transactionClient.execute(
      `
      UPDATE file_assets
      SET storage_provider = :storageProvider,
          original_path = :originalPath,
          storage_key = :storageKey,
          storage_bucket = :storageBucket,
          storage_generation = :storageGeneration,
          storage_metageneration = :storageMetageneration,
          updated_at = :updatedAt
      WHERE id = :assetId
      `,
      {
        assetId: input.assetId,
        storageProvider: canonical.storage_provider,
        originalPath: canonical.original_path,
        storageKey: canonical.storage_key,
        storageBucket: canonical.storage_bucket,
        storageGeneration: canonical.storage_generation,
        storageMetageneration: canonical.storage_metageneration,
        updatedAt: new Date().toISOString()
      }
    );
  });

  let removedObject = false;
  if (canRemoveCurrentObject && asset.storage_key) {
    await createFileStorageServiceForPointer(currentPointer).deleteObject(currentPointer.key);
    removedObject = true;
  }
  return { reconciled: true, removedObject };
}
