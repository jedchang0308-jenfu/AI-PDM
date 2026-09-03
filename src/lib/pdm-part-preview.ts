import "server-only";

import crypto from "node:crypto";
import path from "node:path";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  buildStorageKey,
  createFileStorageService,
  createFileStorageServiceForPointer,
  storagePointerFromRecord,
  type FileStorageService,
  type StoredFileStoragePointer
} from "@/lib/file-storage";
import {
  normalizePartPreviewImage,
  PartPreviewImageValidationError,
  PART_PREVIEW_IMAGE_MAX_BYTES
} from "@/lib/part-preview-image";
import { replayCanonicalTerminalReceipt, runCanonicalIdempotentCommand } from "@/lib/pdm-canonical-command";
import {
  resolveCanonicalDrawingPreview,
  selectCanonicalThreeDSource,
  type CanonicalPreviewDerivativeJobRow,
  type CanonicalPreviewProjection,
  type CanonicalPreviewSourceRow
} from "@/lib/pdm-canonical-preview";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";
import { assertPdmEntityWriteAllowedAsync, PdmReviewLockError } from "@/lib/pdm-review-lock";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import {
  PdmPartPreviewAsyncRepository,
  type PartPreviewDrawingSourceRow,
  type PartPreviewSettingAssetRow
} from "@/lib/repositories/pdm-part-preview-async-repository";

export type PartPreviewSourceControl = {
  settingRowVersion: number;
  canManage: boolean;
  hasPrimaryManufacturingDrawing: boolean;
  disabledReason: string | null;
};

export type PartPreviewMutationResult = {
  preview: CanonicalPreviewProjection;
  settingRowVersion: number;
};

export type PartPreviewUploadFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type PartPreviewResolverDependencies = {
  storageForPointer?: (pointer: StoredFileStoragePointer) => FileStorageService;
};

function asIso(value: string | Date | null) {
  return value instanceof Date ? value.toISOString() : value;
}

function unavailableCustom(part: PartPreviewSettingAssetRow): CanonicalPreviewProjection {
  return {
    state: "unavailable",
    media: null,
    sourceType: "custom_image",
    sourceLabel: "自訂圖片",
    sourceDrawingNumber: null,
    sourceRevision: null,
    alt: `${part.part_number} ${part.part_name} 料號預覽圖`.trim()
  };
}

async function resolveCustomPreview(
  part: PartPreviewSettingAssetRow,
  storageForPointer: (pointer: StoredFileStoragePointer) => FileStorageService
): Promise<CanonicalPreviewProjection> {
  if (!part.file_asset_id
    || part.deleted_at !== null
    || part.linked_entity_type !== "part_number"
    || part.linked_entity_id !== part.part_id
    || part.document_category !== "part_preview_image"
    || !["image/png", "image/jpeg"].includes(part.mime_type ?? "")
    || !["png", "jpg", "jpeg"].includes((part.file_ext ?? "").replace(/^\./u, "").toLowerCase())
    || !part.content_hash
    || !/^[0-9a-f]{64}$/iu.test(part.content_hash)
    || Number(part.file_size ?? 0) < 1
    || Number(part.file_size ?? 0) > PART_PREVIEW_IMAGE_MAX_BYTES) {
    return unavailableCustom(part);
  }

  try {
    const pointer = storagePointerFromRecord(part);
    const validHash = await storageForPointer(pointer).verifyObjectHash(pointer.key, part.content_hash);
    if (!validHash) return unavailableCustom(part);
    return {
      state: "ready",
      media: {
        mode: "image",
        href: pdmFileReadHref({
          fileAssetId: part.file_asset_id,
          context: "part_attachment",
          contextId: part.part_id,
          bindingId: part.file_asset_id
        }),
        fileName: part.file_name
      },
      sourceType: "custom_image",
      sourceLabel: "自訂圖片",
      sourceDrawingNumber: null,
      sourceRevision: null,
      alt: `${part.part_number} ${part.part_name} 料號預覽圖`.trim()
    };
  } catch {
    return unavailableCustom(part);
  }
}

function drawingSource(row: PartPreviewDrawingSourceRow): CanonicalPreviewSourceRow | null {
  if (!row.row_id || !row.revision_id || !row.data_layer || !row.binding_id || !row.asset_id) return null;
  return {
    rowId: row.row_id,
    revisionId: row.revision_id,
    dataLayer: row.data_layer,
    reviewRequestId: null,
    bindingId: row.binding_id,
    assetId: row.asset_id,
    role: row.role ?? "",
    displayName: row.display_name ?? "",
    fileName: row.file_name ?? "",
    fileExt: row.file_ext ?? "",
    mimeType: row.mime_type ?? "",
    contentHash: row.content_hash ?? "",
    isPrimary: row.is_primary ?? false,
    sortOrder: row.sort_order ?? 0
  };
}

