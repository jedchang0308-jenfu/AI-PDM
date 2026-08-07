import crypto from "node:crypto";
import zlib from "node:zlib";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  buildStorageKey,
  createFileStorageService,
  createFileStorageServiceForPointer,
  sha256,
  storagePointerFromRecord
} from "@/lib/file-storage";
import type {
  MasterAttachmentEntityType,
  MasterAttachmentPreviewDerivative,
  MasterAttachmentPreviewDerivativeStatus,
  MasterAttachmentPreviewJob,
  MasterAttachmentPreviewJobStatus,
  MasterAttachmentRecord
} from "@/lib/repositories/master-attachment-repository";

type PreviewRequestedKind = "native_thumbnail_png" | "drawing_pdf";
type PreviewDerivativeKind = "thumbnail_png" | "drawing_pdf" | "sheet_png" | "model_preview_png";

type PreviewSourceRow = {
  id: string;
  company_id: string | null;
  storage_provider: string;
  original_path: string | null;
  storage_key: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  hash_algorithm: string;
  linked_entity_type: string;
  linked_entity_id: string;
};

type PreviewJobRow = {
  id: string;
  source_file_asset_id: string;
  source_content_hash: string;
  requested_kind: string;
  source_extension: string;
  status: string;
  attempt_count: number | string | null;
  locked_by: string | null;
  locked_at: string | null;
  generator_profile: string;
  error_code: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type FileDerivativeRow = {
  id: string;
  source_file_asset_id: string;
  source_content_hash: string;
  derivative_kind: string;
  storage_provider: string;
  storage_key: string;
  original_path: string | null;
  file_name: string;
  mime_type: string;
  file_size: number | string | null;
  content_hash: string;
  width: number | string | null;
  height: number | string | null;
  page_count: number | string | null;
  generator_profile: string;
  generator_version: string | null;
  preview_job_id: string | null;
  status: string;
  created_at: string;
  created_by_worker: string | null;
};

type PreviewState = {
  derivatives: MasterAttachmentPreviewDerivative[];
  job: MasterAttachmentPreviewJob | null;
};

export type PreviewDerivativeFile = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
  contentHash: string;
};

export type PreviewWorkerClaim = {
  jobId: string;
  sourceFileAssetId: string;
  sourceContentHash: string;
  sourceExtension: string;
  requestedKind: PreviewRequestedKind;
  generatorProfile: string;
  storageKey: string | null;
  originalPath: string | null;
};

export type PreviewWorkerCompletionInput =
  | {
      workerId: string;
      jobId: string;
      status: "failed" | "skipped";
      errorCode: string;
      errorSummary: string;
    }
  | {
      workerId: string;
      jobId: string;
      status: "succeeded";
      sourceContentHash: string;
      derivatives: Array<{
        kind: PreviewDerivativeKind;
        fileName: string;
        mimeType: "image/png" | "application/pdf";
        contentBase64: string;
        width?: number | null;
        height?: number | null;
        pageCount?: number | null;
        generatorProfile?: string | null;
        generatorVersion?: string | null;
      }>;
    };

const nativeSolidWorksExtensions = new Set(["sldprt", "sldasm", "slddrw"]);
const fakePreviewGeneratorProfile = "fake_preview_worker";
const fakePreviewGeneratorVersion = "fake-local-pipeline";
const realPreviewGeneratorProfile = "windows_solidworks_preview_worker";
export const previewHeartbeatStaleAfterMs = 30_000;
export const previewMaxAttempts = 3;

export function isNativeSolidWorksPreviewSource(extension: string) {
  return nativeSolidWorksExtensions.has(extension.trim().toLowerCase());
}

export async function decorateMasterAttachmentsWithPreviewState(
  client: AsyncDatabaseClient,
  attachments: MasterAttachmentRecord[]
): Promise<MasterAttachmentRecord[]> {
  if (attachments.length === 0) return attachments;
  const states = await listPreviewStatesForAttachmentIds(client, attachments.map((attachment) => attachment.id));
  return attachments.map((attachment) => {
    const state = states.get(attachment.id);
    return {
      ...attachment,
      previewDerivatives: state?.derivatives ?? [],
      previewJob: state?.job ?? null
    };
  });
}

