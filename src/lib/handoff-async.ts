import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncHandoffRepository, type ListAsyncManufacturingHandoffSubmissionIdsInput } from "@/lib/repositories/handoff-async-repository";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import type { SubmissionDetail } from "@/lib/types";

export async function listManufacturingHandoffEntriesAsync(
  input: ListAsyncManufacturingHandoffSubmissionIdsInput
): Promise<SubmissionDetail[]> {
  const client = getAsyncDatabaseClient();
  const handoffRepository = new AsyncHandoffRepository(client);
  const submissionRepository = new AsyncSubmissionListRepository(client);
  const submissionIds = await handoffRepository.listManufacturingHandoffSubmissionIds(input);
  const submissions = await Promise.all(submissionIds.map((id) => submissionRepository.getSubmission(id)));
  return submissions.map((submission) => {
    if (!submission || submission.company_id !== input.companyId) {
      throw new Error("Manufacturing handoff hydration no longer matches its scoped source.");
    }
    return submission;
  });
}
