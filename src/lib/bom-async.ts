import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncBomRepository } from "@/lib/repositories/bom-async-repository";

export async function getBomBySubmissionIdAsync(submissionId: string) {
  return new AsyncBomRepository(getAsyncDatabaseClient()).getBomBySubmissionId(submissionId);
}

export async function findPreviousBomSubmissionIdAsync(targetSubmissionId: string) {
  return new AsyncBomRepository(getAsyncDatabaseClient()).findPreviousBomSubmissionId(targetSubmissionId);
}

export async function getBomDiffBetweenSubmissionsAsync(input: {
  baseSubmissionId: string;
  targetSubmissionId: string;
}) {
  return new AsyncBomRepository(getAsyncDatabaseClient()).getBomDiffBetweenSubmissions(input);
}
