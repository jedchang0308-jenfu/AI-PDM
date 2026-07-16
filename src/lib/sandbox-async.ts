import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncSandboxRepository } from "@/lib/repositories/sandbox-async-repository";

export async function listSandboxBranchesForSubmissionAsync(submissionId: string) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).listSandboxBranchesForSubmission(submissionId);
}

export async function getSandboxBranchByIdAsync(branchId: string) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).getSandboxBranchById(branchId);
}

export async function getSandboxMergePreviewAsync(branchId: string) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).getSandboxMergePreview(branchId);
}

export async function createSandboxBranchAsync(input: {
  sourceSubmissionId: string;
  userId: string;
  branchName: string;
  reason: string;
}) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).createSandboxBranch(input);
}

export async function updateSandboxBranchStatusAsync(input: {
  branchId: string;
  userId: string;
  status: "promoted" | "closed";
}) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).updateSandboxBranchStatus(input);
}

export async function mergeSandboxBranchAsync(input: { branchId: string; userId: string }) {
  return new AsyncSandboxRepository(getAsyncDatabaseClient()).mergeSandboxBranch(input);
}
