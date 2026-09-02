import crypto from "node:crypto";
import { buildBomSubmissionDiff } from "@/lib/bom-submission-diff";
import { diffBomWorkbenchLines as diffBomWorkbenchLinesShared } from "@/lib/bom-workbench-diff";
import { createAuditLog, getDb, getSubmission } from "@/lib/db";
import type {
  BomDetail,
  BomDiffResult,
  BomReleaseGateIssue,
  BomReleaseSnapshotDetail,
  BomWorkbenchDraftDetail,
  BomWorkbenchDraftSummary,
  BomWorkbenchLine,
  BomWorkbenchSummary,
  WhereUsedEntry
} from "@/lib/types";

export function getBomBySubmissionId(submissionId: string): BomDetail | null {
  const database = getDb();
  const header = database
    .prepare(
      `
      SELECT
        h.*,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.material AS parent_material,
        s.surface_finish AS parent_surface_finish,
        s.status AS parent_status
      FROM bom_headers h
      JOIN items i ON i.id = h.parent_item_id
      JOIN submissions s ON s.id = h.parent_submission_id
      WHERE h.parent_submission_id = ?
    `
    )
    .get(submissionId) as Omit<BomDetail, "lines"> | undefined;

  if (!header) return null;

  const lines = database
    .prepare(
      `
      SELECT
        l.*,
        child_i.part_name AS child_part_name,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.material AS child_material,
        child_s.surface_finish AS child_surface_finish,
        child_s.revision AS child_submission_revision,
        child_s.status AS child_status,
        latest_any.revision AS child_latest_revision,
        latest_released.revision AS child_latest_released_revision
      FROM bom_lines l
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_any ON latest_any.id = (
        SELECT la.id
        FROM submissions la
        WHERE la.item_id = child_i.id
        ORDER BY datetime(COALESCE(la.released_at, la.updated_at, la.created_at)) DESC, la.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE l.bom_header_id = ?
      ORDER BY l.line_no ASC
    `
    )
    .all(header.id) as BomDetail["lines"];

  return { ...header, lines };
}

export type SaveBomWorkbenchDraftTreeInput = {
  draftId: string;
  actorId: string | null;
  reason?: string;
  lines: Array<{
    id?: string;
    parentLineId?: string | null;
    nodeType: "item" | "group";
    partNumber?: string | null;
    revision?: string | null;
    groupName?: string | null;
    quantity?: number | null;
    sequenceNo?: number | null;
  }>;
};

export type SetBomWorkbenchActiveDraftInput = {
  draftId: string;
  actorId: string | null;
};

export type SubmitBomWorkbenchDraftReviewInput = {
  draftId: string;
  actorId: string;
  changeReason: string;
};

export type DecideBomWorkbenchReviewInput = {
  reviewId: string;
  actorId: string;
  decisionReason?: string;
};

export type BomWorkbenchLineDiffChange = {
  key: string;
  change_type: "added" | "removed" | "changed" | "unchanged";
  label: string;
  before: BomWorkbenchComparableLine | null;
  after: BomWorkbenchComparableLine | null;
  changed_fields: string[];
};

export type BomWorkbenchComparableLine = {
  key: string;
  node_type: "item" | "group";
  label: string;
  part_number: string | null;
  revision: string | null;
  group_name: string | null;
  quantity: number | string | null;
  quantity_uom_code?: string | null;
  parent_path: string;
  level: number;
  sequence_no: number;
};

export type BomWorkbenchDraftDiffResult = {
  draft: BomWorkbenchDraftDetail;
  base_snapshot: BomReleaseSnapshotDetail | null;
  summary: {
    added_count: number;
    removed_count: number;
    changed_count: number;
    unchanged_count: number;
  };
  changes: BomWorkbenchLineDiffChange[];
};

export type BomWorkbenchPendingReview = {
  id: string;
  bom_draft_id: string;
  status: "PendingReview";
  submitted_by: string;
  submitted_by_name: string | null;
  change_reason: string;
  submitted_at: string;
  parent_submission_id: string;
  parent_part_number: string;
  parent_part_name: string;
  parent_drawing_number: string;
  parent_revision: string;
  draft_name: string;
  review_attempt: number;
  diff: BomWorkbenchDraftDiffResult;
};

