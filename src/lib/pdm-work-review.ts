import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { PdmWorkReviewAsyncRepository, type PdmWorkReviewRequestRecord } from "@/lib/repositories/pdm-work-review-async-repository";

export type Dev087ReviewDecision = "approve" | "return_for_correction";

export function validateDev087ReviewDecision(value: unknown): Dev087ReviewDecision {
  if (value !== "approve" && value !== "return_for_correction") {
    throw new CanonicalWorkbenchError("DEV087_DECISION_NOT_ALLOWED", "本審核只允許核准或退回修改", 422);
  }
  return value;
}

export async function returnDev087WorkForCorrection(tx: AsyncDatabaseClient, request: PdmWorkReviewRequestRecord) {
  const repository = new PdmWorkReviewAsyncRepository(tx);
  await repository.appendTrace(tx, request);
  await tx.execute(
    `UPDATE canonical_workbench_states SET handling = 'owner', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = :companyId AND work_id = :workId AND handling = 'review_owner'`, request
  );
  await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, request);
  return { acknowledged: true };
}

export async function beginDev087Approval(tx: AsyncDatabaseClient, request: PdmWorkReviewRequestRecord) {
  const repository = new PdmWorkReviewAsyncRepository(tx);
  await repository.appendTrace(tx, request);
  await tx.execute(
    `UPDATE pdm_work_review_requests SET request_status = 'applying', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = :id AND company_id = :companyId AND request_status = 'pending'`, request
  );
  await tx.execute(
    `UPDATE canonical_workbench_states SET handling = 'system', row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = :companyId AND (work_id = :workId OR (branch_id = :branchId AND :workId IS NULL)) AND handling = 'review_owner'`, request
  );
}
