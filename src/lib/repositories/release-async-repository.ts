import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import { mapReadQueryBatches } from "@/lib/repositories/read-query-batch";
import type { ProcurementSyncRun, ReadonlyShare, ReleasePackage, SupplierPortalResponse } from "@/lib/types";

export const SELECT_ASYNC_RELEASE_PACKAGE_BY_SUBMISSION_SQL = `
  SELECT *
  FROM release_packages
  WHERE submission_id = :submissionId
`;

export const UPSERT_ASYNC_RELEASE_PACKAGE_SQL = `
  INSERT INTO release_packages (
    id, submission_id, package_filename, local_path, storage_provider, storage_bucket, storage_key, sha256, file_size, manifest_json, created_by, created_at
  ) VALUES (:id, :submissionId, :packageFilename, :localPath, :storageProvider, :storageBucket, :storageKey, :sha256, :fileSize, :manifestJson, :createdBy, :now)
  ON CONFLICT(submission_id) DO UPDATE SET
    package_filename = excluded.package_filename,
    local_path = excluded.local_path,
    storage_provider = excluded.storage_provider,
    storage_bucket = excluded.storage_bucket,
    storage_key = excluded.storage_key,
    sha256 = excluded.sha256,
    file_size = excluded.file_size,
    manifest_json = excluded.manifest_json,
    created_by = excluded.created_by,
    created_at = excluded.created_at
`;

export const SELECT_ASYNC_RELEASED_FILENAME_CONFLICT_SQL = `
  SELECT
    s.id AS submission_id,
    s.drawing_number,
    s.revision,
    f.file_role,
    f.original_filename
  FROM submission_files f
  JOIN submissions s ON s.id = f.submission_id
  JOIN submissions current_submission ON current_submission.id = :submissionId
  WHERE s.status = 'Released'
    AND s.id <> current_submission.id
    AND s.item_id <> current_submission.item_id
    AND f.file_role = :fileRole
    AND lower(f.original_filename) = lower(:originalFilename)
    AND (:sha256 IS NULL OR lower(COALESCE(f.sha256, '')) <> lower(:sha256))
  ORDER BY COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
  LIMIT 1
`;

function selectReleasedFilenameConflictsSql(predicates: string) {
  return `
    SELECT
      s.id AS submission_id,
      s.drawing_number,
      s.revision,
      f.file_role,
      f.original_filename
    FROM submission_files f
    JOIN submissions s ON s.id = f.submission_id
    JOIN submissions current_submission ON current_submission.id = :submissionId
    WHERE s.status = 'Released'
      AND s.id <> current_submission.id
      AND s.item_id <> current_submission.item_id
      AND (${predicates})
    ORDER BY COALESCE(s.released_at, s.updated_at, s.created_at) DESC, s.id DESC
  `;
}

export const SELECT_ASYNC_PROCUREMENT_SYNC_RUNS_SQL = `
  SELECT
    psr.*,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    creator.display_name AS created_by_name,
    acknowledger.display_name AS acknowledged_by_name
  FROM procurement_sync_runs psr
  JOIN submissions s ON s.id = psr.submission_id
  JOIN items i ON i.id = s.item_id
  JOIN users creator ON creator.id = psr.created_by
  LEFT JOIN users acknowledger ON acknowledger.id = psr.acknowledged_by
  WHERE (:submissionId IS NULL OR psr.submission_id = :submissionId)
    AND (:targetSystem IS NULL OR psr.target_system = :targetSystem)
  ORDER BY psr.created_at DESC, psr.id DESC
`;

export const SELECT_ASYNC_READONLY_SHARE_BY_TOKEN_HASH_SQL = `
  SELECT
    rs.*,
    creator.display_name AS created_by_name,
    revoker.display_name AS revoked_by_name,
    (
      SELECT COUNT(*)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
    ) AS response_count,
    (
      SELECT COUNT(*)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
        AND spr.status = 'open'
    ) AS open_response_count,
    (
      SELECT MAX(spr.created_at)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
    ) AS latest_response_at
  FROM readonly_shares rs
  JOIN users creator ON creator.id = rs.created_by
  LEFT JOIN users revoker ON revoker.id = rs.revoked_by
  WHERE rs.token_hash = :tokenHash
  LIMIT 1
`;

