import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError, type WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";

export type PdmWorkReviewRequestRecord = {
  id: string;
  companyId: string;
  requestKind: "drawing_revision" | "drawing_rd_void" | "part_change" | "relation_change";
  entityType: WorkbenchEntityType;
  canonicalEntityId: string;
  workId: string | null;
  branchId: string | null;
  reviewerUserId: string;
  reviewCycleId: string;
  snapshotPayload: unknown;
  snapshotHash: string;
  requestStatus: "pending" | "applying" | "apply_failed";
  rowVersion: number;
};
type ReviewRow = {
  id: string; company_id: string; request_kind: PdmWorkReviewRequestRecord["requestKind"];
  entity_type: WorkbenchEntityType; canonical_entity_id: string; work_id: string | null; branch_id: string | null;
  reviewer_user_id: string; review_cycle_id: string; snapshot_payload: string | unknown; snapshot_hash: string;
  request_status: PdmWorkReviewRequestRecord["requestStatus"]; row_version: number;
};
function map(row: ReviewRow): PdmWorkReviewRequestRecord {
  return {
    id: row.id, companyId: row.company_id, requestKind: row.request_kind, entityType: row.entity_type,
    canonicalEntityId: row.canonical_entity_id, workId: row.work_id, branchId: row.branch_id,
    reviewerUserId: row.reviewer_user_id, reviewCycleId: row.review_cycle_id,
    snapshotPayload: typeof row.snapshot_payload === "string" ? JSON.parse(row.snapshot_payload) : row.snapshot_payload,
    snapshotHash: row.snapshot_hash, requestStatus: row.request_status, rowVersion: Number(row.row_version)
  };
}

export class PdmWorkReviewAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async selectReviewer(tx: AsyncDatabaseClient, input: { companyId: string; ownerUserId: string }) {
    const rows = await tx.query<{ id: string; priority: number }>(
      `SELECT DISTINCT u.id,
          CASE WHEN r.role_code = 'rd_manager' THEN 0 WHEN r.role_code = 'pdm_admin' THEN 1
               WHEN u.role = 'R&D Manager' THEN 2 WHEN u.role = 'Admin' THEN 3 ELSE 4 END AS priority
       FROM users u
       LEFT JOIN user_company_memberships membership ON membership.user_id = u.id AND membership.company_id = :companyId
       LEFT JOIN user_role_assignments assignment ON assignment.user_id = u.id AND assignment.revoked_at IS NULL
       LEFT JOIN roles r ON r.id = assignment.role_id AND r.enabled = 1
       WHERE u.account_status = 'active' AND u.system_role_enabled = 1
         AND (u.company_id = :companyId OR membership.company_id = :companyId)
         AND (u.role IN ('R&D Manager', 'Admin') OR r.role_code IN ('rd_manager', 'pdm_admin'))
       ORDER BY priority, CASE WHEN u.id = :ownerUserId THEN 1 ELSE 0 END, u.id`,
      input
    );
    const reviewer = rows[0]?.id;
    if (!reviewer) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "找不到可指派的審核負責人", 409);
    return reviewer;
  }

  async create(tx: AsyncDatabaseClient, input: {
    companyId: string; requestKind: PdmWorkReviewRequestRecord["requestKind"]; entityType: WorkbenchEntityType;
    canonicalEntityId: string; workId?: string | null; branchId?: string | null; reviewerUserId: string;
    snapshotPayload: unknown; snapshotHash: string;
  }) {
    const id = crypto.randomUUID();
    const reviewCycleId = crypto.randomUUID();
    await tx.execute(
      `INSERT INTO pdm_work_review_requests (
        id, company_id, request_kind, entity_type, canonical_entity_id, work_id, branch_id,
        reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash, request_status, row_version
      ) VALUES (
        :id, :companyId, :requestKind, :entityType, :canonicalEntityId, :workId, :branchId,
        :reviewerUserId, :reviewCycleId, :snapshotPayload, :snapshotHash, 'pending', 1
      )`,
      { ...input, id, reviewCycleId, workId: input.workId ?? null, branchId: input.branchId ?? null, snapshotPayload: JSON.stringify(input.snapshotPayload) }
    );
    return { id, reviewCycleId, rowVersion: 1 };
  }

  async get(tx: AsyncDatabaseClient, input: { companyId: string; requestId: string }, lock = false) {
    const row = await tx.queryOne<ReviewRow>(
      `SELECT id, company_id, request_kind, entity_type, canonical_entity_id, work_id, branch_id,
              reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash, request_status, row_version
       FROM pdm_work_review_requests WHERE id = :requestId AND company_id = :companyId${lock && tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    return row ? map(row) : null;
  }

  async appendTrace(tx: AsyncDatabaseClient, request: PdmWorkReviewRequestRecord) {
    await tx.execute(
      `INSERT INTO pdm_review_traces (review_cycle_id, company_id, entity_type, canonical_entity_id, decision_at)
       VALUES (:reviewCycleId, :companyId, :entityType, :canonicalEntityId, CURRENT_TIMESTAMP)`, request
    );
  }
}
