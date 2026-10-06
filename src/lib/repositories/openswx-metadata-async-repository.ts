import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { OpenSwxInitiator, OpenSwxSource } from "@/lib/openswx-metadata-contract";
import type { OpenSwxContextType } from "@/lib/openswx-metadata-contract";

export type OpenSwxJob = {
  id: string; companyId: string; sessionId: string | null; sourceContextType: OpenSwxContextType; sourceContextId: string; sourceSetFingerprint: string; readerCommit: string;
  initiator: OpenSwxInitiator; sources: OpenSwxSource[]; status: "queued" | "running" | "completed" | "failed" | "cancelled";
  attemptCount: number; lockedBy: string | null; leaseExpiresAt: string | null; heartbeatAt: string | null;
  dispatchState: "due" | "requested" | "dispatched" | "dispatch_unknown" | "terminal";
  dispatchGeneration: number; dispatchLeaseExpiresAt: string | null; dispatchRequestedAt: string | null;
  dispatchRequestWindowEnd: string | null; providerOperation: string | null; executionName: string | null;
  completionDigest: string | null; completionReceiptId: string | null; resultJson: string | null;
  resultBytes: number | null; completionAuditJson: string | null; completedAt: string | null; createdAt: string; updatedAt: string;
};
function map(row: Record<string, unknown>): OpenSwxJob {
  const result = Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_([a-z])/gu, (_, c: string) => c.toUpperCase()), v instanceof Date ? v.toISOString() : v]));
  result.initiator = JSON.parse(String(result.initiatorJson));
  result.sources = JSON.parse(String(result.sourcesJson));
  for (const key of ["attemptCount", "dispatchGeneration", "resultBytes"]) if (result[key] !== null) result[key] = Number(result[key]);
  return result as OpenSwxJob;
}
/** The caller owns a pinned transaction and authority checks. No mutation of the original recognition queue. */
export class OpenSwxMetadataAsyncRepository {
  constructor(readonly client: AsyncDatabaseClient) {}
  async readAdmissionForExecution(executionName: string) {
    const rows = await this.client.query<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE execution_name=:executionName AND (dispatch_state='dispatched' OR (dispatch_state='terminal' AND status='completed'))${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`, { executionName });
    return rows.length === 1 ? map(rows[0]) : null;
  }
  /** Global purpose-specific admission. Caller holds the transaction across this CAS only. */
  async activeDispatch() {
    if (this.client.kind === "postgres") await this.client.query("SELECT pg_advisory_xact_lock(122, 82)");
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE dispatch_state IN ('requested','dispatched','dispatch_unknown') ORDER BY created_at,id LIMIT 1${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`);
    return row ? map(row) : null;
  }
  async dispatchAdmission(now: string, windowEnd: string, checkDeadline: () => void = () => {}) {
    checkDeadline();
    const active = await this.activeDispatch();
    checkDeadline();
    if (active) return { existing: true, job: active };
    const due = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE dispatch_state='due' AND status='queued' AND attempt_count<2 ORDER BY created_at,id LIMIT 1${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`);
    checkDeadline();
    if (!due) return null;
    const job = map(due);
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state='requested',dispatch_generation=dispatch_generation+1,dispatch_requested_at=:now,dispatch_request_window_end=:windowEnd,dispatch_lease_expires_at=:windowEnd,updated_at=:now WHERE id=:id AND company_id=:companyId AND dispatch_state='due' AND dispatch_generation=:dispatchGeneration`, { ...job, now, windowEnd });
    checkDeadline();
    return { existing: false, job: (await this.read(job.id, job.companyId))! };
  }
  async dispatchReceipt(job: OpenSwxJob, state: OpenSwxJob["dispatchState"], operation: string | null, executionName: string | null, now: string) {
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state=:state,provider_operation=:operation,execution_name=:executionName,updated_at=:now WHERE id=:id AND company_id=:companyId AND dispatch_generation=:dispatchGeneration AND dispatch_state IN ('requested','dispatch_unknown')`, { ...job, state, operation, executionName, now });
    return this.read(job.id, job.companyId);
  }
  /** Authority denial before the sole provider POST. Never close an unknown dispatch. */
  async dispatchBlocked(job: OpenSwxJob, now: string) {
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state='terminal',status=CASE WHEN status='queued' THEN 'failed' ELSE status END,updated_at=:now WHERE id=:id AND company_id=:companyId AND dispatch_generation=:dispatchGeneration AND dispatch_state='requested' AND provider_operation IS NULL AND execution_name IS NULL AND status IN ('queued','cancelled')`, { ...job, now });
    return this.read(job.id, job.companyId);
  }
  async providerTerminal(job: OpenSwxJob, now: string) {
    // Only an exact provider terminal readback can release admission/requeue a lost attempt.
    const attempts = job.attemptCount + (job.status === "queued" ? 1 : 0);
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET dispatch_state=CASE WHEN status IN ('completed','cancelled','failed') OR :attempts>=2 THEN 'terminal' ELSE 'due' END,status=CASE WHEN status IN ('completed','cancelled','failed') THEN status WHEN :attempts>=2 THEN 'failed' ELSE 'queued' END,attempt_count=:attempts,locked_by=CASE WHEN status='completed' THEN locked_by ELSE NULL END,lease_expires_at=NULL,execution_name=CASE WHEN status='completed' THEN execution_name ELSE NULL END,updated_at=:now WHERE id=:id AND company_id=:companyId AND dispatch_generation=:dispatchGeneration AND execution_name=:executionName AND dispatch_state='dispatched'`, { ...job, attempts, now });
    return this.read(job.id, job.companyId);
  }
  async read(id: string, companyId: string, lock = false) {
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE id=:id AND company_id=:companyId${lock && this.client.kind === "postgres" ? " FOR UPDATE" : ""}`, { id, companyId });
    return row ? map(row) : null;
  }
  async readByBinding(companyId: string, sourceContextType: OpenSwxContextType, sourceContextId: string, sourceSetFingerprint: string, readerCommit: string) {
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE company_id=:companyId AND source_context_type=:sourceContextType AND source_context_id=:sourceContextId AND source_set_fingerprint=:sourceSetFingerprint AND reader_commit=:readerCommit`, { companyId, sourceContextType, sourceContextId, sourceSetFingerprint, readerCommit });
    return row ? map(row) : null;
  }
  async insert(input: { id: string; sessionId?: string | null; sourceContextType: OpenSwxContextType; sourceContextId: string; sourceSetFingerprint: string; readerCommit: string; initiator: OpenSwxInitiator; sources: OpenSwxSource[]; now: string }) {
    await this.client.execute(`INSERT INTO ai_pdm_core.openswx_metadata_jobs (id,company_id,session_id,source_context_type,source_context_id,drawing_number_id,drawing_revision_id,revision_package_id,candidate_revision_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,status,attempt_count,dispatch_state,dispatch_generation,created_at,updated_at)
      VALUES (:id,:companyId,:sessionId,:sourceContextType,:sourceContextId,:drawingNumberId,:drawingRevisionId,:revisionPackageId,:candidateRevisionId,:sourceSetFingerprint,:readerCommit,:principalId,:pdmUserId,:initiatorJson,:sourcesJson,'queued',0,'due',0,:now,:now) ON CONFLICT (company_id,source_context_type,source_context_id,source_set_fingerprint,reader_commit) DO NOTHING`, { ...input, sessionId: input.sessionId ?? null, drawingNumberId: input.sourceContextType === "drawing_number" ? input.sourceContextId : null, drawingRevisionId: input.sourceContextType === "drawing_revision" ? input.sourceContextId : null, revisionPackageId: input.sourceContextType === "revision_package" ? input.sourceContextId : null, candidateRevisionId: input.sourceContextType === "candidate_revision" ? input.sourceContextId : null, companyId: input.initiator.companyId, principalId: input.initiator.principalId, pdmUserId: input.initiator.pdmUserId, initiatorJson: JSON.stringify(input.initiator), sourcesJson: JSON.stringify(input.sources) });
    return this.readByBinding(input.initiator.companyId, input.sourceContextType, input.sourceContextId, input.sourceSetFingerprint, input.readerCommit);
  }
  async claim(job: OpenSwxJob, workerId: string, now: string, leaseExpiresAt: string) {
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET status='running',attempt_count=attempt_count+1,locked_by=:workerId,heartbeat_at=:now,lease_expires_at=:leaseExpiresAt,updated_at=:now
      WHERE id=:id AND company_id=:companyId AND status='queued' AND dispatch_state='dispatched' AND execution_name=:executionName AND attempt_count=:attemptCount AND attempt_count<2`, { ...job, workerId, now, leaseExpiresAt });
    return this.read(job.id, job.companyId);
  }
  async heartbeat(job: OpenSwxJob, now: string, leaseExpiresAt: string) {
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET heartbeat_at=:now,lease_expires_at=:leaseExpiresAt,updated_at=:now WHERE id=:id AND company_id=:companyId AND status='running' AND attempt_count=:attemptCount AND locked_by=:lockedBy`, { ...job, now, leaseExpiresAt });
    return this.read(job.id, job.companyId);
  }
  async complete(job: OpenSwxJob, result: { json: string; bytes: number; digest: string }, receiptId: string, now: string) {
    const auditJson = JSON.stringify({ companyId: job.companyId, initiatorPrincipalId: job.initiator.principalId, readerId: job.lockedBy, readerCommit: job.readerCommit, attempt: job.attemptCount, sourceSetFingerprint: job.sourceSetFingerprint, digest: result.digest, receiptId, completedAt: now });
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET status='completed',completion_digest=:digest,completion_receipt_id=:receiptId,completion_audit_json=:auditJson,result_json=:json,result_bytes=:bytes,completed_at=:now,updated_at=:now
      WHERE id=:id AND company_id=:companyId AND status='running' AND attempt_count=:attemptCount AND locked_by=:lockedBy`, { ...job, ...result, receiptId, now, auditJson });
    return this.read(job.id, job.companyId);
  }
  async cancel(job: OpenSwxJob, now: string) {
    await this.client.execute(`UPDATE ai_pdm_core.openswx_metadata_jobs SET status='cancelled',updated_at=:now WHERE id=:id AND company_id=:companyId AND status IN ('queued','running')`, { ...job, now });
    return this.read(job.id, job.companyId);
  }
}
