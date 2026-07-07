import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  AsyncDrawingRevisionPackageRepository,
  DrawingRevisionPackageError
} from "@/lib/repositories/drawing-revision-package-async-repository";
import type { DrawingRevisionPackageSupplementReasonCode, DrawingRevisionSupplementFileInput } from "@/lib/drawing-revision-package";

export { DrawingRevisionPackageError };

export async function ensureDrawingRevisionPackageForSubmissionAsync(input: { submissionId: string; actorId: string }) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.ensurePackageForSubmission(input);
}

export async function getDrawingRevisionPackageBySubmissionIdAsync(submissionId: string) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.getPackageBySubmissionId(submissionId);
}

export async function markDrawingRevisionPackageReleasedForSubmissionAsync(input: { submissionId: string; actorId: string }) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.markPackageReleasedForSubmission(input);
}

export async function markDrawingRevisionPackageCancelledForSubmissionAsync(input: { submissionId: string; actorId: string; reason: string }) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.markPackageCancelledForSubmission(input);
}

export async function requestDrawingRevisionPackageSupplementAsync(input: {
  packageId: string;
  companyId: string;
  actorId: string;
  reasonCode: DrawingRevisionPackageSupplementReasonCode;
  reasonNote?: string | null;
  files: DrawingRevisionSupplementFileInput[];
}) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.requestSupplement(input);
}

export async function decideDrawingRevisionPackageSupplementAsync(input: {
  supplementId: string;
  companyId: string;
  actorId: string;
  actorRole: string;
  decision: "approve" | "reject";
  note?: string | null;
}) {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.decideSupplement(input);
}

export async function dryRunDrawingRevisionPackageMigrationAsync() {
  const repository = new AsyncDrawingRevisionPackageRepository(getAsyncDatabaseClient());
  return repository.dryRunMigration();
}
