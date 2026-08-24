import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { buildStorageKey, createFileStorageService, sha256 } from "@/lib/file-storage";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import { getMasterAttachmentUploadPolicy, validateStorageUploadFile } from "@/lib/storage-upload-policy";

type SourcePartRow = { id: string; part_number: string; company_id: string };

type CandidateRow = {
  id: string;
  storage_provider: string;
  original_path: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  storage_generation: string | null;
  storage_metageneration: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  file_size: number | null;
  content_hash: string | null;
  hash_algorithm: string;
  document_category: string;
  display_name: string;
  description: string;
  revision: string | null;
  sync_status: string;
  updated_at: string;
};

type SnapshotRow = { id: string; selection_fingerprint: string };

export type ReplacementAttachmentCandidate = {
  id: string;
  fileName: string;
  displayName: string;
  documentCategory: string;
  fileSize: number;
  updatedAt: string;
};

export type ReplacementAttachmentNewItemCommand = {
  clientKey: string;
  ordinal: number;
  displayName?: string;
  description?: string;
  documentCategory?: string;
  revision?: string | null;
};

export type PreparedReplacementAttachment = {
  clientKey: string;
  ordinal: number;
  fileName: string;
  fileExt: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  storageProvider: string;
  originalPath: string | null;
  storageBucket: string | null;
  storageKey: string;
  storageGeneration: string | null;
  storageMetageneration: string | null;
  displayName: string;
  description: string;
  documentCategory: string;
  revision: string | null;
};

export type ReplacementAttachmentSnapshotInput = {
  sourcePartNumberId: string;
  sourceToken: string;
  selectedAttachmentIds: string[];
  newAttachments: PreparedReplacementAttachment[];
};

export type ParsedReplacementAttachmentCommand = {
  body: Record<string, unknown>;
  newAttachmentFiles: Map<string, File>;
};

export class ReplacementAttachmentSnapshotError extends Error {
  constructor(readonly code: string, message = code, readonly status = 400) {
    super(message);
    this.name = "ReplacementAttachmentSnapshotError";
  }
}

export async function listReplacementAttachmentCandidatesAsync(input: {
  client: AsyncDatabaseClient;
  companyId: string;
  sourcePartNumber?: string;
  sourcePartNumberId?: string;
}) {
  const source = await resolveSourcePart(input.client, input);
  if (!source) return null;
  const rows = await listCandidateRows(input.client, source.company_id, source.id);
  return {
    sourcePartNumberId: source.id,
    sourcePartNumber: source.part_number,
    sourceToken: candidateToken(source.company_id, source.id, rows),
    candidates: rows.map(mapCandidate)
  };
}

export async function parseReplacementAttachmentCommand(request: Request): Promise<ParsedReplacementAttachmentCommand> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return { body, newAttachmentFiles: new Map<string, File>() };
  }

  const form = await request.formData();
  const rawCommand = form.get("command");
  if (typeof rawCommand !== "string") {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_COMMAND_REQUIRED");
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawCommand) as Record<string, unknown>;
  } catch {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_COMMAND_INVALID");
  }
  const files = new Map<string, File>();
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("part_attachment_file:")) continue;
    if (!(value instanceof File)) continue;
    files.set(key.slice("part_attachment_file:".length), value);
  }
  return { body, newAttachmentFiles: files };
}

export async function prepareReplacementAttachmentCommand(
  parsed: ParsedReplacementAttachmentCommand,
  companyCode: string
) {
  const snapshot = normalizeSnapshotCommand(parsed.body.attachmentSnapshot ?? parsed.body.attachment_snapshot);
  const preparedNewAttachments = await prepareReplacementAttachmentUploads(
    snapshot?.newItems ?? [],
    parsed.newAttachmentFiles,
    companyCode
  );
  return { body: parsed.body, preparedNewAttachments };
}

