import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { OpenSwxInitiator, OpenSwxSource } from "@/lib/openswx-metadata-contract";

export type OpenSwxJob = {
  id: string; companyId: string; sessionId: string; sourceSetFingerprint: string; readerCommit: string;
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
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE execution_name=:executionName AND dispatch_state='dispatched'${this.client.kind === "postgres" ? " FOR UPDATE" : ""}`, { executionName });
    return row ? map(row) : null;
  }
  async read(id: string, companyId: string, lock = false) {
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE id=:id AND company_id=:companyId${lock && this.client.kind === "postgres" ? " FOR UPDATE" : ""}`, { id, companyId });
    return row ? map(row) : null;
  }
  async readByBinding(companyId: string, sessionId: string, sourceSetFingerprint: string, readerCommit: string) {
    const row = await this.client.queryOne<Record<string, unknown>>(`SELECT * FROM ai_pdm_core.openswx_metadata_jobs WHERE company_id=:companyId AND session_id=:sessionId AND source_set_fingerprint=:sourceSetFingerprint AND reader_commit=:readerCommit`, { companyId, sessionId, sourceSetFingerprint, readerCommit });
    return row ? map(row) : null;
  }
  async insert(input: { id: string; sessionId: string; sourceSetFingerprint: string; readerCommit: string; initiator: OpenSwxInitiator; sources: OpenSwxSource[]; now: string }) {
    await this.client.execute(`INSERT INTO ai_pdm_core.openswx_metadata_jobs (id,company_id,session_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,status,attempt_count,dispatch_state,dispatch_generation,created_at,updated_at)
      VALUES (:id,:companyId,:sessionId,:sourceSetFingerprint,:readerCommit,:principalId,:pdmUserId,:initiatorJson,:sourcesJson,'queued',0,'due',0,:now,:now) ON CONFLICT (company_id,session_id,source_set_fingerprint,reader_commit) DO NOTHING`, { ...input, companyId: input.initiator.companyId, principalId: input.initiator.principalId, pdmUserId: input.initiator.pdmUserId, initiatorJson: JSON.stringify(input.initiator), sourcesJson: JSON.stringify(input.sources) });
    return this.readByBinding(input.initiator.companyId, input.sessionId, input.sourceSetFingerprint, input.readerCommit);
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