export const SELECT_ASYNC_READONLY_SHARES_SQL = `
  SELECT
    rs.*,
    creator.display_name AS created_by_name,
    revoker.display_name AS revoked_by_name,
    (
      SELECT COUNT(*)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
    ) AS response_count,
    (
      SELECT COUNT(*)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
        AND spr.status = 'open'
    ) AS open_response_count,
    (
      SELECT MAX(spr.created_at)
      FROM supplier_portal_responses spr
      WHERE spr.share_id = rs.id
    ) AS latest_response_at
  FROM readonly_shares rs
  JOIN users creator ON creator.id = rs.created_by
  LEFT JOIN users revoker ON revoker.id = rs.revoked_by
  WHERE rs.submission_id = :submissionId
  ORDER BY rs.created_at DESC, rs.id DESC
`;

export const INSERT_ASYNC_READONLY_SHARE_SQL = `
  INSERT INTO readonly_shares (
    id, submission_id, token_hash, label, expires_at, created_by, access_count, created_at, updated_at
  ) VALUES (:id, :submissionId, :tokenHash, :label, :expiresAt, :createdBy, 0, :now, :now)
`;

export const REVOKE_ASYNC_READONLY_SHARE_SQL = `
  UPDATE readonly_shares
  SET revoked_at = COALESCE(revoked_at, :now),
      revoked_by = COALESCE(revoked_by, :revokedBy),
      updated_at = :now
  WHERE id = :shareId
    AND submission_id = :submissionId
`;

export const UPDATE_ASYNC_READONLY_SHARE_ACCESS_SQL = `
  UPDATE readonly_shares
  SET access_count = access_count + 1,
      last_accessed_at = :now,
      updated_at = :now
  WHERE id = :shareId
    AND submission_id = :submissionId
`;

export const SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL = `
  SELECT
    spr.*,
    rs.label AS share_label,
    closer.display_name AS closed_by_name
  FROM supplier_portal_responses spr
  JOIN readonly_shares rs ON rs.id = spr.share_id
  LEFT JOIN users closer ON closer.id = spr.closed_by
  WHERE spr.submission_id = :submissionId
    AND (:shareId IS NULL OR spr.share_id = :shareId)
  ORDER BY
    CASE spr.status WHEN 'open' THEN 0 ELSE 1 END,
    spr.created_at DESC,
    spr.id DESC
`;

export const SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL = `
  SELECT
    spr.*,
    rs.label AS share_label,
    closer.display_name AS closed_by_name
  FROM supplier_portal_responses spr
  JOIN readonly_shares rs ON rs.id = spr.share_id
  LEFT JOIN users closer ON closer.id = spr.closed_by
  WHERE spr.submission_id = :submissionId
    AND spr.id = :responseId
  LIMIT 1
`;

export const INSERT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL = `
  INSERT INTO supplier_portal_responses (
    id, share_id, submission_id, response_kind, supplier_name, supplier_email, message, status, created_at, updated_at
  ) VALUES (:id, :shareId, :submissionId, :responseKind, :supplierName, :supplierEmail, :message, 'open', :now, :now)
`;

export const CLOSE_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL = `
  UPDATE supplier_portal_responses
  SET status = 'closed',
      closed_by = :closedBy,
      closed_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :responseId
`;

export const SELECT_ASYNC_PROCUREMENT_SYNC_RUN_BY_ID_SQL = `
  SELECT
    psr.*,
    s.drawing_number,
    s.revision,
    i.part_number,
    i.part_name,
    creator.display_name AS created_by_name,
    acknowledger.display_name AS acknowledged_by_name
  FROM procurement_sync_runs psr
  JOIN submissions s ON s.id = psr.submission_id
  JOIN items i ON i.id = s.item_id
  JOIN users creator ON creator.id = psr.created_by
  LEFT JOIN users acknowledger ON acknowledger.id = psr.acknowledged_by
  WHERE psr.id = :runId
  LIMIT 1
`;

export const INSERT_ASYNC_PROCUREMENT_SYNC_RUN_SQL = `
  INSERT INTO procurement_sync_runs (
    id, submission_id, target_system, status, payload_json, response_json, external_reference, created_by, created_at, updated_at
  ) VALUES (:id, :submissionId, :targetSystem, 'sent', :payloadJson, '{}', :externalReference, :createdBy, :now, :now)
`;

