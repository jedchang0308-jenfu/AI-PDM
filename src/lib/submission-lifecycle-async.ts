import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSubmissionLifecycleRepository } from "@/lib/repositories/submission-lifecycle-async-repository";

export async function getPendingSubmissionObsoleteRequestAsync(submissionId: string) {
  return new AsyncSubmissionLifecycleRepository(getAsyncDatabaseClient()).getPendingObsoleteRequest(submissionId);
}

export async function getSubmissionLifecycleRequestByIdAsync(requestId: string) {
  return new AsyncSubmissionLifecycleRepository(getAsyncDatabaseClient()).getRequestById(requestId);
}

export async function requestSubmissionObsoleteReviewAsync(input: { submissionId: string; actorId: string; reason: string }) {
  return new AsyncSubmissionLifecycleRepository(getAsyncDatabaseClient()).requestObsoleteReview(input);
}

export async function approveSubmissionObsoleteReviewAsync(input: { requestId: string; actorId: string; decisionReason?: string }) {
  return new AsyncSubmissionLifecycleRepository(getAsyncDatabaseClient()).approveObsoleteReview(input);
}

export async function rejectSubmissionObsoleteReviewAsync(input: { requestId: string; actorId: string; decisionReason?: string }) {
  return new AsyncSubmissionLifecycleRepository(getAsyncDatabaseClient()).rejectObsoleteReview(input);
}
