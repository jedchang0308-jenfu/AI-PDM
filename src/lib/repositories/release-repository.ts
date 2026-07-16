import crypto from "node:crypto";
import { createAuditLog, getDb } from "@/lib/db";
import type { ProcurementSyncRun, ReadonlyShare, ReleasePackage, SupplierPortalResponse } from "@/lib/types";

export function getReleasePackageBySubmissionId(submissionId: string) {
  return getDb()
    .prepare("SELECT * FROM release_packages WHERE submission_id = ?")
    .get(submissionId) as ReleasePackage | undefined;
}

export function upsertReleasePackageRecord(input: {
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
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO release_packages (
        id, submission_id, package_filename, local_path, storage_provider, storage_bucket, storage_key, sha256, file_size, manifest_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    `
    )
    .run(
      id,
      input.submissionId,
      input.packageFilename,
      input.localPath,
      input.storageProvider ?? "local_repository",
      input.storageBucket ?? null,
      input.storageKey ?? null,
      input.sha256,
      input.fileSize,
      input.manifestJson,
      input.createdBy,
      now
    );

  return getReleasePackageBySubmissionId(input.submissionId);
}

type ReadonlyShareRow = Omit<ReadonlyShare, "created_by_name" | "revoked_by_name" | "status"> & {
  token_hash: string;
  created_by_name: string | null;
  revoked_by_name: string | null;
};

function normalizeReadonlyShare(row: ReadonlyShareRow): ReadonlyShare {
  const now = Date.now();
  const expired = Date.parse(row.expires_at) <= now;
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
    access_count: row.access_count,
    last_accessed_at: row.last_accessed_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    status: row.revoked_at ? "revoked" : expired ? "expired" : "active",
    response_count: Number(row.response_count ?? 0),
    open_response_count: Number(row.open_response_count ?? 0),
    latest_response_at: row.latest_response_at
  };
}

const readonlyShareSelect = `
  SELECT
    rs.*,
    creator.display_name AS created_by_name,
    revoker.display_name AS revoked_by_name,
    COUNT(spr.id) AS response_count,
    SUM(CASE WHEN spr.status = 'open' THEN 1 ELSE 0 END) AS open_response_count,
    MAX(spr.created_at) AS latest_response_at
  FROM readonly_shares rs
  JOIN users creator ON creator.id = rs.created_by
  LEFT JOIN users revoker ON revoker.id = rs.revoked_by
  LEFT JOIN supplier_portal_responses spr ON spr.share_id = rs.id
`;

export function listReadonlyShares(submissionId: string): ReadonlyShare[] {
  const rows = getDb()
    .prepare(`${readonlyShareSelect} WHERE rs.submission_id = ? GROUP BY rs.id ORDER BY rs.created_at DESC`)
    .all(submissionId) as ReadonlyShareRow[];
  return rows.map(normalizeReadonlyShare);
}

export function createReadonlyShare(input: {
  submissionId: string;
  tokenHash: string;
  label: string;
  expiresAt: string;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO readonly_shares (
        id, submission_id, token_hash, label, expires_at, created_by, access_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
    `
    )
    .run(id, input.submissionId, input.tokenHash, input.label, input.expiresAt, input.createdBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ReadonlyShareCreated",
    detail: { shareId: id, label: input.label, expiresAt: input.expiresAt }
  });

  return listReadonlyShares(input.submissionId).find((share) => share.id === id) ?? null;
}

export function revokeReadonlyShare(input: { submissionId: string; shareId: string; revokedBy: string }) {
  const now = new Date().toISOString();
  const result = getDb()
    .prepare(
      `
      UPDATE readonly_shares
      SET revoked_at = COALESCE(revoked_at, ?),
          revoked_by = COALESCE(revoked_by, ?),
          updated_at = ?
      WHERE id = ?
        AND submission_id = ?
    `
    )
    .run(now, input.revokedBy, now, input.shareId, input.submissionId);

  if (result.changes === 0) return null;

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.revokedBy,
    action: "ReadonlyShareRevoked",
    detail: { shareId: input.shareId }
  });

  return listReadonlyShares(input.submissionId).find((share) => share.id === input.shareId) ?? null;
}

export function getReadonlyShareByTokenHash(tokenHash: string): (ReadonlyShare & { token_hash: string }) | null {
  const row = getDb()
    .prepare(`${readonlyShareSelect} WHERE rs.token_hash = ? GROUP BY rs.id LIMIT 1`)
    .get(tokenHash) as ReadonlyShareRow | undefined;
  if (!row) return null;
  return { ...normalizeReadonlyShare(row), token_hash: row.token_hash };
}

