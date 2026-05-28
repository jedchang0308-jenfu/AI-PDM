import crypto from "node:crypto";
import { createAuditLog, getDb } from "@/lib/db";
import type { ChangeRequest, DiscussionComment, PhaseGateCheck, PdfMarkup, ReviewIssue } from "@/lib/types";

export function listDiscussionComments(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        c.*,
        f.original_filename AS file_original_filename,
        author.display_name AS author_name,
        resolver.display_name AS resolved_by_name
      FROM discussion_comments c
      LEFT JOIN submission_files f ON f.id = c.file_id
      JOIN users author ON author.id = c.author_id
      LEFT JOIN users resolver ON resolver.id = c.resolved_by
      WHERE c.submission_id = ?
      ORDER BY datetime(c.created_at) ASC, c.rowid ASC
    `
    )
    .all(submissionId) as DiscussionComment[];
}

export function getDiscussionComment(input: { submissionId: string; commentId: string }) {
  return listDiscussionComments(input.submissionId).find((comment) => comment.id === input.commentId) ?? null;
}

export function createDiscussionComment(input: { submissionId: string; fileId?: string | null; authorId: string; body: string }) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO discussion_comments (
        id, submission_id, file_id, author_id, body, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId ?? null, input.authorId, input.body, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.authorId,
    action: "DiscussionCommentCreated",
    detail: { commentId: id, fileId: input.fileId ?? null }
  });

  return getDiscussionComment({ submissionId: input.submissionId, commentId: id });
}

export function resolveDiscussionComment(input: { submissionId: string; commentId: string; resolvedBy: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE discussion_comments
      SET status = 'resolved', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, now, now, input.submissionId, input.commentId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "DiscussionCommentResolved",
    detail: { commentId: input.commentId }
  });

  return getDiscussionComment({ submissionId: input.submissionId, commentId: input.commentId });
}

export function listReviewIssues(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        i.*,
        f.original_filename AS file_original_filename,
        raiser.display_name AS raised_by_name,
        assignee.display_name AS assignee_name,
        resolver.display_name AS resolved_by_name
      FROM review_issues i
      LEFT JOIN submission_files f ON f.id = i.file_id
      JOIN users raiser ON raiser.id = i.raised_by
      LEFT JOIN users assignee ON assignee.id = i.assignee_id
      LEFT JOIN users resolver ON resolver.id = i.resolved_by
      WHERE i.submission_id = ?
      ORDER BY
        CASE i.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(i.created_at) ASC,
        i.rowid ASC
    `
    )
    .all(submissionId) as ReviewIssue[];
}

export function getReviewIssue(input: { submissionId: string; issueId: string }) {
  return listReviewIssues(input.submissionId).find((issue) => issue.id === input.issueId) ?? null;
}

export function createReviewIssue(input: {
  submissionId: string;
  fileId?: string | null;
  raisedBy: string;
  assigneeId?: string | null;
  title: string;
  description: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO review_issues (
        id, submission_id, file_id, title, description, status, raised_by, assignee_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId ?? null, input.title, input.description, input.raisedBy, input.assigneeId ?? null, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.raisedBy,
    action: "ReviewIssueCreated",
    detail: { issueId: id, fileId: input.fileId ?? null, assigneeId: input.assigneeId ?? null, title: input.title }
  });

  return getReviewIssue({ submissionId: input.submissionId, issueId: id });
}

export function resolveReviewIssue(input: { submissionId: string; issueId: string; resolvedBy: string; resolution: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE review_issues
      SET status = 'resolved', resolved_by = ?, resolution = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, input.resolution, now, now, input.submissionId, input.issueId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "ReviewIssueResolved",
    detail: { issueId: input.issueId, resolution: input.resolution }
  });

  return getReviewIssue({ submissionId: input.submissionId, issueId: input.issueId });
}