export async function enqueuePreviewJobForAttachmentAsync(
  client: AsyncDatabaseClient,
  input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
    actorUserId: string;
    requestedKind?: PreviewRequestedKind;
    generatorProfile?: string;
    runFakeWorker?: boolean;
    forceRegenerate?: boolean;
  }
) {
  const source = await resolvePreviewSource(client, input);
  if (!source) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");

  const sourceExtension = normalizeExtension(source.file_ext);
  const requestedKind = input.requestedKind ?? "native_thumbnail_png";
  const generatorProfile = input.generatorProfile ?? realPreviewGeneratorProfile;
  const now = new Date().toISOString();
  const status = previewRequestSupported(sourceExtension, requestedKind) ? "queued" : "skipped";
  const errorCode = status === "skipped" ? "unsupported_preview_source" : null;
  const errorSummary =
    status === "skipped" ? "此檔案格式目前不支援 SolidWorks 原檔預覽，請改用 PDF、圖片或等待後續轉檔 worker。" : null;
  const sourceContentHash = requireSourceHash(source);
  const job = await upsertPreviewJob(client, {
    id: crypto.randomUUID(),
    companyId: source.company_id ?? "company-jenfu",
    sourceFileAssetId: source.id,
    sourceContentHash,
    requestedKind,
    sourceExtension,
    status,
    generatorProfile,
    errorCode,
    errorSummary,
    actorUserId: input.actorUserId,
    forceRegenerate: input.forceRegenerate === true,
    now
  });

  if (status === "queued" && input.runFakeWorker === true && generatorProfile === fakePreviewGeneratorProfile) {
    await runFakePreviewWorkerForJobAsync(client, { jobId: job.id, workerId: "local-fake-preview-worker" });
  }

  const states = await listPreviewStatesForAttachmentIds(client, [source.id]);
  return { jobId: job.id, state: states.get(source.id) ?? { derivatives: [], job: mapPreviewJob(job) } };
}

export async function getPreviewDerivativeBytesForAttachmentAsync(
  client: AsyncDatabaseClient,
  input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
    derivativeId: string;
  }
): Promise<PreviewDerivativeFile | null> {
  const source = await resolvePreviewSource(client, input);
  if (!source) return null;
  const sourceContentHash = requireSourceHash(source);
  const row = await client.queryOne<FileDerivativeRow>(
    `
      SELECT *
      FROM file_derivatives
      WHERE id = :derivativeId
        AND source_file_asset_id = :sourceFileAssetId
        AND status = 'ready'
    `,
    { derivativeId: input.derivativeId, sourceFileAssetId: source.id }
  );
  if (!row) return null;
  if (row.source_content_hash !== sourceContentHash) throw new Error("PREVIEW_DERIVATIVE_STALE");
  if (!isDisplayablePreviewDerivativeRow(row)) return null;

  const storagePointer = storagePointerFromRecord(row);
  const bytes = await createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key);
  if (sha256(bytes) !== row.content_hash) throw new Error("PREVIEW_DERIVATIVE_HASH_MISMATCH");
  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    bytes,
    contentHash: row.content_hash
  };
}

export async function claimPreviewJobAsync(
  client: AsyncDatabaseClient,
  input: { workerId: string; supportedKinds: PreviewRequestedKind[]; supportedExtensions: string[] }
): Promise<PreviewWorkerClaim | null> {
  const kindClause = buildNamedInClause("kind", input.supportedKinds);
  const extensionClause = buildNamedInClause("extension", input.supportedExtensions.map(normalizeExtension));
  const row = await client.transaction(async (transactionClient) => {
    const selected = await transactionClient.queryOne<PreviewJobRow>(
      `
        SELECT *
        FROM preview_jobs
        WHERE status = 'queued'
          AND requested_kind IN (${kindClause.sql})
          AND source_extension IN (${extensionClause.sql})
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
      `,
      { ...kindClause.params, ...extensionClause.params }
    );
    if (!selected) return null;
    await transactionClient.execute(
      `
        UPDATE preview_jobs
        SET status = 'running',
            locked_by = :workerId,
            locked_at = :now,
            attempt_count = attempt_count + 1,
            updated_at = :now
        WHERE id = :id
      `,
      { id: selected.id, workerId: input.workerId, now: new Date().toISOString() }
    );
    return selected;
  });
  if (!row) return null;

  const source = await client.queryOne<PreviewSourceRow>("SELECT * FROM file_assets WHERE id = :id", { id: row.source_file_asset_id });
  if (!source) {
    await failPreviewJob(client, {
      jobId: row.id,
      status: "failed",
      errorCode: "source_file_missing",
      errorSummary: "來源檔案不存在，無法產生預覽。",
      workerId: input.workerId
    });
    return null;
  }

  return {
    jobId: row.id,
    sourceFileAssetId: row.source_file_asset_id,
    sourceContentHash: row.source_content_hash,
    sourceExtension: normalizeExtension(row.source_extension),
    requestedKind: row.requested_kind as PreviewRequestedKind,
    generatorProfile: row.generator_profile,
    storageKey: source.storage_key,
    originalPath: source.original_path
  };
}

export async function heartbeatPreviewJobAsync(
  client: AsyncDatabaseClient,
  input: { jobId: string; workerId: string }
) {
  const now = new Date().toISOString();
  await client.execute(
    `
      UPDATE preview_jobs
      SET updated_at = :now
      WHERE id = :jobId
        AND status = 'running'
        AND locked_by = :workerId
    `,
    { jobId: input.jobId, workerId: input.workerId, now }
  );
}