const BOM_WORKBENCH_SOURCE_PRIORITY = {
  manual: 30
} as const;

export class BomReleaseGateError extends Error {
  issues: BomReleaseGateIssue[];

  constructor(issues: BomReleaseGateIssue[]) {
    super("BOM_RELEASE_GATE_BLOCKED");
    this.issues = issues;
  }
}

export function saveBomWorkbenchDraftTree(input: SaveBomWorkbenchDraftTreeInput): BomWorkbenchDraftDetail | null {
  const before = getBomWorkbenchDraftById(input.draftId);
  if (!before) return null;
  assertBomDraftMutable(before.status);

  const normalizedLines = normalizeWorkbenchTreeLines(input.lines);
  const database = getDb();
  const now = new Date().toISOString();
  const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");

  const tx = database.transaction(() => {
    database.prepare("DELETE FROM bom_lines_tree WHERE bom_draft_id = ?").run(input.draftId);
    const insertLine = database.prepare(
      `
      INSERT INTO bom_lines_tree (
        id, bom_draft_id, parent_line_id, node_type, item_id, part_number, revision, group_name,
        quantity, sequence_no, source, source_priority, source_ref_id, source_filename,
        created_by, updated_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    );

    for (const line of normalizedLines) {
      const childItem = line.nodeType === "item" && line.partNumber ? (findItem.get(line.partNumber) as { id: string } | undefined) : undefined;
      insertLine.run(
        line.id,
        input.draftId,
        line.parentLineId,
        line.nodeType,
        childItem?.id ?? null,
        line.nodeType === "item" ? line.partNumber : null,
        line.nodeType === "item" ? line.revision : null,
        line.nodeType === "group" ? line.groupName : null,
        line.nodeType === "item" ? line.quantity : null,
        line.sequenceNo,
        "manual",
        BOM_WORKBENCH_SOURCE_PRIORITY.manual,
        null,
        null,
        input.actorId,
        input.actorId,
        now,
        now
      );
    }

    database
      .prepare(
        `
        UPDATE bom_drafts
        SET source = ?,
            line_count = ?,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run("manual", normalizedLines.length, input.actorId, now, input.draftId);

    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "save_tree",
        JSON.stringify({ lineCount: before.lines.length, lines: before.lines }),
        JSON.stringify({ lineCount: normalizedLines.length, lines: normalizedLines }),
        input.reason?.trim() || "Save BOM workbench draft tree",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: before.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchDraftSaved",
    detail: {
      draftId: input.draftId,
      beforeLineCount: before.lines.length,
      afterLineCount: normalizedLines.length,
      reason: input.reason?.trim() || null
    }
  });

  return getBomWorkbenchDraftById(input.draftId);
}

export function setBomWorkbenchActiveDraft(input: SetBomWorkbenchActiveDraftInput): BomWorkbenchDraftDetail | null {
  const before = getBomWorkbenchDraftById(input.draftId);
  if (!before) return null;
  assertBomDraftMutable(before.status);

  const now = new Date().toISOString();
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET is_active = 0,
            updated_at = ?
        WHERE parent_item_id = ?
          AND upper(parent_revision) = upper(?)
          AND is_active = 1
          AND status IN ('Draft', 'Rejected')
      `
      )
      .run(now, before.parent_item_id, before.parent_revision);
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET is_active = 1,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, input.draftId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "set_active",
        JSON.stringify({ isActive: before.is_active }),
        JSON.stringify({ isActive: 1 }),
        "Set active BOM workbench draft",
        now
      );
  });

  tx();

  createAuditLog({
    submissionId: before.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchDraftActivated",
    detail: { draftId: input.draftId, previousActive: before.is_active }
  });

  return getBomWorkbenchDraftById(input.draftId);
}

export function submitBomWorkbenchDraftReview(input: SubmitBomWorkbenchDraftReviewInput) {
  const draft = getBomWorkbenchDraftById(input.draftId);
  if (!draft) return null;
  assertBomDraftMutable(draft.status);
  const changeReason = input.changeReason.trim();
  if (!changeReason) throw new Error("BOM_REVIEW_CHANGE_REASON_REQUIRED");

  const now = new Date().toISOString();
  const reviewId = crypto.randomUUID();
  const database = getDb();
  const existingPendingReview = database
    .prepare(
      `
      SELECT id
      FROM bom_drafts
      WHERE parent_item_id = ?
        AND upper(parent_revision) = upper(?)
        AND status = 'PendingReview'
        AND id <> ?
      LIMIT 1
    `
    )
    .get(draft.parent_item_id, draft.parent_revision, input.draftId) as { id: string } | undefined;
  if (existingPendingReview) throw new Error("BOM_PENDING_REVIEW_EXISTS");

  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'PendingReview',
            review_attempt = review_attempt + 1,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, input.draftId);
    database
      .prepare(
        `
        INSERT INTO bom_review_requests (
          id, bom_draft_id, status, submitted_by, change_reason, submitted_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(reviewId, input.draftId, "PendingReview", input.actorId, changeReason, now);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.draftId,
        input.actorId,
        "submit_review",
        JSON.stringify({ status: draft.status, reviewAttempt: draft.review_attempt }),
        JSON.stringify({ status: "PendingReview", reviewAttempt: draft.review_attempt + 1, reviewId }),
        changeReason,
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewSubmitted",
    detail: { draftId: input.draftId, reviewId, changeReason }
  });

  return getBomWorkbenchReviewById(reviewId);
}