export const DECIDE_ASYNC_PROCUREMENT_SYNC_RUN_SQL = `
  UPDATE procurement_sync_runs
  SET status = :status,
      response_json = :responseJson,
      external_reference = COALESCE(:externalReference, external_reference),
      acknowledged_by = :actorId,
      acknowledged_at = :now,
      updated_at = :now
  WHERE id = :runId
`;

export type AsyncReleasedFilenameConflict = {
  submission_id: string;
  drawing_number: string;
  revision: string;
  file_role: string;
  original_filename: string;
};

function releasedFilenameKey(fileRole: string, originalFilename: string) {
  return `${fileRole}\u0000${originalFilename.toLowerCase()}`;
}

export class AsyncReleaseRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getReleasePackageBySubmissionId(submissionId: string): Promise<ReleasePackage | null> {
    const record = await this.client.queryOne<ReleasePackage>(SELECT_ASYNC_RELEASE_PACKAGE_BY_SUBMISSION_SQL, {
      submissionId
    });
    return record ? normalizeReleasePackage(record) : null;
  }

  async upsertReleasePackageRecord(input: {
    submissionId: string;
    packageFilename: string;
    localPath: string;
    storageProvider?: "local_repository" | "supabase_storage" | "s3_compatible" | "google_cloud_storage";
    storageBucket?: string | null;
    storageKey?: string | null;
    sha256: string;
    fileSize: number;
    manifestJson: string;
    createdBy: string;
  }): Promise<ReleasePackage | null> {
    await this.client.execute(UPSERT_ASYNC_RELEASE_PACKAGE_SQL, {
      id: this.idFactory(),
      submissionId: input.submissionId,
      packageFilename: input.packageFilename,
      localPath: input.localPath,
      storageProvider: input.storageProvider ?? "local_repository",
      storageBucket: input.storageBucket ?? null,
      storageKey: input.storageKey ?? null,
      sha256: input.sha256,
      fileSize: input.fileSize,
      manifestJson: input.manifestJson,
      createdBy: input.createdBy,
      now: this.clock()
    });
    return this.getReleasePackageBySubmissionId(input.submissionId);
  }

  async findReleasedFilenameConflicts(input: {
    submissionId: string;
    files: Array<{ file_role: string; original_filename: string; sha256?: string | null }>;
  }): Promise<AsyncReleasedFilenameConflict[]> {
    if (input.files.length === 0) return [];

    const batches = await mapReadQueryBatches(input.files, async (files) => {
      const params: Record<string, unknown> = { submissionId: input.submissionId };
      const predicates = files.map((file, index) => {
        params[`fileRole${index}`] = file.file_role;
        params[`originalFilename${index}`] = file.original_filename;
        params[`sha256${index}`] = file.sha256?.trim() || null;
        return `(f.file_role = :fileRole${index} AND lower(f.original_filename) = lower(:originalFilename${index}) AND (:sha256${index} IS NULL OR lower(COALESCE(f.sha256, '')) <> lower(:sha256${index})))`;
      });
      return this.client.query<AsyncReleasedFilenameConflict>(selectReleasedFilenameConflictsSql(predicates.join(" OR ")), params);
    });
    const conflictByKey = new Map<string, AsyncReleasedFilenameConflict>();
    for (const conflict of batches.flat()) {
      const key = releasedFilenameKey(conflict.file_role, conflict.original_filename);
      if (!conflictByKey.has(key)) conflictByKey.set(key, conflict);
    }
    return input.files.flatMap((file) => {
      const conflict = conflictByKey.get(releasedFilenameKey(file.file_role, file.original_filename));
      return conflict ? [conflict] : [];
    });
  }

  async listProcurementSyncRuns(input: {
    submissionId?: string;
    targetSystem?: ProcurementSyncRun["target_system"];
  } = {}): Promise<ProcurementSyncRun[]> {
    return this.client.query<ProcurementSyncRun>(SELECT_ASYNC_PROCUREMENT_SYNC_RUNS_SQL, {
      submissionId: input.submissionId ?? null,
      targetSystem: input.targetSystem ?? null
    });
  }

  async getProcurementSyncRun(runId: string): Promise<ProcurementSyncRun | null> {
    return this.client.queryOne<ProcurementSyncRun>(SELECT_ASYNC_PROCUREMENT_SYNC_RUN_BY_ID_SQL, { runId });
  }

  async createProcurementSyncRun(input: {
    submissionId: string;
    targetSystem: ProcurementSyncRun["target_system"];
    payload: Record<string, unknown>;
    externalReference?: string;
    createdBy: string;
  }): Promise<ProcurementSyncRun | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_PROCUREMENT_SYNC_RUN_SQL, {
      id,
      submissionId: input.submissionId,
      targetSystem: input.targetSystem,
      payloadJson: JSON.stringify(input.payload),
      externalReference: input.externalReference ?? null,
      createdBy: input.createdBy,
      now
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: input.submissionId,
      actorId: input.createdBy,
      action: "ProcurementSyncSent",
      detail: {
        runId: id,
        targetSystem: input.targetSystem,
        externalReference: input.externalReference ?? null
      }
    });

    return this.getProcurementSyncRun(id);
  }

  async decideProcurementSyncRun(input: {
    runId: string;
    actorId: string;
    status: "acknowledged" | "failed";
    externalReference?: string;
    response: Record<string, unknown>;
  }): Promise<
    | { ok: true; run: ProcurementSyncRun | null }
    | { ok: false; status: 404 | 409; error: string }
  > {
    const existing = await this.getProcurementSyncRun(input.runId);
    if (!existing) return { ok: false, status: 404, error: "PROCUREMENT_SYNC_RUN_NOT_FOUND" };
    if (existing.status !== "sent") return { ok: false, status: 409, error: "PROCUREMENT_SYNC_RUN_ALREADY_DECIDED" };

    const now = this.clock();
    await this.client.execute(DECIDE_ASYNC_PROCUREMENT_SYNC_RUN_SQL, {
      runId: input.runId,
      status: input.status,
      responseJson: JSON.stringify(input.response),
      externalReference: input.externalReference ?? null,
      actorId: input.actorId,
      now
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: existing.submission_id,
      actorId: input.actorId,
      action: input.status === "acknowledged" ? "ProcurementSyncAcknowledged" : "ProcurementSyncFailed",
      detail: {
        runId: input.runId,
        externalReference: input.externalReference ?? existing.external_reference
      }
    });

    return { ok: true, run: await this.getProcurementSyncRun(input.runId) };
  }

  async getReadonlyShareByTokenHash(tokenHash: string): Promise<(ReadonlyShare & { token_hash: string }) | null> {
    const row = await this.client.queryOne<ReadonlyShareRow>(SELECT_ASYNC_READONLY_SHARE_BY_TOKEN_HASH_SQL, {
      tokenHash
    });
    if (!row) return null;
    return { ...normalizeReadonlyShare(row), token_hash: row.token_hash };
  }

  async listReadonlyShares(submissionId: string): Promise<ReadonlyShare[]> {
    const rows = await this.client.query<ReadonlyShareRow>(SELECT_ASYNC_READONLY_SHARES_SQL, { submissionId });
    return rows.map(normalizeReadonlyShare);
  }

  async createReadonlyShare(input: {
    submissionId: string;
    tokenHash: string;
    label: string;
    expiresAt: string;
    createdBy: string;
  }): Promise<ReadonlyShare | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_READONLY_SHARE_SQL, {
      id,
      submissionId: input.submissionId,
      tokenHash: input.tokenHash,
      label: input.label,
      expiresAt: input.expiresAt,
      createdBy: input.createdBy,
      now
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: input.submissionId,
      actorId: input.createdBy,
      action: "ReadonlyShareCreated",
      detail: { shareId: id, label: input.label, expiresAt: input.expiresAt }
    });

    return (await this.listReadonlyShares(input.submissionId)).find((share) => share.id === id) ?? null;
  }

  async revokeReadonlyShare(input: {
    submissionId: string;
    shareId: string;
    revokedBy: string;
  }): Promise<ReadonlyShare | null> {
    const existing = (await this.listReadonlyShares(input.submissionId)).find((share) => share.id === input.shareId) ?? null;
    if (!existing) return null;

    await this.client.execute(REVOKE_ASYNC_READONLY_SHARE_SQL, {
      submissionId: input.submissionId,
      shareId: input.shareId,
      revokedBy: input.revokedBy,
      now: this.clock()
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: input.submissionId,
      actorId: input.revokedBy,
      action: "ReadonlyShareRevoked",
      detail: { shareId: input.shareId }
    });

    return (await this.listReadonlyShares(input.submissionId)).find((share) => share.id === input.shareId) ?? null;
  }

  async recordReadonlyShareAccess(input: { submissionId: string; shareId: string }): Promise<void> {
    await this.client.execute(UPDATE_ASYNC_READONLY_SHARE_ACCESS_SQL, {
      submissionId: input.submissionId,
      shareId: input.shareId,
      now: this.clock()
    });
  }

  async listSupplierPortalResponses(input: { submissionId: string; shareId?: string }): Promise<SupplierPortalResponse[]> {
    return this.client.query<SupplierPortalResponse>(SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSES_SQL, {
      submissionId: input.submissionId,
      shareId: input.shareId ?? null
    });
  }

  async getSupplierPortalResponse(input: { submissionId: string; responseId: string }): Promise<SupplierPortalResponse | null> {
    return this.client.queryOne<SupplierPortalResponse>(SELECT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL, input);
  }

  async createSupplierPortalResponse(input: {
    shareId: string;
    submissionId: string;
    responseKind: SupplierPortalResponse["response_kind"];
    supplierName: string;
    supplierEmail: string;
    message: string;
  }): Promise<SupplierPortalResponse | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL, {
      id,
      shareId: input.shareId,
      submissionId: input.submissionId,
      responseKind: input.responseKind,
      supplierName: input.supplierName,
      supplierEmail: input.supplierEmail,
      message: input.message,
      now
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: input.submissionId,
      actorId: null,
      action: "SupplierPortalResponseCreated",
      detail: {
        shareId: input.shareId,
        responseId: id,
        responseKind: input.responseKind,
        supplierEmail: input.supplierEmail
      }
    });

    return this.getSupplierPortalResponse({ submissionId: input.submissionId, responseId: id });
  }

  async closeSupplierPortalResponse(input: { submissionId: string; responseId: string; closedBy: string }): Promise<
    | { ok: true; response: SupplierPortalResponse | null }
    | { ok: false; status: 404 | 409; error: string }
  > {
    const existing = await this.getSupplierPortalResponse({
      submissionId: input.submissionId,
      responseId: input.responseId
    });
    if (!existing) return { ok: false, status: 404, error: "SUPPLIER_PORTAL_RESPONSE_NOT_FOUND" };
    if (existing.status !== "open") return { ok: false, status: 409, error: "SUPPLIER_PORTAL_RESPONSE_ALREADY_CLOSED" };

    const now = this.clock();
    await this.client.execute(CLOSE_ASYNC_SUPPLIER_PORTAL_RESPONSE_SQL, {
      submissionId: input.submissionId,
      responseId: input.responseId,
      closedBy: input.closedBy,
      now
    });

    await new AsyncAuditRepository(this.client, this.clock, this.idFactory).createAuditLog({
      submissionId: input.submissionId,
      actorId: input.closedBy,
      action: "SupplierPortalResponseClosed",
      detail: { responseId: input.responseId }
    });

    return {
      ok: true,
      response: await this.getSupplierPortalResponse({
        submissionId: input.submissionId,
        responseId: input.responseId
      })
    };
  }
}

