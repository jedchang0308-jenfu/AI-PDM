import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { SubmissionLifecycleRequest } from "@/lib/types";

export const SELECT_ASYNC_SUBMISSION_LIFECYCLE_STATUS_SQL = `
  SELECT id, status
  FROM submissions
  WHERE id = :submissionId
`;

export const SELECT_ASYNC_PENDING_SUBMISSION_OBSOLETE_REQUEST_SQL = `
  SELECT
    r.*,
    requester.display_name AS requested_by_name,
    decider.display_name AS decided_by_name
  FROM submission_lifecycle_requests r
  JOIN users requester ON requester.id = r.requested_by
  LEFT JOIN users decider ON decider.id = r.decided_by
  WHERE r.submission_id = :submissionId
    AND r.action_code = 'obsolete_submission'
    AND r.request_status = 'pending'
  ORDER BY r.created_at DESC, r.id DESC
  LIMIT 1
`;

export const SELECT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_BY_ID_SQL = `
  SELECT
    r.*,
    requester.display_name AS requested_by_name,
    decider.display_name AS decided_by_name
  FROM submission_lifecycle_requests r
  JOIN users requester ON requester.id = r.requested_by
  LEFT JOIN users decider ON decider.id = r.decided_by
  WHERE r.id = :requestId
`;

export const INSERT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL = `
  INSERT INTO submission_lifecycle_requests (
    id, submission_id, action_code, request_status, requested_by, reason,
    requested_at, created_at, updated_at
  ) VALUES (
    :id, :submissionId, 'obsolete_submission', 'pending', :requestedBy, :reason,
    :now, :now, :now
  )
`;

export const APPROVE_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL = `
  UPDATE submission_lifecycle_requests
  SET request_status = 'approved',
      decided_by = :decidedBy,
      decision_reason = :decisionReason,
      decided_at = :now,
      updated_at = :now
  WHERE id = :requestId
    AND request_status = 'pending'
`;

export const REJECT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL = `
  UPDATE submission_lifecycle_requests
  SET request_status = 'rejected',
      decided_by = :decidedBy,
      decision_reason = :decisionReason,
      decided_at = :now,
      updated_at = :now
  WHERE id = :requestId
    AND request_status = 'pending'
`;

export const OBSOLETE_ASYNC_SUBMISSION_SQL = `
  UPDATE submissions
  SET status = 'Obsolete',
      obsolete_at = :now,
      obsolete_by = :obsoleteBy,
      updated_at = :now
  WHERE id = :submissionId
    AND status = 'Released'
`;