export async function recoverStalePreviewJobsAsync(client: AsyncDatabaseClient) {
  const rows = await client.query<Pick<PreviewJobRow, "id" | "attempt_count" | "updated_at">>(
    `
      SELECT id, attempt_count, updated_at
      FROM preview_jobs
      WHERE status = 'running'
    `
  );
  const now = Date.now();
  let recovered = 0;
  for (const row of rows) {
    const updatedAt = Date.parse(row.updated_at);
    if (!Number.isFinite(updatedAt) || now - updatedAt < previewHeartbeatStaleAfterMs) continue;
    const attemptCount = Number(row.attempt_count ?? 0);
    const shouldRetry = attemptCount < previewMaxAttempts;
    await client.execute(
      `
        UPDATE preview_jobs
        SET status = :status,
            error_code = :errorCode,
            error_summary = :errorSummary,
            locked_by = NULL,
            locked_at = NULL,
            updated_at = :now,
            completed_at = :completedAt
        WHERE id = :jobId
          AND status = 'running'
          AND updated_at = :previousUpdatedAt
      `,
      {
        jobId: row.id,
        status: shouldRetry ? "queued" : "failed",
        errorCode: "preview_worker_heartbeat_timeout",
        errorSummary: shouldRetry ? "系統已自動重新排程。" : "預覽服務未回應，請稍後再試。",
        now: new Date().toISOString(),
        completedAt: shouldRetry ? null : new Date().toISOString(),
        previousUpdatedAt: row.updated_at
      }
    );
    recovered += 1;
  }
  return { recovered };
}

export async function completePreviewJobAsync(client: AsyncDatabaseClient, input: PreviewWorkerCompletionInput) {
  if (input.status !== "succeeded") {
    const accepted = await failPreviewJob(client, {
      jobId: input.jobId,
      status: input.status,
      errorCode: input.errorCode,
      errorSummary: input.errorSummary,
      workerId: input.workerId
    });
    return { accepted, derivativeIds: [] };
  }

  const job = await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE id = :jobId", { jobId: input.jobId });
  if (!job) throw new Error("PREVIEW_JOB_NOT_FOUND");
  if (job.status !== "running" || job.locked_by !== input.workerId) return { accepted: false, derivativeIds: [] };
  if (job.source_content_hash !== input.sourceContentHash) {
    await failPreviewJob(client, {
      jobId: input.jobId,
      status: "failed",
      errorCode: "source_hash_mismatch",
      errorSummary: "預覽產物與目前來源檔 hash 不一致，系統已拒絕採用。",
      workerId: input.workerId
    });
    return { accepted: false, derivativeIds: [] };
  }

  const derivativeIds = await client.transaction(async (transactionClient) => {
    const ids: string[] = [];
    for (const derivative of input.derivatives) {
      const bytes = Buffer.from(derivative.contentBase64, "base64");
      const stored = await storePreviewDerivativeBytes({
        sourceFileAssetId: job.source_file_asset_id,
        sourceContentHash: job.source_content_hash,
        jobId: job.id,
        kind: derivative.kind,
        fileName: derivative.fileName,
        mimeType: derivative.mimeType,
        bytes
      });
      const derivativeId = crypto.randomUUID();
      const now = new Date().toISOString();
      await retireReadyDerivatives(transactionClient, {
        sourceFileAssetId: job.source_file_asset_id,
        sourceContentHash: job.source_content_hash,
        derivativeKind: derivative.kind,
        generatorProfile: derivative.generatorProfile ?? job.generator_profile
      });
      await insertDerivative(transactionClient, {
        id: derivativeId,
        companyId: "company-jenfu",
        sourceFileAssetId: job.source_file_asset_id,
        sourceContentHash: job.source_content_hash,
        derivativeKind: derivative.kind,
        storageProvider: stored.provider,
        storageKey: stored.key,
        originalPath: stored.localPath,
        fileName: derivative.fileName,
        mimeType: derivative.mimeType,
        fileSize: bytes.byteLength,
        contentHash: stored.sha256,
        width: derivative.width ?? null,
        height: derivative.height ?? null,
        pageCount: derivative.pageCount ?? null,
        generatorProfile: derivative.generatorProfile ?? job.generator_profile,
        generatorVersion: derivative.generatorVersion ?? "worker-contract",
        previewJobId: job.id,
        createdByWorker: input.workerId,
        now
      });
      ids.push(derivativeId);
    }
    await transactionClient.execute(
      `
        UPDATE preview_jobs
        SET status = 'succeeded',
            error_code = NULL,
            error_summary = NULL,
            locked_by = :workerId,
            updated_at = :now,
            completed_at = :now
        WHERE id = :jobId
          AND status = 'running'
          AND locked_by = :workerId
      `,
      { jobId: input.jobId, workerId: input.workerId, now: new Date().toISOString() }
    );
    return ids;
  });

  return { accepted: true, derivativeIds };
}

