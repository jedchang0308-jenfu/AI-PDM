import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import type { VerifiedWorkloadActor } from "@/lib/worker-service-auth";
import { JenfuPrincipalAdmissionRepository, JenfuPrincipalAdmissionError } from "@/lib/jenfu-principal-admission-repository";
import { JenfuPrincipalAccountRepository, JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
import { JenfuAuthEpochRepository } from "@/lib/jenfu-auth-epoch-repository";
import { validatePrincipalPublishedGrantSnapshot } from "@/lib/jenfu-principal-published-grant-validation";
import { evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot } from "@/lib/jenfu-principal-permission-service";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";
import { hasPdmNonOwnerEditScope } from "@/lib/pdm-edit-scope-policy";
import type { DrawingRecognitionSourceContextType } from "@/lib/drawing-recognition-contract";
import { OpenSwxMetadataAsyncRepository, type OpenSwxJob } from "@/lib/repositories/openswx-metadata-async-repository";
import { encodeOpenSwxCompletion, OpenSwxMetadataError, OPENSWX_LIMITS, OPENSWX_READER, requireOpenSwxSources, type OpenSwxFence, type OpenSwxInitiator, type OpenSwxSource } from "@/lib/openswx-metadata-contract";

/** Rechecks durable delegation against canonical typed state and current published grants, never restores a session. */
export async function requireCurrentOpenSwxAuthority(db: AsyncDatabaseClient, i: OpenSwxInitiator, permission = "numbering.recognition.run") {
  try {
  const typed = await new JenfuPrincipalAdmissionRepository(db).requireActiveTypedPrincipal(i.identityIssuer, i.identitySubject);
  const account = await new JenfuPrincipalAccountRepository(db).requireActive(i.principalId);
  const state = await new JenfuAuthEpochRepository(db).readCanonicalPrincipalState(i.principalId);
  if (typed.principalId !== i.principalId || typed.employeeId !== i.employeeId || typed.accountType !== account.accountType || account.employeeId !== i.employeeId || account.companyId !== i.companyId || account.pdmUserId !== i.pdmUserId || account.profileVersion !== i.profileVersion || account.lifecycleVersion !== i.accountLifecycleVersion || state.authEpoch !== i.authEpoch || !Number.isFinite(Date.parse(i.authenticatedAt)) || !Number.isFinite(Date.parse(i.sessionIssuedAt)) || (state.revokedBefore && Date.parse(i.authenticatedAt) <= Date.parse(state.revokedBefore)) || (account.sessionInvalidBefore && Date.parse(i.sessionIssuedAt) <= Date.parse(account.sessionInvalidBefore))) throw new OpenSwxMetadataError("OPENSWX_INITIATOR_REVOKED", 403);
  const profile = await db.queryOne(`SELECT id FROM ai_pdm_core.users WHERE id=:pdmUserId AND company_id=:companyId`, i);
  if (!profile) throw new OpenSwxMetadataError("OPENSWX_INITIATOR_REVOKED", 403);
  await validatePrincipalPublishedGrantSnapshot(db, { principalId: typed.principalId, employeeId: typed.employeeId, identityIssuer: typed.identityIssuer, identitySubject: typed.identitySubject });
  const [decision] = await evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot(db, { principalId: i.principalId, employeeId: i.employeeId, identityIssuer: i.identityIssuer, identitySubject: i.identitySubject, localPrincipalId: i.pdmUserId, companyId: i.companyId, sessionSchemaVersion: 2 }, [{ permissionKind: "action", permissionCode: permission }]);
  if (!decision?.allowed) throw new OpenSwxMetadataError("OPENSWX_AUTHORITY_DENIED", 403);
  return decision;
  } catch (error) {
    if ((error instanceof JenfuPrincipalAdmissionError && ["principal_not_active", "principal_ambiguous"].includes(error.code)) || (error instanceof JenfuPrincipalAccountError && error.code === "principal_account_inactive") || (error instanceof JenfuEntitlementRepositoryError && error.code === "permission_not_granted")) throw new OpenSwxMetadataError("OPENSWX_INITIATOR_REVOKED", 403);
    throw error;
  }
}
type Session = { id: string; company_id: string; source_context_type: DrawingRecognitionSourceContextType; source_context_id: string; source_set_fingerprint: string; initiator_principal_id: string | null; created_by: string; drawing_id: string | null };
/** Exact source snapshot plus current context membership. V6 source catalog is never permission authority. */
export async function readCurrentOpenSwxSources(db: AsyncDatabaseClient, companyId: string, sessionId: string) {
  const session = await db.queryOne<Session>(`SELECT * FROM ai_pdm_core.drawing_recognition_sessions WHERE id=:sessionId AND company_id=:companyId`, { sessionId, companyId });
  if (!session) throw new OpenSwxMetadataError("OPENSWX_SESSION_NOT_FOUND", 404);
  const contextTable = { drawing_number: "drawing_numbers", drawing_revision: "drawing_revisions", revision_package: "drawing_revision_packages", candidate_revision: "numbering_candidate_revisions" }[session.source_context_type];
  if (!contextTable || !await db.queryOne(`SELECT id FROM ai_pdm_core.${contextTable} WHERE id=:contextId AND company_id=:companyId`, { contextId: session.source_context_id, companyId })) throw new OpenSwxMetadataError("OPENSWX_SOURCE_OWNERSHIP_LOST", 403);
  const current = await new DrawingRecognitionAsyncRepository(db).readCurrentSourceBasis({ companyId, sourceContextId: session.source_context_id, sourceContextType: session.source_context_type });
  if (current.sourceSetFingerprint !== session.source_set_fingerprint) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  const rows = await db.query<{ id: string; file_asset_id: string; content_hash: string; file_size: number | string; file_ext: string; storage_generation: string | null }>(`SELECT source.id,source.file_asset_id,source.content_hash,source.file_size,source.file_ext,source.storage_generation FROM ai_pdm_core.drawing_recognition_sources source JOIN ai_pdm_core.file_assets asset ON asset.id=source.file_asset_id WHERE source.company_id=:companyId AND source.session_id=:sessionId AND asset.deleted_at IS NULL AND source.content_hash=asset.content_hash AND source.file_size=asset.file_size AND COALESCE(source.storage_generation,'')=COALESCE(asset.storage_generation,'') ORDER BY source.sort_order,source.id`, { companyId, sessionId });
  if (rows.length !== current.sources.length || rows.some(r => !current.sources.some(c => c.fileAssetId === r.file_asset_id && c.contentHash === r.content_hash && c.storageGeneration === r.storage_generation))) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  const sources = rows.map(r => ({ id: r.id, fileAssetId: r.file_asset_id, sha256: r.content_hash, bytes: Number(r.file_size), extension: r.file_ext.toLowerCase().replace(/^\./u, ""), storageGeneration: r.storage_generation }));
  requireOpenSwxSources(sources);
  return { session, sources, fingerprint: current.sourceSetFingerprint };
}
export type OpenSwxCoreDependencies = {
  /** Test seams are explicit: production wiring uses the defaults and a verified request guard. */
  authority?: typeof requireCurrentOpenSwxAuthority; sourceBasis?: typeof readCurrentOpenSwxSources;
  now?: () => number;
};
function initiator(v: VerifiedPrincipalRequest): OpenSwxInitiator {
  return { principalId: v.session.principalId, employeeId: v.session.employeeId, pdmUserId: v.profile.pdmUserId, companyId: v.profile.companyId, identityIssuer: v.session.identityIssuer, identitySubject: v.session.identitySubject, profileVersion: v.session.profileVersion, accountLifecycleVersion: v.session.accountLifecycleVersion, authEpoch: v.session.authEpoch, authenticatedAt: v.session.authenticatedAt, sessionIssuedAt: v.session.issuedAt };
}
function reader(actor: VerifiedWorkloadActor) {
  if (actor.kind !== "workload" || actor.id !== OPENSWX_READER.id || !actor.purposes.includes("openswx_metadata_jobs") || !actor.capabilities.includes("openswx_metadata")) throw new OpenSwxMetadataError("OPENSWX_WORKLOAD_FORBIDDEN", 403);
}
export class OpenSwxMetadataService {
  constructor(private readonly db: AsyncDatabaseClient, private readonly dependencies: OpenSwxCoreDependencies = {}) {}
  private now() { return this.dependencies.now?.() ?? Date.now(); }
  private authority = (db: AsyncDatabaseClient, i: OpenSwxInitiator, p?: string) => (this.dependencies.authority ?? requireCurrentOpenSwxAuthority)(db, i, p);
  private basis = (db: AsyncDatabaseClient, c: string, s: string) => (this.dependencies.sourceBasis ?? readCurrentOpenSwxSources)(db, c, s);
  private async current(db: AsyncDatabaseClient, job: OpenSwxJob) {
    const decision = await this.authority(db, job.initiator);
    const basis = await this.basis(db, job.companyId, job.sessionId);
    await this.resource(db, basis.session, job.initiator, decision.roleCode);
    if (basis.fingerprint !== job.sourceSetFingerprint || JSON.stringify(basis.sources) !== JSON.stringify(job.sources)) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  }
  private async resource(db: AsyncDatabaseClient, session: Session, i: OpenSwxInitiator, roleCode: string | null) {
    const owner = session.initiator_principal_id === i.principalId || Boolean(session.drawing_id && await db.queryOne(`SELECT drawing.id FROM ai_pdm_core.drawings drawing JOIN ai_pdm_core.principal_accounts account ON account.pdm_user_id=drawing.owner_id AND account.company_id=drawing.company_id WHERE drawing.id=:drawingId AND drawing.company_id=:companyId AND account.principal_id=:principalId`, { drawingId: session.drawing_id, companyId: i.companyId, principalId: i.principalId }));
    if (!owner && !hasPdmNonOwnerEditScope({ roles: roleCode ? [roleCode] : [] })) throw new OpenSwxMetadataError("OPENSWX_SESSION_FORBIDDEN", 403);
  }
  private async job(db: AsyncDatabaseClient, id: string, companyId: string) {
    const job = await new OpenSwxMetadataAsyncRepository(db).read(id, companyId, true);
    if (!job) throw new OpenSwxMetadataError("OPENSWX_JOB_NOT_FOUND", 404);
    return job;
  }
  private fence(job: OpenSwxJob, actor: VerifiedWorkloadActor, f: OpenSwxFence, terminal = false) {
    reader(actor);
    if (!Number.isSafeInteger(f.attempt) || f.attempt < 1 || job.attemptCount !== f.attempt || job.lockedBy !== actor.id || job.readerCommit !== OPENSWX_READER.commit || f.readerCommit !== job.readerCommit || f.sourceSetFingerprint !== job.sourceSetFingerprint || !f.executionName || f.executionName !== job.executionName || (!terminal && (job.status !== "running" || !job.leaseExpiresAt || !Number.isFinite(Date.parse(job.leaseExpiresAt)) || Date.parse(job.leaseExpiresAt) <= this.now()))) throw new OpenSwxMetadataError("OPENSWX_LEASE_FENCE_LOST");
    if (job.status === "cancelled" || job.status === "failed") throw new OpenSwxMetadataError("OPENSWX_JOB_TERMINAL");
  }
  async enqueue(verified: VerifiedPrincipalRequest, sessionId: string) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i);
      const basis = await this.basis(db, i.companyId, sessionId);
      // Same current resource rules as recognition: Principal owner or published privileged role.
      await this.resource(db, basis.session, i, decision.roleCode);
      return new OpenSwxMetadataAsyncRepository(db).insert({ id: crypto.randomUUID(), sessionId, sourceSetFingerprint: basis.fingerprint, readerCommit: OPENSWX_READER.commit, initiator: i, sources: basis.sources, now: new Date(this.now()).toISOString() });
    }, { serializable: true });
  }
  async claim(actor: VerifiedWorkloadActor, input: { executionName: string }) {
    reader(actor);
    return this.db.transaction(async db => {
      const job = await new OpenSwxMetadataAsyncRepository(db).readAdmissionForExecution(input.executionName);
      if (!job) throw new OpenSwxMetadataError("OPENSWX_CLAIM_NOT_ADMITTED");
      if (job.status !== "queued" || job.dispatchState !== "dispatched" || job.executionName !== input.executionName || !input.executionName || job.readerCommit !== OPENSWX_READER.commit || job.attemptCount >= OPENSWX_LIMITS.attempts) throw new OpenSwxMetadataError("OPENSWX_CLAIM_NOT_ADMITTED");
      await this.current(db, job);
      const now = this.now();
      return new OpenSwxMetadataAsyncRepository(db).claim(job, actor.id, new Date(now).toISOString(), new Date(now + OPENSWX_LIMITS.leaseMs).toISOString());
    }, { serializable: true });
  }
  async heartbeat(actor: VerifiedWorkloadActor, f: OpenSwxFence) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f); await this.current(db, job);
      const now = this.now();
      return new OpenSwxMetadataAsyncRepository(db).heartbeat(job, new Date(now).toISOString(), new Date(now + OPENSWX_LIMITS.leaseMs).toISOString());
    }, { serializable: true });
  }
  async authorizeSource(actor: VerifiedWorkloadActor, f: OpenSwxFence, sourceId: string) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f); await this.current(db, job);
      const source = job.sources.find(s => s.id === sourceId);
      if (!source) throw new OpenSwxMetadataError("OPENSWX_SOURCE_FORBIDDEN", 403);
      return source;
    }, { serializable: true });
  }
  async complete(actor: VerifiedWorkloadActor, f: OpenSwxFence, results: readonly { sourceId: string; payload: unknown }[]) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId);
      this.fence(job, actor, f, job.status === "completed"); await this.current(db, job);
      const result = encodeOpenSwxCompletion(job.sources, results);
      if (job.status === "completed") {
        if (job.completionDigest !== result.digest) throw new OpenSwxMetadataError("OPENSWX_COMPLETION_CONFLICT");
        return job;
      }
      return new OpenSwxMetadataAsyncRepository(db).complete(job, result, crypto.randomUUID(), new Date(this.now()).toISOString());
    }, { serializable: true });
  }
  async readback(actor: VerifiedWorkloadActor, f: OpenSwxFence) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f, job.status === "completed"); await this.current(db, job); return job;
    }, { serializable: true });
  }
  async cancel(verified: VerifiedPrincipalRequest, jobId: string) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i);
      const job = await this.job(db, jobId, i.companyId);
      const session = await db.queryOne<Session>(`SELECT * FROM ai_pdm_core.drawing_recognition_sessions WHERE id=:sessionId AND company_id=:companyId`, { sessionId: job.sessionId, companyId: job.companyId });
      if (!session) throw new OpenSwxMetadataError("OPENSWX_SESSION_NOT_FOUND", 404);
      await this.resource(db, session, i, decision.roleCode);
      return new OpenSwxMetadataAsyncRepository(db).cancel(job, new Date(this.now()).toISOString());
    }, { serializable: true });
  }
}
