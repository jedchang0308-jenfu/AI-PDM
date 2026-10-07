import crypto from "node:crypto";
import { createFileStorageServiceForPointer, storagePointerFromRecord, type FileStorageService } from "@/lib/file-storage";
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
import { DrawingRecognitionError } from "@/lib/drawing-recognition-contract";
import { OpenSwxMetadataAsyncRepository, type OpenSwxJob } from "@/lib/repositories/openswx-metadata-async-repository";
import { encodeOpenSwxCompletion, OpenSwxMetadataError, OPENSWX_LIMITS, OPENSWX_READER, type OpenSwxFence, type OpenSwxInitiator, type OpenSwxContextType } from "@/lib/openswx-metadata-contract";

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
export type OpenSwxSelection = { sourceContextType: OpenSwxContextType; sourceContextId: string; sourceAssetIds: readonly string[] };
/** Same-company context and selected current membership; no DM session dependency. */
export async function readCurrentOpenSwxSources(db: AsyncDatabaseClient, companyId: string, input: OpenSwxSelection) {
  try { return await new DrawingRecognitionAsyncRepository(db).readContextSourceSnapshot({ companyId, ...input }); }
  catch (error) { if (error instanceof DrawingRecognitionError) throw new OpenSwxMetadataError(error.code, error.status); throw error; }
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
  private basis = (db: AsyncDatabaseClient, c: string, s: OpenSwxSelection) => (this.dependencies.sourceBasis ?? readCurrentOpenSwxSources)(db, c, s);
  private async current(db: AsyncDatabaseClient, job: OpenSwxJob) {
    const decision = await this.authority(db, job.initiator);
    const basis = await this.basis(db, job.companyId, { sourceContextType: job.sourceContextType, sourceContextId: job.sourceContextId, sourceAssetIds: job.sources.map(s => s.fileAssetId) });
    this.resource(basis.context.ownerPrincipalId, job.initiator, decision.roleCode);
    if (basis.fingerprint !== job.sourceSetFingerprint || JSON.stringify(basis.sources) !== JSON.stringify(job.sources)) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  }
  private resource(ownerPrincipalId: string, i: OpenSwxInitiator, roleCode: string | null) {
    if (ownerPrincipalId !== i.principalId && !hasPdmNonOwnerEditScope({ roles: roleCode ? [roleCode] : [] })) throw new OpenSwxMetadataError("OPENSWX_CONTEXT_FORBIDDEN", 403);
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
  async enqueue(verified: VerifiedPrincipalRequest, selection: OpenSwxSelection) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i);
      let cancellableRevision = false;
      if (selection.sourceContextType === "drawing_revision") {
        const revision = await db.queryOne<{ lifecycle_state: string }>(
          `SELECT lifecycle_state FROM ai_pdm_core.drawing_revisions
           WHERE company_id=:companyId AND id=:revisionId${db.kind === "postgres" ? " FOR UPDATE" : ""}`,
          { companyId: i.companyId, revisionId: selection.sourceContextId }
        );
        if (!revision) throw new OpenSwxMetadataError("OPENSWX_CONTEXT_NOT_FOUND", 404);
        if (revision.lifecycle_state === "cancelled") throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
        cancellableRevision = ["preparing", "correction_required"].includes(revision.lifecycle_state);
      }
      const basis = await this.basis(db, i.companyId, selection);
      // Same current resource rules as recognition: Principal owner or published privileged role.
      this.resource(basis.context.ownerPrincipalId, i, decision.roleCode);
      const candidateId = crypto.randomUUID();
      const job = await new OpenSwxMetadataAsyncRepository(db).insert({ id: candidateId, sourceContextType: selection.sourceContextType, sourceContextId: selection.sourceContextId, sourceSetFingerprint: basis.fingerprint, readerCommit: OPENSWX_READER.commit, initiator: i, sources: basis.sources, now: new Date(this.now()).toISOString() });
      if (selection.sourceContextType === "drawing_revision" && !job) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
      if (db.kind === "postgres" && cancellableRevision && job?.id === candidateId) {
        // A NEW private job must change the held parent tuple so an older cancellation snapshot retries.
        const touched = await db.query<{ id: string }>(
          `UPDATE ai_pdm_core.drawing_revisions SET row_version=row_version
           WHERE company_id=:companyId AND id=:revisionId AND lifecycle_state IN ('preparing','correction_required') RETURNING id`,
          { companyId: i.companyId, revisionId: selection.sourceContextId }
        );
        if (touched.length !== 1 || touched[0]?.id !== selection.sourceContextId) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
      }
      return job;
    }, { serializable: true });
  }
  async humanRead(verified: VerifiedPrincipalRequest, selection: OpenSwxSelection) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i, "numbering.recognition.review");
      const basis = await this.basis(db, i.companyId, selection);
      this.resource(basis.context.ownerPrincipalId, i, decision.roleCode);
      const job = await new OpenSwxMetadataAsyncRepository(db).readByBinding(i.companyId, selection.sourceContextType, selection.sourceContextId, basis.fingerprint, OPENSWX_READER.commit);
      if (job && (job.sourceSetFingerprint !== basis.fingerprint || JSON.stringify(job.sources) !== JSON.stringify(basis.sources))) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
      return job;
    });
  }
  /** Company authority comes exclusively from the unique persisted provider execution. */
  async workerFence(actor: VerifiedWorkloadActor, jobId: string, input: Omit<OpenSwxFence, "jobId" | "companyId">): Promise<OpenSwxFence> {
    reader(actor);
    return this.db.transaction(async db => {
      const job = await new OpenSwxMetadataAsyncRepository(db).readAdmissionForExecution(input.executionName);
      if (!job || job.id !== jobId) throw new OpenSwxMetadataError("OPENSWX_CLAIM_NOT_ADMITTED");
      const f = { ...input, jobId, companyId: job.companyId };
      this.fence(job, actor, f, job.status === "completed");
      return f;
    });
  }
  async authorizeDispatch(job: OpenSwxJob) {
    return this.db.transaction(async db => {
      const saved = await this.job(db, job.id, job.companyId);
      const check = () => { if (saved.status !== "queued" || saved.dispatchState !== "requested" || saved.dispatchGeneration !== job.dispatchGeneration || !saved.dispatchLeaseExpiresAt || Date.parse(saved.dispatchLeaseExpiresAt) <= this.now()) throw new OpenSwxMetadataError("OPENSWX_DISPATCH_FENCE_LOST"); };
      check(); await this.current(db, saved); check();
    });
  }
  async cancelContext(verified: VerifiedPrincipalRequest, selection: OpenSwxSelection) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i);
      const basis = await this.basis(db, i.companyId, selection);
      this.resource(basis.context.ownerPrincipalId, i, decision.roleCode);
      const job = await new OpenSwxMetadataAsyncRepository(db).readByBinding(i.companyId, selection.sourceContextType, selection.sourceContextId, basis.fingerprint, OPENSWX_READER.commit);
      if (!job) throw new OpenSwxMetadataError("OPENSWX_JOB_NOT_FOUND", 404);
      return new OpenSwxMetadataAsyncRepository(db).cancel(job, new Date(this.now()).toISOString());
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
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f); await this.current(db, job); this.fence(job, actor, f);
      const now = this.now();
      return new OpenSwxMetadataAsyncRepository(db).heartbeat(job, new Date(now).toISOString(), new Date(now + OPENSWX_LIMITS.leaseMs).toISOString());
    }, { serializable: true });
  }
  async authorizeSource(actor: VerifiedWorkloadActor, f: OpenSwxFence, sourceId: string) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f); await this.current(db, job); this.fence(job, actor, f);
      const source = job.sources.find(s => s.id === sourceId);
      if (!source) throw new OpenSwxMetadataError("OPENSWX_SOURCE_FORBIDDEN", 403);
      return source;
    }, { serializable: true });
  }
  async complete(actor: VerifiedWorkloadActor, f: OpenSwxFence, results: readonly { sourceId: string; payload: unknown }[]) {
    return this.db.transaction(async db => {
      const job = await this.job(db, f.jobId, f.companyId);
      this.fence(job, actor, f, job.status === "completed"); await this.current(db, job); this.fence(job, actor, f, job.status === "completed");
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
      const job = await this.job(db, f.jobId, f.companyId); this.fence(job, actor, f, job.status === "completed"); await this.current(db, job); this.fence(job, actor, f, job.status === "completed"); return job;
    }, { serializable: true });
  }
  async cancel(verified: VerifiedPrincipalRequest, jobId: string) {
    return this.db.transaction(async db => {
      const i = initiator(verified), decision = await this.authority(db, i);
      const job = await this.job(db, jobId, i.companyId);
      const basis = await this.basis(db, i.companyId, { sourceContextType: job.sourceContextType, sourceContextId: job.sourceContextId, sourceAssetIds: job.sources.map(s => s.fileAssetId) });
      this.resource(basis.context.ownerPrincipalId, i, decision.roleCode);
      return new OpenSwxMetadataAsyncRepository(db).cancel(job, new Date(this.now()).toISOString());
    }, { serializable: true });
  }
}