async function runFakePreviewWorkerForJobAsync(client: AsyncDatabaseClient, input: { jobId: string; workerId: string }) {
  const job = await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE id = :jobId", { jobId: input.jobId });
  if (!job) throw new Error("PREVIEW_JOB_NOT_FOUND");
  const source = await client.queryOne<PreviewSourceRow>("SELECT * FROM file_assets WHERE id = :id", { id: job.source_file_asset_id });
  if (!source) {
    await failPreviewJob(client, {
      jobId: input.jobId,
      status: "failed",
      errorCode: "source_file_missing",
      errorSummary: "來源檔案不存在，無法產生預覽。",
      workerId: input.workerId
    });
    return;
  }
  if (requireSourceHash(source) !== job.source_content_hash) {
    await failPreviewJob(client, {
      jobId: input.jobId,
      status: "failed",
      errorCode: "source_hash_mismatch",
      errorSummary: "來源檔案已更新，請重新產生預覽。",
      workerId: input.workerId
    });
    return;
  }

  const derivativeKind: PreviewDerivativeKind = "thumbnail_png";
  const preview = buildFakePreviewPng({
    sourceExtension: normalizeExtension(source.file_ext),
    sourceFileName: source.file_name,
    sourceContentHash: job.source_content_hash
  });
  const bytes = preview.bytes;
  const stored = await storePreviewDerivativeBytes({
    sourceFileAssetId: job.source_file_asset_id,
    sourceContentHash: job.source_content_hash,
    jobId: job.id,
    kind: derivativeKind,
    fileName: `${source.file_name}.preview.png`,
    mimeType: "image/png",
    bytes
  });
  const now = new Date().toISOString();

  await client.transaction(async (transactionClient) => {
    await retireReadyDerivatives(transactionClient, {
      sourceFileAssetId: job.source_file_asset_id,
      sourceContentHash: job.source_content_hash,
      derivativeKind,
      generatorProfile: job.generator_profile
    });
    await insertDerivative(transactionClient, {
      id: crypto.randomUUID(),
      companyId: source.company_id ?? "company-jenfu",
      sourceFileAssetId: job.source_file_asset_id,
      sourceContentHash: job.source_content_hash,
      derivativeKind,
      storageProvider: stored.provider,
      storageKey: stored.key,
      originalPath: stored.localPath,
      fileName: `${source.file_name}.preview.png`,
      mimeType: "image/png",
      fileSize: bytes.byteLength,
      contentHash: stored.sha256,
      width: preview.width,
      height: preview.height,
      pageCount: null,
      generatorProfile: job.generator_profile,
      generatorVersion: fakePreviewGeneratorVersion,
      previewJobId: job.id,
      createdByWorker: input.workerId,
      now
    });
    await transactionClient.execute(
      `
        UPDATE preview_jobs
        SET status = 'succeeded',
            error_code = NULL,
            error_summary = NULL,
            locked_by = :workerId,
            updated_at = :now,
            completed_at = :now
        WHERE id = :jobId
      `,
      { jobId: input.jobId, workerId: input.workerId, now }
    );
  });
}

type RgbaColor = [number, number, number, number];

function buildFakePreviewPng(input: { sourceExtension: string; sourceFileName: string; sourceContentHash: string }) {
  const width = 320;
  const height = 180;
  const digest = crypto
    .createHash("sha256")
    .update([input.sourceExtension, input.sourceFileName, input.sourceContentHash].join("|"))
    .digest();
  const pixels = Buffer.alloc(width * height * 4);
  const accent: RgbaColor = [40 + (digest[0] % 110), 94 + (digest[1] % 90), 110 + (digest[2] % 90), 255];
  const secondary: RgbaColor = [170 + (digest[3] % 55), 106 + (digest[4] % 80), 48 + (digest[5] % 90), 255];
  const line: RgbaColor = [71, 85, 105, 255];
  fillRect(pixels, width, height, 0, 0, width, height, [247, 250, 252, 255]);
  fillRect(pixels, width, height, 0, 0, width, 24, mixRgba(accent, [255, 255, 255, 255], 0.78));
  fillRect(pixels, width, height, 0, 24, 6, height - 24, accent);
  strokeRect(pixels, width, height, 0, 0, width, height, [203, 213, 225, 255], 2);

  if (input.sourceExtension === "slddrw") {
    drawFakeDrawingSheet(pixels, width, height, accent, secondary, line);
  } else if (input.sourceExtension === "sldasm") {
    drawFakeAssemblyModel(pixels, width, height, accent, secondary, line, digest);
  } else {
    drawFakePartModel(pixels, width, height, accent, secondary, line, digest);
  }
  drawPreviewFingerprint(pixels, width, height, digest, accent, secondary);
  return { width, height, bytes: createPngRgba(width, height, pixels) };
}

function drawFakeDrawingSheet(pixels: Buffer, width: number, height: number, accent: RgbaColor, secondary: RgbaColor, line: RgbaColor) {
  fillRect(pixels, width, height, 48, 34, 224, 118, [255, 255, 255, 255]);
  strokeRect(pixels, width, height, 48, 34, 224, 118, line, 2);
  strokeRect(pixels, width, height, 58, 44, 204, 98, [148, 163, 184, 255], 1);
  for (let i = 0; i < 5; i += 1) {
    drawLine(pixels, width, height, 74 + i * 31, 54, 98 + i * 28, 108, [203, 213, 225, 255]);
    drawLine(pixels, width, height, 92 + i * 27, 111, 170 + i * 9, 64, [203, 213, 225, 255]);
  }
  strokeRect(pixels, width, height, 176, 110, 86, 32, line, 1);
  fillRect(pixels, width, height, 178, 112, 82, 10, mixRgba(accent, [255, 255, 255, 255], 0.72));
  fillRect(pixels, width, height, 184, 128, 42, 4, secondary);
  fillRect(pixels, width, height, 184, 136, 64, 3, [148, 163, 184, 255]);
  drawLine(pixels, width, height, 62, 132, 166, 72, accent);
  drawLine(pixels, width, height, 66, 136, 171, 76, secondary);
}

