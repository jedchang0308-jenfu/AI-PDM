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
  SELECT
    id,
    company_id,
    item_id,
    drawing_number,
    revision,
    corrects_submission_id,
    source_entity_type,
    source_entity_id
  FROM submissions
  WHERE id = :id
`;

export const SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_ID_SQL = `
  SELECT
    d.id AS drawing_id,
    d.company_id,
    d.part_root_id,
    d.drawing_number,
    d.development_phase AS drawing_development_phase,
    d.record_status AS drawing_record_status,
    r.id AS root_id,
    r.root_code,
    r.development_phase AS root_development_phase,
    r.record_status AS root_record_status
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
  WHERE d.company_id = :companyId
    AND d.id = :drawingNumberId
  LIMIT 1
`;

export const SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_NUMBER_SQL = `
  SELECT
    d.id AS drawing_id,
    d.company_id,
    d.part_root_id,
    d.drawing_number,
    d.development_phase AS drawing_development_phase,
    d.record_status AS drawing_record_status,
    r.id AS root_id,
    r.root_code,
    r.development_phase AS root_development_phase,
    r.record_status AS root_record_status
  FROM drawing_numbers d
  JOIN part_roots r ON r.id = d.part_root_id
  WHERE d.company_id = :companyId
    AND d.drawing_number = :drawingNumber
  ORDER BY d.updated_at DESC, d.id ASC
`;

export const SELECT_ASYNC_RELEASE_SOURCE_PART_LINKS_SQL = `
  SELECT
    l.link_type,
    p.id AS part_id,
    p.part_number,
    p.development_phase AS part_development_phase,
    p.record_status AS part_record_status
  FROM drawing_part_links l
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE l.drawing_number_id = :drawingNumberId
  ORDER BY
    CASE WHEN l.link_type = 'primary_manufacturing' THEN 0 ELSE 1 END,
    p.part_number ASC,
    p.id ASC
`;

export const SELECT_ASYNC_RELATED_RELEASE_FAILED_SUBMISSIONS_SQL = `
  SELECT id
  FROM submissions
  WHERE company_id = :companyId
    AND drawing_number = :drawingNumber
    AND revision = :revision
    AND id <> :id
    AND status = 'ReleaseFailed'
    AND resolved_by_submission_id IS NULL
  ORDER BY created_at ASC, id ASC
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

export const MARK_ASYNC_CORRECTED_RELEASE_FAILED_RESOLVED_SQL = `
  UPDATE submissions
  SET resolved_by_submission_id = :resolvedBySubmissionId,
      resolved_at = :now,
      updated_at = :now
  WHERE id = :id
    AND status = 'ReleaseFailed'
    AND resolved_by_submission_id IS NULL
`;

export const CANCEL_ASYNC_PENDING_SUBMISSION_SQL = `
  UPDATE submissions
  SET status = 'Cancelled',
      cancelled_at = :now,
      cancelled_by = :actorId,
      cancel_reason = :reason,
      updated_at = :now,
      release_error = NULL,
      reject_reason = NULL
  WHERE id = :id
    AND status = 'Pending'
`;

export const UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL = `
  UPDATE items
  SET current_revision = :revision,
      updated_at = :now
  WHERE id = :itemId
`;

export const UPDATE_ASYNC_RELEASE_DRAWING_MASTER_SQL = `
  UPDATE drawing_numbers
  SET development_phase = 'Release',
      record_status = 'Released',
      updated_at = :now
  WHERE id = :drawingNumberId
    AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
`;

export const UPDATE_ASYNC_RELEASE_PART_MASTER_SQL = `
  UPDATE part_numbers
  SET development_phase = 'Release',
      record_status = 'Released',
      updated_at = :now
  WHERE id = :partNumberId
    AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
`;

