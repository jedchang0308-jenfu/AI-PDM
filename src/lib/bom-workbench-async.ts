import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncBomWorkbenchRepository } from "@/lib/repositories/bom-workbench-async-repository";
export { BomReleaseGateError, BomXlsImportError } from "@/lib/repositories/bom-workbench-async-repository";

export async function getBomWorkbenchBySubmissionIdAsync(submissionId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).getWorkbenchBySubmissionId(submissionId);
}

export async function listBomWorkbenchDraftsBySubmissionIdAsync(submissionId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).listDraftsBySubmissionId(submissionId);
}

export async function getBomWorkbenchDraftByIdAsync(draftId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).getDraftById(draftId);
}

export async function getBomWorkbenchDraftDiffAsync(draftId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).getDraftDiff(draftId);
}

export async function saveBomWorkbenchDraftTreeAsync(input: {
  draftId: string;
  actorId: string | null;
  reason?: string;
  lines: Array<{
    id?: string;
    parentLineId?: string | null;
    nodeType: "item" | "group";
    partNumber?: string | null;
    revision?: string | null;
    groupName?: string | null;
    quantity?: number | null;
    sequenceNo?: number | null;
  }>;
}) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).saveDraftTree(input);
}

export async function createBomWorkbenchDraftFromAssemblyAsync(input: {
  submissionId: string;
  actorId: string | null;
  draftName?: string;
  setActive?: boolean;
}) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).createDraftFromAssembly(input);
}

export async function createBomWorkbenchDraftFromSolidWorksXlsAsync(input: {
  submissionId: string;
  actorId: string | null;
  draftName?: string;
  setActive?: boolean;
  originalFilename: string;
  fileBuffer: Buffer;
  contentType?: string | null;
  profileName?: string;
  profileVersion?: string;
}) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).createDraftFromSolidWorksXls(input);
}

export async function getBomReleaseSnapshotByIdAsync(snapshotId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).getReleaseSnapshotById(snapshotId);
}

export async function listPendingBomWorkbenchReviewsAsync() {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).listPendingReviews();
}

export async function getBomWorkbenchReviewByIdAsync(reviewId: string) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).getReviewById(reviewId);
}

export async function submitBomWorkbenchDraftReviewAsync(input: { draftId: string; actorId: string; changeReason: string }) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).submitReview(input);
}

export async function reconfirmBomWorkbenchReplacementFlagsAsync(input: { draftId: string; actorId: string; note?: string }) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).reconfirmReplacementFlags(input);
}

export async function rejectBomWorkbenchReviewAsync(input: { reviewId: string; actorId: string; decisionReason?: string }) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).rejectReview(input);
}

export async function approveBomWorkbenchReviewAsync(input: { reviewId: string; actorId: string; decisionReason?: string }) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).approveReview(input);
}

export async function setBomWorkbenchActiveDraftAsync(input: { draftId: string; actorId: string | null }) {
  return new AsyncBomWorkbenchRepository(getAsyncDatabaseClient()).setActiveDraft(input);
}