export function listChangeRequests(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        c.*,
        requester.display_name AS requested_by_name,
        decider.display_name AS decided_by_name
      FROM change_requests c
      JOIN users requester ON requester.id = c.requested_by
      LEFT JOIN users decider ON decider.id = c.decided_by
      WHERE c.submission_id = ?
      ORDER BY
        CASE c.status WHEN 'open' THEN 0 ELSE 1 END,
        datetime(c.created_at) ASC,
        c.rowid ASC
    `
    )
    .all(submissionId) as ChangeRequest[];
}

export function getChangeRequest(input: { submissionId: string; changeId: string }) {
  return listChangeRequests(input.submissionId).find((change) => change.id === input.changeId) ?? null;
}

export function createChangeRequest(input: {
  submissionId: string;
  requestedBy: string;
  kind: ChangeRequest["kind"];
  title: string;
  reason: string;
  impact: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO change_requests (
        id, submission_id, kind, title, reason, impact, status, requested_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.kind, input.title, input.reason, input.impact, input.requestedBy, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.requestedBy,
    action: "ChangeRequestCreated",
    detail: { changeId: id, kind: input.kind, title: input.title }
  });

  return getChangeRequest({ submissionId: input.submissionId, changeId: id });
}

export function decideChangeRequest(input: {
  submissionId: string;
  changeId: string;
  decidedBy: string;
  status: "approved" | "rejected" | "closed";
  comment: string;
}) {
  const existing = getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到變更需求" };
  if (existing.status !== "open") {
    return { ok: false as const, status: 409, error: "只有未結案的變更需求可以決議" };
  }

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE change_requests
      SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.status, input.decidedBy, input.comment, now, now, input.submissionId, input.changeId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "ChangeRequestDecided",
    detail: { changeId: input.changeId, status: input.status, comment: input.comment }
  });

  return { ok: true as const, change: getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId }) };
}

const DEFAULT_PHASE_GATE_CHECKS: Array<{
  gateCode: PhaseGateCheck["gate_code"];
  gateName: string;
  checklistItem: string;
  required: 0 | 1;
}> = [
  {
    gateCode: "concept",
    gateName: "概念關卡",
    checklistItem: "變更目的、零件範圍與業務原因已清楚定義。",
    required: 1
  },
  {
    gateCode: "design",
    gateName: "設計關卡",
    checklistItem: "CAD 檔案、圖面、材質與版次中繼資料皆可審閱。",
    required: 1
  },
  {
    gateCode: "verification",
    gateName: "驗證關卡",
    checklistItem: "BOM、使用處影響、風險提示或審核問題已檢查。",
    required: 1
  },
  {
    gateCode: "release",
    gateName: "發布關卡",
    checklistItem: "發布包、製造交接與外部影響已確認就緒。",
    required: 1
  }
];

export function listPhaseGateChecks(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        p.*,
        creator.display_name AS created_by_name,
        decider.display_name AS decided_by_name
      FROM phase_gate_checks p
      JOIN users creator ON creator.id = p.created_by
      LEFT JOIN users decider ON decider.id = p.decided_by
      WHERE p.submission_id = ?
      ORDER BY
        CASE p.gate_code
          WHEN 'concept' THEN 1
          WHEN 'design' THEN 2
          WHEN 'verification' THEN 3
          WHEN 'release' THEN 4
          ELSE 5
        END,
        p.rowid ASC
    `
    )
    .all(submissionId) as PhaseGateCheck[];
}

export function getPhaseGateCheck(input: { submissionId: string; checkId: string }) {
  return listPhaseGateChecks(input.submissionId).find((check) => check.id === input.checkId) ?? null;
}

export function initializePhaseGateChecks(input: { submissionId: string; createdBy: string }) {
  const database = getDb();
  const existing = listPhaseGateChecks(input.submissionId);
  if (existing.length > 0) return { created: false, checks: existing };

  const now = new Date().toISOString();
  const insert = database.prepare(
    `
    INSERT INTO phase_gate_checks (
      id, submission_id, gate_code, gate_name, checklist_item, required, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
  `
  );
  const createDefaults = database.transaction(() => {
    for (const item of DEFAULT_PHASE_GATE_CHECKS) {
      insert.run(
        crypto.randomUUID(),
        input.submissionId,
        item.gateCode,
        item.gateName,
        item.checklistItem,
        item.required,
        input.createdBy,
        now,
        now
      );
    }
  });
  createDefaults();

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.createdBy,
    action: "PhaseGateInitialized",
    detail: { checkCount: DEFAULT_PHASE_GATE_CHECKS.length }
  });

  return { created: true, checks: listPhaseGateChecks(input.submissionId) };
}

