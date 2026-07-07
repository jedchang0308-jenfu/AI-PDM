import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSubmissionStatusRepository } from "@/lib/repositories/submission-status-async-repository";

export async function rejectSubmissionAsync(input: { id: string; rejectReason: string }): Promise<void> {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).rejectSubmission(input);
}

export async function getActiveSandboxBranchForSubmissionAsync(submissionId: string) {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).getActiveSandboxBranchForSubmission(submissionId);
}

export async function markSubmissionReleasingAsync(id: string): Promise<void> {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).markSubmissionReleasing(id);
}

export async function markSubmissionReleaseFailedAsync(input: { id: string; releaseError: string }): Promise<void> {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).markSubmissionReleaseFailed(input);
}

export async function cancelPendingSubmissionAsync(input: { id: string; actorId: string; reason: string }): Promise<void> {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).cancelPendingSubmission(input);
}

export async function markSubmissionReleasedAndObsoletePreviousAsync(input: { id: string; actorId: string }) {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).markSubmissionReleasedAndObsoletePrevious(input);
}

export async function assertSubmissionRevisionCanReleaseAsync(id: string): Promise<void> {
  return new AsyncSubmissionStatusRepository(getAsyncDatabaseClient()).assertSubmissionRevisionCanRelease({ id });
}
