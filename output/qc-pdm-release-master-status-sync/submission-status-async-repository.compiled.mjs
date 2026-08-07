import crypto from "node:crypto";
import { compareRevisionCodes } from "@/lib/revision-policy";
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
    s.id,
    s.company_id,
    s.item_id,
    s.drawing_number,
    s.revision,
    s.corrects_submission_id,
    s.source_entity_type,
    s.source_entity_id,
    ss.source_part_number_id,
    ss.source_part_number
  FROM submissions s
  LEFT JOIN submission_snapshots ss ON ss.submission_id = s.id
  WHERE s.id = :id
`;
export const SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_ID_SQL = `
  SELECT
    d.id AS drawing_id,
    d.company_id,
    d.part_root_id,
    d.drawing_number,
    d.record_status AS drawing_record_status,
    r.id AS root_id,
    r.root_code,
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
    d.record_status AS drawing_record_status,
    r.id AS root_id,
    r.root_code,
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
    p.record_status AS part_record_status
  FROM drawing_part_links l
  JOIN part_numbers p ON p.id = l.part_number_id
  WHERE l.drawing_number_id = :drawingNumberId
  ORDER BY
    CASE WHEN l.link_type = 'primary_manufacturing' THEN 0 ELSE 1 END,
    p.part_number ASC,
    p.id ASC
`;
export const SELECT_ASYNC_RELEASE_SUBMISSION_PART_SCOPES_SQL = `
  SELECT
    scope.id AS scope_id,
    scope.item_id,
    scope.part_number_id AS part_id,
    scope.part_number,
    scope.link_type AS snapshotted_link_type,
    p.record_status AS part_record_status,
    l.link_type AS current_link_type
  FROM submission_part_scopes scope
  JOIN part_numbers p
    ON p.id = scope.part_number_id
   AND p.company_id = scope.company_id
  LEFT JOIN drawing_part_links l
    ON l.part_number_id = scope.part_number_id
   AND l.drawing_number_id = :drawingNumberId
  WHERE scope.submission_id = :submissionId
    AND scope.company_id = :companyId
  ORDER BY scope.part_number ASC, scope.part_number_id ASC
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
  SELECT id, revision, status
  FROM submissions
  WHERE item_id = :itemId
    AND id <> :id
    AND status IN ('Released', 'Obsolete')
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
  SET record_status = 'Released',
      updated_at = :now
  WHERE id = :drawingNumberId
    AND record_status NOT IN ('Obsolete', 'Merged')
`;
export const UPDATE_ASYNC_RELEASE_PART_MASTER_SQL = `
  UPDATE part_numbers
  SET record_status = 'Released',
      updated_at = :now
  WHERE id = :partNumberId
    AND record_status NOT IN ('Obsolete', 'Merged')
`;
export const UPDATE_ASYNC_RELEASE_ROOT_MASTER_SQL = `
  UPDATE part_roots
  SET record_status = 'Released',
      updated_at = :now
  WHERE id = :rootId
    AND record_status NOT IN ('Obsolete', 'Merged')
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
export const MARK_ASYNC_FORMAL_SUBMISSION_CURRENT_SQL = `
  UPDATE submissions
  SET status = 'Released',
      superseded_by_submission_id = NULL,
      obsolete_at = NULL,
      obsolete_by = NULL,
      updated_at = :now
  WHERE id = :id
    AND status IN ('Released', 'Obsolete')
`;
export const INSERT_ASYNC_OBSOLETE_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ObsoleteByRevision', :detailJson, :createdAt)
`;
export const INSERT_ASYNC_REVISION_CURRENT_RECOMPUTED_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'RevisionCurrentRecomputed', :detailJson, :createdAt)
`;
export const INSERT_ASYNC_RELEASE_FAILED_RESOLUTION_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ReleaseFailedResolvedByCorrection', :detailJson, :createdAt)
`;
export const INSERT_ASYNC_RELEASE_MASTER_STATUS_SYNC_AUDIT_LOG_SQL = `
  INSERT INTO audit_logs (id, submission_id, actor_id, action, detail_json, created_at)
  VALUES (:id, :submissionId, :actorId, 'ReleaseMasterStatusSynced', :detailJson, :createdAt)
