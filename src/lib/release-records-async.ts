import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncReleaseRepository } from "@/lib/repositories/release-async-repository";
import type { ProcurementSyncRun, SupplierPortalResponse } from "@/lib/types";

export async function getReleasePackageBySubmissionIdAsync(submissionId: string) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).getReleasePackageBySubmissionId(submissionId);
}

export async function upsertReleasePackageRecordAsync(input: {
  submissionId: string;
  packageFilename: string;
  localPath: string;
  storageProvider?: "local_repository" | "supabase_storage" | "s3_compatible";
  storageBucket?: string | null;
  storageKey?: string | null;
  sha256: string;
  fileSize: number;
  manifestJson: string;
  createdBy: string;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).upsertReleasePackageRecord(input);
}

export async function findReleasedFilenameConflictsAsync(input: {
  submissionId: string;
  files: Array<{ file_role: string; original_filename: string }>;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).findReleasedFilenameConflicts(input);
}

export async function listProcurementSyncRunsAsync(input: {
  submissionId?: string;
  targetSystem?: ProcurementSyncRun["target_system"];
} = {}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).listProcurementSyncRuns(input);
}

export async function createProcurementSyncRunAsync(input: {
  submissionId: string;
  targetSystem: ProcurementSyncRun["target_system"];
  payload: Record<string, unknown>;
  externalReference?: string;
  createdBy: string;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).createProcurementSyncRun(input);
}

export async function decideProcurementSyncRunAsync(input: {
  runId: string;
  actorId: string;
  status: "acknowledged" | "failed";
  externalReference?: string;
  response: Record<string, unknown>;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).decideProcurementSyncRun(input);
}

export async function getReadonlyShareByTokenHashAsync(tokenHash: string) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).getReadonlyShareByTokenHash(tokenHash);
}

export async function listReadonlySharesAsync(submissionId: string) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).listReadonlyShares(submissionId);
}

export async function createReadonlyShareAsync(input: {
  submissionId: string;
  tokenHash: string;
  label: string;
  expiresAt: string;
  createdBy: string;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).createReadonlyShare(input);
}

export async function revokeReadonlyShareAsync(input: { submissionId: string; shareId: string; revokedBy: string }) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).revokeReadonlyShare(input);
}

export async function recordReadonlyShareAccessAsync(input: { submissionId: string; shareId: string }) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).recordReadonlyShareAccess(input);
}

export async function listSupplierPortalResponsesAsync(input: { submissionId: string; shareId?: string }) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).listSupplierPortalResponses(input);
}

export async function createSupplierPortalResponseAsync(input: {
  shareId: string;
  submissionId: string;
  responseKind: SupplierPortalResponse["response_kind"];
  supplierName: string;
  supplierEmail: string;
  message: string;
}) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).createSupplierPortalResponse(input);
}

export async function closeSupplierPortalResponseAsync(input: { submissionId: string; responseId: string; closedBy: string }) {
  return new AsyncReleaseRepository(getAsyncDatabaseClient()).closeSupplierPortalResponse(input);
}