export function approveBomWorkbenchReview(input: DecideBomWorkbenchReviewInput) {
  const review = getBomWorkbenchReviewById(input.reviewId);
  if (!review) return null;
  if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");
  const draft = getBomWorkbenchDraftById(review.bom_draft_id);
  if (!draft) return null;
  if (draft.status !== "PendingReview") throw new Error("BOM_DRAFT_NOT_PENDING_REVIEW");

  const issues = evaluateBomReleaseGate(draft.lines);
  if (issues.length > 0) throw new BomReleaseGateError(issues);

  const now = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_release_snapshots
        SET obsolete_at = ?,
            obsolete_by = ?
        WHERE parent_item_id = ?
          AND upper(parent_revision) = upper(?)
          AND obsolete_at IS NULL
      `
      )
      .run(now, input.actorId, draft.parent_item_id, draft.parent_revision);
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Obsolete',
            updated_by = ?,
            updated_at = ?
        WHERE id IN (
          SELECT bom_draft_id
          FROM bom_release_snapshots
          WHERE parent_item_id = ?
            AND upper(parent_revision) = upper(?)
            AND id <> ?
        )
          AND status = 'Released'
      `
      )
      .run(input.actorId, now, draft.parent_item_id, draft.parent_revision, snapshotId);
    database
      .prepare(
        `
        INSERT INTO bom_release_snapshots (
          id, bom_draft_id, parent_item_id, parent_submission_id, parent_revision,
          line_snapshot_json, line_count, released_by, released_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        snapshotId,
        draft.id,
        draft.parent_item_id,
        draft.parent_submission_id,
        draft.parent_revision,
        JSON.stringify(draft.lines),
        draft.lines.length,
        input.actorId,
        now
      );
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Released',
            is_active = 0,
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, draft.id);
    database
      .prepare(
        `
        UPDATE bom_review_requests
        SET status = 'Approved',
            reviewed_by = ?,
            decision_reason = ?,
            reviewed_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, input.decisionReason?.trim() || null, now, input.reviewId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draft.id,
        input.actorId,
        "approve_release",
        JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        JSON.stringify({ status: "Released", snapshotId }),
        input.decisionReason?.trim() || "Approve BOM release",
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewApproved",
    detail: { draftId: draft.id, reviewId: input.reviewId, snapshotId, decisionReason: input.decisionReason?.trim() || null }
  });

  return {
    review: getBomWorkbenchReviewById(input.reviewId),
    draft: getBomWorkbenchDraftById(draft.id),
    snapshotId
  };
}