export function replacementAttachmentSnapshotFromBody(
  body: Record<string, unknown>,
  preparedNewAttachments: PreparedReplacementAttachment[]
): ReplacementAttachmentSnapshotInput | null {
  const command = normalizeSnapshotCommand(body.attachmentSnapshot ?? body.attachment_snapshot);
  if (!command) return null;
  if (command.newItems.length !== preparedNewAttachments.length) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_INVALID", "New attachment file mapping is incomplete");
  }
  return {
    sourcePartNumberId: command.sourcePartNumberId,
    sourceToken: command.sourceToken,
    selectedAttachmentIds: command.selectedAttachmentIds,
    newAttachments: preparedNewAttachments
  };
}

export function replacementAttachmentSelectionFingerprint(input: ReplacementAttachmentSnapshotInput) {
  return sha256Text(
    JSON.stringify({
      v: 1,
      sourcePartNumberId: input.sourcePartNumberId,
      sourceToken: input.sourceToken,
      selectedAttachmentIds: [...new Set(input.selectedAttachmentIds)].sort(),
      newAttachments: [...input.newAttachments]
        .sort((a, b) => a.ordinal - b.ordinal || a.clientKey.localeCompare(b.clientKey))
        .map((item) => ({
          clientKey: item.clientKey,
          ordinal: item.ordinal,
          contentHash: item.contentHash,
          fileSize: item.fileSize,
          fileName: item.fileName,
          displayName: item.displayName,
          description: item.description,
          documentCategory: item.documentCategory,
          revision: item.revision
        }))
    })
  );
}

