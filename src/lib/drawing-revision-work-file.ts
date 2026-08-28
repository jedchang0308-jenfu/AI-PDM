import crypto from "node:crypto";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { DrawingRevisionActor } from "@/lib/drawing-revision-work";
import { buildStorageKey, createFileStorageService } from "@/lib/file-storage";
import { drawingUploadRoleForExtension } from "@/lib/pdm-file-ownership";
import { runDev087IdempotentCommand } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { verifyCanonicalWorkbenchCommandContract } from "@/lib/pdm-workbench-authority-control";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";
import { getStorageUploadPolicy, validateStorageUploadFile } from "@/lib/storage-upload-policy";

type CommandContext = {
  idempotencyKey: string;
  contractToken: string;
  expectedRowVersion: number;
  correlationId?: string;
};

export type DrawingRevisionWorkFileUploadCheckpoint =
  | "before_tombstone"
  | "after_binding_switch"
  | "before_row_version"
  | "before_readback";

function correlation(value?: string) {
  return value?.trim() || crypto.randomUUID();
}

function optionalText(value: unknown, fallback: string, maxLength: number) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return (normalized || fallback).slice(0, maxLength);
}

function extension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase().slice(0, 30) : "";
}

function canonicalRole(fileName: string) {
  const role = drawingUploadRoleForExtension(fileName);
  return role === "dwg" ? "dwg_dxf" : role;
}

