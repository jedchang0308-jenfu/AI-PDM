import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncCollaborationRepository } from "@/lib/repositories/collaboration-async-repository";

export async function listDiscussionCommentsAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listDiscussionComments(submissionId);
}

export async function getDiscussionCommentAsync(input: { submissionId: string; commentId: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).getDiscussionComment(input);
}

export async function createDiscussionCommentAsync(input: {
  submissionId: string;
  fileId?: string | null;
  authorId: string;
  body: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).createDiscussionComment(input);
}

export async function resolveDiscussionCommentAsync(input: { submissionId: string; commentId: string; resolvedBy: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).resolveDiscussionComment(input);
}

export async function listReviewIssuesAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listReviewIssues(submissionId);
}

export async function getReviewIssueAsync(input: { submissionId: string; issueId: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).getReviewIssue(input);
}

export async function createReviewIssueAsync(input: {
  submissionId: string;
  fileId?: string | null;
  raisedBy: string;
  assigneeId?: string | null;
  title: string;
  description: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).createReviewIssue(input);
}

export async function resolveReviewIssueAsync(input: {
  submissionId: string;
  issueId: string;
  resolvedBy: string;
  resolution: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).resolveReviewIssue(input);
}

export async function listPdfMarkupsAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listPdfMarkups(submissionId);
}

export async function getPdfMarkupAsync(input: { submissionId: string; markupId: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).getPdfMarkup(input);
}

export async function createPdfMarkupAsync(input: {
  submissionId: string;
  fileId: string;
  authorId: string;
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  body: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).createPdfMarkup(input);
}

export async function resolvePdfMarkupAsync(input: { submissionId: string; markupId: string; resolvedBy: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).resolvePdfMarkup(input);
}

export async function listChangeRequestsAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listChangeRequests(submissionId);
}

export async function getChangeRequestAsync(input: { submissionId: string; changeId: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).getChangeRequest(input);
}

export async function createChangeRequestAsync(input: {
  submissionId: string;
  requestedBy: string;
  kind: "ECR" | "ECO" | "ECN";
  title: string;
  reason: string;
  impact: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).createChangeRequest(input);
}

export async function decideChangeRequestAsync(input: {
  submissionId: string;
  changeId: string;
  decidedBy: string;
  status: "approved" | "rejected" | "closed";
  comment: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).decideChangeRequest(input);
}

export async function listPhaseGateChecksAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listPhaseGateChecks(submissionId);
}

export async function getPhaseGateCheckAsync(input: { submissionId: string; checkId: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).getPhaseGateCheck(input);
}

export async function initializePhaseGateChecksAsync(input: { submissionId: string; createdBy: string }) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).initializePhaseGateChecks(input);
}

export async function decidePhaseGateCheckAsync(input: {
  submissionId: string;
  checkId: string;
  decidedBy: string;
  status: "completed" | "waived";
  comment: string;
}) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).decidePhaseGateCheck(input);
}

export async function listOpenRequiredPhaseGateChecksAsync(submissionId: string) {
  return new AsyncCollaborationRepository(getAsyncDatabaseClient()).listOpenRequiredPhaseGateChecks(submissionId);
}