function drawFakePartModel(
  pixels: Buffer,
  width: number,
  height: number,
  accent: RgbaColor,
  secondary: RgbaColor,
  line: RgbaColor,
  digest: Buffer
) {
  const lift = digest[6] % 14;
  fillRect(pixels, width, height, 92, 78 - lift, 132, 56, mixRgba(accent, [255, 255, 255, 255], 0.18));
  fillRect(pixels, width, height, 122, 52 - lift, 74, 36, mixRgba(secondary, [255, 255, 255, 255], 0.1));
  strokeRect(pixels, width, height, 92, 78 - lift, 132, 56, line, 2);
  strokeRect(pixels, width, height, 122, 52 - lift, 74, 36, line, 2);
  drawLine(pixels, width, height, 92, 78 - lift, 122, 52 - lift, line);
  drawLine(pixels, width, height, 224, 78 - lift, 196, 52 - lift, line);
  drawLine(pixels, width, height, 224, 134 - lift, 196, 88 - lift, line);
  fillRect(pixels, width, height, 143, 94 - lift, 31, 18, [241, 245, 249, 255]);
  strokeRect(pixels, width, height, 143, 94 - lift, 31, 18, line, 1);
  for (let i = 0; i < 4; i += 1) drawLine(pixels, width, height, 114 + i * 28, 137 - lift, 142 + i * 28, 152 - lift, [148, 163, 184, 255]);
}

function drawFakeAssemblyModel(
  pixels: Buffer,
  width: number,
  height: number,
  accent: RgbaColor,
  secondary: RgbaColor,
  line: RgbaColor,
  digest: Buffer
) {
  const offset = digest[7] % 10;
  fillRect(pixels, width, height, 78, 80, 88, 46, mixRgba(accent, [255, 255, 255, 255], 0.12));
  fillRect(pixels, width, height, 154, 60 + offset, 78, 52, mixRgba(secondary, [255, 255, 255, 255], 0.08));
  fillRect(pixels, width, height, 128, 104, 104, 30, [226, 232, 240, 255]);
  strokeRect(pixels, width, height, 78, 80, 88, 46, line, 2);
  strokeRect(pixels, width, height, 154, 60 + offset, 78, 52, line, 2);
  strokeRect(pixels, width, height, 128, 104, 104, 30, line, 2);
  drawLine(pixels, width, height, 166, 103, 154, 88 + offset, accent);
  drawLine(pixels, width, height, 166, 103, 128, 119, secondary);
  drawLine(pixels, width, height, 208, 112 + offset, 232, 119, accent);
  fillRect(pixels, width, height, 102, 94, 18, 18, [248, 250, 252, 255]);
  strokeRect(pixels, width, height, 102, 94, 18, 18, line, 1);
}

function drawPreviewFingerprint(
  pixels: Buffer,
  width: number,
  height: number,
  digest: Buffer,
  accent: RgbaColor,
  secondary: RgbaColor
) {
  for (let i = 0; i < 14; i += 1) {
    const barHeight = 4 + (digest[i] % 18);
    const color = i % 2 === 0 ? accent : secondary;
    fillRect(pixels, width, height, 38 + i * 18, height - 22 - barHeight, 10, barHeight, mixRgba(color, [255, 255, 255, 255], 0.2));
  }
  for (let i = 0; i < digest.length; i += 1) {
    const x = width - 42 + (i % 16);
    const y = height - 17 + Math.floor(i / 16);
    setPixel(pixels, width, height, x, y, [digest[i], digest[(i + 5) % digest.length], digest[(i + 11) % digest.length], 255]);
  }
}

function createPngRgba(width: number, height: number, pixels: Buffer) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.byteLength, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const crc32Table = buildCrc32Table();

function buildCrc32Table() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function fillRect(pixels: Buffer, width: number, height: number, x: number, y: number, rectWidth: number, rectHeight: number, color: RgbaColor) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(width, Math.ceil(x + rectWidth));
  const y1 = Math.min(height, Math.ceil(y + rectHeight));
  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) setPixel(pixels, width, height, px, py, color);
  }
}

function strokeRect(
  pixels: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  rectWidth: number,
  rectHeight: number,
  color: RgbaColor,
  thickness = 1
) {
  fillRect(pixels, width, height, x, y, rectWidth, thickness, color);
  fillRect(pixels, width, height, x, y + rectHeight - thickness, rectWidth, thickness, color);
  fillRect(pixels, width, height, x, y, thickness, rectHeight, color);
  fillRect(pixels, width, height, x + rectWidth - thickness, y, thickness, rectHeight, color);
}

