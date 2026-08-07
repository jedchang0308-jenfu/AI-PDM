import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncAuditRepository } from "@/lib/repositories/audit-async-repository";
import type { ChangeRequest, DiscussionComment, PdfMarkup, ReviewIssue } from "@/lib/types";

export const SELECT_ASYNC_DISCUSSION_COMMENTS_SQL = `
  SELECT
    c.*,
    f.original_filename AS file_original_filename,
    author.display_name AS author_name,
    resolver.display_name AS resolved_by_name
  FROM discussion_comments c
  LEFT JOIN submission_files f ON f.id = c.file_id
  JOIN users author ON author.id = c.author_id
  LEFT JOIN users resolver ON resolver.id = c.resolved_by
  WHERE c.submission_id = :submissionId
  ORDER BY c.created_at ASC, c.id ASC
`;

export const INSERT_ASYNC_DISCUSSION_COMMENT_SQL = `
  INSERT INTO discussion_comments (
    id, submission_id, file_id, author_id, body, status, created_at, updated_at
  ) VALUES (:id, :submissionId, :fileId, :authorId, :body, 'open', :now, :now)
`;

export const RESOLVE_ASYNC_DISCUSSION_COMMENT_SQL = `
  UPDATE discussion_comments
  SET status = 'resolved',
      resolved_by = :resolvedBy,
      resolved_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :commentId
`;

export const SELECT_ASYNC_REVIEW_ISSUES_SQL = `
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
  WHERE i.submission_id = :submissionId
  ORDER BY
    CASE i.status WHEN 'open' THEN 0 ELSE 1 END,
    i.created_at ASC,
    i.id ASC
`;

export const INSERT_ASYNC_REVIEW_ISSUE_SQL = `
  INSERT INTO review_issues (
    id, submission_id, file_id, title, description, status, raised_by, assignee_id, created_at, updated_at
  ) VALUES (:id, :submissionId, :fileId, :title, :description, 'open', :raisedBy, :assigneeId, :now, :now)
`;

export const RESOLVE_ASYNC_REVIEW_ISSUE_SQL = `
  UPDATE review_issues
  SET status = 'resolved',
      resolved_by = :resolvedBy,
      resolution = :resolution,
      resolved_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :issueId
`;

export const SELECT_ASYNC_PDF_MARKUPS_SQL = `
  SELECT
    m.*,
    f.original_filename AS file_original_filename,
    author.display_name AS author_name,
    resolver.display_name AS resolved_by_name
  FROM pdf_markups m
  JOIN submission_files f ON f.id = m.file_id
  JOIN users author ON author.id = m.author_id
  LEFT JOIN users resolver ON resolver.id = m.resolved_by
  WHERE m.submission_id = :submissionId
  ORDER BY
    CASE m.status WHEN 'open' THEN 0 ELSE 1 END,
    f.original_filename ASC,
    m.page_number ASC,
    m.y_percent ASC,
    m.x_percent ASC,
    m.created_at ASC,
    m.id ASC
`;

export const INSERT_ASYNC_PDF_MARKUP_SQL = `
  INSERT INTO pdf_markups (
    id, submission_id, file_id, page_number, x_percent, y_percent, body, status, author_id, created_at, updated_at
  ) VALUES (:id, :submissionId, :fileId, :pageNumber, :xPercent, :yPercent, :body, 'open', :authorId, :now, :now)
`;

export const RESOLVE_ASYNC_PDF_MARKUP_SQL = `
  UPDATE pdf_markups
  SET status = 'resolved',
      resolved_by = :resolvedBy,
      resolved_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :markupId
`;

export const SELECT_ASYNC_CHANGE_REQUESTS_SQL = `
  SELECT
    c.*,
    requester.display_name AS requested_by_name,
    decider.display_name AS decided_by_name
  FROM change_requests c
  JOIN users requester ON requester.id = c.requested_by
  LEFT JOIN users decider ON decider.id = c.decided_by
  WHERE c.submission_id = :submissionId
  ORDER BY
    CASE c.status WHEN 'open' THEN 0 ELSE 1 END,
    c.created_at ASC,
    c.id ASC
`;

export const INSERT_ASYNC_CHANGE_REQUEST_SQL = `
  INSERT INTO change_requests (
    id, submission_id, kind, title, reason, impact, status, requested_by, created_at, updated_at
  ) VALUES (:id, :submissionId, :kind, :title, :reason, :impact, 'open', :requestedBy, :now, :now)
`;

