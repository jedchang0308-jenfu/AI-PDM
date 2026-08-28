import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { PdmWorkReviewAsyncRepository, type PdmWorkReviewRequestRecord } from "@/lib/repositories/pdm-work-review-async-repository";

export type Dev087ReviewDecision = "approve" | "return_for_correction";

/** Disposable-local QC fault profile; empty in every normal runtime. */
export type Dev087FaultHandling = "system_admin" | "blocked";

export function dev087FaultHandling(env: Record<string, string | undefined> = process.env): Dev087FaultHandling | null {
  const value = String(env.PDM_DEV087_FAULT_PROFILE ?? "").trim().toLowerCase();
  return value === "system_admin" || value === "blocked" ? value : null;
}

export function dev087FaultReason(handling: Dev087FaultHandling) {
  return handling === "system_admin"
    ? "自動化正式化需要系統管理員處理。"
    : "自動化正式化缺少安全修復路徑。";
}

/**
 * Record the disposable-local fault as a terminal review outcome. The review
 * request is removed so an already-decided approval cannot remain actionable
 * in the inbox or be submitted again; the canonical state is the sole UI
 * source for the system-admin/blocked indication.
 */
export async function recordDev087Fault(
  tx: AsyncDatabaseClient,
  request: PdmWorkReviewRequestRecord,
  handling: Dev087FaultHandling
) {
  const repository = new PdmWorkReviewAsyncRepository(tx);
  await tx.execute(
    `UPDATE canonical_workbench_states SET handling = :handling, blocker_reason = :reason, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
     WHERE company_id = :companyId AND work_id = :workId`,
    { ...request, handling, reason: handling === "blocked" ? dev087FaultReason(handling) : null }
  );
  await repository.recordTerminalReceipt(tx, request);
  await tx.execute(`DELETE FROM pdm_work_review_requests WHERE id = :id AND company_id = :companyId`, request);
  return { acknowledged: true };
}

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
  await repository.recordTerminalReceipt(tx, request);
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
