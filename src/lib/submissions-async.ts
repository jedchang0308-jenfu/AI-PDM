import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  AsyncSubmissionListRepository,
  type ListSubmissionsAsyncInput,
  type SearchSubmissionsAsyncInput
} from "@/lib/repositories/submission-list-async-repository";
import {
  AsyncSubmissionWriteRepository,
  type CreateSubmissionAsyncInput
} from "@/lib/repositories/submission-write-async-repository";
import { AsyncSubmissionStatusRepository } from "@/lib/repositories/submission-status-async-repository";

export async function listSubmissionsAsync(input: ListSubmissionsAsyncInput = {}) {
  return new AsyncSubmissionListRepository(getAsyncDatabaseClient()).listSubmissions(input);
}

export async function getSubmissionAsync(id: string) {
  const client = getAsyncDatabaseClient();
  const submission = await new AsyncSubmissionListRepository(client).getSubmission(id);
  if (!submission) return null;
  return {
    ...submission,
    release_actionability: await new AsyncSubmissionStatusRepository(client).getSubmissionReleaseActionability({ id })
  };
}

export async function searchSubmissionsAsync(input: SearchSubmissionsAsyncInput = {}) {
  return new AsyncSubmissionListRepository(getAsyncDatabaseClient()).searchSubmissions(input);
}

export async function listDesignReuseCandidatesAsync(input: {
  submissionId: string;
  submittedBy?: string;
  limit?: number;
}) {
  return new AsyncSubmissionListRepository(getAsyncDatabaseClient()).listDesignReuseCandidates(input);
}

export async function listDuplicateGeometryCandidatesAsync(input: {
  submissionId: string;
  submittedBy?: string;
  limit?: number;
}) {
  return new AsyncSubmissionListRepository(getAsyncDatabaseClient()).listDuplicateGeometryCandidates(input);
}

export async function submissionRevisionExistsAsync(input: { companyId: string; drawingNumber: string; revision: string }) {
  return new AsyncSubmissionWriteRepository(getAsyncDatabaseClient()).submissionRevisionExists(input);
}

export async function listSubmissionRevisionsByDrawingAsync(input: { companyId: string; drawingNumber: string }) {
  return new AsyncSubmissionWriteRepository(getAsyncDatabaseClient()).listSubmissionRevisionsByDrawing(input);
}

export async function createSubmissionRecordAsync(input: CreateSubmissionAsyncInput) {
  return new AsyncSubmissionWriteRepository(getAsyncDatabaseClient()).createSubmissionRecord(input);
}
