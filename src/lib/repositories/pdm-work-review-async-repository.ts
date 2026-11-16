import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError, type HistoricalWorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";

export type PdmWorkReviewRequestRecord = {
  id: string;
  companyId: string;
  requestKind: "drawing_revision" | "drawing_rd_void" | "part_change" | "relation_change";
  entityType: HistoricalWorkbenchEntityType;
  canonicalEntityId: string;
  workId: string | null;
  branchId: string | null;
  reviewerUserId: string | null;
  submission?: { userId: string; submittedAt: string };
  reviewCycleId: string;
  snapshotPayload: unknown;
  snapshotHash: string;
  requestStatus: "pending" | "applying" | "apply_failed";
  rowVersion: number;
};
export type PdmWorkReviewTerminalReceipt = {
  requestId: string;
  companyId: string;
  decidedAt: string;
  requestKind?: PdmWorkReviewRequestRecord["requestKind"] | null;
};
type ReviewRow = {
  id: string; company_id: string; request_kind: PdmWorkReviewRequestRecord["requestKind"];
  entity_type: HistoricalWorkbenchEntityType; canonical_entity_id: string; work_id: string | null; branch_id: string | null;
  reviewer_user_id: string | null; review_cycle_id: string; snapshot_payload: string | unknown; snapshot_hash: string;
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
    // This selector is still used by the v1 workbench. Once a profile has
    // principal authority, its historical role must not nominate a reviewer.
    const legacyOnly = tx.kind === "postgres" ? `
         AND NOT EXISTS (
           SELECT 1 FROM ai_pdm_core.principal_identity_cutovers cutover
           WHERE cutover.pdm_user_id = u.id AND cutover.status = 'principal_active'
         )` : "";
    const rows = await tx.query<{ id: string; priority: number }>(
      `SELECT u.id,
          MIN(CASE WHEN r.role_code = 'rd_manager' THEN 0 WHEN r.role_code = 'pdm_admin' THEN 1
               WHEN u.role = 'R&D Manager' THEN 2 WHEN u.role = 'Admin' THEN 3 ELSE 4 END) AS priority,
          MAX(CASE WHEN u.id = :ownerUserId THEN 1 ELSE 0 END) AS owner_priority
       FROM users u
       LEFT JOIN user_company_memberships membership ON membership.user_id = u.id AND membership.company_id = :companyId
       LEFT JOIN user_role_assignments assignment ON assignment.user_id = u.id AND assignment.revoked_at IS NULL
       LEFT JOIN roles r ON r.id = assignment.role_id AND r.enabled = 1
       WHERE u.account_status = 'active' AND u.system_role_enabled = 1
         AND (u.company_id = :companyId OR membership.company_id = :companyId)
         AND (u.role IN ('R&D Manager', 'Admin') OR r.role_code IN ('rd_manager', 'pdm_admin'))${legacyOnly}
       GROUP BY u.id
       ORDER BY priority, owner_priority, u.id`,
      input
    );
    const reviewer = rows[0]?.id;
    if (!reviewer) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "找不到可指派的審核負責人", 409);
    return reviewer;
  }

  async create(tx: AsyncDatabaseClient, input: {
    companyId: string; requestKind: PdmWorkReviewRequestRecord["requestKind"]; entityType: HistoricalWorkbenchEntityType;
    canonicalEntityId: string; workId?: string | null; branchId?: string | null;
    snapshotPayload: unknown; snapshotHash: string;
  } & ({ reviewerUserId: string; submittedBy?: never } | {
    reviewerUserId: null; submittedBy: string; requiresModelReview: boolean; requiresPublish: boolean
  })) {
    const id = crypto.randomUUID();
    const reviewCycleId = crypto.randomUUID();
    const shared = input.reviewerUserId === null;
    if (shared && (tx.kind !== "postgres" || !input.submittedBy)) {
      throw new Error("SHARED_WORK_REVIEW_SUBMITTER_REQUIRED");
    }
    await tx.execute(
      `INSERT INTO pdm_work_review_requests (
        id, company_id, request_kind, entity_type, canonical_entity_id, work_id, branch_id,
        reviewer_user_id, review_cycle_id, snapshot_payload, snapshot_hash, request_status, row_version${shared ? ", submitted_by, requires_model_review, requires_publish" : ""}
      ) VALUES (
        :id, :companyId, :requestKind, :entityType, :canonicalEntityId, :workId, :branchId,
        :reviewerUserId, :reviewCycleId, :snapshotPayload, :snapshotHash, 'pending', 1${shared ? ", :submittedBy, :requiresModelReview, :requiresPublish" : ""}
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
    if (!row) return null;
    const request = map(row);
    if (request.reviewerUserId === null && tx.kind === "postgres") {
      const submission = await tx.queryOne<{ user_id: string; submitted_at: string }>(
        `SELECT submitted_by AS user_id, created_at::text AS submitted_at
         FROM pdm_work_review_requests WHERE id = :requestId AND company_id = :companyId
           AND reviewer_user_id IS NULL AND submitted_by IS NOT NULL`,
        input
      );
      if (submission) request.submission = { userId: submission.user_id, submittedAt: submission.submitted_at };
    }
    return request;
  }

  async appendTrace(tx: AsyncDatabaseClient, request: PdmWorkReviewRequestRecord) {
    await tx.execute(
      `INSERT INTO pdm_review_traces (review_cycle_id, company_id, entity_type, canonical_entity_id, decision_at)
       VALUES (:reviewCycleId, :companyId, :entityType, :canonicalEntityId, CURRENT_TIMESTAMP)`, request
    );
  }

  async getTerminalReceipt(tx: AsyncDatabaseClient, input: { companyId: string; requestId: string },
    options: { includeRequestKind?: boolean } = {}) {
    return tx.queryOne<PdmWorkReviewTerminalReceipt>(
      `SELECT request_id AS requestId, company_id AS companyId, decided_at AS decidedAt
       ${options.includeRequestKind ? ', request_kind AS "requestKind"' : ""}
       FROM pdm_work_review_terminal_receipts
       WHERE request_id = :requestId AND company_id = :companyId`,
      input
    );
  }

  async recordTerminalReceipt(tx: AsyncDatabaseClient, request: PdmWorkReviewRequestRecord,
    result?: { actorId: string; decision: "approve" | "return_for_correction"; applyFailed?: boolean }) {
    if (request.reviewerUserId === null) {
      if (!request.submission || !result || tx.kind !== "postgres") {
        throw new Error("SHARED_WORK_REVIEW_OUTCOME_REQUIRED");
      }
      await tx.execute(
        `INSERT INTO pdm_work_review_terminal_receipts (
           request_id, company_id, decided_at, submitted_by, submitted_at, request_kind,
           canonical_entity_id, decided_by, decision, apply_failed
         ) VALUES (
           :id, :companyId, CURRENT_TIMESTAMP, :submittedBy, CAST(:submittedAt AS timestamptz), :requestKind,
           :canonicalEntityId, :actorId, :decision, :applyFailed
         )`,
        { ...request, ...result, submittedBy: request.submission.userId,
          submittedAt: request.submission.submittedAt, applyFailed: result.applyFailed ?? false }
      );
      return;
    }
    await tx.execute(
      `INSERT INTO pdm_work_review_terminal_receipts (request_id, company_id, decided_at)
       VALUES (:id, :companyId, CURRENT_TIMESTAMP)`,
      request
    );
  }
}