export const DECIDE_ASYNC_CHANGE_REQUEST_SQL = `
  UPDATE change_requests
  SET status = :status,
      decided_by = :decidedBy,
      decision_comment = :comment,
      decided_at = :now,
      updated_at = :now
  WHERE submission_id = :submissionId
    AND id = :changeId
`;

export type AsyncChangeRequestDecisionResult =
  | { ok: true; change: ChangeRequest | null }
  | { ok: false; status: 404 | 409; error: string };

export class AsyncCollaborationRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listDiscussionComments(submissionId: string): Promise<DiscussionComment[]> {
    return this.client.query<DiscussionComment>(SELECT_ASYNC_DISCUSSION_COMMENTS_SQL, { submissionId });
  }

  async getDiscussionComment(input: { submissionId: string; commentId: string }): Promise<DiscussionComment | null> {
    const comments = await this.listDiscussionComments(input.submissionId);
    return comments.find((comment) => comment.id === input.commentId) ?? null;
  }

  async createDiscussionComment(input: {
    submissionId: string;
    fileId?: string | null;
    authorId: string;
    body: string;
  }): Promise<DiscussionComment | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_DISCUSSION_COMMENT_SQL, {
      id,
      submissionId: input.submissionId,
      fileId: input.fileId ?? null,
      authorId: input.authorId,
      body: input.body,
      now
    });
    await this.audit("DiscussionCommentCreated", input.submissionId, input.authorId, {
      commentId: id,
      fileId: input.fileId ?? null
    });
    return this.getDiscussionComment({ submissionId: input.submissionId, commentId: id });
  }

  async resolveDiscussionComment(input: {
    submissionId: string;
    commentId: string;
    resolvedBy: string;
  }): Promise<DiscussionComment | null> {
    const now = this.clock();
    await this.client.execute(RESOLVE_ASYNC_DISCUSSION_COMMENT_SQL, {
      submissionId: input.submissionId,
      commentId: input.commentId,
      resolvedBy: input.resolvedBy,
      now
    });
    await this.audit("DiscussionCommentResolved", input.submissionId, input.resolvedBy, {
      commentId: input.commentId
    });
    return this.getDiscussionComment({ submissionId: input.submissionId, commentId: input.commentId });
  }

  async listReviewIssues(submissionId: string): Promise<ReviewIssue[]> {
    return this.client.query<ReviewIssue>(SELECT_ASYNC_REVIEW_ISSUES_SQL, { submissionId });
  }

  async getReviewIssue(input: { submissionId: string; issueId: string }): Promise<ReviewIssue | null> {
    const issues = await this.listReviewIssues(input.submissionId);
    return issues.find((issue) => issue.id === input.issueId) ?? null;
  }

  async createReviewIssue(input: {
    submissionId: string;
    fileId?: string | null;
    raisedBy: string;
    assigneeId?: string | null;
    title: string;
    description: string;
  }): Promise<ReviewIssue | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_REVIEW_ISSUE_SQL, {
      id,
      submissionId: input.submissionId,
      fileId: input.fileId ?? null,
      title: input.title,
      description: input.description,
      raisedBy: input.raisedBy,
      assigneeId: input.assigneeId ?? null,
      now
    });
    await this.audit("ReviewIssueCreated", input.submissionId, input.raisedBy, {
      issueId: id,
      fileId: input.fileId ?? null,
      assigneeId: input.assigneeId ?? null,
      title: input.title
    });
    return this.getReviewIssue({ submissionId: input.submissionId, issueId: id });
  }

  async resolveReviewIssue(input: {
    submissionId: string;
    issueId: string;
    resolvedBy: string;
    resolution: string;
  }): Promise<ReviewIssue | null> {
    const now = this.clock();
    await this.client.execute(RESOLVE_ASYNC_REVIEW_ISSUE_SQL, {
      submissionId: input.submissionId,
      issueId: input.issueId,
      resolvedBy: input.resolvedBy,
      resolution: input.resolution,
      now
    });
    await this.audit("ReviewIssueResolved", input.submissionId, input.resolvedBy, {
      issueId: input.issueId,
      resolution: input.resolution
    });
    return this.getReviewIssue({ submissionId: input.submissionId, issueId: input.issueId });
  }

  async listPdfMarkups(submissionId: string): Promise<PdfMarkup[]> {
    return this.client.query<PdfMarkup>(SELECT_ASYNC_PDF_MARKUPS_SQL, { submissionId });
  }

  async getPdfMarkup(input: { submissionId: string; markupId: string }): Promise<PdfMarkup | null> {
    const markups = await this.listPdfMarkups(input.submissionId);
    return markups.find((markup) => markup.id === input.markupId) ?? null;
  }

  async createPdfMarkup(input: {
    submissionId: string;
    fileId: string;
    authorId: string;
    pageNumber: number;
    xPercent: number;
    yPercent: number;
    body: string;
  }): Promise<PdfMarkup | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_PDF_MARKUP_SQL, {
      id,
      submissionId: input.submissionId,
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      xPercent: input.xPercent,
      yPercent: input.yPercent,
      body: input.body,
      authorId: input.authorId,
      now
    });
    await this.audit("PdfMarkupCreated", input.submissionId, input.authorId, {
      markupId: id,
      fileId: input.fileId,
      pageNumber: input.pageNumber,
      xPercent: input.xPercent,
      yPercent: input.yPercent
    });
    return this.getPdfMarkup({ submissionId: input.submissionId, markupId: id });
  }

  async resolvePdfMarkup(input: { submissionId: string; markupId: string; resolvedBy: string }): Promise<PdfMarkup | null> {
    const now = this.clock();
    await this.client.execute(RESOLVE_ASYNC_PDF_MARKUP_SQL, {
      submissionId: input.submissionId,
      markupId: input.markupId,
      resolvedBy: input.resolvedBy,
      now
    });
    await this.audit("PdfMarkupResolved", input.submissionId, input.resolvedBy, {
      markupId: input.markupId
    });
    return this.getPdfMarkup({ submissionId: input.submissionId, markupId: input.markupId });
  }

  async listChangeRequests(submissionId: string): Promise<ChangeRequest[]> {
    return this.client.query<ChangeRequest>(SELECT_ASYNC_CHANGE_REQUESTS_SQL, { submissionId });
  }

  async getChangeRequest(input: { submissionId: string; changeId: string }): Promise<ChangeRequest | null> {
    const changes = await this.listChangeRequests(input.submissionId);
    return changes.find((change) => change.id === input.changeId) ?? null;
  }

  async createChangeRequest(input: {
    submissionId: string;
    requestedBy: string;
    kind: ChangeRequest["kind"];
    title: string;
    reason: string;
    impact: string;
  }): Promise<ChangeRequest | null> {
    const id = this.idFactory();
    const now = this.clock();
    await this.client.execute(INSERT_ASYNC_CHANGE_REQUEST_SQL, {
      id,
      submissionId: input.submissionId,
      kind: input.kind,
      title: input.title,
      reason: input.reason,
      impact: input.impact,
      requestedBy: input.requestedBy,
      now
    });
    await this.audit("ChangeRequestCreated", input.submissionId, input.requestedBy, {
      changeId: id,
      kind: input.kind,
      title: input.title
    });
    return this.getChangeRequest({ submissionId: input.submissionId, changeId: id });
  }

  async decideChangeRequest(input: {
    submissionId: string;
    changeId: string;
    decidedBy: string;
    status: "approved" | "rejected" | "closed";
    comment: string;
  }): Promise<AsyncChangeRequestDecisionResult> {
    const existing = await this.getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId });
    if (!existing) return { ok: false, status: 404, error: "Change request not found" };
    if (existing.status !== "open") {
      return { ok: false, status: 409, error: "Change request is already decided" };
    }

    const now = this.clock();
    await this.client.execute(DECIDE_ASYNC_CHANGE_REQUEST_SQL, {
      submissionId: input.submissionId,
      changeId: input.changeId,
      decidedBy: input.decidedBy,
      status: input.status,
      comment: input.comment,
      now
    });
    await this.audit("ChangeRequestDecided", input.submissionId, input.decidedBy, {
      changeId: input.changeId,
      status: input.status,
      comment: input.comment
    });

    return {
      ok: true,
      change: await this.getChangeRequest({ submissionId: input.submissionId, changeId: input.changeId })
    };
  }

  private async audit(action: string, submissionId: string, actorId: string, detail: Record<string, unknown>) {
    await new AsyncAuditRepository(this.client, this.clock).createAuditLog({
      submissionId,
      actorId,
      action,
      detail
    });
  }
}
