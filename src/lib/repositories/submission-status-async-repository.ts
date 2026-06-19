import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { SandboxBranch } from "@/lib/types";

export const REJECT_ASYNC_SUBMISSION_SQL = `
  UPDATE submissions
  SET status = 'Rejected',
      updated_at = :now,
      rejected_at = :now,
      release_error = NULL,
      reject_reason = :rejectReason
  WHERE id = :id
`;

export const SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_SQL = `
  SELECT
    b.*,
    created_user.display_name AS created_by_name,
    promoted_user.display_name AS promoted_by_name,
    closed_user.display_name AS closed_by_name,
    merged_user.display_name AS merged_by_name,
    source.drawing_number AS source_drawing_number,
    source.revision AS source_revision,
    sandbox.drawing_number AS sandbox_drawing_number,
    sandbox.revision AS sandbox_revision,
    sandbox.status AS sandbox_status
  FROM sandbox_branches b
  JOIN users created_user ON created_user.id = b.created_by
  LEFT JOIN users promoted_user ON promoted_user.id = b.promoted_by
  LEFT JOIN users closed_user ON closed_user.id = b.closed_by
  LEFT JOIN users merged_user ON merged_user.id = b.merged_by
  JOIN submissions source ON source.id = b.source_submission_id
  JOIN submissions sandbox ON sandbox.id = b.sandbox_submission_id
  WHERE b.sandbox_submission_id = :submissionId
    AND b.status = 'active'
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT 1
`;

export const MARK_ASYNC_SUBMISSION_RELEASING_SQL = `
  UPDATE submissions
  SET status = 'Releasing',
      updated_at = :now,
      release_error = NULL,
      reject_reason = NULL
  WHERE id = :id
`;

export const MARK_ASYNC_SUBMISSION_RELEASE_FAILED_SQL = `
  UPDATE submissions
  SET status = 'ReleaseFailed',
      updated_at = :now,
      release_error = :releaseError
  WHERE id = :id
`;

export const SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL = `
  SELECT id, item_id, revision
  FROM submissions
  WHERE id = :id
`;

export const SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL = `
  SELECT id
  FROM submissions
  WHERE item_id = :itemId
    AND id <> :id
    AND status = 'Released'
  ORDER BY COALESCE(released_at, updated_at, created_at) ASC, id ASC
`;

export const MARK_ASYNC_SUBMISSION_RELEASED_SQL = `
  UPDATE submissions
  SET status = 'Released',
      released_at = COALESCE(released_at, :now),
      updated_at = :now,
      release_error = NULL,
      reject_reason = NULL
  WHERE id = :id
`;

export const UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL = `
  UPDATE items
  SET current_revision = :revision,
      updated_at = :now
  WHERE id = :itemId
`;

export const MARK_ASYNC_PREVIOUS_SUBMISSION_OBSOLETE_SQL = `
  UPDATE submissions
  SET status = 'Obsolete',
      superseded_by_submission_id = :supersededBySubmissionId,
      obsolete_at = :now,
      obsolete_by = :obsoleteBy,
      updated_at = :now
  WHERE id = :id
    AND status = 'Released'
`;

export const INSERT_ASYNC_OBSOLETE_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ObsoleteByRevision', :detailJson, :createdAt)
`;

export type AsyncReleaseLifecycleResult = {
  obsolete_count: number;
  obsolete_submission_ids: string[];
};

export class AsyncSubmissionStatusRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async getActiveSandboxBranchForSubmission(submissionId: string): Promise<SandboxBranch | null> {
    return this.client.queryOne<SandboxBranch>(SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_SQL, { submissionId });
  }

  async rejectSubmission(input: { id: string; rejectReason: string }): Promise<void> {
    await this.client.execute(REJECT_ASYNC_SUBMISSION_SQL, {
      id: input.id,
      rejectReason: input.rejectReason,
      now: this.clock()
    });
  }

  async markSubmissionReleasing(id: string): Promise<void> {
    await this.client.execute(MARK_ASYNC_SUBMISSION_RELEASING_SQL, {
      id,
      now: this.clock()
    });
  }

  async markSubmissionReleaseFailed(input: { id: string; releaseError: string }): Promise<void> {
    await this.client.execute(MARK_ASYNC_SUBMISSION_RELEASE_FAILED_SQL, {
      id: input.id,
      releaseError: input.releaseError,
      now: this.clock()
    });
  }

  async markSubmissionReleasedAndObsoletePrevious(input: {
    id: string;
    actorId: string;
  }): Promise<AsyncReleaseLifecycleResult> {
    const now = this.clock();
    const submission = await this.client.queryOne<{ id: string; item_id: string; revision: string }>(
      SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL,
      { id: input.id }
    );
    if (!submission) throw new Error("Submission not found");

    const obsoleteRows = await this.client.query<{ id: string }>(SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL, {
      itemId: submission.item_id,
      id: submission.id
    });

    const applyLifecycle = async (client: AsyncDatabaseClient) => {
      await client.execute(MARK_ASYNC_SUBMISSION_RELEASED_SQL, { id: submission.id, now });
      await client.execute(UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL, {
        itemId: submission.item_id,
        revision: submission.revision,
        now
      });

      for (const row of obsoleteRows) {
        await client.execute(MARK_ASYNC_PREVIOUS_SUBMISSION_OBSOLETE_SQL, {
          id: row.id,
          supersededBySubmissionId: submission.id,
          obsoleteBy: input.actorId,
          now
        });
        await client.execute(INSERT_ASYNC_OBSOLETE_AUDIT_LOG_SQL, {
          id: this.idFactory(),
          submissionId: row.id,
          actorId: input.actorId,
          detailJson: JSON.stringify({
            supersededBySubmissionId: submission.id,
            supersededByRevision: submission.revision
          }),
          createdAt: now
        });
      }
    };

    if (this.client.kind === "postgres") {
      await this.client.transaction(applyLifecycle);
    } else {
      await applyLifecycle(this.client);
    }

    return {
      obsolete_count: obsoleteRows.length,
      obsolete_submission_ids: obsoleteRows.map((row) => row.id)
    };
  }
}