export async function applyReplacementAttachmentSnapshotAsync(input: {
  client: AsyncDatabaseClient;
  companyId: string;
  draftId: string;
  actorUserId: string;
  snapshot: ReplacementAttachmentSnapshotInput;
}) {
  const fingerprint = replacementAttachmentSelectionFingerprint(input.snapshot);
  const existing = await input.client.queryOne<SnapshotRow>(
    `SELECT id, selection_fingerprint FROM part_attachment_reuse_snapshots WHERE company_id = :companyId AND part_number_draft_id = :draftId`,
    { companyId: input.companyId, draftId: input.draftId }
  );
  if (existing) {
    if (existing.selection_fingerprint !== fingerprint) {
      throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SNAPSHOT_CONFLICT", undefined, 409);
    }
    return { snapshotId: existing.id, idempotentReplay: true };
  }

  const draft = await input.client.queryOne<{ source_part_number_id: string | null }>(
    `SELECT source_part_number_id FROM part_number_drafts WHERE id = :draftId AND company_id = :companyId`,
    { companyId: input.companyId, draftId: input.draftId }
  );
  if (!draft || draft.source_part_number_id !== input.snapshot.sourcePartNumberId) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SOURCE_MISMATCH", undefined, 409);
  }

  const source = await resolveSourcePart(input.client, {
    companyId: input.companyId,
    sourcePartNumberId: input.snapshot.sourcePartNumberId
  });
  if (!source) throw new ReplacementAttachmentSnapshotError("SOURCE_PART_NOT_FOUND", undefined, 404);
  const candidates = await listCandidateRows(input.client, input.companyId, source.id);
  const currentToken = candidateToken(input.companyId, source.id, candidates);
  if (currentToken !== input.snapshot.sourceToken) {
    throw new ReplacementAttachmentSnapshotError("SOURCE_ATTACHMENTS_STALE", undefined, 409);
  }

  const selectedIds = input.snapshot.selectedAttachmentIds.map((id) => id.trim()).filter(Boolean);
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SELECTION_INVALID");
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (selectedIds.some((id) => !candidateById.has(id))) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SELECTION_INVALID");
  }

  const now = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  await input.client.execute(
    `
      INSERT INTO part_attachment_reuse_snapshots (
        id, company_id, part_number_draft_id, source_part_number_id, source_token,
        selection_fingerprint, candidate_count, selected_count, new_count, created_by, created_at
      ) VALUES (
        :id, :companyId, :draftId, :sourcePartNumberId, :sourceToken,
        :fingerprint, :candidateCount, :selectedCount, :newCount, :createdBy, :createdAt
      )
    `,
    {
      id: snapshotId,
      companyId: input.companyId,
      draftId: input.draftId,
      sourcePartNumberId: source.id,
      sourceToken: currentToken,
      fingerprint,
      candidateCount: candidates.length,
      selectedCount: selectedIds.length,
      newCount: input.snapshot.newAttachments.length,
      createdBy: input.actorUserId,
      createdAt: now
    }
  );

  const targetByContent = new Map<string, string>();
  const targetAssets: Array<{ id: string; source: CandidateRow | PreparedReplacementAttachment }> = [];
  const origins: Array<{
    targetId: string;
    originKind: "inherited" | "new";
    originKey: string;
    sourceId: string | null;
  }> = [];
  const sortedNew = [...input.snapshot.newAttachments].sort((a, b) => a.ordinal - b.ordinal || a.clientKey.localeCompare(b.clientKey));
  for (const item of sortedNew) {
    const contentKey = dedupeKey(item.contentHash, item.fileSize, `new:${item.clientKey}`);
    let targetId = targetByContent.get(contentKey);
    if (!targetId) {
      targetId = crypto.randomUUID();
      targetByContent.set(contentKey, targetId);
      targetAssets.push({ id: targetId, source: item });
    }
    origins.push({
      targetId,
      originKind: "new",
      originKey: `new:${item.clientKey}`,
      sourceId: null
    });
  }

  for (const candidate of candidates.filter((item) => selectedIds.includes(item.id))) {
    const contentKey = dedupeKey(candidate.content_hash, candidate.file_size ?? 0, `source:${candidate.id}`);
    let targetId = targetByContent.get(contentKey);
    if (!targetId) {
      targetId = crypto.randomUUID();
      targetByContent.set(contentKey, targetId);
      targetAssets.push({ id: targetId, source: candidate });
    }
    origins.push({
      targetId,
      originKind: "inherited",
      originKey: candidate.id,
      sourceId: candidate.id
    });
  }

  await insertTargetFileAssets(input.client, {
    draftId: input.draftId,
    actorUserId: input.actorUserId,
    now,
    assets: targetAssets
  });
  await insertOrigins(input.client, {
    companyId: input.companyId,
    snapshotId,
    actorUserId: input.actorUserId,
    now,
    origins
  });

  await new AsyncAuditRepository(input.client).createAuditLog({
    actorId: input.actorUserId,
    action: "numbering.replacement_part.attachments_snapshot",
    detail: {
      companyId: input.companyId,
      draftId: input.draftId,
      sourcePartNumberId: source.id,
      candidateCount: candidates.length,
      selectedCount: selectedIds.length,
      newCount: sortedNew.length,
      targetCount: targetByContent.size
    }
  });
  return { snapshotId, idempotentReplay: false };
}

