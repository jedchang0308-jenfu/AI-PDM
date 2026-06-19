import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncItemLockRepository } from "@/lib/repositories/item-lock-async-repository";

export async function findActiveItemLockForSubmissionIdentifiersAsync(input: {
  companyId?: string;
  drawingNumber?: string;
  partNumber?: string;
}) {
  return new AsyncItemLockRepository(getAsyncDatabaseClient()).findActiveItemLockForSubmissionIdentifiers(input);
}

export async function createItemLockAsync(input: {
  submissionId: string;
  userId: string;
  reason: string;
  hours?: number;
}) {
  return new AsyncItemLockRepository(getAsyncDatabaseClient()).createItemLock(input);
}

export async function releaseItemLockAsync(input: {
  submissionId: string;
  userId: string;
  force?: boolean;
}) {
  return new AsyncItemLockRepository(getAsyncDatabaseClient()).releaseItemLock(input);
}