function normalizeReleasePackage(record: ReleasePackage): ReleasePackage {
  return {
    ...record,
    file_size: Number(record.file_size ?? 0)
  };
}

type ReadonlyShareRow = Omit<ReadonlyShare, "created_by_name" | "revoked_by_name" | "status"> & {
  token_hash: string;
  created_by_name: string | null;
  revoked_by_name: string | null;
  response_count: number | string | null;
  open_response_count: number | string | null;
  latest_response_at: string | null;
};

function normalizeReadonlyShare(row: ReadonlyShareRow): ReadonlyShare {
  const expired = Date.parse(row.expires_at) <= Date.now();
  return {
    id: row.id,
    submission_id: row.submission_id,
    label: row.label,
    expires_at: row.expires_at,
    created_by: row.created_by,
    created_by_name: row.created_by_name ?? row.created_by,
    revoked_at: row.revoked_at,
    revoked_by: row.revoked_by,
    revoked_by_name: row.revoked_by_name,
    access_count: Number(row.access_count ?? 0),
    last_accessed_at: row.last_accessed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.revoked_at ? "revoked" : expired ? "expired" : "active",
    response_count: Number(row.response_count ?? 0),
    open_response_count: Number(row.open_response_count ?? 0),
    latest_response_at: row.latest_response_at
  };
}
