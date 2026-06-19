import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncHandoffRepository, type ListAsyncManufacturingHandoffSubmissionIdsInput } from "@/lib/repositories/handoff-async-repository";
import { AsyncSubmissionListRepository } from "@/lib/repositories/submission-list-async-repository";
import type { SubmissionDetail } from "@/lib/types";

export async function listManufacturingHandoffEntriesAsync(
  input: ListAsyncManufacturingHandoffSubmissionIdsInput = {}
): Promise<SubmissionDetail[]> {
  const client = getAsyncDatabaseClient();
  const handoffRepository = new AsyncHandoffRepository(client);
  const submissionRepository = new AsyncSubmissionListRepository(client);
  const submissionIds = await handoffRepository.listManufacturingHandoffSubmissionIds(input);
  const submissions = await Promise.all(submissionIds.map((id) => submissionRepository.getSubmission(id)));
  return submissions.filter((submission): submission is SubmissionDetail => Boolean(submission));
}
