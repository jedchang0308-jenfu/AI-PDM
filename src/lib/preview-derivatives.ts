import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { canonicalJsonStringify } from "@/lib/canonical-json";
import { parsePreviewLeaseBasis, previewLeaseProtocolVersion, type PreviewLeaseBasis } from "@/lib/preview-worker-lease";
import {
  assertStoredFileIntegrity,
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
import {
  parsePrincipalJobInitiator,
  PrincipalJobAuthorityError,
  requireCurrentPrincipalJobAuthority,
  type PrincipalJobInitiator
} from "@/lib/principal-job-authority";

export type PreviewRequestedKind = "native_thumbnail_png" | "drawing_pdf";
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
  document_category?: string | null;
  capability_role?: string | null;
};

// file_assets has no company_id. Resolve its owner from the canonical linked entity;
// a caller-supplied company or a preview job's historical label is not proof.
const previewSourceCompanyPredicate = (companyExpression: string) => `(
  (fa.linked_entity_type = 'drawing_revision' AND EXISTS (
    SELECT 1 FROM drawing_revisions revision
    WHERE revision.id = fa.linked_entity_id AND revision.company_id = ${companyExpression}
      AND EXISTS (SELECT 1 FROM drawing_revision_files binding
        WHERE binding.drawing_revision_id=revision.id AND binding.company_id=revision.company_id
          AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL)
  )) OR
  (fa.linked_entity_type = 'numbering_candidate_revision' AND EXISTS (
    SELECT 1 FROM numbering_candidate_revision_drafts candidate
    WHERE candidate.id = fa.linked_entity_id AND candidate.company_id = ${companyExpression}
      AND EXISTS (SELECT 1 FROM numbering_candidate_revision_files binding
        WHERE binding.candidate_revision_id=candidate.id AND binding.company_id=candidate.company_id
          AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL)
  )) OR
  (fa.linked_entity_type = 'drawing_number' AND EXISTS (
    SELECT 1 FROM drawing_numbers drawing
    WHERE drawing.id = fa.linked_entity_id AND drawing.company_id = ${companyExpression}
  )) OR
  (fa.linked_entity_type = 'part_number' AND EXISTS (
    SELECT 1 FROM part_numbers part
    WHERE part.id = fa.linked_entity_id AND part.company_id = ${companyExpression}
  ))
)`;

async function previewSourceBelongsToCompany(client: AsyncDatabaseClient, sourceFileAssetId: string, companyId: string) {
  if (!sourceFileAssetId.trim() || !companyId.trim()) return false;
  const source = await client.queryOne<{ id: string }>(
    `SELECT fa.id FROM file_assets fa
      WHERE fa.id = :sourceFileAssetId AND fa.deleted_at IS NULL
        AND ${previewSourceCompanyPredicate(":companyId")}`,
    { sourceFileAssetId, companyId }
  );
  return source?.id === sourceFileAssetId;
}

type PreviewJobRow = {
  id: string;
  company_id: string;
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
  updated_at: string | Date;
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
  leaseBasis: PreviewLeaseBasis;
};