export async function promoteReplacementPartAttachmentsAsync(input: {
  client: AsyncDatabaseClient;
  companyId: string;
  draftId: string;
  partNumberId: string;
  actorUserId: string;
}) {
  const snapshot = await input.client.queryOne<{ id: string }>(
    `SELECT id FROM part_attachment_reuse_snapshots WHERE company_id = :companyId AND part_number_draft_id = :draftId`,
    { companyId: input.companyId, draftId: input.draftId }
  );
  if (!snapshot) {
    const sourceCount = await input.client.queryOne<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM part_number_drafts draft
        JOIN file_assets asset
          ON asset.linked_entity_type = 'part_number'
         AND asset.linked_entity_id = draft.source_part_number_id
         AND asset.deleted_at IS NULL
         AND asset.document_category NOT IN ('drawing_2d', 'cad_3d')
        WHERE draft.id = :draftId AND draft.company_id = :companyId
      `,
      { companyId: input.companyId, draftId: input.draftId }
    );
    if (Number(sourceCount?.count ?? 0) > 0) {
      throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SNAPSHOT_REQUIRED", undefined, 409);
    }
    return { promoted: 0, legacyEmptySource: true };
  }

  const integrity = await input.client.queryOne<{ expected_count: number | string; valid_count: number | string }>(
    `
      SELECT
        COUNT(DISTINCT origin.target_file_asset_id) AS expected_count,
        COUNT(DISTINCT CASE
          WHEN asset.linked_entity_type = 'part_number_draft'
           AND asset.linked_entity_id = :draftId
           AND asset.deleted_at IS NULL
          THEN asset.id
        END) AS valid_count
      FROM part_attachment_reuse_origins origin
      LEFT JOIN file_assets asset ON asset.id = origin.target_file_asset_id
      WHERE origin.company_id = :companyId AND origin.snapshot_id = :snapshotId
    `,
    { companyId: input.companyId, draftId: input.draftId, snapshotId: snapshot.id }
  );
  const before = await input.client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count FROM file_assets WHERE linked_entity_type = 'part_number_draft' AND linked_entity_id = :draftId AND deleted_at IS NULL`,
    { draftId: input.draftId }
  );
  const expectedOriginCount = Number(integrity?.expected_count ?? 0);
  if (
    expectedOriginCount !== Number(integrity?.valid_count ?? 0) ||
    expectedOriginCount !== Number(before?.count ?? 0)
  ) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_PROMOTION_INCOMPLETE", undefined, 409);
  }
  await input.client.execute(
    `
      UPDATE file_assets
      SET linked_entity_type = 'part_number', linked_entity_id = :partNumberId, updated_at = :updatedAt
      WHERE linked_entity_type = 'part_number_draft'
        AND linked_entity_id = :draftId
        AND deleted_at IS NULL
        AND id IN (
          SELECT origin.target_file_asset_id
          FROM part_attachment_reuse_origins origin
          WHERE origin.company_id = :companyId AND origin.snapshot_id = :snapshotId
        )
    `,
    {
      companyId: input.companyId,
      snapshotId: snapshot.id,
      partNumberId: input.partNumberId,
      draftId: input.draftId,
      updatedAt: new Date().toISOString()
    }
  );
  const expected = expectedOriginCount;
  const after = await input.client.queryOne<{ expected_count: number | string; valid_count: number | string }>(
    `
      SELECT
        COUNT(DISTINCT origin.target_file_asset_id) AS expected_count,
        COUNT(DISTINCT CASE
          WHEN asset.linked_entity_type = 'part_number'
           AND asset.linked_entity_id = :partNumberId
           AND asset.deleted_at IS NULL
          THEN asset.id
        END) AS valid_count
      FROM part_attachment_reuse_origins origin
      LEFT JOIN file_assets asset ON asset.id = origin.target_file_asset_id
      WHERE origin.company_id = :companyId AND origin.snapshot_id = :snapshotId
    `,
    { companyId: input.companyId, partNumberId: input.partNumberId, snapshotId: snapshot.id }
  );
  if (Number(after?.expected_count ?? 0) !== Number(after?.valid_count ?? 0)) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_PROMOTION_INCOMPLETE", undefined, 409);
  }
  await new AsyncAuditRepository(input.client).createAuditLog({
    actorId: input.actorUserId,
    action: "numbering.replacement_part.attachments_promoted",
    detail: { companyId: input.companyId, draftId: input.draftId, partNumberId: input.partNumberId, promoted: expected }
  });
  return { promoted: expected, legacyEmptySource: false };
}