export function getBomReleaseSnapshotById(snapshotId: string): BomReleaseSnapshotDetail | null {
  const row = getDb()
    .prepare(
      `
      SELECT
        rs.*,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        u.display_name AS released_by_name
      FROM bom_release_snapshots rs
      JOIN items i ON i.id = rs.parent_item_id
      JOIN submissions s ON s.id = rs.parent_submission_id
      LEFT JOIN users u ON u.id = rs.released_by
      WHERE rs.id = ?
    `
    )
    .get(snapshotId) as
    | (Omit<BomReleaseSnapshotDetail, "lines"> & {
        line_snapshot_json: string;
      })
    | undefined;

  if (!row) return null;

  let lines: BomWorkbenchLine[] = [];
  try {
    const parsed = JSON.parse(row.line_snapshot_json) as unknown;
    if (Array.isArray(parsed)) lines = parsed as BomWorkbenchLine[];
  } catch {
    lines = [];
  }

  const { line_snapshot_json: _lineSnapshotJson, ...snapshot } = row;
  return { ...snapshot, lines };
}

export function getBomWorkbenchDraftDiff(draftId: string): BomWorkbenchDraftDiffResult | null {
  const draft = getBomWorkbenchDraftById(draftId);
  if (!draft) return null;
  const baseSnapshot = getLatestBomReleaseSnapshotForDraft(draft);
  const changes = diffBomWorkbenchLinesShared(baseSnapshot?.lines ?? [], draft.lines);
  return {
    draft,
    base_snapshot: baseSnapshot,
    summary: {
      added_count: changes.filter((change) => change.change_type === "added").length,
      removed_count: changes.filter((change) => change.change_type === "removed").length,
      changed_count: changes.filter((change) => change.change_type === "changed").length,
      unchanged_count: changes.filter((change) => change.change_type === "unchanged").length
    },
    changes
  };
}

export function listPendingBomWorkbenchReviews(): BomWorkbenchPendingReview[] {
  const rows = getDb()
    .prepare(
      `
      SELECT
        rr.id,
        rr.bom_draft_id,
        rr.status,
        rr.submitted_by,
        u.display_name AS submitted_by_name,
        rr.change_reason,
        rr.submitted_at,
        d.parent_submission_id,
        d.draft_name,
        d.review_attempt,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        d.parent_revision
      FROM bom_review_requests rr
      JOIN bom_drafts d ON d.id = rr.bom_draft_id
      JOIN items i ON i.id = d.parent_item_id
      JOIN submissions s ON s.id = d.parent_submission_id
      LEFT JOIN users u ON u.id = rr.submitted_by
      WHERE rr.status = 'PendingReview'
        AND d.status = 'PendingReview'
      ORDER BY datetime(rr.submitted_at) DESC, rr.rowid DESC
    `
    )
    .all() as Array<Omit<BomWorkbenchPendingReview, "diff">>;

  return rows
    .map((row) => {
      const diff = getBomWorkbenchDraftDiff(row.bom_draft_id);
      return diff ? { ...row, diff } : null;
    })
    .filter((row): row is BomWorkbenchPendingReview => Boolean(row));
}