export type PreviewWorkerCompletionInput =
  | { workerId: string; jobId: string; leaseBasis: PreviewLeaseBasis; status: "cancelled"; cancelReason: "operator_shutdown" }
  | {
      workerId: string;
      jobId: string;
      leaseBasis: PreviewLeaseBasis;
      status: "failed" | "skipped";
      errorCode: string;
      errorSummary: string;
    }
  | {
      workerId: string;
      jobId: string;
      leaseBasis: PreviewLeaseBasis;
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
export const previewQueuedUnclaimedAfterMs = 120_000;
export const previewMaxAttempts = 3;

export function isNativeSolidWorksPreviewSource(extension: string) {
  return nativeSolidWorksExtensions.has(extension.trim().toLowerCase());
}

/**
 * Automatic producers must use the native PNG contract for SolidWorks source
 * files. `drawing_pdf` remains an explicit Phase 2 request only.
 */
export function requestedPreviewKindForSource(extension: string): PreviewRequestedKind {
  return isNativeSolidWorksPreviewSource(extension) ? "native_thumbnail_png" : "drawing_pdf";
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

export type AutomaticPreviewPreparationResult = {
  sourceFileAssetId: string;
  disposition: "ready" | "active" | "queued" | "failed";
  jobId: string | null;
};

/** Authorized callers pass an exact source identity. A read must never select
 * another company's job or a replacement source's prior generation. */
export async function readLatestPreviewJobForSourceAsync(client: AsyncDatabaseClient, input: {
  companyId: string; sourceFileAssetId: string; sourceContentHash: string;
  requestedKind: PreviewRequestedKind;
}): Promise<MasterAttachmentPreviewJob | null> {
  const job = await client.queryOne<PreviewJobRow>(`SELECT * FROM preview_jobs
    WHERE generator_profile <> 'fake_preview_worker' AND company_id=:companyId AND source_file_asset_id=:sourceFileAssetId
      AND source_content_hash=:sourceContentHash AND requested_kind=:requestedKind
    ORDER BY updated_at DESC,created_at DESC,id DESC LIMIT 1`, input);
  return job ? mapPreviewJob(job) : null;
}

export function canonicalPreviewJobResponse(job: MasterAttachmentPreviewJob | null): {
  status: number; headers: Record<string, string>;
  body: { error: { code: string; message: string; retryable: boolean; jobErrorCode?: string } };
} {
  const headers: Record<string, string> = { "cache-control": "private, no-store" };
  if (job?.status === "queued" || job?.status === "running") {
    return { status: 202, headers: { ...headers, "retry-after": "2", "x-pdm-preview-state": "pending" },
      body: { error: { code: "PREVIEW_NOT_READY", message: "預覽正在準備；可先下載原檔。", retryable: true } } };
  }
  const unsupported = job?.status === "skipped";
  const code = unsupported ? "PREVIEW_UNSUPPORTED" : job?.status === "cancelled"
    ? "PREVIEW_CANCELLED" : job?.status === "succeeded" ? "PREVIEW_OUTPUT_MISSING" : "PREVIEW_FAILED";
  return { status: unsupported ? 422 : 409,
    headers: { ...headers, "x-pdm-preview-state": unsupported ? "unsupported" : job?.status === "cancelled" ? "cancelled" : "failed" },
    body: { error: { code, message: unsupported ? "此格式無法預覽；可下載原檔。" : job?.status === "cancelled" ? "預覽已取消；可下載原檔。" : "預覽無法顯示；可下載原檔。",
      retryable: false, ...(job?.errorCode ? { jobErrorCode: sanitizePreviewErrorCode(job.errorCode) } : {}) } } };
}

/**
 * Shared lifecycle/detail recovery for canonical file assets. Callers must
 * supply company-scoped asset ids that were resolved through their own read or
 * mutation authority. A preview failure never changes the controlled source.
 */
export async function ensureAutomaticPreviewJobsForSourceAssetsAsync(
  client: AsyncDatabaseClient,
  input: { companyId: string; sourceFileAssetIds: string[]; actorUserId: string; principalInitiator?: PrincipalJobInitiator; requireQueued?: boolean; runFakeWorker?: boolean }
): Promise<AutomaticPreviewPreparationResult[]> {
  assertRealPreviewWorker(input.runFakeWorker);
  if (!input.principalInitiator || input.principalInitiator.pdmUserId !== input.actorUserId ||
      input.principalInitiator.companyId !== input.companyId) {
    if (input.requireQueued) throw new Error("PREVIEW_PRINCIPAL_CONTEXT_REQUIRED");
    return [];
  }
  const sourceFileAssetIds = [...new Set(input.sourceFileAssetIds.map((value) => value.trim()).filter(Boolean))];
  if (sourceFileAssetIds.length === 0) return [];

  await recoverStalePreviewJobsAsync(client, { companyId: input.companyId, sourceFileAssetIds });

  const idClause = buildNamedInClause("canonicalPreviewAsset", sourceFileAssetIds);
  const sources = await client.query<PreviewSourceRow>(
    `SELECT fa.id, :companyId AS company_id,
            COALESCE(fa.storage_provider, 'local_repository') AS storage_provider,
            fa.original_path, fa.storage_key, fa.file_name, fa.file_ext, fa.mime_type,
            fa.file_size, fa.content_hash, fa.hash_algorithm, fa.document_category,
            COALESCE(
              (SELECT binding.role FROM drawing_revision_files binding
                WHERE binding.drawing_revision_id=fa.linked_entity_id
                  AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL
                ORDER BY binding.sort_order,binding.id LIMIT 1),
              (SELECT binding.role FROM numbering_candidate_revision_files binding
                WHERE binding.candidate_revision_id=fa.linked_entity_id
                  AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL
                ORDER BY binding.sort_order,binding.id LIMIT 1),
              fa.document_category) AS capability_role,
            fa.linked_entity_type, fa.linked_entity_id
       FROM file_assets fa
      WHERE fa.id IN (${idClause.sql})
        AND fa.deleted_at IS NULL
        AND ${previewSourceCompanyPredicate(":companyId")}`,
    { companyId: input.companyId, ...idClause.params }
  );
  const states = await listPreviewStatesForAttachmentIds(client, sources.map((source) => source.id));
  const jobRows = await client.query<PreviewJobRow>(
    `SELECT * FROM preview_jobs
      WHERE generator_profile <> 'fake_preview_worker' AND company_id = :companyId AND source_file_asset_id IN (${idClause.sql})
      ORDER BY updated_at DESC, created_at DESC`,
    { companyId: input.companyId, ...idClause.params }
  );
  const jobsBySourceId = new Map<string, PreviewJobRow[]>();
  for (const job of jobRows) {
    jobsBySourceId.set(job.source_file_asset_id, [...(jobsBySourceId.get(job.source_file_asset_id) ?? []), job]);
  }
  const generatorProfile = realPreviewGeneratorProfile;
  const results: AutomaticPreviewPreparationResult[] = [];

  for (const source of sources) {
    if (!isNativeSolidWorksPreviewSource(source.file_ext)) continue;
    const sourceHash = source.content_hash?.trim() ?? "";
    const requestedKind = requestedPreviewKindForSource(source.file_ext);
    const state = states.get(source.id);
    const currentJob = (jobsBySourceId.get(source.id) ?? []).find(
      (job) => job.source_content_hash === sourceHash && job.requested_kind === requestedKind
    ) ?? null;
    const hasCurrentDerivative = Boolean(sourceHash) && (state?.derivatives ?? []).some(
      (derivative) => derivative.status === "ready" && derivative.sourceContentHash === sourceHash
    );
    if (hasCurrentDerivative) {
      results.push({ sourceFileAssetId: source.id, disposition: "ready", jobId: currentJob?.id ?? null });
      continue;
    }

    if (currentJob && (currentJob.status === "queued" || currentJob.status === "running")) {
      results.push({ sourceFileAssetId: source.id, disposition: "active", jobId: currentJob.id });
      continue;
    }

    if (currentJob) {
      // Detail/GET recovery cannot resurrect a terminal job. Explicit worker
      // regeneration is a separate command with its existing authority.
      results.push({ sourceFileAssetId: source.id, disposition: "failed", jobId: currentJob.id });
      continue;
    }

    try {
      const prepared = await enqueuePreviewJobForSourceAsync(client, {
        source,
        actorUserId: input.actorUserId,
        principalInitiator: input.principalInitiator,
        requestedKind,
        generatorProfile,
        forceRegenerate: false
      });
      results.push({ sourceFileAssetId: source.id, disposition: "queued", jobId: prepared.jobId });
    } catch (error) {
      if (input.requireQueued) throw error;
      results.push({ sourceFileAssetId: source.id, disposition: "failed", jobId: null });
    }
  }

  return results;
}

export async function enqueuePreviewJobForAttachmentAsync(
  client: AsyncDatabaseClient,
  input: {
    entityType: MasterAttachmentEntityType;
    entityCode: string;
    attachmentId: string;
    actorUserId: string;
    principalInitiator: PrincipalJobInitiator;
    companyId?: string;
    requestedKind?: PreviewRequestedKind;
    generatorProfile?: string;
    runFakeWorker?: boolean;
    forceRegenerate?: boolean;
  }
) {
  if (!input.companyId?.trim() || !input.principalInitiator ||
      input.principalInitiator.pdmUserId !== input.actorUserId ||
      input.principalInitiator.companyId !== input.companyId) {
    throw new Error("PREVIEW_PRINCIPAL_COMPANY_CONTEXT_REQUIRED");
  }
  const source = await resolvePreviewSource(client, input);
  if (!source) throw new Error("MASTER_ATTACHMENT_NOT_FOUND");

  return enqueuePreviewJobForSourceAsync(client, {
    source,
    actorUserId: input.actorUserId,
    principalInitiator: input.principalInitiator,
    requestedKind: input.requestedKind,
    generatorProfile: input.generatorProfile,
    runFakeWorker: input.runFakeWorker,
    forceRegenerate: input.forceRegenerate
  });
}

export async function enqueuePreviewJobForSourceAsync(
  client: AsyncDatabaseClient,
  input: {
    source: PreviewSourceRow;
    actorUserId: string;
    principalInitiator: PrincipalJobInitiator;
    requestedKind?: PreviewRequestedKind;
    generatorProfile?: string;
    runFakeWorker?: boolean;
    forceRegenerate?: boolean;
  }
) {
  assertRealPreviewWorker(input.runFakeWorker, input.generatorProfile);
  const source = input.source;
  const principalInitiator = parsePrincipalJobInitiator(input.principalInitiator);
  if (!principalInitiator || principalInitiator.pdmUserId !== input.actorUserId ||
      principalInitiator.companyId !== input.source.company_id) throw new Error("PREVIEW_PRINCIPAL_CONTEXT_REQUIRED");
  const companyId = source.company_id?.trim();
  if (!companyId || !await previewSourceBelongsToCompany(client, source.id, companyId)) {
    throw new Error("PREVIEW_SOURCE_COMPANY_SCOPE_INVALID");
  }

  const sourceExtension = normalizeExtension(source.file_ext);
  const requestedKind = input.requestedKind ?? requestedPreviewKindForSource(source.file_ext);
  const generatorProfile = input.generatorProfile ?? realPreviewGeneratorProfile;
  const now = (await previewClock(client)).iso;
  const status = previewRequestSupported(sourceExtension, requestedKind) ? "queued" : "skipped";
  const errorCode = status === "skipped" ? "unsupported_preview_source" : null;
  const errorSummary =
    status === "skipped" ? "此檔案格式目前不支援 SolidWorks 原檔預覽，請改用 PDF、圖片或等待後續轉檔 worker。" : null;
  const sourceContentHash = requireSourceHash(source);
  const job = await upsertPreviewJob(client, {
    id: crypto.randomUUID(),
    companyId,
    sourceFileAssetId: source.id,
    sourceContentHash,
    requestedKind,
    sourceExtension,
    status,
    generatorProfile,
    errorCode,
    errorSummary,
    actorUserId: input.actorUserId,
    principalInitiator,
    forceRegenerate: input.forceRegenerate === true,
    now
  });

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
        AND company_id = :companyId
    `,
    { derivativeId: input.derivativeId, sourceFileAssetId: source.id, companyId: source.company_id }
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

export async function getPreviewDerivativeBytesForSourceAssetAsync(
  client: AsyncDatabaseClient,
  input: { sourceFileAssetId: string; sourceContentHash: string; derivativeId: string }
): Promise<PreviewDerivativeFile | null> {
  const row = await client.queryOne<FileDerivativeRow>(
    `
      SELECT derivative.*
      FROM file_derivatives derivative
      JOIN file_assets fa ON fa.id = derivative.source_file_asset_id AND fa.deleted_at IS NULL
      WHERE derivative.id = :derivativeId
        AND derivative.source_file_asset_id = :sourceFileAssetId
        AND derivative.status = 'ready'
        AND ${previewSourceCompanyPredicate("derivative.company_id")}
    `,
    input
  );
  if (!row || row.source_content_hash !== input.sourceContentHash) return null;
  if (row.generator_profile === fakePreviewGeneratorProfile || !isDisplayablePreviewDerivativeRow(row)) return null;
  const storagePointer = storagePointerFromRecord(row);
  const bytes = await createFileStorageServiceForPointer(storagePointer).readObject(storagePointer.key);
  if (sha256(bytes) !== row.content_hash) return null;
  return { fileName: row.file_name, mimeType: row.mime_type, bytes, contentHash: row.content_hash };
}

/** PostgreSQL triggers own updated_at. Compare and stamp leases against that
 * same server clock; workstation/container clock skew is not lease age. */
async function previewClock(client: AsyncDatabaseClient) {
  if (client.kind !== "postgres") {
    const epoch = Date.now(); return { epoch, iso: new Date(epoch).toISOString() };
  }
  const row = await client.queryOne<{ lease_clock: string | Date }>("SELECT statement_timestamp() AS lease_clock");
  const value = row?.lease_clock;
  const epoch = typeof value === "string" ? Date.parse(value) : value?.getTime();
  if (epoch === undefined || !Number.isFinite(epoch)) throw new Error("PREVIEW_LEASE_CLOCK_UNAVAILABLE");
  return { epoch, iso: new Date(epoch).toISOString() };
}

export async function claimPreviewJobAsync(
  client: AsyncDatabaseClient,
  input: { leaseProtocolVersion: 2; workerId: string; companyId: string; supportedKinds: PreviewRequestedKind[]; supportedExtensions: string[] }
): Promise<PreviewWorkerClaim | null> {
  if (input.leaseProtocolVersion !== previewLeaseProtocolVersion) throw new Error("WORKLOAD_LEASE_PROTOCOL_REQUIRED");
  if (!input.companyId.trim() || !input.supportedKinds.length || !input.supportedExtensions.length) return null;
  await recoverStalePreviewJobsAsync(client, { companyId: input.companyId, supportedKinds: input.supportedKinds, supportedExtensions: input.supportedExtensions });
  const kindClause = buildNamedInClause("kind", input.supportedKinds);
  const extensionClause = buildNamedInClause("extension", input.supportedExtensions.map(normalizeExtension));
  const result = await client.transaction(async (transactionClient) => {
    const selected = await transactionClient.queryOne<PreviewJobRow>(
      `
        SELECT *
        FROM preview_jobs job
        WHERE status = 'queued'
          AND company_id = :companyId
          AND attempt_count < :maxAttempts
          AND requested_kind IN (${kindClause.sql})
          AND source_extension IN (${extensionClause.sql})
          AND ${recoverablePreviewSourcePredicate()}
        ORDER BY priority ASC, created_at ASC
        LIMIT 1
        ${transactionClient.kind === "postgres" ? "FOR UPDATE SKIP LOCKED" : ""}
      `,
      { ...kindClause.params, ...extensionClause.params, companyId: input.companyId, maxAttempts: previewMaxAttempts }
    );
    if (!selected) return null;
    const source = await readPreviewSource(transactionClient, selected.source_file_asset_id, selected.company_id, true);
    if (!source || source.content_hash !== selected.source_content_hash) return null;
    const now = (await previewClock(transactionClient)).iso;
    if (!parsePreviewLeaseBasis({ companyId: selected.company_id, sourceFileAssetId: selected.source_file_asset_id,
      sourceContentHash: selected.source_content_hash, attemptCount: Number(selected.attempt_count) + 1, lockedAt: now })) return null;
    const claimed = await transactionClient.queryOne<PreviewJobRow & { lease_locked_at: string }>(
      `
        UPDATE preview_jobs AS job
        SET status = 'running',
            locked_by = :workerId,
            locked_at = :now,
            attempt_count = attempt_count + 1,
            worker_completion_json = NULL,
            updated_at = :now
        WHERE id = :id AND status = 'queued' AND attempt_count < :maxAttempts
          AND ${recoverablePreviewSourcePredicate()}
          ${previewWriteFreshnessPredicate(transactionClient)}
        RETURNING *, CAST(locked_at AS TEXT) AS lease_locked_at
      `,
      { id: selected.id, workerId: input.workerId, now, maxAttempts: previewMaxAttempts }
    );
    return claimed ? { row: claimed, source } : null;
  }, { isolationLevel: "repeatable_read", readOnly: false });
  if (!result) return null;
  const { row, source } = result;

  return {
    jobId: row.id,
    sourceFileAssetId: row.source_file_asset_id,
    sourceContentHash: row.source_content_hash,
    sourceExtension: normalizeExtension(row.source_extension),
    requestedKind: row.requested_kind as PreviewRequestedKind,
    generatorProfile: row.generator_profile,
    storageKey: source.storage_key,
    originalPath: source.original_path,
    leaseBasis: { companyId: row.company_id, sourceFileAssetId: row.source_file_asset_id,
      sourceContentHash: row.source_content_hash, attemptCount: Number(row.attempt_count), lockedAt: new Date(row.lease_locked_at).toISOString() }
  };
}

type PreviewLeaseInput = { jobId: string; workerId: string; leaseBasis: PreviewLeaseBasis };

function previewLeasePredicate() {
  return `job.id=:jobId AND job.status='running' AND job.locked_by=:workerId
    AND job.company_id=:companyId AND job.source_file_asset_id=:sourceFileAssetId
    AND job.source_content_hash=:sourceContentHash AND job.attempt_count=:attemptCount
    AND job.locked_at=:lockedAt AND ${recoverablePreviewSourcePredicate()}`;
}

/** The existing PG trigger stamps transaction-start now(). A transaction that
 * waited through a full lease must not claim/refresh with an already-stale stamp.
 * Enforce this in the UPDATE as well as checking freshness after source locks. */
function previewWriteFreshnessPredicate(client: AsyncDatabaseClient, heartbeat = false) {
  return client.kind === "postgres" ? `AND statement_timestamp() < transaction_timestamp() + INTERVAL '30 seconds'
    ${heartbeat ? "AND statement_timestamp() < job.updated_at + INTERVAL '30 seconds'" : ""}` : "";
}

async function readPreviewLease(client: AsyncDatabaseClient, input: PreviewLeaseInput, lock = false, checkFreshness = true) {
  if (!input.jobId?.trim() || !input.workerId?.trim() || !parsePreviewLeaseBasis(input.leaseBasis)) return null;
  const job = await client.queryOne<PreviewJobRow & { heartbeat_token: string; metadata_json: string }>(
    `SELECT job.*, CAST(job.updated_at AS TEXT) AS heartbeat_token FROM preview_jobs job
      WHERE ${previewLeasePredicate()} ${lock && client.kind === "postgres" ? "FOR UPDATE OF job" : ""}`,
    { jobId: input.jobId, workerId: input.workerId, ...input.leaseBasis });
  if (!job) return null;
  const updatedAt = typeof job.updated_at === "string" ? Date.parse(job.updated_at) : job.updated_at?.getTime();
  if (!Number.isFinite(updatedAt)) return null;
  const source = await readPreviewSource(client, input.leaseBasis.sourceFileAssetId, job.company_id, lock);
  if (!source || source.content_hash !== job.source_content_hash) return null;
  const clock = await previewClock(client);
  if (checkFreshness && clock.epoch - updatedAt >= previewHeartbeatStaleAfterMs) return null;
  return { job, source, clock };
}

async function readPreviewSource(client: AsyncDatabaseClient, id: string, companyId: string, lock = false) {
  const source = await client.queryOne<PreviewSourceRow>(
    `SELECT * FROM file_assets WHERE id=:id AND deleted_at IS NULL ${lock && client.kind === "postgres" ? "FOR SHARE" : ""}`, { id });
  if (!source) return null;
  // file_assets has no company_id. Lock the exact canonical relation as well as
  // the immutable pointer, so a company change cannot race the storage write.
  if (lock) {
    const ownerTables: Record<string, string> = { drawing_revision: "drawing_revisions",
      numbering_candidate_revision: "numbering_candidate_revision_drafts", drawing_number: "drawing_numbers", part_number: "part_numbers" };
    const table = ownerTables[source.linked_entity_type];
    if (!table || !await client.queryOne(`SELECT id FROM ${table} WHERE id=:id AND company_id=:companyId
      ${client.kind === "postgres" ? "FOR SHARE" : ""}`, { id: source.linked_entity_id, companyId: companyId })) return null;
  }
  return source;
}

function sourceSnapshot(source: PreviewSourceRow) {
  return JSON.stringify(source);
}

export async function heartbeatPreviewJobAsync(client: AsyncDatabaseClient, input: PreviewLeaseInput): Promise<boolean> {
  return client.transaction(async transaction => {
    const owned = await readPreviewLease(transaction, input, true);
    if (!owned) return false;
    const updated = await transaction.queryOne<{ id: string }>(`UPDATE preview_jobs AS job SET updated_at=:now
      WHERE ${previewLeasePredicate()} AND job.updated_at=:previousUpdatedAt
        ${previewWriteFreshnessPredicate(transaction, true)} RETURNING id`,
      { jobId: input.jobId, workerId: input.workerId, ...input.leaseBasis,
        previousUpdatedAt: owned.job.heartbeat_token, now: owned.clock.iso });
    return Boolean(updated);
  }, { isolationLevel: "repeatable_read", readOnly: false });
}

function recoverablePreviewSourcePredicate() {
  return `job.generator_profile <> 'fake_preview_worker' AND EXISTS (SELECT 1 FROM file_assets fa WHERE fa.id=job.source_file_asset_id
    AND fa.deleted_at IS NULL AND fa.content_hash=job.source_content_hash
    AND LOWER(REPLACE(fa.file_ext,'.',''))=LOWER(REPLACE(job.source_extension,'.',''))
    AND LOWER(REPLACE(fa.file_ext,'.','')) IN ('sldprt','sldasm','slddrw')
    AND job.requested_kind='native_thumbnail_png' AND ${previewSourceCompanyPredicate("job.company_id")})`;
}

export type PreviewRecoveryScope = { companyId: string; sourceFileAssetIds: string[] }
  | { companyId: string; supportedKinds: PreviewRequestedKind[]; supportedExtensions: string[] };

export async function recoverStalePreviewJobsAsync(client: AsyncDatabaseClient, scope?: PreviewRecoveryScope) {
  // Legacy callers without a verified resource/workload scope may read, but
  // must never recover the entire application queue.
  if (!scope) return { recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 };
  let scopeSql: string;
  let scopeParams: Record<string, string>;
  if ("sourceFileAssetIds" in scope) {
    const ids = [...new Set(scope.sourceFileAssetIds.map(value => value.trim()).filter(Boolean))];
    if (!scope.companyId.trim() || !ids.length) return { recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 };
    const assets = buildNamedInClause("recoveryAsset", ids);
    scopeSql = `job.company_id=:recoveryCompany AND job.source_file_asset_id IN (${assets.sql})`;
    scopeParams = { recoveryCompany: scope.companyId, ...assets.params };
  } else {
    if (!scope.companyId.trim() || !scope.supportedKinds.length || !scope.supportedExtensions.length) return { recovered: 0, queuedUnclaimed: 0, invalidSourceTerminated: 0 };
    const kinds = buildNamedInClause("recoveryKind", scope.supportedKinds);
    const extensions = buildNamedInClause("recoveryExtension", scope.supportedExtensions.map(normalizeExtension));
    scopeSql = `job.company_id=:recoveryCompany AND job.requested_kind IN (${kinds.sql}) AND LOWER(REPLACE(job.source_extension,'.','')) IN (${extensions.sql})`;
    scopeParams = { recoveryCompany: scope.companyId, ...kinds.params, ...extensions.params };
  }
  const sourceSql = recoverablePreviewSourcePredicate();
  const rows = await client.query<Pick<PreviewJobRow, "id" | "status" | "attempt_count" | "company_id" | "source_file_asset_id" | "source_content_hash" | "locked_by"> & {
    updated_at: string | Date; previous_updated_at: string; previous_locked_at: string | null; source_valid: number | string }>(
    `SELECT job.id,job.status,job.attempt_count,job.company_id,job.source_file_asset_id,job.source_content_hash,
        job.locked_by,CAST(job.locked_at AS TEXT) AS previous_locked_at,job.updated_at,CAST(job.updated_at AS TEXT) AS previous_updated_at,
        CASE WHEN ${sourceSql} THEN 1 ELSE 0 END AS source_valid FROM preview_jobs job
      WHERE job.status IN ('running','queued') AND ${scopeSql}
        AND job.generator_profile <> 'fake_preview_worker' AND job.requested_kind='native_thumbnail_png'
        AND LOWER(REPLACE(job.source_extension,'.','')) IN ('sldprt','sldasm','slddrw')`, scopeParams);
  const { epoch: now, iso: nowIso } = await previewClock(client);
  let recovered = 0, queuedUnclaimed = 0, invalidSourceTerminated = 0;
  for (const row of rows) {
    const updatedAt = row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(row.updated_at);
    const timeout = row.status === "running" ? previewHeartbeatStaleAfterMs : previewQueuedUnclaimedAfterMs;
    if (!Number.isFinite(updatedAt) || now - updatedAt < timeout) continue;
    const attemptCount = Number(row.attempt_count ?? 0);
    const sourceValid = Number(row.source_valid) === 1;
    if (!sourceValid && row.status !== "running") continue;
    const retry = sourceValid && row.status === "running" && attemptCount < previewMaxAttempts;
    const changed = await client.queryOne<{ id: string }>(`UPDATE preview_jobs AS job SET status=:nextStatus,
      error_code=:errorCode,error_summary=:errorSummary,locked_by=NULL,locked_at=NULL,updated_at=:now,completed_at=:completedAt
      ,worker_completion_json=CASE WHEN :nextStatus='queued' THEN NULL ELSE worker_completion_json END
      WHERE job.id=:jobId AND job.status=:previousStatus AND job.updated_at=:previousUpdatedAt
        AND job.attempt_count=:previousAttempts AND job.company_id=:previousCompanyId
        AND job.source_file_asset_id=:previousSourceId AND job.source_content_hash=:previousSourceHash
        AND (job.locked_by=:previousLockedBy OR (job.locked_by IS NULL AND :previousLockedBy IS NULL))
        AND (job.locked_at=:previousLockedAt OR (job.locked_at IS NULL AND :previousLockedAt IS NULL))
        AND ${scopeSql} AND job.generator_profile <> 'fake_preview_worker'
        AND (CASE WHEN ${sourceSql} THEN 1 ELSE 0 END)=:previousSourceValid
        RETURNING ${client.kind === "postgres" ? "job.id" : "id"}`, {
      ...scopeParams, jobId: row.id, previousStatus: row.status, previousUpdatedAt: row.previous_updated_at,
      previousCompanyId: row.company_id, previousSourceId: row.source_file_asset_id, previousSourceHash: row.source_content_hash,
      previousLockedBy: row.locked_by, previousLockedAt: row.previous_locked_at, previousSourceValid: sourceValid ? 1 : 0, previousAttempts: attemptCount, nextStatus: retry ? "queued" : "failed", now: nowIso,
      completedAt: retry ? null : nowIso,
      errorCode: !sourceValid ? "preview_source_unavailable" : row.status === "queued" ? "preview_worker_unavailable" : "preview_worker_heartbeat_timeout",
      errorSummary: !sourceValid ? "來源或公司關聯已失效，預覽工作已停止；請重新確認來源。" : row.status === "queued" ? "預覽服務未接手，已停止等待，請確認服務後重試。"
        : retry ? "系統已自動重新排程。" : "預覽服務未回應，請稍後再試。"
    });
    if (!changed) continue;
    if (!sourceValid) { invalidSourceTerminated += 1; continue; }
    recovered += 1;
    if (row.status === "queued") queuedUnclaimed += 1;
  }
  return { recovered, queuedUnclaimed, invalidSourceTerminated };
}

export async function completePreviewJobAsync(client: AsyncDatabaseClient, input: PreviewWorkerCompletionInput) {
  const refused = { accepted: false, derivativeIds: [] as string[] };
  if (!parsePreviewLeaseBasis(input.leaseBasis) || !["succeeded", "failed", "skipped", "cancelled"].includes(input.status)) return refused;
  if (input.status === "cancelled" && input.cancelReason !== "operator_shutdown") return refused;
  if (input.status !== "succeeded") {
    return { accepted: await finishPreviewJob(client, input), derivativeIds: [] };
  }
  const observed = await readPreviewLease(client, input);
  if (!observed || observed.job.source_content_hash !== input.sourceContentHash) return refused;
  const job = observed.job;
  // A successful preview must contain a usable result. Keep the current lease
  // running on malformed/empty output; worker error handling decides whether to fail it.
  if (!Array.isArray(input.derivatives) || input.derivatives.length === 0) {
    return { accepted: false, derivativeIds: [] };
  }
  const validOutput = input.derivatives.every(derivative => {
    if (!derivative || typeof derivative.fileName !== "string" || typeof derivative.contentBase64 !== "string") return false;
    const bytes = Buffer.from(derivative.contentBase64, "base64");
    const png = derivative.mimeType === "image/png" && /\.png$/iu.test(derivative.fileName)
      && ["thumbnail_png", "model_preview_png", "sheet_png"].includes(derivative.kind)
      && bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const pdf = derivative.mimeType === "application/pdf" && /\.pdf$/iu.test(derivative.fileName)
      && derivative.kind === "drawing_pdf" && bytes.subarray(0,5).toString("ascii") === "%PDF-";
    return job.requested_kind === "native_thumbnail_png" ? png : (png || pdf);
  });
  if (!validOutput) return { accepted: false, derivativeIds: [] };


  const objectKeys: string[] = [];
  const storedObjects: Array<{ provider: string; key: string; generation?: string }> = [];
  try {
    const derivativeIds = await client.transaction(async (transactionClient) => {
      const owned = await readPreviewLease(transactionClient, input, true);
      if (!owned || sourceSnapshot(owned.source) !== sourceSnapshot(observed.source)) return null;
      if (transactionClient.kind === "postgres") {
        const current = await readClaimedPreviewSourceInSnapshot(transactionClient, input);
        const original = previewJobInitiatorFromMetadata(observed.job.metadata_json);
        if (!current || !original || JSON.stringify(current.initiator) !== JSON.stringify(original)) return null;
      }
    const ids: string[] = [];
    for (const derivative of input.derivatives) {
      const bytes = Buffer.from(derivative.contentBase64, "base64");
      const objectKeyId = crypto.randomUUID();
      objectKeys.push(buildStorageKey(["preview-derivatives", job.source_file_asset_id, job.source_content_hash, job.id,
        objectKeyId, `${derivative.kind}-${sanitizeDerivativeFilename(derivative.fileName)}`]));
      const stored = await storePreviewDerivativeBytes({
        objectKeyId,
        sourceFileAssetId: job.source_file_asset_id,
        sourceContentHash: job.source_content_hash,
        jobId: job.id,
        kind: derivative.kind,
        fileName: derivative.fileName,
        mimeType: derivative.mimeType,
        bytes
      });
      storedObjects.push({ provider: stored.provider, key: stored.key, generation: stored.generation });
      const derivativeId = crypto.randomUUID();
      const now = (await previewClock(transactionClient)).iso;
      await retireReadyDerivatives(transactionClient, {
        sourceFileAssetId: job.source_file_asset_id,
        sourceContentHash: job.source_content_hash,
        derivativeKind: derivative.kind,
        generatorProfile: derivative.generatorProfile ?? job.generator_profile
      });
      await insertDerivative(transactionClient, {
        id: derivativeId,
        companyId: job.company_id,
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

      // Locks are held through commit. Do not age out our own lease while its
      // heartbeat is blocked by this transaction; still recheck every identity.
      const current = await readPreviewLease(transactionClient, input, false, false);
      if (!current || sourceSnapshot(current.source) !== sourceSnapshot(owned.source)) throw new Error("PREVIEW_JOB_CLAIM_LOST");
      const completionTime = (await previewClock(transactionClient)).iso;
      const completed = await transactionClient.queryOne<{ id: string }>(`UPDATE preview_jobs AS job
        SET status='succeeded', error_code=NULL, error_summary=NULL, locked_by=NULL, locked_at=NULL,
            updated_at=:now, completed_at=:now, worker_completion_json=:workerCompletionJson
        WHERE ${previewLeasePredicate()} AND job.updated_at=:previousUpdatedAt RETURNING id`,
        { jobId: input.jobId, workerId: input.workerId, ...input.leaseBasis,
          previousUpdatedAt: owned.job.heartbeat_token, now: completionTime,
          workerCompletionJson: previewCompletionReceipt(input, "succeeded", completionTime) });
      if (!completed) throw new Error("PREVIEW_JOB_CLAIM_LOST");
      return ids;
    }, { isolationLevel: "repeatable_read", readOnly: false });
    return { accepted: derivativeIds !== null, derivativeIds: derivativeIds ?? [] };
  } catch (error) {
    // Never retry a transaction with external storage effects. COMMIT ACK may
    // be lost; record enough for read-only reconciliation, do not infer rollback
    // or delete a possibly shared local object / immutable GCS generation.
    if (objectKeys.length) console.error("PREVIEW_COMPLETION_OUTCOME_REQUIRES_READBACK", {
      jobId: input.jobId, attemptCount: input.leaseBasis.attemptCount, objectKeys, storedObjects });
    throw error;
  }
}

async function listPreviewStatesForAttachmentIds(client: AsyncDatabaseClient, attachmentIds: string[]) {
  const states = new Map<string, PreviewState>();
  if (attachmentIds.length === 0) return states;
  for (const id of attachmentIds) states.set(id, { derivatives: [], job: null });

  const idClause = buildNamedInClause("attachmentId", attachmentIds);
  const derivatives = await client.query<FileDerivativeRow>(
    `
      SELECT derivative.*
      FROM file_derivatives derivative
      JOIN file_assets fa ON fa.id = derivative.source_file_asset_id AND fa.deleted_at IS NULL
      WHERE derivative.source_file_asset_id IN (${idClause.sql})
        AND ${previewSourceCompanyPredicate("derivative.company_id")}
      ORDER BY derivative.created_at DESC
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
      SELECT job.*
      FROM preview_jobs job
      JOIN file_assets fa ON fa.id = job.source_file_asset_id AND fa.deleted_at IS NULL
      WHERE job.generator_profile <> 'fake_preview_worker' AND job.source_file_asset_id IN (${idClause.sql})
        AND ${previewSourceCompanyPredicate("job.company_id")}
      ORDER BY job.updated_at DESC, job.created_at DESC
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
  input: { entityType: MasterAttachmentEntityType; entityCode: string; attachmentId: string; companyId?: string }
) {
  if (input.entityType === "drawing_number") {
    return await client.queryOne<PreviewSourceRow>(
      `
        SELECT fa.*, dn.company_id AS company_id
        FROM file_assets fa
        JOIN drawing_numbers dn ON dn.id = fa.linked_entity_id
        WHERE fa.id = :attachmentId
          AND fa.linked_entity_type = 'drawing_number'
          AND dn.drawing_number = :entityCode
          AND (CAST(:companyId AS TEXT) IS NULL OR dn.company_id = :companyId)
          AND fa.deleted_at IS NULL
      `,
      { attachmentId: input.attachmentId, entityCode: input.entityCode, companyId: input.companyId ?? null }
    );
  }

  return await client.queryOne<PreviewSourceRow>(
    `
      SELECT fa.*, pn.company_id AS company_id
      FROM file_assets fa
      JOIN part_numbers pn ON pn.id = fa.linked_entity_id
      WHERE fa.id = :attachmentId
        AND fa.linked_entity_type = 'part_number'
        AND pn.part_number = :entityCode
        AND (CAST(:companyId AS TEXT) IS NULL OR pn.company_id = :companyId)
        AND fa.deleted_at IS NULL
    `,
    { attachmentId: input.attachmentId, entityCode: input.entityCode, companyId: input.companyId ?? null }
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
    principalInitiator: PrincipalJobInitiator;
    forceRegenerate: boolean;
    now: string;
  }
) {
  const idempotencyKey = buildPreviewJobIdempotencyKey(input);
  const existing = await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE idempotency_key = :idempotencyKey", {
    idempotencyKey
  });
  if (existing) {
    if (existing.company_id !== input.companyId) throw new Error("PREVIEW_JOB_COMPANY_CONFLICT");
    const forceResetStatuses = new Set(["succeeded", "failed", "skipped", "cancelled"]);
    const shouldResetExisting = input.forceRegenerate && forceResetStatuses.has(existing.status);
    if (shouldResetExisting) {
      if (Number(existing.attempt_count) >= previewMaxAttempts) throw new Error("PREVIEW_ATTEMPTS_EXHAUSTED");
      await client.execute(
        `
          UPDATE preview_jobs
          SET status = :status,
              error_code = :errorCode,
              error_summary = :errorSummary,
              metadata_json = :metadataJson,
              locked_by = NULL,
              locked_at = NULL,
              updated_at = :now,
              completed_at = CASE WHEN :status = 'skipped' THEN :now ELSE NULL END
          WHERE id = :id AND status = :previousStatus AND attempt_count = :previousAttempts
            AND updated_at = :previousUpdatedAt
        `,
        {
          id: existing.id, previousStatus: existing.status, previousAttempts: existing.attempt_count,
          previousUpdatedAt: existing.updated_at,
          status: input.status,
          errorCode: input.errorCode,
          errorSummary: input.errorSummary,
          metadataJson: JSON.stringify({ initiator: input.principalInitiator }),
          now: input.now
        }
      );
      return await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE id=:id", { id: existing.id }) ?? existing;
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
        :actorUserId, :now, :now, :completedAt, :metadataJson
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `,
    {
      ...input,
      idempotencyKey,
      metadataJson: JSON.stringify({ initiator: input.principalInitiator }),
      completedAt: input.status === "skipped" ? input.now : null
    }
  );

  return (await client.queryOne<PreviewJobRow>("SELECT * FROM preview_jobs WHERE idempotency_key = :idempotencyKey", { idempotencyKey })) ?? {
    id: input.id,
    company_id: input.companyId,
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

async function finishPreviewJob(client: AsyncDatabaseClient, input: Exclude<PreviewWorkerCompletionInput, { status: "succeeded" }>) {
  return client.transaction(async transaction => {
    const owned = await readPreviewLease(transaction, input, true);
    if (!owned) return false;
    const cancelled = input.status === "cancelled";
    const completionTime = (await previewClock(transaction)).iso;
    const updated = await transaction.queryOne<{ id: string }>(`UPDATE preview_jobs AS job
      SET status=:status, error_code=:errorCode, error_summary=:errorSummary,
          locked_by=NULL, locked_at=NULL, updated_at=:now, completed_at=:now,
          worker_completion_json=:workerCompletionJson
      WHERE ${previewLeasePredicate()} AND job.updated_at=:previousUpdatedAt RETURNING id`, {
      jobId: input.jobId, workerId: input.workerId, ...input.leaseBasis, status: input.status,
      errorCode: cancelled ? "preview_worker_cancelled" : sanitizePreviewErrorCode(input.errorCode),
      errorSummary: cancelled ? "預覽已由處理服務取消；可下載原檔。" : sanitizePreviewErrorSummary(input.errorSummary),
      previousUpdatedAt: owned.job.heartbeat_token, now: completionTime,
      workerCompletionJson: previewCompletionReceipt(input, input.status, completionTime)
    });
    return Boolean(updated);
  }, { isolationLevel: "repeatable_read", readOnly: false });
}

function previewCompletionReceipt(input: PreviewWorkerCompletionInput, terminalStatus: string, committedAt: string) {
  return JSON.stringify({ workerId: input.workerId, leaseBasis: input.leaseBasis,
    resultDigest: crypto.createHash("sha256").update(canonicalJsonStringify(input)).digest("hex"),
    terminalStatus, committedAt });
}

async function storePreviewDerivativeBytes(input: {
  objectKeyId: string;
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
      input.objectKeyId,
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
    lastHeartbeatAt: typeof row.updated_at === "string" ? row.updated_at : row.updated_at.toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.updated_at.toISOString(),
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
  return row.generator_profile !== fakePreviewGeneratorProfile && row.generator_version !== fakePreviewGeneratorVersion;
}

function assertRealPreviewWorker(runFakeWorker?: boolean, profile?: string) {
  if (runFakeWorker || process.env.PDM_LOCAL_FAKE_PREVIEW_WORKER === "1" || profile === fakePreviewGeneratorProfile) {
    throw new Error("LOCAL_FAKE_PREVIEW_WORKER_RETIRED");
  }
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

type ClaimedPreviewSourceSnapshot = {
  job: PreviewJobRow & { metadata_json: unknown };
  source: PreviewSourceRow;
  initiator: PrincipalJobInitiator;
};

function previewSourceIdentity(source: PreviewSourceRow) {
  return JSON.stringify([
    source.id, source.company_id, source.storage_provider, source.original_path, source.storage_key,
    source.file_name, source.file_ext, source.mime_type, source.file_size, source.content_hash,
    source.hash_algorithm, source.linked_entity_type, source.linked_entity_id,
    source.document_category, source.capability_role ?? null
  ]);
}

function previewJobInitiatorFromMetadata(value: unknown): PrincipalJobInitiator | null {
  let metadata: unknown = value;
  if (typeof metadata === "string") {
    try { metadata = JSON.parse(metadata) as unknown; } catch { return null; }
  }
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  return parsePrincipalJobInitiator((metadata as Record<string, unknown>).initiator);
}

async function readClaimedPreviewSourceInSnapshot(snapshot: AsyncDatabaseClient, input: PreviewLeaseInput): Promise<ClaimedPreviewSourceSnapshot | null> {
  if (snapshot.kind !== "postgres") return null;
  const owned = await readPreviewLease(snapshot, input);
  if (!owned) return null;
  const { job } = owned;
  const initiator = previewJobInitiatorFromMetadata(job.metadata_json);
  if (!initiator || initiator.companyId !== job.company_id) return null;
  const source = await snapshot.queryOne<PreviewSourceRow>(
    `SELECT fa.*,job.company_id AS company_id,
        COALESCE(
          (SELECT binding.role FROM drawing_revision_files binding
            WHERE binding.drawing_revision_id=fa.linked_entity_id
              AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL
            ORDER BY binding.sort_order,binding.id LIMIT 1),
          (SELECT binding.role FROM numbering_candidate_revision_files binding
            WHERE binding.candidate_revision_id=fa.linked_entity_id
              AND binding.source_file_asset_id=fa.id AND binding.removed_at IS NULL
            ORDER BY binding.sort_order,binding.id LIMIT 1),
          fa.document_category) AS capability_role
       FROM file_assets fa JOIN preview_jobs job ON job.source_file_asset_id=fa.id
      WHERE job.id=:jobId AND job.company_id=:companyId AND fa.deleted_at IS NULL
        AND fa.content_hash=job.source_content_hash
        AND ${previewSourceCompanyPredicate("job.company_id")}`,
    { jobId: job.id, companyId: job.company_id }
  );
  if (!source || source.id !== job.source_file_asset_id || source.content_hash !== job.source_content_hash ||
      normalizeExtension(source.file_ext) !== normalizeExtension(job.source_extension)) return null;
  try {
    await requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: source.linked_entity_type,
      documentCategory: source.document_category,
      capabilityRole: source.capability_role
    });
  } catch (error) {
    if (error instanceof PrincipalJobAuthorityError && error.status === 403) return null;
    throw error;
  }
  return { job, source, initiator };
}

/** A workload token is not access to every asset: only the running claim holder
 * may read this job's same-company immutable source, preserving its Principal. */
export async function readClaimedPreviewSourceAsync(client: AsyncDatabaseClient, input: PreviewLeaseInput) {
  const observe = async (snapshot: AsyncDatabaseClient) => {
    const state = await readClaimedPreviewSourceInSnapshot(snapshot, input);
    return state ? { ...state, principalId: state.initiator.principalId } : null;
  };
  const resolved = await client.transaction(observe, { isolationLevel: "repeatable_read", readOnly: true });
  if (!resolved) throw new Error("PREVIEW_JOB_CLAIM_LOST");
  const pointer = storagePointerFromRecord(resolved.source);
  const bytes = await createFileStorageServiceForPointer(pointer).readObject(pointer.key);
  assertStoredFileIntegrity(bytes, resolved.source);
  // A new transaction after storage I/O, not the old repeatable-read snapshot.
  const current = await client.transaction(observe, { isolationLevel: "repeatable_read", readOnly: true });
  if (!current || JSON.stringify(current.initiator) !== JSON.stringify(resolved.initiator) || previewSourceIdentity(current.source) !== previewSourceIdentity(resolved.source)) {
    throw new Error("PREVIEW_JOB_CLAIM_LOST");
  }
  return { bytes, contentHash: resolved.job.source_content_hash, fileName: resolved.source.file_name,
    mimeType: resolved.source.mime_type || "application/octet-stream", principalId: resolved.principalId };
}
