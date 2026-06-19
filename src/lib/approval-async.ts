import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncApprovalRepository, type AsyncApprovalDecision } from "@/lib/repositories/approval-async-repository";
import type { ApprovalMatrixRequirement } from "@/lib/types";

export async function addApprovalAsync(input: {
  submissionId: string;
  reviewerId: string;
  decision: AsyncApprovalDecision;
  comment?: string | null;
}) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).addApproval(input);
}

export async function reviewerHasDecisionAsync(input: { submissionId: string; reviewerId: string }) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).reviewerHasDecision(input);
}

export async function getApprovalSummaryAsync(submissionId: string) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).getApprovalSummary(submissionId);
}

export async function listApprovalMatrixRequirementsAsync(submissionId: string) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).listApprovalMatrixRequirements(submissionId);
}

export async function getApprovalMatrixRequirementAsync(input: { submissionId: string; requirementId: string }) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).getApprovalMatrixRequirement(input);
}

export async function initializeApprovalMatrixRequirementsAsync(input: {
  submissionId: string;
  createdBy: string;
  requirements?: Array<{ requiredRole: ApprovalMatrixRequirement["required_role"]; minCount: number }>;
}) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).initializeApprovalMatrixRequirements(input);
}

export async function refreshApprovalMatrixRequirementsAsync(submissionId: string) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).refreshApprovalMatrixRequirements(submissionId);
}

export async function waiveApprovalMatrixRequirementAsync(input: {
  submissionId: string;
  requirementId: string;
  decidedBy: string;
  comment: string;
}) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).waiveApprovalMatrixRequirement(input);
}

export async function listOpenApprovalMatrixRequirementsAsync(submissionId: string) {
  return new AsyncApprovalRepository(getAsyncDatabaseClient()).listOpenApprovalMatrixRequirements(submissionId);
}