export function rejectBomWorkbenchReview(input: DecideBomWorkbenchReviewInput) {
  const review = getBomWorkbenchReviewById(input.reviewId);
  if (!review) return null;
  if (review.status !== "PendingReview") throw new Error("BOM_REVIEW_NOT_PENDING");
  const draft = getBomWorkbenchDraftById(review.bom_draft_id);
  if (!draft) return null;

  const now = new Date().toISOString();
  const decisionReason = input.decisionReason?.trim() || "";
  const database = getDb();
  const tx = database.transaction(() => {
    database
      .prepare(
        `
        UPDATE bom_drafts
        SET status = 'Rejected',
            updated_by = ?,
            updated_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, now, draft.id);
    database
      .prepare(
        `
        UPDATE bom_review_requests
        SET status = 'Rejected',
            reviewed_by = ?,
            decision_reason = ?,
            reviewed_at = ?
        WHERE id = ?
      `
      )
      .run(input.actorId, decisionReason || null, now, input.reviewId);
    database
      .prepare(
        `
        INSERT INTO bom_edit_events (
          id, bom_draft_id, actor_id, event_type, before_json, after_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        draft.id,
        input.actorId,
        "reject_review",
        JSON.stringify({ status: draft.status, reviewId: input.reviewId }),
        JSON.stringify({ status: "Rejected" }),
        decisionReason || "Reject BOM review",
        now
      );
  });
  tx();

  createAuditLog({
    submissionId: draft.parent_submission_id,
    actorId: input.actorId,
    action: "BomWorkbenchReviewRejected",
    detail: { draftId: draft.id, reviewId: input.reviewId, decisionReason: decisionReason || null }
  });

  return {
    review: getBomWorkbenchReviewById(input.reviewId),
    draft: getBomWorkbenchDraftById(draft.id)
  };
}

export function getBomWorkbenchReviewById(reviewId: string) {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM bom_review_requests
      WHERE id = ?
    `
    )
    .get(reviewId) as
    | {
        id: string;
        bom_draft_id: string;
        status: "PendingReview" | "Approved" | "Rejected" | "Cancelled";
        submitted_by: string;
        reviewed_by: string | null;
        change_reason: string;
        decision_reason: string | null;
        submitted_at: string;
        reviewed_at: string | null;
      }
    | undefined;
}

export function evaluateBomReleaseGate(lines: BomWorkbenchLine[]): BomReleaseGateIssue[] {
  const database = getDb();
  const findItem = database.prepare("SELECT id FROM items WHERE upper(part_number) = upper(?) LIMIT 1");
  const findSubmission = database.prepare(
    `
    SELECT id, revision, status
    FROM submissions
    WHERE item_id = ?
      AND (? IS NULL OR upper(revision) = upper(?))
    ORDER BY
      CASE WHEN status = 'Released' THEN 0 ELSE 1 END,
      datetime(COALESCE(released_at, updated_at, created_at)) DESC,
      rowid DESC
    LIMIT 1
  `
  );
  const latestReleased = database.prepare(
    `
    SELECT revision
    FROM submissions
    WHERE item_id = ?
      AND status = 'Released'
    ORDER BY datetime(COALESCE(released_at, updated_at, created_at)) DESC, rowid DESC
    LIMIT 1
  `
  );

  const issues: BomReleaseGateIssue[] = [];
  for (const line of lines) {
    if (line.node_type !== "item" || !line.part_number) continue;
    const item = findItem.get(line.part_number) as { id: string } | undefined;
    if (!item) {
      issues.push({
        code: "missing_child_item",
        line_id: line.id,
        part_number: line.part_number,
        revision: line.revision,
        message: "Child item does not exist"
      });
      continue;
    }
    const childSubmission = findSubmission.get(item.id, line.revision, line.revision) as
      | { id: string; revision: string; status: string }
      | undefined;
    if (!childSubmission) {
      issues.push({
        code: "missing_child_revision",
        line_id: line.id,
        part_number: line.part_number,
        revision: line.revision,
        message: "Child revision submission does not exist"
      });
      continue;
    }
    if (childSubmission.status !== "Released") {
      issues.push({
        code: "child_not_released",
        line_id: line.id,
        part_number: line.part_number,
        revision: line.revision,
        child_status: childSubmission.status,
        message: "Child revision is not Released"
      });
      continue;
    }
    const latest = latestReleased.get(item.id) as { revision: string } | undefined;
    if (line.revision && latest?.revision && latest.revision.toUpperCase() !== line.revision.toUpperCase()) {
      issues.push({
        code: "child_outdated_revision",
        line_id: line.id,
        part_number: line.part_number,
        revision: line.revision,
        latest_released_revision: latest.revision,
        message: "Child revision is not the latest Released revision"
      });
    }
  }
  return issues;
}

export function getBomWorkbenchBySubmissionId(submissionId: string): BomWorkbenchSummary | null {
  const database = getDb();
  const parent = database
    .prepare(
      `
      SELECT
        s.id AS parent_submission_id,
        s.item_id AS parent_item_id,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.revision AS parent_revision,
        s.status AS parent_status
      FROM submissions s
      JOIN items i ON i.id = s.item_id
      WHERE s.id = ?
    `
    )
    .get(submissionId) as Omit<BomWorkbenchSummary, "drafts" | "active_draft"> | undefined;

  if (!parent) return null;

  const drafts = listBomWorkbenchDraftsBySubmissionId(submissionId);
  const activeSummary = drafts.find((draft) => draft.is_active === 1 && (draft.status === "Draft" || draft.status === "Rejected")) ?? null;
  const activeDraft = activeSummary ? getBomWorkbenchDraftById(activeSummary.id) : null;

  return {
    ...parent,
    drafts,
    active_draft: activeDraft
  };
}

export function listBomWorkbenchDraftsBySubmissionId(submissionId: string): BomWorkbenchDraftSummary[] {
  return getDb()
    .prepare(
      `
      SELECT *
      FROM bom_drafts
      WHERE parent_submission_id = ?
      ORDER BY is_active DESC, datetime(updated_at) DESC, rowid DESC
    `
    )
    .all(submissionId) as BomWorkbenchDraftSummary[];
}

export function getBomWorkbenchDraftById(draftId: string): BomWorkbenchDraftDetail | null {
  const database = getDb();
  const draft = database.prepare("SELECT * FROM bom_drafts WHERE id = ?").get(draftId) as BomWorkbenchDraftSummary | undefined;
  if (!draft) return null;

  const lines = database
    .prepare(
      `
      SELECT
        l.*,
        i.part_name AS part_name
      FROM bom_lines_tree l
      LEFT JOIN items i ON i.id = l.item_id
      WHERE l.bom_draft_id = ?
      ORDER BY COALESCE(l.parent_line_id, ''), l.sequence_no ASC, l.rowid ASC
    `
    )
    .all(draftId) as BomWorkbenchLine[];

  const floatingTopics = database
    .prepare(
      `
      SELECT
        f.*,
        i.part_name AS part_name
      FROM bom_draft_floating_topics f
      LEFT JOIN items i ON i.id = f.item_id
      WHERE f.bom_draft_id = ?
      ORDER BY COALESCE(f.parent_floating_topic_id, ''), f.sequence_no ASC, f.rowid ASC
    `
    )
    .all(draftId) as import("@/lib/types").BomDraftFloatingTopic[];

  return { ...draft, lines, floating_topics: floatingTopics, reconfirmation_flags: [] };
}

type NormalizedWorkbenchTreeLine = {
  id: string;
  parentLineId: string | null;
  nodeType: "item" | "group";
  partNumber: string | null;
  revision: string | null;
  groupName: string | null;
  quantity: number | null;
  sequenceNo: number;
};

function assertBomDraftMutable(status: BomWorkbenchDraftSummary["status"]) {
  if (status !== "Draft" && status !== "Rejected") {
    throw new Error("BOM_DRAFT_NOT_MUTABLE");
  }
}

function getLatestBomReleaseSnapshotForDraft(draft: BomWorkbenchDraftDetail): BomReleaseSnapshotDetail | null {
  const row = getDb()
    .prepare(
      `
      SELECT id
      FROM bom_release_snapshots
      WHERE parent_item_id = ?
        AND bom_draft_id <> ?
      ORDER BY
        CASE WHEN obsolete_at IS NULL THEN 0 ELSE 1 END,
        datetime(released_at) DESC,
        rowid DESC
      LIMIT 1
    `
    )
    .get(draft.parent_item_id, draft.id) as { id: string } | undefined;
  return row ? getBomReleaseSnapshotById(row.id) : null;
}

function normalizeWorkbenchTreeLines(lines: SaveBomWorkbenchDraftTreeInput["lines"]): NormalizedWorkbenchTreeLine[] {
  const normalized = lines.map((line, index) => normalizeWorkbenchTreeLine(line, index));
  const byId = new Map<string, NormalizedWorkbenchTreeLine>();
  for (const line of normalized) {
    if (byId.has(line.id)) throw new Error("BOM_DUPLICATE_LINE_ID");
    byId.set(line.id, line);
  }
  for (const line of normalized) {
    if (line.parentLineId && !byId.has(line.parentLineId)) throw new Error("BOM_PARENT_LINE_NOT_FOUND");
    if (line.parentLineId === line.id) throw new Error("BOM_CYCLE_DETECTED");
  }

  const merged = mergeDuplicateSiblingItems(normalized);
  validateTreeDepthAndCycles(merged);
  return sortWorkbenchTreeLines(merged);
}

function normalizeWorkbenchTreeLine(
  line: SaveBomWorkbenchDraftTreeInput["lines"][number],
  index: number
): NormalizedWorkbenchTreeLine {
  const nodeType = line.nodeType;
  if (nodeType !== "item" && nodeType !== "group") throw new Error("BOM_INVALID_NODE_TYPE");
  const id = line.id?.trim() || crypto.randomUUID();
  const parentLineId = line.parentLineId?.trim() || null;
  const sequenceNo = Number.isFinite(Number(line.sequenceNo)) ? Number(line.sequenceNo) : index + 1;
  if (sequenceNo < 1) throw new Error("BOM_INVALID_SEQUENCE");

  if (nodeType === "group") {
    const groupName = line.groupName?.trim();
    if (!groupName) throw new Error("BOM_GROUP_NAME_REQUIRED");
    return {
      id,
      parentLineId,
      nodeType,
      partNumber: null,
      revision: null,
      groupName,
      quantity: null,
      sequenceNo
    };
  }

  const partNumber = line.partNumber?.trim();
  if (!partNumber) throw new Error("BOM_PART_NUMBER_REQUIRED");
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("BOM_INVALID_QUANTITY");
  return {
    id,
    parentLineId,
    nodeType,
    partNumber,
    revision: line.revision?.trim() || null,
    groupName: null,
    quantity,
    sequenceNo
  };
}

function mergeDuplicateSiblingItems(lines: NormalizedWorkbenchTreeLine[]) {
  const bySiblingItem = new Map<string, NormalizedWorkbenchTreeLine>();
  const duplicateToKept = new Map<string, string>();
  const merged: NormalizedWorkbenchTreeLine[] = [];

  for (const line of lines.sort((a, b) => a.sequenceNo - b.sequenceNo)) {
    if (line.nodeType !== "item") {
      merged.push(line);
      continue;
    }
    const key = [
      line.parentLineId ?? "ROOT",
      line.partNumber?.trim().toUpperCase() ?? "",
      line.revision?.trim().toUpperCase() ?? ""
    ].join("::");
    const existing = bySiblingItem.get(key);
    if (existing) {
      existing.quantity = Number(existing.quantity ?? 0) + Number(line.quantity ?? 0);
      duplicateToKept.set(line.id, existing.id);
      continue;
    }
    bySiblingItem.set(key, line);
    merged.push(line);
  }

  return merged.map((line) => ({
    ...line,
    parentLineId: line.parentLineId && duplicateToKept.has(line.parentLineId) ? (duplicateToKept.get(line.parentLineId) ?? line.parentLineId) : line.parentLineId
  }));
}

function validateTreeDepthAndCycles(lines: NormalizedWorkbenchTreeLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const visiting = new Set<string>();
  const visitedDepth = new Map<string, number>();

  function depthOf(line: NormalizedWorkbenchTreeLine): number {
    const existingDepth = visitedDepth.get(line.id);
    if (existingDepth) return existingDepth;
    if (visiting.has(line.id)) throw new Error("BOM_CYCLE_DETECTED");
    visiting.add(line.id);
    const parentDepth = line.parentLineId ? depthOf(byId.get(line.parentLineId) ?? failMissingParent()) : 0;
    visiting.delete(line.id);
    const depth = parentDepth + 1;
    if (depth > 10) throw new Error("BOM_MAX_DEPTH_EXCEEDED");
    visitedDepth.set(line.id, depth);
    return depth;
  }

  for (const line of lines) depthOf(line);
}

function failMissingParent(): never {
  throw new Error("BOM_PARENT_LINE_NOT_FOUND");
}

function sortWorkbenchTreeLines(lines: NormalizedWorkbenchTreeLine[]) {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const depthCache = new Map<string, number>();
  const depthOf = (line: NormalizedWorkbenchTreeLine): number => {
    const cached = depthCache.get(line.id);
    if (cached) return cached;
    const depth = line.parentLineId ? depthOf(byId.get(line.parentLineId) ?? line) + 1 : 1;
    depthCache.set(line.id, depth);
    return depth;
  };
  return [...lines].sort((a, b) => depthOf(a) - depthOf(b) || a.sequenceNo - b.sequenceNo || a.id.localeCompare(b.id));
}

export function findPreviousBomSubmissionId(targetSubmissionId: string) {
  const target = getSubmission(targetSubmissionId);
  if (!target) return null;

  const rows = getDb()
    .prepare(
      `
      SELECT s.id
      FROM submissions s
      JOIN bom_headers h ON h.parent_submission_id = s.id
      WHERE s.item_id = ?
      ORDER BY datetime(s.created_at) ASC, s.rowid ASC
    `
    )
    .all(target.item_id) as Array<{ id: string }>;

  const targetIndex = rows.findIndex((row) => row.id === targetSubmissionId);
  if (targetIndex <= 0) return null;
  return rows[targetIndex - 1]?.id ?? null;
}

export function getBomDiffBetweenSubmissions(input: { baseSubmissionId: string; targetSubmissionId: string }): BomDiffResult | null {
  const baseSubmission = getSubmission(input.baseSubmissionId);
  const targetSubmission = getSubmission(input.targetSubmissionId);
  const baseBom = getBomBySubmissionId(input.baseSubmissionId);
  const targetBom = getBomBySubmissionId(input.targetSubmissionId);
  if (!baseSubmission || !targetSubmission || !baseBom || !targetBom) return null;
  return buildBomSubmissionDiff(baseSubmission, targetSubmission, baseBom.lines, targetBom.lines);
}

export function listWhereUsed(input: { partNumber: string; submittedBy?: string }) {
  const filters = ["upper(l.child_part_number) = upper(?)"];
  const values: unknown[] = [input.partNumber.trim()];
  if (input.submittedBy) {
    filters.push("s.submitted_by = ?");
    values.push(input.submittedBy);
  }

  return getDb()
    .prepare(
      `
      SELECT
        h.parent_submission_id,
        h.parent_item_id,
        i.part_number AS parent_part_number,
        i.part_name AS parent_part_name,
        s.drawing_number AS parent_drawing_number,
        s.revision AS parent_revision,
        s.status AS parent_status,
        s.submitted_by AS parent_submitted_by,
        u.display_name AS parent_submitted_by_name,
        h.id AS bom_header_id,
        h.status AS bom_status,
        l.child_part_number,
        l.child_revision,
        child_s.id AS child_submission_id,
        child_s.drawing_number AS child_drawing_number,
        child_s.status AS child_status,
        latest_released.revision AS child_latest_released_revision,
        CASE
          WHEN l.child_revision IS NOT NULL
            AND latest_released.revision IS NOT NULL
            AND upper(l.child_revision) <> upper(latest_released.revision)
          THEN 1
          ELSE 0
        END AS child_is_outdated,
        l.quantity,
        l.source_filename,
        s.created_at AS parent_created_at,
        s.released_at AS parent_released_at
      FROM bom_lines l
      JOIN bom_headers h ON h.id = l.bom_header_id
      JOIN submissions s ON s.id = h.parent_submission_id
      JOIN items i ON i.id = h.parent_item_id
      JOIN users u ON u.id = s.submitted_by
      LEFT JOIN items child_i ON upper(child_i.part_number) = upper(l.child_part_number)
      LEFT JOIN submissions child_s ON child_s.id = (
        SELECT cs.id
        FROM submissions cs
        WHERE cs.item_id = child_i.id
          AND (l.child_revision IS NULL OR upper(cs.revision) = upper(l.child_revision))
        ORDER BY
          CASE WHEN cs.status = 'Released' THEN 0 ELSE 1 END,
          datetime(COALESCE(cs.released_at, cs.updated_at, cs.created_at)) DESC,
          cs.rowid DESC
        LIMIT 1
      )
      LEFT JOIN submissions latest_released ON latest_released.id = (
        SELECT lr.id
        FROM submissions lr
        WHERE lr.item_id = child_i.id
          AND lr.status = 'Released'
        ORDER BY datetime(COALESCE(lr.released_at, lr.updated_at, lr.created_at)) DESC, lr.rowid DESC
        LIMIT 1
      )
      WHERE ${filters.join(" AND ")}
      ORDER BY child_is_outdated DESC, datetime(COALESCE(s.released_at, s.updated_at, s.created_at)) DESC, s.id DESC
    `
    )
    .all(...values) as WhereUsedEntry[];
}