export function recordReadonlyShareAccess(input: { shareId: string; submissionId: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE readonly_shares
      SET access_count = access_count + 1,
          last_accessed_at = ?,
          updated_at = ?
      WHERE id = ?
        AND submission_id = ?
    `
    )
    .run(now, now, input.shareId, input.submissionId);
}

const supplierPortalResponseSelect = `
  SELECT
    spr.*,
    rs.label AS share_label,
    closer.display_name AS closed_by_name
  FROM supplier_portal_responses spr
  JOIN readonly_shares rs ON rs.id = spr.share_id
  LEFT JOIN users closer ON closer.id = spr.closed_by
`;

export function listSupplierPortalResponses(input: { submissionId: string; shareId?: string }) {
  const values = [input.submissionId];
  const filters = ["spr.submission_id = ?"];
  if (input.shareId) {
    filters.push("spr.share_id = ?");
    values.push(input.shareId);
  }

  return getDb()
    .prepare(
      `
      ${supplierPortalResponseSelect}
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE spr.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(spr.created_at) DESC,
        spr.rowid DESC
    `
    )
    .all(...values) as SupplierPortalResponse[];
}

export function getSupplierPortalResponse(input: { submissionId: string; responseId: string }) {
  return (
    getDb()
      .prepare(`${supplierPortalResponseSelect} WHERE spr.submission_id = ? AND spr.id = ? LIMIT 1`)
      .get(input.submissionId, input.responseId) as SupplierPortalResponse | undefined
  ) ?? null;
}

export function createSupplierPortalResponse(input: {
  shareId: string;
  submissionId: string;
  responseKind: SupplierPortalResponse["response_kind"];
  supplierName: string;
  supplierEmail: string;
  message: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO supplier_portal_responses (
        id, share_id, submission_id, response_kind, supplier_name, supplier_email, message, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `
    )
    .run(id, input.shareId, input.submissionId, input.responseKind, input.supplierName, input.supplierEmail, input.message, now, now);

  createAuditLog({
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

  return getSupplierPortalResponse({ submissionId: input.submissionId, responseId: id });
}

export function closeSupplierPortalResponse(input: { submissionId: string; responseId: string; closedBy: string }) {
  const existing = getSupplierPortalResponse({ submissionId: input.submissionId, responseId: input.responseId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到供應商入口回覆" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的供應商回覆可以關閉" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE supplier_portal_responses
      SET status = 'closed', closed_by = ?, closed_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.closedBy, now, now, input.submissionId, input.responseId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.closedBy,
    action: "SupplierPortalResponseClosed",
    detail: { responseId: input.responseId }
  });

  return { ok: true as const, response: getSupplierPortalResponse({ submissionId: input.submissionId, responseId: input.responseId }) };
}

const procurementSyncRunSelect = `
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
`;

export function listProcurementSyncRuns(input: { submissionId?: string; targetSystem?: ProcurementSyncRun["target_system"] } = {}) {
  const filters: string[] = [];
  const values: string[] = [];
  if (input.submissionId) {
    filters.push("psr.submission_id = ?");
    values.push(input.submissionId);
  }
  if (input.targetSystem) {
    filters.push("psr.target_system = ?");
    values.push(input.targetSystem);
  }

  return getDb()
    .prepare(
      `
      ${procurementSyncRunSelect}
      ${filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY datetime(psr.created_at) DESC, psr.rowid DESC
    `
    )
    .all(...values) as ProcurementSyncRun[];
}

export function getProcurementSyncRun(runId: string) {
  return (
    getDb()
      .prepare(`${procurementSyncRunSelect} WHERE psr.id = ? LIMIT 1`)
      .get(runId) as ProcurementSyncRun | undefined
  ) ?? null;
}

export function createProcurementSyncRun(input: {
  submissionId: string;
  targetSystem: ProcurementSyncRun["target_system"];
  payload: Record<string, unknown>;
  externalReference?: string;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      INSERT INTO procurement_sync_runs (
        id, submission_id, target_system, status, payload_json, response_json, external_reference, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, 'sent', ?, '{}', ?, ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.targetSystem, JSON.stringify(input.payload), input.externalReference ?? null, input.createdBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "ProcurementSyncSent",
    detail: { runId: id, targetSystem: input.targetSystem, externalReference: input.externalReference ?? null }
  });

  return getProcurementSyncRun(id);
}

export function decideProcurementSyncRun(input: {
  runId: string;
  actorId: string;
  status: "acknowledged" | "failed";
  externalReference?: string;
  response: Record<string, unknown>;
}) {
  const existing = getProcurementSyncRun(input.runId);
  if (!existing) return { ok: false as const, status: 404, error: "找不到採購同步紀錄" };
  if (existing.status !== "sent") return { ok: false as const, status: 409, error: "只有已送出的同步紀錄可以決議" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE procurement_sync_runs
      SET status = ?,
          response_json = ?,
          external_reference = COALESCE(?, external_reference),
          acknowledged_by = ?,
          acknowledged_at = ?,
          updated_at = ?
      WHERE id = ?
    `
    )
    .run(input.status, JSON.stringify(input.response), input.externalReference ?? null, input.actorId, now, now, input.runId);

  createAuditLog({
    submissionId: existing.submission_id,
    actorId: input.actorId,
    action: input.status === "acknowledged" ? "ProcurementSyncAcknowledged" : "ProcurementSyncFailed",
    detail: { runId: input.runId, externalReference: input.externalReference ?? existing.external_reference }
  });

  return { ok: true as const, run: getProcurementSyncRun(input.runId) };
}