export const INSERT_ASYNC_SUBMISSION_LIFECYCLE_AUDIT_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, :action, :detailJson, :createdAt)
`;

export type RequestSubmissionObsoleteReviewInput = {
  submissionId: string;
  actorId: string;
  reason: string;
};

export type DecideSubmissionObsoleteReviewInput = {
  requestId: string;
  actorId: string;
  decisionReason?: string;
};

type SubmissionStatusRow = {
  id: string;
  status: string;
};

export class AsyncSubmissionLifecycleRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getPendingObsoleteRequest(submissionId: string): Promise<SubmissionLifecycleRequest | null> {
    return this.client.queryOne<SubmissionLifecycleRequest>(SELECT_ASYNC_PENDING_SUBMISSION_OBSOLETE_REQUEST_SQL, { submissionId });
  }

  async getRequestById(requestId: string): Promise<SubmissionLifecycleRequest | null> {
    return this.client.queryOne<SubmissionLifecycleRequest>(SELECT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_BY_ID_SQL, { requestId });
  }

  async requestObsoleteReview(input: RequestSubmissionObsoleteReviewInput): Promise<SubmissionLifecycleRequest | null> {
    const submission = await this.getSubmissionStatus(input.submissionId);
    if (!submission) return null;
    if (submission.status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    if (submission.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

    const reason = input.reason.trim();
    if (!reason) throw new Error("LIFE_OBSOLETE_REASON_REQUIRED");
    const existing = await this.getPendingObsoleteRequest(input.submissionId);
    if (existing) throw new Error("LIFE_OBSOLETE_ALREADY_REQUESTED");

    const now = this.clock();
    const requestId = this.idFactory();
    const create = async (client: AsyncDatabaseClient) => {
      await client.execute(INSERT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL, {
        id: requestId,
        submissionId: input.submissionId,
        requestedBy: input.actorId,
        reason,
        now
      });
      await this.audit(client, {
        submissionId: input.submissionId,
        actorId: input.actorId,
        action: "lifecycle.obsolete.requested",
        detail: {
          entityType: "submission",
          requestId,
          beforeStatus: submission.status,
          requestedStatus: "Obsolete",
          reason
        },
        now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(create);
    } else {
      await create(this.client);
    }

    return this.getRequestById(requestId);
  }

  async approveObsoleteReview(input: DecideSubmissionObsoleteReviewInput): Promise<SubmissionLifecycleRequest | null> {
    const request = await this.getRequestById(input.requestId);
    if (!request) return null;
    if (request.request_status !== "pending") throw new Error("LIFE_OBSOLETE_REVIEW_NOT_PENDING");
    const submission = await this.getSubmissionStatus(request.submission_id);
    if (!submission) return null;
    if (submission.status === "Obsolete") throw new Error("LIFE_OBSOLETE_ALREADY_APPROVED");
    if (submission.status !== "Released") throw new Error("LIFE_OBSOLETE_NOT_FORMAL");

    const now = this.clock();
    const decisionReason = input.decisionReason?.trim() || null;
    const approve = async (client: AsyncDatabaseClient) => {
      await client.execute(APPROVE_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL, {
        requestId: request.id,
        decidedBy: input.actorId,
        decisionReason,
        now
      });
      await client.execute(OBSOLETE_ASYNC_SUBMISSION_SQL, {
        submissionId: request.submission_id,
        obsoleteBy: input.actorId,
        now
      });
      await this.audit(client, {
        submissionId: request.submission_id,
        actorId: input.actorId,
        action: "lifecycle.obsolete.approved",
        detail: {
          entityType: "submission",
          requestId: request.id,
          beforeStatus: submission.status,
          afterStatus: "Obsolete",
          decisionReason
        },
        now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(approve);
    } else {
      await approve(this.client);
    }

    return this.getRequestById(request.id);
  }

  async rejectObsoleteReview(input: DecideSubmissionObsoleteReviewInput): Promise<SubmissionLifecycleRequest | null> {
    const request = await this.getRequestById(input.requestId);
    if (!request) return null;
    if (request.request_status !== "pending") throw new Error("LIFE_OBSOLETE_REVIEW_NOT_PENDING");

    const now = this.clock();
    const decisionReason = input.decisionReason?.trim() || null;
    const reject = async (client: AsyncDatabaseClient) => {
      await client.execute(REJECT_ASYNC_SUBMISSION_LIFECYCLE_REQUEST_SQL, {
        requestId: request.id,
        decidedBy: input.actorId,
        decisionReason,
        now
      });
      await this.audit(client, {
        submissionId: request.submission_id,
        actorId: input.actorId,
        action: "lifecycle.obsolete.rejected",
        detail: {
          entityType: "submission",
          requestId: request.id,
          afterStatus: "Released",
          decisionReason
        },
        now
      });
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(reject);
    } else {
      await reject(this.client);
    }

    return this.getRequestById(request.id);
  }

  private async getSubmissionStatus(submissionId: string): Promise<SubmissionStatusRow | null> {
    return this.client.queryOne<SubmissionStatusRow>(SELECT_ASYNC_SUBMISSION_LIFECYCLE_STATUS_SQL, { submissionId });
  }

  private async audit(
    client: AsyncDatabaseClient,
    input: {
      submissionId: string;
      actorId: string;
      action: string;
      detail: Record<string, unknown>;
      now: string;
    }
  ) {
    await client.execute(INSERT_ASYNC_SUBMISSION_LIFECYCLE_AUDIT_SQL, {
      id: this.idFactory(),
      submissionId: input.submissionId,
      actorId: input.actorId,
      action: input.action,
      detailJson: JSON.stringify(input.detail),
      createdAt: input.now
    });
  }
}