export const UPDATE_ASYNC_RELEASE_ROOT_MASTER_SQL = `
  UPDATE part_roots
  SET development_phase = 'Release',
      record_status = 'Released',
      updated_at = :now
  WHERE id = :rootId
    AND record_status NOT IN ('Obsolete', 'Merged', 'EVTDisabled')
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

export const INSERT_ASYNC_RELEASE_FAILED_RESOLUTION_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ReleaseFailedResolvedByCorrection', :detailJson, :createdAt)
`;

export const INSERT_ASYNC_RELEASE_MASTER_STATUS_SYNC_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ReleaseMasterStatusSynced', :detailJson, :createdAt)
`;

type MasterLifecyclePhase = "EVT" | "DVT" | "PVT" | "Release" | "ECR";
type MasterLifecycleStatus =
  | "Draft"
  | "NeedInfo"
  | "Active"
  | "PendingReview"
  | "Released"
  | "Rejected"
  | "Obsolete"
  | "Merged"
  | "EVTDisabled"
  | "PendingAdminConfirm"
  | "MainDrawingInvalid";

type ReleaseLifecycleSubmissionRow = {
  id: string;
  company_id: string;
  item_id: string;
  drawing_number: string;
  revision: string;
  corrects_submission_id: string | null;
  source_entity_type: string | null;
  source_entity_id: string | null;
};

type ReleaseSourceDrawingRow = {
  drawing_id: string;
  company_id: string;
  part_root_id: string;
  drawing_number: string;
  drawing_development_phase: MasterLifecyclePhase;
  drawing_record_status: MasterLifecycleStatus;
  root_id: string;
  root_code: string;
  root_development_phase: MasterLifecyclePhase;
  root_record_status: MasterLifecycleStatus;
};

type ReleaseSourcePartLinkRow = {
  link_type: "primary_manufacturing" | "reference";
  part_id: string;
  part_number: string;
  part_development_phase: MasterLifecyclePhase;
  part_record_status: MasterLifecycleStatus;
};

type MasterStatusSyncEntityResult = {
  id: string;
  code: string;
  before: {
    development_phase: MasterLifecyclePhase;
    record_status: MasterLifecycleStatus;
  };
  after: {
    development_phase: MasterLifecyclePhase;
    record_status: MasterLifecycleStatus;
  };
  updated: boolean;
  skipped_reason: "protected_terminal_status" | null;
};

export type AsyncReleaseMasterStatusSyncResult = {
  drawing: MasterStatusSyncEntityResult;
  part: MasterStatusSyncEntityResult;
  root: MasterStatusSyncEntityResult;
  part_resolution: "primary_manufacturing" | "single_link_fallback";
};

export type AsyncReleaseLifecycleResult = {
  obsolete_count: number;
  obsolete_submission_ids: string[];
  resolved_release_failed_count: number;
  resolved_release_failed_submission_ids: string[];
  master_status_sync: AsyncReleaseMasterStatusSyncResult;
};

const PROTECTED_RELEASE_MASTER_STATUSES = new Set<MasterLifecycleStatus>(["Obsolete", "Merged", "EVTDisabled"]);

function isProtectedReleaseMasterStatus(status: MasterLifecycleStatus) {
  return PROTECTED_RELEASE_MASTER_STATUSES.has(status);
}

function buildMasterStatusResult(input: {
  id: string;
  code: string;
  beforePhase: MasterLifecyclePhase;
  beforeStatus: MasterLifecycleStatus;
}): MasterStatusSyncEntityResult {
  const protectedStatus = isProtectedReleaseMasterStatus(input.beforeStatus);
  return {
    id: input.id,
    code: input.code,
    before: {
      development_phase: input.beforePhase,
      record_status: input.beforeStatus
    },
    after: {
      development_phase: protectedStatus ? input.beforePhase : "Release",
      record_status: protectedStatus ? input.beforeStatus : "Released"
    },
    updated: !protectedStatus && (input.beforePhase !== "Release" || input.beforeStatus !== "Released"),
    skipped_reason: protectedStatus ? "protected_terminal_status" : null
  };
}

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

  async cancelPendingSubmission(input: { id: string; actorId: string; reason: string }): Promise<void> {
    await this.client.execute(CANCEL_ASYNC_PENDING_SUBMISSION_SQL, {
      id: input.id,
      actorId: input.actorId,
      reason: input.reason,
      now: this.clock()
    });
  }

  async markSubmissionReleasedAndObsoletePrevious(input: {
    id: string;
    actorId: string;
  }): Promise<AsyncReleaseLifecycleResult> {
    const now = this.clock();
    const submission = await this.client.queryOne<ReleaseLifecycleSubmissionRow>(
      SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL,
      { id: input.id }
    );
    if (!submission) throw new Error("Submission not found");

    const obsoleteRows = await this.client.query<{ id: string }>(SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL, {
      itemId: submission.item_id,
      id: submission.id
    });
    const relatedReleaseFailedRows = await this.client.query<{ id: string }>(SELECT_ASYNC_RELATED_RELEASE_FAILED_SUBMISSIONS_SQL, {
      companyId: submission.company_id,
      drawingNumber: submission.drawing_number,
      revision: submission.revision,
      id: submission.id
    });

    let masterStatusSync: AsyncReleaseMasterStatusSyncResult | null = null;
    const applyLifecycle = async (client: AsyncDatabaseClient) => {
      masterStatusSync = await this.syncReleaseMasterStatuses(client, { submission, actorId: input.actorId, now });
      await client.execute(MARK_ASYNC_SUBMISSION_RELEASED_SQL, { id: submission.id, now });
      for (const row of relatedReleaseFailedRows) {
        await client.execute(MARK_ASYNC_CORRECTED_RELEASE_FAILED_RESOLVED_SQL, {
          id: row.id,
          resolvedBySubmissionId: submission.id,
          now
        });
        await client.execute(INSERT_ASYNC_RELEASE_FAILED_RESOLUTION_AUDIT_LOG_SQL, {
          id: this.idFactory(),
          submissionId: row.id,
          actorId: input.actorId,
          detailJson: JSON.stringify({
            resolvedBySubmissionId: submission.id,
            resolvedByRevision: submission.revision
          }),
          createdAt: now
        });
      }
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

    await this.client.transaction(applyLifecycle);
    if (!masterStatusSync) throw new Error("主資料狀態同步失敗：發布交易未完成，請重新送審或通知 Admin。");

    return {
      obsolete_count: obsoleteRows.length,
      obsolete_submission_ids: obsoleteRows.map((row) => row.id),
      resolved_release_failed_count: relatedReleaseFailedRows.length,
      resolved_release_failed_submission_ids: relatedReleaseFailedRows.map((row) => row.id),
      master_status_sync: masterStatusSync
    };
  }

  private async syncReleaseMasterStatuses(
    client: AsyncDatabaseClient,
    input: {
      submission: ReleaseLifecycleSubmissionRow;
      actorId: string;
      now: string;
    }
  ): Promise<AsyncReleaseMasterStatusSyncResult> {
    const drawing = await this.resolveReleaseSourceDrawing(client, input.submission);
    const partResolution = await this.resolveReleaseSourcePart(client, drawing);

    await client.execute(UPDATE_ASYNC_RELEASE_DRAWING_MASTER_SQL, {
      drawingNumberId: drawing.drawing_id,
      now: input.now
    });
    await client.execute(UPDATE_ASYNC_RELEASE_PART_MASTER_SQL, {
      partNumberId: partResolution.part.part_id,
      now: input.now
    });
    await client.execute(UPDATE_ASYNC_RELEASE_ROOT_MASTER_SQL, {
      rootId: drawing.root_id,
      now: input.now
    });

    const result: AsyncReleaseMasterStatusSyncResult = {
      drawing: buildMasterStatusResult({
        id: drawing.drawing_id,
        code: drawing.drawing_number,
        beforePhase: drawing.drawing_development_phase,
        beforeStatus: drawing.drawing_record_status
      }),
      part: buildMasterStatusResult({
        id: partResolution.part.part_id,
        code: partResolution.part.part_number,
        beforePhase: partResolution.part.part_development_phase,
        beforeStatus: partResolution.part.part_record_status
      }),
      root: buildMasterStatusResult({
        id: drawing.root_id,
        code: drawing.root_code,
        beforePhase: drawing.root_development_phase,
        beforeStatus: drawing.root_record_status
      }),
      part_resolution: partResolution.resolution
    };

    await client.execute(INSERT_ASYNC_RELEASE_MASTER_STATUS_SYNC_AUDIT_LOG_SQL, {
      id: this.idFactory(),
      submissionId: input.submission.id,
      actorId: input.actorId,
      detailJson: JSON.stringify({
        submissionId: input.submission.id,
        drawingNumber: input.submission.drawing_number,
        revision: input.submission.revision,
        sync: result
      }),
      createdAt: input.now
    });

    return result;
  }

  private async resolveReleaseSourceDrawing(
    client: AsyncDatabaseClient,
    submission: ReleaseLifecycleSubmissionRow
  ): Promise<ReleaseSourceDrawingRow> {
    if (submission.source_entity_type === "drawing_number" && submission.source_entity_id) {
      const sourceDrawing = await client.queryOne<ReleaseSourceDrawingRow>(SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_ID_SQL, {
        companyId: submission.company_id,
        drawingNumberId: submission.source_entity_id
      });
      if (sourceDrawing) return sourceDrawing;

      throw new Error("主資料狀態同步失敗：找不到這筆送審的來源圖號，不能標記為已發布。請通知主管或 Admin 檢查圖號資料。");
    }

    const fallbackDrawings = await client.query<ReleaseSourceDrawingRow>(SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_NUMBER_SQL, {
      companyId: submission.company_id,
      drawingNumber: submission.drawing_number
    });
    if (fallbackDrawings.length === 1) return fallbackDrawings[0];
    if (fallbackDrawings.length === 0) {
      throw new Error("主資料狀態同步失敗：找不到這筆送審的圖號，不能標記為已發布。請先回圖號模組確認圖號是否存在。");
    }

    throw new Error("主資料狀態同步失敗：同一個圖號對到多筆主資料，不能標記為已發布。請通知 Admin 檢查資料關聯。");
  }

  private async resolveReleaseSourcePart(
    client: AsyncDatabaseClient,
    drawing: ReleaseSourceDrawingRow
  ): Promise<{ part: ReleaseSourcePartLinkRow; resolution: AsyncReleaseMasterStatusSyncResult["part_resolution"] }> {
    const links = await client.query<ReleaseSourcePartLinkRow>(SELECT_ASYNC_RELEASE_SOURCE_PART_LINKS_SQL, {
      drawingNumberId: drawing.drawing_id
    });
    const primaryLinks = links.filter((row) => row.link_type === "primary_manufacturing");
    if (primaryLinks.length === 1) {
      return { part: primaryLinks[0], resolution: "primary_manufacturing" };
    }
    if (primaryLinks.length > 1) {
      throw new Error("主資料狀態同步失敗：此圖號有多個主料號關聯，不能標記為已發布。請先在圖料模組確認主料號。");
    }
    if (links.length === 1) {
      return { part: links[0], resolution: "single_link_fallback" };
    }
    if (links.length === 0) {
      throw new Error("主資料狀態同步失敗：此圖號尚未關聯主料號，不能標記為已發布。請先在圖料模組建立圖料關聯。");
    }

    throw new Error("主資料狀態同步失敗：此圖號有多個料號關聯但沒有指定主料號，不能標記為已發布。請先在圖料模組確認主料號。");
  }
}