type PartDrawingPreviewCandidate = {
  rowId: string;
  revisionId: string;
  dataLayer: "drawing_production" | "drawing_rd";
  drawingNumber: string;
  revision: string;
  updatedAt: number;
  source: CanonicalPreviewSourceRow | null;
  projection: CanonicalPreviewProjection;
};

function timestamp(value: string | Date | null) {
  if (value instanceof Date) return value.getTime();
  const text = value ?? "";
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/u.test(text)
    ? `${text.replace(" ", "T")}Z`
    : text;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readyDerivativeTimestamp(
  source: CanonicalPreviewSourceRow | null,
  jobs: readonly CanonicalPreviewDerivativeJobRow[]
) {
  if (!source) return 0;
  return jobs.reduce((latest, job) => {
    if (job.recordKind !== "derivative"
      || job.status !== "ready"
      || !job.id
      || !job.storageKey
      || job.mimeType?.toLowerCase() !== "image/png"
      || !["model_preview_png", "thumbnail_png"].includes(job.derivativeKind ?? "")
      || job.generatorProfile === "fake_preview_worker"
      || job.generatorVersion === "fake-local-pipeline"
      || job.sourceFileAssetId !== source.assetId
      || job.sourceContentHash !== source.contentHash) return latest;
    return Math.max(latest, timestamp(job.createdAt));
  }, 0);
}

function comparePreviewCandidates(left: PartDrawingPreviewCandidate, right: PartDrawingPreviewCandidate) {
  return right.updatedAt - left.updatedAt
    || right.revision.localeCompare(left.revision, "en", { numeric: true, sensitivity: "base" })
    || left.rowId.localeCompare(right.rowId);
}

function resolveAutomaticPartPreview(input: {
  part: PartPreviewSettingAssetRow;
  rows: readonly PartPreviewDrawingSourceRow[];
  jobs: readonly CanonicalPreviewDerivativeJobRow[];
}): CanonicalPreviewProjection {
  const drawingIds = [...new Set(input.rows.map((row) => row.drawing_id))];
  const linkedIdentity = input.rows[0] ?? null;
  const alt = `${input.part.part_number} ${input.part.part_name} 料號預覽圖`.trim();
  if (drawingIds.length !== 1) {
    return resolveCanonicalDrawingPreview({
      source: null,
      derivativeJobs: input.jobs,
      identity: { alt }
    });
  }

  const rowsByRevision = new Map<string, PartPreviewDrawingSourceRow[]>();
  for (const row of input.rows) {
    if (!row.row_id || !row.revision_id || !row.data_layer || !row.revision) continue;
    rowsByRevision.set(row.revision_id, [...(rowsByRevision.get(row.revision_id) ?? []), row]);
  }

  const candidates = [...rowsByRevision.values()].map((rows): PartDrawingPreviewCandidate => {
    const identity = rows[0];
    const sources = rows.map(drawingSource).filter((value): value is CanonicalPreviewSourceRow => Boolean(value));
    const source = selectCanonicalThreeDSource(sources, identity.revision_id!);
    const sourceLabel = identity.data_layer === "drawing_production" ? "量產預覽" : "研發預覽";
    const projection = resolveCanonicalDrawingPreview({
      source,
      derivativeJobs: input.jobs,
      identity: {
        drawingNumber: identity.drawing_number,
        revision: identity.revision,
        sourceLabel,
        alt
      }
    });
    const updatedAt = Math.max(
      ...rows.flatMap((row) => [
        timestamp(row.binding_updated_at),
        timestamp(row.revision_updated_at),
        timestamp(row.state_updated_at)
      ]),
      readyDerivativeTimestamp(source, input.jobs)
    );
    return {
      rowId: identity.row_id!,
      revisionId: identity.revision_id!,
      dataLayer: identity.data_layer!,
      drawingNumber: identity.drawing_number,
      revision: identity.revision!,
      updatedAt,
      source,
      projection
    };
  });

  const production = candidates
    .filter((candidate) => candidate.dataLayer === "drawing_production")
    .sort(comparePreviewCandidates);
  const activeRd = candidates
    .filter((candidate) => candidate.dataLayer === "drawing_rd")
    .sort(comparePreviewCandidates);
  return production.find((candidate) => candidate.projection.state === "ready")?.projection
    ?? activeRd.find((candidate) => candidate.projection.state === "ready")?.projection
    ?? production[0]?.projection
    ?? activeRd[0]?.projection
    ?? resolveCanonicalDrawingPreview({
      source: null,
      derivativeJobs: input.jobs,
      identity: {
        drawingNumber: linkedIdentity?.drawing_number ?? null,
        revision: null,
        sourceLabel: "主要製造圖",
        alt
      }
    });
}

function derivativeJob(row: Awaited<ReturnType<PdmPartPreviewAsyncRepository["listDerivativeJobs"]>>[number]): CanonicalPreviewDerivativeJobRow {
  return {
    recordKind: row.record_kind,
    id: row.id,
    sourceFileAssetId: row.source_file_asset_id,
    sourceContentHash: row.source_content_hash,
    derivativeKind: row.derivative_kind,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    generatorProfile: row.generator_profile,
    generatorVersion: row.generator_version,
    status: row.status,
    createdAt: asIso(row.created_at),
    lastHeartbeatAt: asIso(row.last_heartbeat_at)
  };
}

export async function resolvePartPreviewsAsync(
  client: AsyncDatabaseClient,
  input: {
    companyId: string;
    partIds: readonly string[];
    rowKeysByPartId: Record<string, readonly string[]>;
  },
  dependencies: PartPreviewResolverDependencies = {}
): Promise<Record<string, CanonicalPreviewProjection>> {
  const partIds = [...new Set(input.partIds.map((value) => value.trim()).filter(Boolean))];
  if (partIds.length === 0) return {};
  const repository = new PdmPartPreviewAsyncRepository(client);
  const [parts, drawingRows] = await Promise.all([
    repository.listSettingsAndCustomAssets({ companyId: input.companyId, partIds }),
    repository.listPrimaryDrawingSources({ companyId: input.companyId, partIds })
  ]);
  const assetIds = [...new Set(drawingRows.map((row) => row.asset_id).filter((value): value is string => Boolean(value)))];
  const jobs = (await repository.listDerivativeJobs({ companyId: input.companyId, assetIds })).map(derivativeJob);
  const storageForPointer = dependencies.storageForPointer ?? ((pointer) => createFileStorageServiceForPointer(pointer));
  const drawingRowsByPart = new Map<string, PartPreviewDrawingSourceRow[]>();
  for (const row of drawingRows) {
    drawingRowsByPart.set(row.part_id, [...(drawingRowsByPart.get(row.part_id) ?? []), row]);
  }

  const result: Record<string, CanonicalPreviewProjection> = {};
  for (const part of parts) {
    let preview: CanonicalPreviewProjection;
    if (part.source_mode === "custom_image") {
      preview = await resolveCustomPreview(part, storageForPointer);
    } else {
      preview = resolveAutomaticPartPreview({
        part,
        rows: drawingRowsByPart.get(part.part_id) ?? [],
        jobs
      });
    }
    preview = {
      ...preview,
      hasPrimaryManufacturingDrawing: (drawingRowsByPart.get(part.part_id) ?? []).some((row) => Boolean(row.drawing_id))
    };
    for (const rowKey of input.rowKeysByPartId[part.part_id] ?? []) result[rowKey] = preview;
  }
  return result;
}

function safeFileName(original: string, extension: ".png" | ".jpg") {
  const stem = path.basename(original, path.extname(original)).trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return `${(stem || "part-preview").slice(0, 120)}${extension}`;
}

function asVersion(value: number | string | null | undefined) {
  const version = Number(value ?? 0);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

function mapServiceError(error: unknown, correlationId: string): never {
  if (error instanceof CanonicalWorkbenchError) throw error;
  if (error instanceof PartPreviewImageValidationError) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", error.message, 422, correlationId);
  }
  if (error instanceof PdmReviewLockError) {
    throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "料號正在審核中，暫時不可變更預覽圖", 409, correlationId);
  }
  const message = error instanceof Error ? error.message : "";
  if (message.includes("PART_PREVIEW_ACTIVE_ASSET")) {
    throw new CanonicalWorkbenchError("PART_PREVIEW_ACTIVE_ASSET", "請先恢復使用主要製造圖或更換預覽圖", 409, correlationId);
  }
  throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "預覽圖操作失敗，請稍後再試", 503, correlationId);
}