function drawLine(pixels: Buffer, width: number, height: number, x0: number, y0: number, x1: number, y1: number, color: RgbaColor) {
  let currentX = Math.round(x0);
  let currentY = Math.round(y0);
  const targetX = Math.round(x1);
  const targetY = Math.round(y1);
  const dx = Math.abs(targetX - currentX);
  const sx = currentX < targetX ? 1 : -1;
  const dy = -Math.abs(targetY - currentY);
  const sy = currentY < targetY ? 1 : -1;
  let err = dx + dy;
  while (true) {
    setPixel(pixels, width, height, currentX, currentY, color);
    if (currentX === targetX && currentY === targetY) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      currentX += sx;
    }
    if (e2 <= dx) {
      err += dx;
      currentY += sy;
    }
  }
}

function setPixel(pixels: Buffer, width: number, height: number, x: number, y: number, color: RgbaColor) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const index = (y * width + x) * 4;
  pixels[index] = color[0];
  pixels[index + 1] = color[1];
  pixels[index + 2] = color[2];
  pixels[index + 3] = color[3];
}

function mixRgba(left: RgbaColor, right: RgbaColor, rightWeight: number): RgbaColor {
  const leftWeight = 1 - rightWeight;
  return [
    Math.round(left[0] * leftWeight + right[0] * rightWeight),
    Math.round(left[1] * leftWeight + right[1] * rightWeight),
    Math.round(left[2] * leftWeight + right[2] * rightWeight),
    Math.round(left[3] * leftWeight + right[3] * rightWeight)
  ];
}

async function listPreviewStatesForAttachmentIds(client: AsyncDatabaseClient, attachmentIds: string[]) {
  const states = new Map<string, PreviewState>();
  if (attachmentIds.length === 0) return states;
  for (const id of attachmentIds) states.set(id, { derivatives: [], job: null });

  const idClause = buildNamedInClause("attachmentId", attachmentIds);
  const derivatives = await client.query<FileDerivativeRow>(
    `
      SELECT *
      FROM file_derivatives
      WHERE source_file_asset_id IN (${idClause.sql})
      ORDER BY created_at DESC
    `,
    idClause.params
  );
  for (const row of derivatives) {
    if (!isDisplayablePreviewDerivativeRow(row)) continue;
    const state = states.get(row.source_file_asset_id);
    if (!state) continue;
    state.derivatives.push(mapFileDerivative(row));
  }

  const jobs = await client.query<PreviewJobRow>(
    `
      SELECT *
      FROM preview_jobs
      WHERE source_file_asset_id IN (${idClause.sql})
      ORDER BY updated_at DESC, created_at DESC
    `,
    idClause.params
  );
  for (const row of jobs) {
    const state = states.get(row.source_file_asset_id);
    if (!state || state.job) continue;
    state.job = mapPreviewJob(row);
  }
  return states;
}

async function resolvePreviewSource(
  client: AsyncDatabaseClient,
  input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string }
) {
  if (input.entityType === "drawing_number") {
    return await client.queryOne<PreviewSourceRow>(
      `
        SELECT fa.*, COALESCE(dn.company_id, 'company-jenfu') AS company_id
        FROM file_assets fa
        JOIN drawing_numbers dn ON dn.id = fa.linked_entity_id
        WHERE fa.id = :attachmentId
          AND fa.linked_entity_type = 'drawing_number'
          AND dn.drawing_number = :entityCode
          AND fa.deleted_at IS NULL
      `,
      { attachmentId: input.attachmentId, entityCode: input.entityCode }
    );
  }

  return await client.queryOne<PreviewSourceRow>(
    `
      SELECT fa.*, COALESCE(pn.company_id, 'company-jenfu') AS company_id
      FROM file_assets fa
      JOIN part_numbers pn ON pn.id = fa.linked_entity_id
      WHERE fa.id = :attachmentId
        AND fa.linked_entity_type = 'part_number'
        AND pn.part_number = :entityCode
        AND fa.deleted_at IS NULL
    `,
    { attachmentId: input.attachmentId, entityCode: input.entityCode }
  );
}