`;
const PROTECTED_RELEASE_MASTER_STATUSES = new Set(["Obsolete", "Merged"]);
function isProtectedReleaseMasterStatus(status) {
    return PROTECTED_RELEASE_MASTER_STATUSES.has(status);
}
function buildMasterStatusResult(input) {
    const protectedStatus = isProtectedReleaseMasterStatus(input.beforeStatus);
    return {
        id: input.id,
        code: input.code,
        before: {
            record_status: input.beforeStatus
        },
        after: {
            record_status: protectedStatus ? input.beforeStatus : "Released"
        },
        updated: !protectedStatus && input.beforeStatus !== "Released",
        skipped_reason: protectedStatus ? "protected_terminal_status" : null
    };
}
export class AsyncSubmissionStatusRepository {
    client;
    clock;
    idFactory;
    constructor(client, clock = () => new Date().toISOString(), idFactory = () => crypto.randomUUID()) {
        this.client = client;
        this.clock = clock;
        this.idFactory = idFactory;
    }
    async getActiveSandboxBranchForSubmission(submissionId) {
        return this.client.queryOne(SELECT_ASYNC_ACTIVE_SANDBOX_BRANCH_SQL, { submissionId });
    }
    async rejectSubmission(input) {
        await this.client.execute(REJECT_ASYNC_SUBMISSION_SQL, {
            id: input.id,
            rejectReason: input.rejectReason,
            now: this.clock()
        });
    }
    async markSubmissionReleasing(id) {
        await this.client.execute(MARK_ASYNC_SUBMISSION_RELEASING_SQL, {
            id,
            now: this.clock()
        });
    }
    async markSubmissionReleaseFailed(input) {
        await this.client.execute(MARK_ASYNC_SUBMISSION_RELEASE_FAILED_SQL, {
            id: input.id,
            releaseError: input.releaseError,
            now: this.clock()
        });
    }
    async cancelPendingSubmission(input) {
        await this.client.execute(CANCEL_ASYNC_PENDING_SUBMISSION_SQL, {
            id: input.id,
            actorId: input.actorId,
            reason: input.reason,
            now: this.clock()
        });
    }
    async markSubmissionReleasedAndObsoletePrevious(input) {
        const now = this.clock();
        const submission = await this.client.queryOne(SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL, { id: input.id });
        if (!submission)
            throw new Error("Submission not found");
        const releasedRows = await this.client.query(SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL, {
            itemId: submission.item_id,
            id: submission.id
        });
        assertNoFormalDuplicateRevision(submission, releasedRows);
        const releasePlan = buildRevisionCurrentPlan(submission, releasedRows);
        const relatedReleaseFailedRows = await this.client.query(SELECT_ASYNC_RELATED_RELEASE_FAILED_SUBMISSIONS_SQL, {
            companyId: submission.company_id,
            drawingNumber: submission.drawing_number,
            revision: submission.revision,
            id: submission.id
        });
        let masterStatusSync = null;
        const applyLifecycle = async (client) => {
            masterStatusSync = await this.syncReleaseMasterStatuses(client, { submission, actorId: input.actorId, now });
            await client.execute(MARK_ASYNC_SUBMISSION_RELEASED_SQL, { id: submission.id, now });
            await client.execute(`
        UPDATE drawing_revision_packages
        SET status = 'Released',
            released_at = COALESCE(released_at, :now),
            updated_at = :now
        WHERE source_submission_id = :id
      `, { id: submission.id, now });
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
                revision: releasePlan.latest.revision,
                now
            });
            const scopedItems = await client.query(SELECT_ASYNC_RELEASE_SUBMISSION_PART_SCOPES_SQL, {
                submissionId: submission.id,
                companyId: submission.company_id,
                drawingNumberId: submission.source_entity_type === "drawing_number" ? submission.source_entity_id : null
            });
            for (const scope of scopedItems) {
                await client.execute(UPDATE_ASYNC_ITEM_CURRENT_REVISION_SQL, {
                    itemId: scope.item_id,
                    revision: releasePlan.latest.revision,
                    now
                });
            }
            await client.execute(MARK_ASYNC_FORMAL_SUBMISSION_CURRENT_SQL, {
                id: releasePlan.latest.id,
                now
            });
            for (const row of releasePlan.newlyObsolete) {
                await client.execute(MARK_ASYNC_PREVIOUS_SUBMISSION_OBSOLETE_SQL, {
                    id: row.id,
                    supersededBySubmissionId: releasePlan.latest.id,
                    obsoleteBy: input.actorId,
                    now
                });
                await client.execute(INSERT_ASYNC_OBSOLETE_AUDIT_LOG_SQL, {
                    id: this.idFactory(),
                    submissionId: row.id,
                    actorId: input.actorId,
                    detailJson: JSON.stringify({
                        supersededBySubmissionId: releasePlan.latest.id,
                        supersededByRevision: releasePlan.latest.revision,
                        acceptedSubmissionId: submission.id,
                        acceptedRevision: submission.revision
                    }),
                    createdAt: now
                });
            }
            await client.execute(INSERT_ASYNC_REVISION_CURRENT_RECOMPUTED_AUDIT_LOG_SQL, {
                id: this.idFactory(),
                submissionId: submission.id,
                actorId: input.actorId,
                detailJson: JSON.stringify({
                    acceptedSubmissionId: submission.id,
                    acceptedRevision: submission.revision,
                    latestSubmissionId: releasePlan.latest.id,
                    latestRevision: releasePlan.latest.revision,
                    acceptedAsHistory: releasePlan.acceptedAsHistory,
                    historySubmissionIds: releasePlan.history.map((row) => row.id)
                }),
                createdAt: now
            });
        };
        await this.client.transaction(applyLifecycle);
        if (!masterStatusSync)
            throw new Error("主資料狀態同步失敗：發布交易未完成，請重新送審或通知 Admin。");
        return {
            obsolete_count: releasePlan.newlyObsolete.length,
            obsolete_submission_ids: releasePlan.newlyObsolete.map((row) => row.id),
            latest_submission_id: releasePlan.latest.id,
            latest_revision: releasePlan.latest.revision,
            history_submission_ids: releasePlan.history.map((row) => row.id),
            accepted_submission_id: submission.id,
            accepted_revision: submission.revision,
            accepted_as_history: releasePlan.acceptedAsHistory,
            resolved_release_failed_count: relatedReleaseFailedRows.length,
            resolved_release_failed_submission_ids: relatedReleaseFailedRows.map((row) => row.id),
            master_status_sync: masterStatusSync
        };
    }
    async assertSubmissionRevisionCanRelease(input) {
        const submission = await this.client.queryOne(SELECT_ASYNC_RELEASE_LIFECYCLE_SUBMISSION_SQL, { id: input.id });
        if (!submission)
            throw new Error("Submission not found");
        const releasedRows = await this.client.query(SELECT_ASYNC_RELEASE_LIFECYCLE_OBSOLETE_SUBMISSIONS_SQL, {
            itemId: submission.item_id,
            id: submission.id
        });
        assertNoFormalDuplicateRevision(submission, releasedRows);
    }
    async syncReleaseMasterStatuses(client, input) {
        const drawing = await this.resolveReleaseSourceDrawing(client, input.submission);
        const scopedParts = await client.query(SELECT_ASYNC_RELEASE_SUBMISSION_PART_SCOPES_SQL, {
            submissionId: input.submission.id,
            companyId: input.submission.company_id,
            drawingNumberId: drawing.drawing_id
        });
        for (const scope of scopedParts) {
            if (!scope.current_link_type) {
                throw new Error(`主資料狀態同步失敗：送審範圍料號 ${scope.part_number} 已不在此圖號關聯中，整批不能發布。請重新確認圖料關係後重送。`);
            }
            if (scope.current_link_type !== scope.snapshotted_link_type) {
                throw new Error(`主資料狀態同步失敗：送審範圍料號 ${scope.part_number} 的圖料關聯類型已變更，整批不能發布。請重新確認後重送。`);
            }
        }
        const legacyPartResolution = scopedParts.length === 0
            ? await this.resolveReleaseSourcePart(client, drawing, input.submission)
            : null;
        const releaseParts = scopedParts.length > 0
            ? scopedParts.map((scope) => ({
                link_type: scope.current_link_type ?? scope.snapshotted_link_type,
                part_id: scope.part_id,
                part_number: scope.part_number,
                part_record_status: scope.part_record_status
            }))
            : legacyPartResolution
                ? [legacyPartResolution.part]
                : [];
        if (releaseParts.length === 0) {
            throw new Error("主資料狀態同步失敗：送審沒有可發布的料號範圍。");
        }
        await client.execute(UPDATE_ASYNC_RELEASE_DRAWING_MASTER_SQL, {
            drawingNumberId: drawing.drawing_id,
            now: input.now
        });
        for (const part of releaseParts) {
            await client.execute(UPDATE_ASYNC_RELEASE_PART_MASTER_SQL, {
                partNumberId: part.part_id,
                now: input.now
            });
        }
        await client.execute(UPDATE_ASYNC_RELEASE_ROOT_MASTER_SQL, {
            rootId: drawing.root_id,
            now: input.now
        });
        const partResults = releaseParts.map((part) => buildMasterStatusResult({
            id: part.part_id,
            code: part.part_number,
            beforeStatus: part.part_record_status
        }));
        const result = {
            drawing: buildMasterStatusResult({
                id: drawing.drawing_id,
                code: drawing.drawing_number,
                beforeStatus: drawing.drawing_record_status
            }),
            part: partResults[0],
            parts: partResults,
            root: buildMasterStatusResult({
                id: drawing.root_id,
                code: drawing.root_code,
                beforeStatus: drawing.root_record_status
            }),
            part_resolution: scopedParts.length > 0 ? "submission_scope" : legacyPartResolution.resolution
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
    async resolveReleaseSourceDrawing(client, submission) {
        if (submission.source_entity_type === "drawing_number" && submission.source_entity_id) {
            const sourceDrawing = await client.queryOne(SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_ID_SQL, {
                companyId: submission.company_id,
                drawingNumberId: submission.source_entity_id
            });
            if (sourceDrawing)
                return sourceDrawing;
            throw new Error("主資料狀態同步失敗：找不到這筆送審的來源圖號，不能標記為已發布。請通知主管或 Admin 檢查圖號資料。");
        }
        const fallbackDrawings = await client.query(SELECT_ASYNC_RELEASE_SOURCE_DRAWING_BY_NUMBER_SQL, {
            companyId: submission.company_id,
            drawingNumber: submission.drawing_number
        });
        if (fallbackDrawings.length === 1)
            return fallbackDrawings[0];
        if (fallbackDrawings.length === 0) {
            throw new Error("主資料狀態同步失敗：找不到這筆送審的圖號，不能標記為已發布。請先回圖號模組確認圖號是否存在。");
        }
        throw new Error("主資料狀態同步失敗：同一個圖號對到多筆主資料，不能標記為已發布。請通知 Admin 檢查資料關聯。");
    }
    async resolveReleaseSourcePart(client, drawing, submission) {
        const links = await client.query(SELECT_ASYNC_RELEASE_SOURCE_PART_LINKS_SQL, {
            drawingNumberId: drawing.drawing_id
        });
        if (submission.source_part_number_id) {
            const snapshottedPart = links.find((row) => row.part_id === submission.source_part_number_id);
            if (snapshottedPart)
                return { part: snapshottedPart, resolution: "submission_snapshot" };
            throw new Error(`主資料狀態同步失敗：送審快照料號 ${submission.source_part_number ?? submission.source_part_number_id} 已不在此圖號關聯中，不能標記為已發布。請重新確認圖料關係後重送。`);
        }
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
function assertNoFormalDuplicateRevision(submission, releasedRows) {
    const blockingRow = releasedRows.find((row) => compareReleaseRevisions(row.revision, submission.revision) === 0);
    if (!blockingRow)
        return;
    throw new Error(`版次 ${submission.revision} 已有正式紀錄（${blockingRow.id}），不能重複核准同一版次。請開啟既有版次補件或改用新的版次。`);
}
function compareReleaseRevisions(left, right) {
    return compareRevisionCodes(left, right, { allowLegacy: true });
}
function buildRevisionCurrentPlan(submission, formalRows) {
    const accepted = { id: submission.id, revision: submission.revision, status: "Released" };
    const allRows = [...formalRows, accepted];
    const latest = allRows.reduce((current, row) => (compareReleaseRevisions(row.revision, current.revision) > 0 ? row : current), accepted);
    const history = allRows.filter((row) => row.id !== latest.id);
    const newlyObsolete = history.filter((row) => row.status === "Released");
    return {
        latest,
        history,
        newlyObsolete,
        acceptedAsHistory: latest.id !== submission.id
    };
}