export function decidePhaseGateCheck(input: {
  submissionId: string;
  checkId: string;
  decidedBy: string;
  status: "completed" | "waived";
  comment: string;
}) {
  const existing = getPhaseGateCheck({ submissionId: input.submissionId, checkId: input.checkId });
  if (!existing) return { ok: false as const, status: 404, error: "找不到階段關卡檢核項目" };
  if (existing.status !== "open") return { ok: false as const, status: 409, error: "只有未結案的階段關卡可以決議" };

  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE phase_gate_checks
      SET status = ?, decided_by = ?, decision_comment = ?, decided_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.status, input.decidedBy, input.comment, now, now, input.submissionId, input.checkId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.decidedBy,
    action: "PhaseGateDecided",
    detail: { checkId: input.checkId, status: input.status, comment: input.comment }
  });

  return { ok: true as const, check: getPhaseGateCheck({ submissionId: input.submissionId, checkId: input.checkId }) };
}

export function listOpenRequiredPhaseGateChecks(submissionId: string) {
  return listPhaseGateChecks(submissionId).filter((check) => check.required === 1 && check.status === "open");
}

export function listPdfMarkups(submissionId: string) {
  return getDb()
    .prepare(
      `
      SELECT
        m.*,
        f.original_filename AS file_original_filename,
        author.display_name AS author_name,
        resolver.display_name AS resolved_by_name
      FROM pdf_markups m
      JOIN submission_files f ON f.id = m.file_id
      JOIN users author ON author.id = m.author_id
      LEFT JOIN users resolver ON resolver.id = m.resolved_by
      WHERE m.submission_id = ?
      ORDER BY
        CASE m.status WHEN 'open' THEN 0 ELSE 1 END,
        f.original_filename ASC,
        m.page_number ASC,
        m.y_percent ASC,
        m.x_percent ASC,
        datetime(m.created_at) ASC,
        m.rowid ASC
    `
    )
    .all(submissionId) as PdfMarkup[];
}

export function getPdfMarkup(input: { submissionId: string; markupId: string }) {
  return listPdfMarkups(input.submissionId).find((markup) => markup.id === input.markupId) ?? null;
}

export function createPdfMarkup(input: {
  submissionId: string;
  fileId: string;
  authorId: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  body: string;
}) {
  const database = getDb();
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  database
    .prepare(
      `
      INSERT INTO pdf_markups (
        id, submission_id, file_id, page_number, x_percent, y_percent, body, status, author_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
    `
    )
    .run(id, input.submissionId, input.fileId, input.pageNumber, input.xPercent, input.yPercent, input.body, input.authorId, now, now);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.authorId,
    action: "PdfMarkupCreated",
    detail: {
      markupId: id,
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      xPercent: input.xPercent,
      yPercent: input.yPercent
    }
  });

  return getPdfMarkup({ submissionId: input.submissionId, markupId: id });
}

export function resolvePdfMarkup(input: { submissionId: string; markupId: string; resolvedBy: string }) {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `
      UPDATE pdf_markups
      SET status = 'resolved', resolved_by = ?, resolved_at = ?, updated_at = ?
      WHERE submission_id = ? AND id = ?
    `
    )
    .run(input.resolvedBy, now, now, input.submissionId, input.markupId);

  createAuditLog({
    submissionId: input.submissionId,
    actorId: input.resolvedBy,
    action: "PdfMarkupResolved",
    detail: { markupId: input.markupId }
  });

  return getPdfMarkup({ submissionId: input.submissionId, markupId: input.markupId });
}