function normalizeSnapshotCommand(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object") {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SNAPSHOT_INVALID");
  }
  const row = value as Record<string, unknown>;
  const sourcePartNumberId = String(row.sourcePartNumberId ?? row.source_part_number_id ?? "").trim();
  const sourceToken = String(row.sourceToken ?? row.source_token ?? "").trim();
  const selectedRaw = row.selectedAttachmentIds ?? row.selected_attachment_ids;
  const selectedAttachmentIds = Array.isArray(selectedRaw) ? selectedRaw.map((item) => String(item).trim()).filter(Boolean) : [];
  const newRaw = row.newItems ?? row.new_items;
  const newItems = Array.isArray(newRaw)
    ? newRaw.map((value, index) => normalizeNewItem(value, index))
    : [];
  if (!sourcePartNumberId || !sourceToken) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_SNAPSHOT_INVALID");
  }
  return { sourcePartNumberId, sourceToken, selectedAttachmentIds, newItems };
}

function normalizeNewItem(value: unknown, index: number): ReplacementAttachmentNewItemCommand {
  if (!value || typeof value !== "object") throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_INVALID");
  const row = value as Record<string, unknown>;
  const clientKey = String(row.clientKey ?? row.client_key ?? "").trim();
  const ordinal = Number(row.ordinal ?? index);
  if (!clientKey || !Number.isInteger(ordinal) || ordinal < 0) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_INVALID");
  }
  return {
    clientKey,
    ordinal,
    displayName: nullableText(row.displayName ?? row.display_name) ?? undefined,
    description: nullableText(row.description) ?? undefined,
    documentCategory: nullableText(row.documentCategory ?? row.document_category) ?? undefined,
    revision: nullableText(row.revision)
  };
}

async function prepareReplacementAttachmentUploads(
  commands: ReplacementAttachmentNewItemCommand[],
  files: Map<string, File>,
  companyCodeValue: string
) {
  if (commands.length !== files.size || commands.some((item) => !files.has(item.clientKey))) {
    throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_INVALID", "New attachment files do not match the command");
  }
  const companyCode = sanitizeSegment(String(companyCodeValue ?? "company"));
  const storage = createFileStorageService();
  const storedByContent = new Map<string, Awaited<ReturnType<typeof storage.putObject>>>();
  const result: PreparedReplacementAttachment[] = [];
  for (const command of [...commands].sort((a, b) => a.ordinal - b.ordinal || a.clientKey.localeCompare(b.clientKey))) {
    const file = files.get(command.clientKey)!;
    const policy = getMasterAttachmentUploadPolicy();
    const validation = validateStorageUploadFile(file, policy);
    if (!validation.ok) {
      throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_TOO_LARGE", undefined, 413);
    }
    const fileName = file.name.trim();
    if (!fileName || file.size <= 0) throw new ReplacementAttachmentSnapshotError("REPLACEMENT_ATTACHMENT_FILE_INVALID");
    const bytes = Buffer.from(await file.arrayBuffer());
    const contentHash = sha256(bytes);
    const contentKey = `${contentHash}:${bytes.byteLength}`;
    let stored = storedByContent.get(contentKey);
    if (!stored) {
      stored = await storage.putObject({
        key: buildStorageKey(["replacement-part-attachments", companyCode, contentHash.slice(0, 2), contentHash]),
        bytes,
        contentType: file.type || undefined
      });
      storedByContent.set(contentKey, stored);
    }
    result.push({
      clientKey: command.clientKey,
      ordinal: command.ordinal,
      fileName,
      fileExt: fileExtension(fileName),
      mimeType: file.type || "application/octet-stream",
      fileSize: bytes.byteLength,
      contentHash,
      storageProvider: stored.provider,
      originalPath: stored.localPath || null,
      storageBucket: stored.bucket ?? null,
      storageKey: stored.key,
      storageGeneration: null,
      storageMetageneration: null,
      displayName: command.displayName?.trim() || fileName,
      description: command.description?.trim() || "",
      documentCategory: command.documentCategory?.trim() || "other",
      revision: command.revision?.trim() || null
    });
  }
  return result;
}