async function upsertPreviewJob(
  client: AsyncDatabaseClient,
  input: {
    id: string;
    companyId: string;
    sourceFileAssetId: string;
    sourceContentHash: string;
    requestedKind: PreviewRequestedKind;
    sourceExtension: string;
    status: "queued" | "skipped";
    generatorProfile: string;
    errorCode: string | null;
    errorSummary: string | null;
    actorUserId: string;
    forceRegenerate: boolean;
    now: string;
  }
) {
  const idempotencyKey = buildPreviewJobIdempotencyKey(input);
  const existing = await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE idempotency_key = :idempotencyKey", {
    idempotencyKey
  });
  if (existing) {
    const retryableStatuses = new Set(["failed", "skipped", "cancelled"]);
    const forceResetStatuses = new Set(["succeeded", "failed", "skipped", "cancelled"]);
    const shouldResetExisting = input.forceRegenerate ? forceResetStatuses.has(existing.status) : retryableStatuses.has(existing.status);
    if (shouldResetExisting) {
      await client.execute(
        `
          UPDATE preview_jobs
          SET status = :status,
              error_code = :errorCode,
              error_summary = :errorSummary,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = :now,
              completed_at = CASE WHEN :status = 'skipped' THEN :now ELSE NULL END
          WHERE id = :id
        `,
        {
          id: existing.id,
          status: input.status,
          errorCode: input.errorCode,
          errorSummary: input.errorSummary,
          now: input.now
        }
      );
      return {
        ...existing,
        status: input.status,
        error_code: input.errorCode,
        error_summary: input.errorSummary,
        updated_at: input.now,
        completed_at: input.status === "skipped" ? input.now : null
      };
    }
    return existing;
  }

  await client.execute(
    `
      INSERT INTO preview_jobs (
        id, company_id, source_file_asset_id, source_content_hash, requested_kind, source_extension,
        status, priority, attempt_count, idempotency_key, generator_profile, error_code, error_summary,
        created_by, created_at, updated_at, completed_at, metadata_json
      )
      VALUES (
        :id, :companyId, :sourceFileAssetId, :sourceContentHash, :requestedKind, :sourceExtension,
        :status, 100, 0, :idempotencyKey, :generatorProfile, :errorCode, :errorSummary,
        :actorUserId, :now, :now, :completedAt, '{}'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `,
    {
      ...input,
      idempotencyKey,
      completedAt: input.status === "skipped" ? input.now : null
    }
  );

  return (await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE idempotency_key = :idempotencyKey", { idempotencyKey })) ?? {
    id: input.id,
    source_file_asset_id: input.sourceFileAssetId,
    source_content_hash: input.sourceContentHash,
    requested_kind: input.requestedKind,
    source_extension: input.sourceExtension,
    status: input.status,
    attempt_count: 0,
    locked_by: null,
    locked_at: null,
    generator_profile: input.generatorProfile,
    error_code: input.errorCode,
    error_summary: input.errorSummary,
    created_at: input.now,
    updated_at: input.now,
    completed_at: input.status === "skipped" ? input.now : null
  } satisfies PreviewJobRow;
}

async function failPreviewJob(
  client: AsyncDatabaseClient,
  input: {
    jobId: string;
    status: "failed" | "skipped";
    errorCode: string;
    errorSummary: string;
    workerId: string;
  }
) {
  const now = new Date().toISOString();
  const current = await client.queryOne<Pick<PreviewJobRow, "status" | "locked_by">>(
    "SELECT status, locked_by FROM preview_jobs WHERE id = :jobId",
    { jobId: input.jobId }
  );
  if (!current || current.status !== "running" || current.locked_by !== input.workerId) return false;
  await client.execute(
    `
      UPDATE preview_jobs
      SET status = :status,
          error_code = :errorCode,
          error_summary = :errorSummary,
          locked_by = :workerId,
          updated_at = :now,
          completed_at = :now
      WHERE id = :jobId
    `,
    {
      jobId: input.jobId,
      status: input.status,
      errorCode: sanitizePreviewErrorCode(input.errorCode),
      errorSummary: sanitizePreviewErrorSummary(input.errorSummary),
      workerId: input.workerId,
      now
    }
  );
  return true;
}

async function storePreviewDerivativeBytes(input: {
  sourceFileAssetId: string;
  sourceContentHash: string;
  jobId: string;
  kind: PreviewDerivativeKind;
  fileName: string;
  mimeType: "image/png" | "application/pdf";
  bytes: Buffer;
}) {
  if (input.bytes.byteLength === 0) throw new Error("PREVIEW_DERIVATIVE_EMPTY");
  const storage = createFileStorageService();
  return await storage.putObject({
    key: buildStorageKey([
      "preview-derivatives",
      input.sourceFileAssetId,
      input.sourceContentHash,
      input.jobId,
      `${input.kind}-${sanitizeDerivativeFilename(input.fileName)}`
    ]),
    bytes: input.bytes,
    contentType: input.mimeType
  });
}

async function retireReadyDerivatives(
  client: AsyncDatabaseClient,
  input: { sourceFileAssetId: string; sourceContentHash: string; derivativeKind: PreviewDerivativeKind; generatorProfile: string }
) {
  await client.execute(
    `
      UPDATE file_derivatives
      SET status = 'retired'
      WHERE source_file_asset_id = :sourceFileAssetId
        AND source_content_hash = :sourceContentHash
        AND derivative_kind = :derivativeKind
        AND generator_profile = :generatorProfile
        AND status = 'ready'
    `,
    input
  );
}