export async function uploadDrawingRevisionWorkFile(input: {
  client: AsyncDatabaseClient;
  workId: string;
  file: unknown;
  displayName?: unknown;
  description?: unknown;
  actor: DrawingRevisionActor;
  context: CommandContext;
  /** Dependency-injection seam used only by isolated transaction fault tests. */
  checkpoint?: (point: DrawingRevisionWorkFileUploadCheckpoint) => void | Promise<void>;
}) {
  if (!input.actor.permissions.update) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }
  await verifyCanonicalWorkbenchCommandContract(input.client, {
    companyId: input.actor.companyId,
    actorId: input.actor.id,
    token: input.context.contractToken
  });
  if (!(input.file instanceof File) || input.file.size < 1) {
    throw new CanonicalWorkbenchError("DRAWING_REVISION_FILE_REQUIRED", "請選擇要上傳的圖面檔案。", 400);
  }

  const policy = getStorageUploadPolicy();
  const uploadDecision = validateStorageUploadFile(input.file, policy);
  if (!uploadDecision.ok) {
    throw new CanonicalWorkbenchError(
      "DRAWING_REVISION_FILE_TOO_LARGE",
      `「${input.file.name}」超過單檔 ${policy.maxUploadFileMb.toFixed(0)} MB 的上傳上限。`,
      413
    );
  }

  const fileName = optionalText(input.file.name, "drawing-file", 255);
  const role = canonicalRole(fileName);
  if (!role) {
    throw new CanonicalWorkbenchError(
      "DRAWING_REVISION_FILE_ROLE_INVALID",
      "接受 .SLDDRW、.SLDPRT、.SLDASM、.PDF、.DWG/.DXF、.STEP/.STP、.IGES/.IGS/.IGF、.X_T/.X_B、.SAT、.STL 或 .JT。",
      422
    );
  }

  const displayName = optionalText(input.displayName, fileName, 300);
  const description = optionalText(input.description, "圖面進版受控原始檔", 2_000);
  const bytes = Buffer.from(await input.file.arrayBuffer());
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");
  const mimeType = input.file.type.trim() || "application/octet-stream";
  const fileExt = extension(fileName);
  const isPrimary = role === "drawing_2d" || role === "cad_3d";
  const repository = new DrawingRevisionWorkAsyncRepository(input.client);
  const work = await repository.readWork(input.client, input.actor.companyId, input.workId);
  if (!work) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "圖面工作資料不存在", 404);
  if (input.actor.id !== work.owner_user_id && !input.actor.canEditNonOwned) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "無權限執行此操作", 403);
  }

  const commandCorrelation = correlation(input.context.correlationId);
  const storage = createFileStorageService();
  let cleanupTarget: { key: string; provider: string } | null = null;
  try {
    const result = await runDev087IdempotentCommand(input.client, {
      companyId: input.actor.companyId,
      actorId: input.actor.id,
      command: "drawing.file.upload",
      idempotencyKey: input.context.idempotencyKey,
      request: {
        workId: input.workId,
        expectedRowVersion: input.context.expectedRowVersion,
        fileName,
        fileSize: bytes.byteLength,
        contentHash,
        role,
        displayName,
        description
      },
      effectKey: `drawing-work:${input.workId}:file:${role}`,
      correlationId: commandCorrelation
    }, async (tx) => {
      const locked = await repository.readWork(tx, input.actor.companyId, input.workId, true);
      if (!locked || Number(locked.row_version) !== input.context.expectedRowVersion || locked.handling !== "owner") {
        throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409, commandCorrelation);
      }
      await repository.assertWorkMutationBasis(tx, locked);

      const exact = await tx.queryOne<{
        id: string;
        source_file_asset_id: string;
        display_name: string;
      }>(
        `SELECT file.id, file.source_file_asset_id, file.display_name
         FROM drawing_revision_work_files binding
         JOIN drawing_revision_files file ON file.id = binding.file_binding_id
         JOIN file_assets asset ON asset.id = file.source_file_asset_id
         WHERE binding.work_id = :workId
           AND file.company_id = :companyId
           AND file.drawing_revision_id = :revisionId
           AND file.removed_at IS NULL
           AND asset.deleted_at IS NULL
           AND file.role = :role
           AND asset.content_hash = :contentHash
           AND asset.file_size = :fileSize
         LIMIT 1`,
        {
          workId: input.workId,
          companyId: input.actor.companyId,
          revisionId: locked.revision_id,
          role,
          contentHash,
          fileSize: bytes.byteLength
        }
      );
      if (exact) {
        return {
          workId: input.workId,
          rowVersion: input.context.expectedRowVersion,
          reused: true,
          file: { id: exact.id, sourceFileAssetId: exact.source_file_asset_id, role, displayName: exact.display_name }
        };
      }

      const fileAssetId = `FA-${crypto.randomUUID()}`;
      const fileBindingId = crypto.randomUUID();
      const storageKey = buildStorageKey([
        "drawing-revision-works",
        input.actor.companyId,
        input.workId,
        `${fileAssetId}-${fileName}`
      ]);
      const before = await storage.getObjectMetadata(storageKey);
      const stored = await storage.putObject({ key: storageKey, bytes, contentType: mimeType });
      if (!before && stored.key === storageKey) cleanupTarget = { key: stored.key, provider: stored.provider };
      if (stored.bytes !== bytes.byteLength || stored.sha256 !== contentHash || !(await storage.verifyObjectHash(stored.key, contentHash))) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "檔案已收到，但完整性驗證未通過，請重新上傳。", 503, commandCorrelation);
      }

      const currentRoleBindings = isPrimary ? await tx.query<{
        file_binding_id: string;
        ordinal: number | string;
        drawing_revision_id: string;
        source_file_asset_id: string;
      }>(
        `SELECT binding.file_binding_id, binding.ordinal, file.drawing_revision_id, file.source_file_asset_id
         FROM drawing_revision_work_files binding
         JOIN drawing_revision_files file ON file.id = binding.file_binding_id
         WHERE binding.work_id = :workId AND file.role = :role AND file.removed_at IS NULL
         ORDER BY binding.ordinal, binding.file_binding_id`,
        { workId: input.workId, role }
      ) : [];
      const maxOrdinal = await tx.queryOne<{ value: number | string }>(
        `SELECT COALESCE(MAX(ordinal), -1) AS value FROM drawing_revision_work_files WHERE work_id = :workId`,
        { workId: input.workId }
      );
      const ordinal = currentRoleBindings.length > 0
        ? Math.min(...currentRoleBindings.map((entry) => Number(entry.ordinal)))
        : Number(maxOrdinal?.value ?? -1) + 1;

      await input.checkpoint?.("before_tombstone");
      for (const current of currentRoleBindings) {
        await tx.execute(
          `DELETE FROM drawing_revision_work_files WHERE work_id = :workId AND file_binding_id = :fileBindingId`,
          { workId: input.workId, fileBindingId: current.file_binding_id }
        );
        if (current.drawing_revision_id === locked.revision_id) {
          await tx.execute(
            `UPDATE drawing_revision_files
             SET removed_at = CURRENT_TIMESTAMP, removed_by = :actorId, updated_at = CURRENT_TIMESTAMP
             WHERE id = :fileBindingId AND company_id = :companyId AND removed_at IS NULL`,
            { fileBindingId: current.file_binding_id, companyId: input.actor.companyId, actorId: input.actor.id }
          );
          await tx.execute(
            `UPDATE file_assets
             SET deleted_at = CURRENT_TIMESTAMP, deleted_by = :actorId, deleted_reason = 'drawing_revision_work_file_replaced', updated_at = CURRENT_TIMESTAMP
             WHERE id = :fileAssetId AND linked_entity_type = 'drawing_revision' AND linked_entity_id = :revisionId AND deleted_at IS NULL`,
            { fileAssetId: current.source_file_asset_id, revisionId: locked.revision_id, actorId: input.actor.id }
          );
        }
      }
      await input.checkpoint?.("after_binding_switch");

      await tx.execute(
        `INSERT INTO file_assets (
           id, storage_provider, original_path, storage_bucket, storage_key,
           file_name, file_ext, mime_type, file_size, content_hash,
           linked_entity_type, linked_entity_id, document_category, display_name,
           description, revision, uploaded_by
         ) VALUES (
           :id, :storageProvider, :originalPath, :storageBucket, :storageKey,
           :fileName, :fileExt, :mimeType, :fileSize, :contentHash,
           'drawing_revision', :revisionId, :documentCategory, :displayName,
           :description, :revision, :actorId
         )`,
        {
          id: fileAssetId,
          storageProvider: stored.provider,
          originalPath: stored.provider === "local_repository" ? stored.localPath : null,
          storageBucket: stored.bucket ?? null,
          storageKey: stored.key,
          fileName,
          fileExt,
          mimeType,
          fileSize: stored.bytes,
          contentHash: stored.sha256,
          revisionId: locked.revision_id,
          documentCategory: role,
          displayName,
          description,
          revision: locked.target_label,
          actorId: input.actor.id
        }
      );
      await tx.execute(
        `INSERT INTO drawing_revision_files (
           id, company_id, drawing_revision_id, source_file_asset_id, role,
           role_source, display_name, description, sort_order, is_primary, created_by
         ) VALUES (
           :id, :companyId, :revisionId, :fileAssetId, :role,
           'extension', :displayName, :description, :sortOrder, :isPrimary, :actorId
         )`,
        {
          id: fileBindingId,
          companyId: input.actor.companyId,
          revisionId: locked.revision_id,
          fileAssetId,
          role,
          displayName,
          description,
          sortOrder: ordinal,
          isPrimary: isPrimary ? 1 : 0,
          actorId: input.actor.id
        }
      );
      await tx.execute(
        `INSERT INTO drawing_revision_work_files (work_id, file_binding_id, ordinal, content_hash)
         VALUES (:workId, :fileBindingId, :ordinal, :contentHash)`,
        { workId: input.workId, fileBindingId, ordinal, contentHash }
      );
      await input.checkpoint?.("before_row_version");
      await tx.execute(
        `UPDATE drawing_revision_works
         SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`,
        {
          workId: input.workId,
          companyId: input.actor.companyId,
          expectedRowVersion: input.context.expectedRowVersion
        }
      );
      await tx.execute(
        `UPDATE canonical_workbench_states
         SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE company_id = :companyId AND work_id = :workId AND handling = 'owner'`,
        { companyId: input.actor.companyId, workId: input.workId }
      );
      await input.checkpoint?.("before_readback");
      await repository.assertWorkFileSnapshot(tx, locked);
      return {
        workId: input.workId,
        rowVersion: input.context.expectedRowVersion + 1,
        reused: false,
        file: { id: fileBindingId, sourceFileAssetId: fileAssetId, role, displayName }
      };
    });
    cleanupTarget = null;
    return result;
  } catch (error) {
    const target = cleanupTarget as { key: string; provider: string } | null;
    if (target) {
      try {
        await storage.deleteObject(target.key);
      } catch (cleanupError) {
        console.error("Drawing revision work orphan upload cleanup failed.", {
          correlationId: commandCorrelation,
          storageProvider: target.provider,
          storageKey: target.key,
          cleanupError
        });
      }
    }
    throw error;
  }
}