async function resolveSourcePart(
  client: AsyncDatabaseClient,
  input: { companyId: string; sourcePartNumber?: string; sourcePartNumberId?: string }
) {
  if (input.sourcePartNumberId) {
    return client.queryOne<SourcePartRow>(
      `SELECT id, part_number, company_id FROM part_numbers WHERE company_id = :companyId AND id = :id LIMIT 1`,
      { companyId: input.companyId, id: input.sourcePartNumberId }
    );
  }
  return client.queryOne<SourcePartRow>(
    `SELECT id, part_number, company_id FROM part_numbers WHERE company_id = :companyId AND part_number = :partNumber LIMIT 1`,
    { companyId: input.companyId, partNumber: input.sourcePartNumber ?? "" }
  );
}

function listCandidateRows(client: AsyncDatabaseClient, companyId: string, sourcePartNumberId: string) {
  return client.query<CandidateRow>(
    `
      SELECT
        asset.id, asset.storage_provider, asset.original_path, asset.storage_bucket, asset.storage_key,
        asset.storage_generation, asset.storage_metageneration, asset.file_name, asset.file_ext,
        asset.mime_type, asset.file_size, asset.content_hash, asset.hash_algorithm,
        asset.document_category, asset.display_name, asset.description, asset.revision,
        asset.sync_status, asset.updated_at
      FROM file_assets asset
      JOIN part_numbers part
        ON part.id = asset.linked_entity_id
       AND part.company_id = :companyId
      WHERE asset.linked_entity_type = 'part_number'
        AND asset.linked_entity_id = :sourcePartNumberId
        AND asset.deleted_at IS NULL
        AND asset.document_category NOT IN ('drawing_2d', 'cad_3d')
      ORDER BY asset.id ASC
    `,
    { companyId, sourcePartNumberId }
  );
}

function candidateToken(companyId: string, sourcePartNumberId: string, rows: CandidateRow[]) {
  return sha256Text(
    JSON.stringify({
      v: 1,
      companyId,
      sourcePartNumberId,
      candidates: rows.map((row) => ({
        id: row.id,
        updatedAt: row.updated_at,
        contentHash: row.content_hash,
        fileSize: row.file_size,
        storageProvider: row.storage_provider,
        storageBucket: row.storage_bucket,
        storageKey: row.storage_key,
        storageGeneration: row.storage_generation
      }))
    })
  );
}

function mapCandidate(row: CandidateRow): ReplacementAttachmentCandidate {
  return {
    id: row.id,
    fileName: row.file_name,
    displayName: row.display_name || row.file_name,
    documentCategory: row.document_category,
    fileSize: Number(row.file_size ?? 0),
    updatedAt: row.updated_at
  };
}