export const openSwxPrivateHeaders = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
export function openSwxErrorResponse(error: unknown) {
  return Response.json({ code: error instanceof OpenSwxMetadataError ? error.code : "OPENSWX_DEPENDENCY_UNAVAILABLE" }, { status: error instanceof OpenSwxMetadataError ? error.status : 503, headers: openSwxPrivateHeaders });
}
export function openSwxHumanProjection(job: OpenSwxJob | null, configured: boolean) {
  return { configured, job: job ? { id: job.id, status: job.status, dispatchState: job.dispatchState, attempt: job.attemptCount, heartbeatAt: job.heartbeatAt, leaseExpiresAt: job.leaseExpiresAt, readerCommit: job.readerCommit, sourceSetFingerprint: job.sourceSetFingerprint, result: job.resultJson ? JSON.parse(job.resultJson) : null } : null };
}
/** Run permission admits/cancels work. CAD values require the separate review GET guard. */
export function openSwxHumanStatusProjection(job: OpenSwxJob | null, configured: boolean) {
  return { configured, job: job ? { id: job.id, status: job.status, dispatchState: job.dispatchState, attempt: job.attemptCount, heartbeatAt: job.heartbeatAt, leaseExpiresAt: job.leaseExpiresAt } : null };
}
export function openSwxWorkerProjection(job: OpenSwxJob | null) {
  return job ? { id: job.id, status: job.status, attempt: job.attemptCount, readerCommit: job.readerCommit, sourceSetFingerprint: job.sourceSetFingerprint, executionName: job.executionName, leaseExpiresAt: job.leaseExpiresAt, sources: job.sources, completionDigest: job.completionDigest, completionReceiptId: job.completionReceiptId } : null;
}
/** Bounded JSON without trusting Content-Length or silently dropping fields. */
export async function readOpenSwxJson(request: Request, allowed: readonly string[], maxBytes = 2 * 1024 * 1024, parentSignal?: AbortSignal) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new OpenSwxMetadataError("OPENSWX_BODY_INVALID", 400);
  const stream = request.body?.getReader(); if (!stream) throw new OpenSwxMetadataError("OPENSWX_BODY_INVALID", 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(10_000), ...(parentSignal ? [parentSignal] : [])]);
  async function nextChunk() {
    if (signal.aborted) throw new OpenSwxMetadataError("OPENSWX_REQUEST_ABORTED", 408);
    let abort: (() => void) | undefined;
    try { return await Promise.race([stream!.read(), new Promise<never>((_, reject) => { abort = () => reject(new OpenSwxMetadataError("OPENSWX_REQUEST_ABORTED", 408)); signal.addEventListener("abort", abort, { once: true }); if (signal.aborted) abort(); })]); }
    finally { if (abort) signal.removeEventListener("abort", abort); }
  }
  let bytes = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const next = await nextChunk(); if (next.done) break; bytes += next.value.length; if (bytes > maxBytes) throw new OpenSwxMetadataError("OPENSWX_BODY_LIMIT", 413); chunks.push(next.value); }
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k))) throw new OpenSwxMetadataError("OPENSWX_BODY_INVALID", 400);
    return value as Record<string, unknown>;
  } catch (error) { if (error instanceof OpenSwxMetadataError) throw error; throw new OpenSwxMetadataError("OPENSWX_BODY_INVALID", 400); }
  finally { await stream.cancel().catch(() => {}); stream.releaseLock(); }
}
export function openSwxRequestFence(request: Request): Omit<OpenSwxFence, "jobId" | "companyId"> {
  const attempt = Number(request.headers.get("x-openswx-attempt"));
  const sourceSetFingerprint = request.headers.get("x-openswx-source-fingerprint") ?? "";
  const readerCommit = request.headers.get("x-openswx-reader-commit") ?? "";
  const executionName = request.headers.get("x-openswx-execution") ?? "";
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !/^[a-f0-9]{64}$/u.test(sourceSetFingerprint) || readerCommit !== OPENSWX_READER.commit || executionName.length > 300) throw new OpenSwxMetadataError("OPENSWX_FENCE_INVALID", 400);
  return { attempt, sourceSetFingerprint, readerCommit, executionName };
}
export async function readOpenSwxContent(db: AsyncDatabaseClient, service: OpenSwxMetadataService, actor: VerifiedWorkloadActor, fence: OpenSwxFence, sourceId: string, storageFactory: typeof createFileStorageServiceForPointer = createFileStorageServiceForPointer) {
  const source = await service.authorizeSource(actor, fence, sourceId);
  async function pointer() {
    const asset = await db.queryOne<{ storage_provider: string | null; storage_bucket: string | null; storage_generation: string | null; storage_key: string | null; local_path: string | null; content_hash: string; file_size: number }>(`SELECT asset.* FROM ai_pdm_core.file_assets asset WHERE asset.id=:assetId AND asset.deleted_at IS NULL`, { assetId: source.fileAssetId });
    if (!asset || asset.content_hash !== source.sha256 || Number(asset.file_size) !== source.bytes || asset.storage_generation !== source.storageGeneration) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
    return storagePointerFromRecord(asset);
  }
  const before = await pointer(), storage: FileStorageService = storageFactory(before);
  const metadata = await storage.getObjectMetadata(before.key);
  if (!metadata || metadata.bytes !== source.bytes || (metadata.generation ?? null) !== source.storageGeneration) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  const bytes = await storage.readObject(before.key);
  const afterMetadata = await storage.getObjectMetadata(before.key);
  if (JSON.stringify(await pointer()) !== JSON.stringify(before) || !afterMetadata || afterMetadata.bytes !== source.bytes || (afterMetadata.generation ?? null) !== source.storageGeneration || bytes.length !== source.bytes || crypto.createHash("sha256").update(bytes).digest("hex") !== source.sha256) throw new OpenSwxMetadataError("OPENSWX_SOURCE_DRIFT");
  // Final authority/lease/source check is the last await before bytes leave this service.
  await service.authorizeSource(actor, fence, sourceId);
  return { bytes, sha256: source.sha256 };
}