async function insertDerivative(
  client: AsyncDatabaseClient,
  input: {
    id: string;
    companyId: string;
    sourceFileAssetId: string;
    sourceContentHash: string;
    derivativeKind: PreviewDerivativeKind;
    storageProvider: string;
    storageKey: string;
    originalPath: string | null;
    fileName: string;
    mimeType: "image/png" | "application/pdf";
    fileSize: number;
    contentHash: string;
    width: number | null;
    height: number | null;
    pageCount: number | null;
    generatorProfile: string;
    generatorVersion: string | null;
    previewJobId: string;
    createdByWorker: string;
    now: string;
  }
) {
  await client.execute(
    `
      INSERT INTO file_derivatives (
        id, company_id, source_file_asset_id, source_content_hash, derivative_kind,
        storage_provider, storage_key, original_path, file_name, mime_type, file_size, content_hash,
        hash_algorithm, width, height, page_count, generator_profile, generator_version,
        preview_job_id, status, created_at, created_by_worker, metadata_json
      )
      VALUES (
        :id, :companyId, :sourceFileAssetId, :sourceContentHash, :derivativeKind,
        :storageProvider, :storageKey, :originalPath, :fileName, :mimeType, :fileSize, :contentHash,
        'SHA-256', :width, :height, :pageCount, :generatorProfile, :generatorVersion,
        :previewJobId, 'ready', :now, :createdByWorker, '{}'
      )
    `,
    input
  );
}

function mapFileDerivative(row: FileDerivativeRow): MasterAttachmentPreviewDerivative {
  return {
    id: row.id,
    derivativeKind: row.derivative_kind,
    mimeType: row.mime_type,
    fileName: row.file_name,
    fileSize: Number(row.file_size ?? 0),
    width: nullableNumber(row.width),
    height: nullableNumber(row.height),
    pageCount: nullableNumber(row.page_count),
    sourceContentHash: row.source_content_hash,
    generatorProfile: row.generator_profile,
    generatorVersion: row.generator_version,
    status: normalizeDerivativeStatus(row.status),
    createdAt: row.created_at
  };
}

function mapPreviewJob(row: PreviewJobRow): MasterAttachmentPreviewJob {
  return {
    id: row.id,
    requestedKind: row.requested_kind,
    status: normalizeJobStatus(row.status),
    sourceContentHash: row.source_content_hash,
    sourceExtension: normalizeExtension(row.source_extension),
    generatorProfile: row.generator_profile,
    attemptCount: Number(row.attempt_count ?? 0),
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    createdAt: row.created_at,
    startedAt: row.locked_at,
    lastHeartbeatAt: row.updated_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

function buildNamedInClause(prefix: string, values: string[]) {
  if (values.length === 0) return { sql: "NULL", params: {} };
  const params: Record<string, string> = {};
  const placeholders = values.map((value, index) => {
    const name = `${prefix}${index}`;
    params[name] = value;
    return `:${name}`;
  });
  return { sql: placeholders.join(", "), params };
}

function buildPreviewJobIdempotencyKey(input: {
  sourceFileAssetId: string;
  sourceContentHash: string;
  requestedKind: PreviewRequestedKind;
  generatorProfile: string;
}) {
  return ["preview", input.sourceFileAssetId, input.sourceContentHash, input.requestedKind, input.generatorProfile].join(":");
}

function isDisplayablePreviewDerivativeRow(row: Pick<FileDerivativeRow, "generator_profile" | "generator_version">) {
  if (isLocalFakePreviewWorkerEnabled()) return true;
  return row.generator_profile !== fakePreviewGeneratorProfile && row.generator_version !== fakePreviewGeneratorVersion;
}

function isLocalFakePreviewWorkerEnabled() {
  return process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1";
}

function previewRequestSupported(extension: string, requestedKind: PreviewRequestedKind) {
  if (requestedKind === "native_thumbnail_png") return isNativeSolidWorksPreviewSource(extension);
  return extension === "slddrw";
}

function requireSourceHash(source: PreviewSourceRow) {
  const hash = source.content_hash?.trim();
  if (!hash) throw new Error("PREVIEW_SOURCE_HASH_REQUIRED");
  return hash;
}

function normalizeExtension(value: string) {
  return value.trim().replace(/^\./, "").toLowerCase();
}

function normalizeJobStatus(value: string): MasterAttachmentPreviewJobStatus {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "failed" || value === "skipped" || value === "cancelled") return value;
  return "failed";
}

function normalizeDerivativeStatus(value: string): MasterAttachmentPreviewDerivativeStatus {
  if (value === "ready" || value === "stale" || value === "retired" || value === "failed") return value;
  return "failed";
}

function nullableNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizePreviewErrorCode(value: string) {
  return value.replace(/[^a-z0-9_:-]/gi, "_").slice(0, 80) || "preview_worker_failed";
}

function sanitizePreviewErrorSummary(value: string) {
  const text = value
    .replace(/swdocmgr_[A-Za-z0-9_-]+/gi, "[redacted-swdocmgr-token]")
    .replace(/[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3,}/g, "[redacted-license-token]")
    .replace(/(?:api|license|secret|key)\s*[:=]\s*\S+/gi, "[redacted-secret]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return text.slice(0, 240) || "預覽產生失敗，請確認來源檔案與 worker 狀態後重試。";
}

function sanitizeDerivativeFilename(value: string) {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim().slice(0, 120) || "preview.png";
}