async function insertTargetFileAssets(
  client: AsyncDatabaseClient,
  input: {
    draftId: string;
    actorUserId: string;
    now: string;
    assets: Array<{ id: string; source: CandidateRow | PreparedReplacementAttachment }>;
  }
) {
  if (input.assets.length === 0) return;
  const params: Record<string, unknown> = {};
  const values = input.assets.map((asset, index) => {
    const source = asset.source;
    const prepared = "clientKey" in source;
    Object.assign(params, {
      [`id${index}`]: asset.id,
      [`storageProvider${index}`]: prepared ? source.storageProvider : source.storage_provider,
      [`originalPath${index}`]: prepared ? source.originalPath : source.original_path,
      [`storageBucket${index}`]: prepared ? source.storageBucket : source.storage_bucket,
      [`storageKey${index}`]: prepared ? source.storageKey : source.storage_key,
      [`storageGeneration${index}`]: prepared ? source.storageGeneration : source.storage_generation,
      [`storageMetageneration${index}`]: prepared ? source.storageMetageneration : source.storage_metageneration,
      [`fileName${index}`]: prepared ? source.fileName : source.file_name,
      [`fileExt${index}`]: prepared ? source.fileExt : source.file_ext,
      [`mimeType${index}`]: prepared ? source.mimeType : source.mime_type,
      [`fileSize${index}`]: prepared ? source.fileSize : source.file_size,
      [`contentHash${index}`]: prepared ? source.contentHash : source.content_hash,
      [`hashAlgorithm${index}`]: prepared ? "SHA-256" : source.hash_algorithm,
      [`draftId${index}`]: input.draftId,
      [`documentCategory${index}`]: prepared ? source.documentCategory : source.document_category,
      [`displayName${index}`]: prepared ? source.displayName : source.display_name || source.file_name,
      [`description${index}`]: source.description,
      [`revision${index}`]: source.revision,
      [`uploadedBy${index}`]: input.actorUserId,
      [`syncStatus${index}`]: prepared ? "local_only" : source.sync_status,
      [`createdAt${index}`]: input.now,
      [`updatedAt${index}`]: input.now
    });
    return `(
      :id${index}, :storageProvider${index}, :originalPath${index}, :storageBucket${index}, :storageKey${index},
      :storageGeneration${index}, :storageMetageneration${index}, :fileName${index}, :fileExt${index},
      :mimeType${index}, :fileSize${index}, :contentHash${index}, :hashAlgorithm${index},
      'part_number_draft', :draftId${index}, :documentCategory${index}, :displayName${index},
      :description${index}, :revision${index}, :uploadedBy${index}, 'none', :syncStatus${index},
      :createdAt${index}, :updatedAt${index}
    )`;
  });
  await client.execute(
    `
      INSERT INTO file_assets (
        id, storage_provider, original_path, storage_bucket, storage_key, storage_generation, storage_metageneration,
        file_name, file_ext, mime_type, file_size, content_hash, hash_algorithm,
        linked_entity_type, linked_entity_id, document_category, display_name, description, revision,
        uploaded_by, gdrive_status, sync_status, created_at, updated_at
      ) VALUES ${values.join(",\n")}
    `,
    params
  );
}

function insertOrigins(
  client: AsyncDatabaseClient,
  input: {
    companyId: string;
    snapshotId: string;
    actorUserId: string;
    now: string;
    origins: Array<{
      targetId: string;
      originKind: "inherited" | "new";
      originKey: string;
      sourceId: string | null;
    }>;
  }
) {
  if (input.origins.length === 0) return Promise.resolve();
  const params: Record<string, unknown> = {};
  const values = input.origins.map((origin, index) => {
    Object.assign(params, {
      [`id${index}`]: crypto.randomUUID(),
      [`companyId${index}`]: input.companyId,
      [`snapshotId${index}`]: input.snapshotId,
      [`targetId${index}`]: origin.targetId,
      [`originKind${index}`]: origin.originKind,
      [`originKey${index}`]: origin.originKey,
      [`sourceId${index}`]: origin.sourceId,
      [`createdBy${index}`]: input.actorUserId,
      [`createdAt${index}`]: input.now
    });
    return `(
      :id${index}, :companyId${index}, :snapshotId${index}, :targetId${index}, :originKind${index},
      :originKey${index}, :sourceId${index}, :createdBy${index}, :createdAt${index}
    )`;
  });
  return client.execute(
    `
      INSERT INTO part_attachment_reuse_origins (
        id, company_id, snapshot_id, target_file_asset_id, origin_kind, origin_key,
        source_file_asset_id, created_by, created_at
      ) VALUES ${values.join(",\n")}
    `,
    params
  );
}

function dedupeKey(hash: string | null, size: number, fallback: string) {
  return hash ? `${hash.toLowerCase()}:${size}` : fallback;
}

function sha256Text(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fileExtension(fileName: string) {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(index + 1).toLowerCase() : "";
}

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "company";
}

function nullableText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}