export class PartPreviewService {
  constructor(
    private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient(),
    private readonly storage: FileStorageService = createFileStorageService()
  ) {}

  async setCustom(input: {
    companyId: string;
    partNumber: string;
    actorId: string;
    expectedRowVersion: number;
    idempotencyKey: string;
    correlationId: string;
    file: PartPreviewUploadFile;
  }): Promise<PartPreviewMutationResult> {
    let staged: { requestedKey: string; returnedKey: string; cleanupEligible: boolean } | null = null;
    try {
      if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "預覽圖版本無效", 422, input.correlationId);
      }
      if (input.file.size < 1 || input.file.size > PART_PREVIEW_IMAGE_MAX_BYTES) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "預覽圖不可為空檔且不可超過 10 MiB", 422, input.correlationId);
      }
      const repository = new PdmPartPreviewAsyncRepository(this.client);
      const part = await repository.findPart({ companyId: input.companyId, partNumber: input.partNumber });
      if (!part) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404, input.correlationId);
      const normalized = await normalizePartPreviewImage({
        bytes: Buffer.from(await input.file.arrayBuffer()),
        fileName: input.file.name,
        declaredMimeType: input.file.type
      });
      const request = { partId: part.id, expectedRowVersion: input.expectedRowVersion, normalizedSha256: normalized.sha256 };
      const replay = await replayCanonicalTerminalReceipt<PartPreviewMutationResult>(this.client, {
        companyId: input.companyId,
        command: "dev065:part-preview.set-custom",
        idempotencyKey: input.idempotencyKey,
        request,
        correlationId: input.correlationId
      });
      if (replay) return replay;

      const commandKey = crypto.createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 32);
      const requestedKey = buildStorageKey([
        "part-previews",
        input.companyId,
        part.id,
        commandKey,
        `${normalized.sha256}${normalized.extension}`
      ]);
      const preexisting = Boolean(await this.storage.getObjectMetadata(requestedKey));
      const stored = await this.storage.putObject({
        key: requestedKey,
        bytes: normalized.bytes,
        contentType: normalized.mimeType,
        cacheControl: "private, no-store"
      });
      staged = { requestedKey, returnedKey: stored.key, cleanupEligible: !preexisting && stored.key === requestedKey };

      return await runCanonicalIdempotentCommand(this.client, {
        companyId: input.companyId,
        actorId: input.actorId,
        command: "dev065:part-preview.set-custom",
        idempotencyKey: input.idempotencyKey,
        request,
        effectKey: `part-preview:${part.id}`,
        correlationId: input.correlationId
      }, async (tx) => {
        const txRepository = new PdmPartPreviewAsyncRepository(tx);
        const lockedPart = await txRepository.findPart({ companyId: input.companyId, partNumber: input.partNumber, lock: true });
        if (!lockedPart || lockedPart.id !== part.id) {
          throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404, input.correlationId);
        }
        await assertPdmEntityWriteAllowedAsync(tx, {
          companyId: input.companyId,
          targetIds: [part.id],
          targetRefs: [{ type: "part_number", id: part.id }]
        });
        const oldSetting = await txRepository.getSetting({ companyId: input.companyId, partId: part.id, lock: true });
        if (asVersion(oldSetting?.row_version) !== input.expectedRowVersion) {
          throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "預覽圖已被更新，請重新整理", 409, input.correlationId);
        }
        const assetId = await txRepository.insertCustomAsset({
          partId: part.id,
          storageProvider: stored.provider,
          originalPath: stored.localPath,
          storageBucket: stored.bucket ?? null,
          storageKey: stored.key,
          fileName: safeFileName(input.file.name, normalized.extension),
          fileExt: normalized.extension.slice(1),
          mimeType: normalized.mimeType,
          fileSize: normalized.bytes.byteLength,
          contentHash: normalized.sha256,
          actorId: input.actorId
        });
        const setting = await txRepository.setCustom({ companyId: input.companyId, partId: part.id, fileAssetId: assetId, actorId: input.actorId });
        await new AsyncAuditRepository(tx).createAuditLog({
          actorId: input.actorId,
          action: oldSetting?.source_mode === "custom_image" ? "numbering.part_preview.replace_custom" : "numbering.part_preview.set_custom",
          detail: {
            partId: part.id,
            partNumber: part.part_number,
            oldSourceMode: oldSetting?.source_mode ?? "auto",
            newSourceMode: "custom_image",
            oldAssetId: oldSetting?.file_asset_id ?? null,
            newAssetId: assetId,
            rowVersion: asVersion(setting.row_version),
            correlationId: input.correlationId
          }
        });
        const preview = (await resolvePartPreviewsAsync(tx, {
          companyId: input.companyId,
          partIds: [part.id],
          rowKeysByPartId: { [part.id]: ["mutation"] }
        }, { storageForPointer: () => this.storage }))["mutation"];
        if (!preview) throw new Error("PART_PREVIEW_READBACK_MISSING");
        return { preview, settingRowVersion: asVersion(setting.row_version) };
      });
    } catch (error) {
      if (staged?.cleanupEligible && !isIndeterminateReceiptConflict(error)) {
        try {
          const bound = await this.client.queryOne<{ id: string }>(
            `SELECT id FROM file_assets WHERE storage_key = :storageKey AND deleted_at IS NULL LIMIT 1`,
            { storageKey: staged.returnedKey }
          );
          if (!bound) await this.storage.deleteObject(staged.requestedKey);
        } catch {
          console.warn("DEV065_STORAGE_COMPENSATION_RECONCILIATION_REQUIRED", {
            companyId: input.companyId,
            partNumber: input.partNumber,
            correlationId: input.correlationId
          });
        }
      }
      return mapServiceError(error, input.correlationId);
    }
  }

  async resetAuto(input: {
    companyId: string;
    partNumber: string;
    actorId: string;
    expectedRowVersion: number;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<PartPreviewMutationResult> {
    try {
      if (!Number.isSafeInteger(input.expectedRowVersion) || input.expectedRowVersion < 0) {
        throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "預覽圖版本無效", 422, input.correlationId);
      }
      const repository = new PdmPartPreviewAsyncRepository(this.client);
      const part = await repository.findPart({ companyId: input.companyId, partNumber: input.partNumber });
      if (!part) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404, input.correlationId);
      const request = { partId: part.id, expectedRowVersion: input.expectedRowVersion };
      const replay = await replayCanonicalTerminalReceipt<PartPreviewMutationResult>(this.client, {
        companyId: input.companyId,
        command: "dev065:part-preview.reset-auto",
        idempotencyKey: input.idempotencyKey,
        request,
        correlationId: input.correlationId
      });
      if (replay) return replay;
      return await runCanonicalIdempotentCommand(this.client, {
        companyId: input.companyId,
        actorId: input.actorId,
        command: "dev065:part-preview.reset-auto",
        idempotencyKey: input.idempotencyKey,
        request,
        effectKey: `part-preview:${part.id}`,
        correlationId: input.correlationId
      }, async (tx) => {
        const txRepository = new PdmPartPreviewAsyncRepository(tx);
        const lockedPart = await txRepository.findPart({ companyId: input.companyId, partNumber: input.partNumber, lock: true });
        if (!lockedPart || lockedPart.id !== part.id) {
          throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404, input.correlationId);
        }
        await assertPdmEntityWriteAllowedAsync(tx, {
          companyId: input.companyId,
          targetIds: [part.id],
          targetRefs: [{ type: "part_number", id: part.id }]
        });
        const oldSetting = await txRepository.getSetting({ companyId: input.companyId, partId: part.id, lock: true });
        if (asVersion(oldSetting?.row_version) !== input.expectedRowVersion) {
          throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "預覽圖已被更新，請重新整理", 409, input.correlationId);
        }
        const setting = await txRepository.resetAuto({ companyId: input.companyId, partId: part.id, actorId: input.actorId });
        await new AsyncAuditRepository(tx).createAuditLog({
          actorId: input.actorId,
          action: "numbering.part_preview.reset_auto",
          detail: {
            partId: part.id,
            partNumber: part.part_number,
            oldSourceMode: oldSetting?.source_mode ?? "auto",
            newSourceMode: "auto",
            oldAssetId: oldSetting?.file_asset_id ?? null,
            newAssetId: null,
            rowVersion: asVersion(setting.row_version),
            correlationId: input.correlationId
          }
        });
        const preview = (await resolvePartPreviewsAsync(tx, {
          companyId: input.companyId,
          partIds: [part.id],
          rowKeysByPartId: { [part.id]: ["mutation"] }
        }))["mutation"];
        if (!preview) throw new Error("PART_PREVIEW_READBACK_MISSING");
        return { preview, settingRowVersion: asVersion(setting.row_version) };
      });
    } catch (error) {
      return mapServiceError(error, input.correlationId);
    }
  }
}

function isIndeterminateReceiptConflict(error: unknown) {
  return error instanceof CanonicalWorkbenchError
    && error.code === "WORKBENCH_ROW_VERSION_CONFLICT"
    && error.message.includes("處理中");
}
