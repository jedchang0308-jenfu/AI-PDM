import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureOpenSwxMetadataSchema } from "@/lib/db";
import { SQLiteAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { OpenSwxMetadataService, requireCurrentOpenSwxAuthority, type OpenSwxCoreDependencies } from "./openswx-metadata";
import { OpenSwxMetadataAsyncRepository } from "./repositories/openswx-metadata-async-repository";
import { OPENSWX_READER, encodeOpenSwxCompletion, type OpenSwxFence } from "./openswx-metadata-contract";
import type { VerifiedPrincipalRequest } from "./jenfu-principal-request-guard";
import type { VerifiedWorkloadActor } from "./worker-service-auth";

// Narrow transaction fixture; current published identity authority is a declared seam here.
// Native authority/API integration is a separate gate, never inferred from these tests.
const hash = "a".repeat(64), source = { id: "asset", fileAssetId: "asset", sha256: hash, bytes: 12, extension: "sldprt", storageGeneration: null, sourceRole: "main", sortOrder: 0 };
const payload = { schemaVersion: "aipdm.openswx-public-api.v1", status: "opened", documentType: "part", version: 30, sheetCount: 0, globalProperties: { Material: "Steel", Empty: "" }, configurations: [{ index: 0, name: "default", effectiveProperties: { Material: "Steel" } }] };
const verified = { profile: { companyId: "company", pdmUserId: "user" }, session: { principalId: "principal", employeeId: "employee", identityIssuer: "issuer", identitySubject: "subject", profileVersion: 1, accountLifecycleVersion: 1, authEpoch: 0, authenticatedAt: "2026-10-05T00:00:00Z", issuedAt: "2026-10-05T00:00:00Z" } } as VerifiedPrincipalRequest;
const actor: VerifiedWorkloadActor = { kind: "workload", id: OPENSWX_READER.id, purposes: ["openswx_metadata_jobs"], capabilities: ["openswx_metadata"] };
let sqlite: Database.Database, db: SQLiteAsyncDatabaseClient, service: OpenSwxMetadataService;
let time = Date.parse("2026-10-05T00:01:00Z"), revoked = false, drift = false, owner = "principal";
const executionName = "projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata/executions/test-execution";
const ledger: object[] = [];
beforeEach(() => {
  time = Date.parse("2026-10-05T00:01:00Z"); revoked = false; drift = false; owner = "principal";
  sqlite = new Database(":memory:"); sqlite.pragma("foreign_keys=ON");
  sqlite.exec(`CREATE TABLE drawing_recognition_sessions(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,initiator_principal_id TEXT,drawing_id TEXT,source_context_type TEXT,source_context_id TEXT);
    CREATE TABLE principal_accounts(company_id TEXT NOT NULL,pdm_user_id TEXT NOT NULL,principal_id TEXT NOT NULL,UNIQUE(company_id,pdm_user_id,principal_id));
    CREATE TABLE drawing_recognition_sources(id TEXT PRIMARY KEY,company_id TEXT,session_id TEXT,file_asset_id TEXT,content_hash TEXT,file_size INTEGER,storage_generation TEXT,file_ext TEXT);
    CREATE TABLE part_roots(id TEXT PRIMARY KEY); CREATE TABLE part_numbers(id TEXT PRIMARY KEY,part_root_id TEXT REFERENCES part_roots(id)); CREATE TABLE drawings(id TEXT PRIMARY KEY,company_id TEXT,part_root_id TEXT REFERENCES part_roots(id));`);
  // Invariant gate on the unmodified empty source snapshot, before any seed.
  expect(sqlite.prepare("SELECT count(*) n FROM part_roots").get()).toEqual({ n: 0 });
  expect(sqlite.prepare("SELECT count(*) n FROM part_numbers").get()).toEqual({ n: 0 });
  expect(sqlite.prepare("SELECT count(*) n FROM drawings").get()).toEqual({ n: 0 });
  expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%migration%'").all()).toEqual([]);
  expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  sqlite.exec(`CREATE TABLE drawing_numbers(id TEXT PRIMARY KEY,company_id TEXT,created_by TEXT);
CREATE TABLE drawing_revisions(id TEXT PRIMARY KEY,company_id TEXT,drawing_id TEXT);
CREATE TABLE drawing_revision_packages(id TEXT PRIMARY KEY,company_id TEXT);
CREATE TABLE numbering_candidate_revision_drafts(id TEXT PRIMARY KEY,company_id TEXT,workspace_id TEXT);
CREATE TABLE numbering_draft_workspaces(id TEXT PRIMARY KEY,company_id TEXT,owner_id TEXT);
CREATE TABLE file_assets(id TEXT PRIMARY KEY,content_hash TEXT,file_size INTEGER,file_ext TEXT,storage_generation TEXT,deleted_at TEXT,linked_entity_type TEXT,linked_entity_id TEXT);
CREATE TABLE numbering_candidate_revision_files(candidate_revision_id TEXT,company_id TEXT,source_file_asset_id TEXT,removed_at TEXT);
CREATE TABLE drawing_revision_files(id TEXT PRIMARY KEY,drawing_revision_id TEXT,company_id TEXT,source_file_asset_id TEXT,removed_at TEXT);
CREATE TABLE drawing_revision_package_files(package_id TEXT,source_file_asset_id TEXT);
CREATE TABLE canonical_workbench_states(revision_id TEXT,company_id TEXT,work_id TEXT);
CREATE TABLE drawing_revision_works(id TEXT,company_id TEXT);
CREATE TABLE drawing_revision_work_files(work_id TEXT,file_binding_id TEXT);`);
  ensureOpenSwxMetadataSchema(sqlite);
  sqlite.exec(`INSERT INTO drawing_recognition_sessions(id,company_id,initiator_principal_id,drawing_id) VALUES ('session','company','principal',NULL); INSERT INTO principal_accounts VALUES('company','user','principal'); INSERT INTO drawing_recognition_sources VALUES('source','company','session','asset','${hash}',12,NULL,'sldprt');`);
  sqlite.exec(`INSERT INTO drawing_numbers VALUES('drawing','company','user'); INSERT INTO file_assets VALUES('asset','${hash}',12,'sldprt',NULL,NULL,'drawing_number','drawing')`);
  ledger.push({ fixture: ":memory:", seed: ["company/session", "company/user/principal", "source/asset/hash/12"], primaryData: "untouched", productionAuthority: "NOT_TESTED" });
  db = new SQLiteAsyncDatabaseClient(sqlite);
  const dependencies: OpenSwxCoreDependencies = {
    now: () => time,
    authority: async (_db, i) => { if (revoked || i.companyId !== "company" || i.principalId !== "principal") throw Error("authority_revoked"); return { allowed: true, roleCode: null } as Awaited<ReturnType<NonNullable<OpenSwxCoreDependencies["authority"]>>>; },
    sourceBasis: async () => ({ context: { companyId: "company", sourceContextType: "drawing_number", sourceContextId: "drawing", ownerPrincipalId: owner }, fingerprint: drift ? "b".repeat(64) : hash, sources: [source] })
  };
  service = new OpenSwxMetadataService(db, dependencies);
});
afterEach(() => { expect(sqlite.pragma("foreign_key_check")).toEqual([]); sqlite.close(); });
afterAll(() => {
  if (process.env.DEV122_OPENSWX_EVIDENCE_DIR) fs.writeFileSync(path.join(process.env.DEV122_OPENSWX_EVIDENCE_DIR, "fixture-mutation-ledger.json"), JSON.stringify({ project: "AI-PDM", purpose: "narrow SQLite transaction fixture", unmodifiedEmptySnapshot: { masterCounts: [0, 0, 0], rootReferences: "PASS_EMPTY", migrationResidue: [], globalForeignKeys: [] }, mutations: ledger, cleanup: "all in-memory handles closed afterEach", currentPrincipalAuthority: "SEAM_NOT_RUNTIME_PROOF" }, null, 2));
});
async function running() {
  const job = await service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] }); if (!job) throw Error("missing_job");
  // Provider receipt persistence is explicitly a fixture action, not dispatch verification.
  await db.execute(`UPDATE openswx_metadata_jobs SET dispatch_state='dispatched',dispatch_generation=1,execution_name=:executionName WHERE id=:id`, { id: job.id, executionName });
  await service.claim(actor, { executionName });
  const fence: OpenSwxFence = { jobId: job.id, companyId: "company", attempt: 1, sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit, executionName };
  return fence;
}
describe("OpenSWX auxiliary transaction core", () => {
  it("dispatch authority rejects cancellation, generation drift and expired admission before provider", async () => {
    await service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] });
    const admission = await new OpenSwxMetadataAsyncRepository(db).dispatchAdmission(new Date(time).toISOString(), new Date(time + 30_000).toISOString());
    const job = admission!.job;
    await expect(service.authorizeDispatch(job)).resolves.toBeUndefined();
    await expect(service.authorizeDispatch({ ...job, dispatchGeneration: 0 })).rejects.toThrow("OPENSWX_DISPATCH_FENCE_LOST");
    time += 30_000; await expect(service.authorizeDispatch(job)).rejects.toThrow("OPENSWX_DISPATCH_FENCE_LOST"); time -= 30_000;
    await service.cancel(verified, job.id); await expect(service.authorizeDispatch(job)).rejects.toThrow("OPENSWX_DISPATCH_FENCE_LOST");
  });
  it("lease expiring during current authority/source awaits cannot return content descriptor", async () => {
    const f = await running(), before = sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get();
    const slow = new OpenSwxMetadataService(db, { now: () => time,
      authority: async () => ({ allowed: true, roleCode: null }) as Awaited<ReturnType<NonNullable<OpenSwxCoreDependencies["authority"]>>>,
      sourceBasis: async () => { time += 60_001; return { context: { companyId: "company", sourceContextType: "drawing_number", sourceContextId: "drawing", ownerPrincipalId: "principal" }, fingerprint: hash, sources: [source] }; }
    });
    await expect(slow.authorizeSource(actor, f, "asset")).rejects.toThrow("OPENSWX_LEASE_FENCE_LOST");
    expect(sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get()).toEqual(before);
  });
  it("uses the actual typed admission repository to distinguish current denial from failed directory reads", async () => {
    const job = await service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] });
    const noActivePrincipal = { kind: "postgres", query: async () => [] } as unknown as AsyncDatabaseClient;
    await expect(requireCurrentOpenSwxAuthority(noActivePrincipal, job!.initiator)).rejects.toMatchObject({ code: "OPENSWX_INITIATOR_REVOKED", status: 403 });
    const unavailable = { kind: "postgres", query: async () => { throw Error("fixture_dependency_outage"); } } as unknown as AsyncDatabaseClient;
    await expect(requireCurrentOpenSwxAuthority(unavailable, job!.initiator)).rejects.toMatchObject({ code: "principal_directory_unavailable", httpStatus: 503 });
  });
  it("deduplicates concurrent enqueue without overwriting immutable Principal snapshot", async () => {
    const jobs = await Promise.all([service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] }), service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] })]);
    expect(jobs[0]?.id).toBe(jobs[1]?.id); expect(jobs[0]?.initiator.principalId).toBe("principal");
    expect(sqlite.prepare("SELECT count(*) n FROM openswx_metadata_jobs").get()).toEqual({ n: 1 });
    expect(() => sqlite.exec("UPDATE openswx_metadata_jobs SET initiator_json='{}'")).toThrow();
    expect(() => sqlite.exec("UPDATE openswx_metadata_jobs SET sources_json='[]'")).toThrow();
  });
  it("requires persisted exact execution and blocks concurrent double claim", async () => {
    const f = await running();
    await expect(service.claim(actor, { executionName })).rejects.toThrow("OPENSWX_CLAIM_NOT_ADMITTED");
    await expect(service.claim(actor, { executionName: "other" })).rejects.toThrow();
    expect((await service.readback(actor, f)).attemptCount).toBe(1);
  });
  it("persists honest partial result and replays exact receipt/audit once", async () => {
    const f = await running(); const input = [{ sourceId: source.id, payload }];
    const first = await service.complete(actor, f, input); time += 120_000;
    const replay = await service.complete(actor, f, input); expect(replay).toEqual(first);
    const readback = await service.readback(actor, f); expect(readback).toEqual(first);
    const result = JSON.parse(first!.resultJson!); expect(result.schemaVersion).toBe(OPENSWX_READER.schema);
    expect(result.results[0].outcome).toBe("partial"); expect(Object.keys(result.results[0].coverage)).toHaveLength(7);
    expect(result.results[0].properties.find((p: { name: string; scope: string }) => p.name === "Empty" && p.scope === "document_global")).toMatchObject({ storedValue: "", valueAvailability: "stored_empty_string" });
    expect(result.results[0].properties[2].scope).toBe("configuration_effective_merged");
    expect(first?.completionAuditJson).not.toContain("Steel");
    await expect(service.complete(actor, f, [{ sourceId: source.id, payload: { ...payload, version: 31 } }])).rejects.toThrow("OPENSWX_COMPLETION_CONFLICT");
    expect(() => sqlite.exec("UPDATE openswx_metadata_jobs SET completion_digest='" + "b".repeat(64) + "'")).toThrow("openswx_receipt_immutable");
    expect(await service.readback(actor, f)).toEqual(first);
  });
  it.each(["revoke", "source", "ownership", "expired", "staleAttempt", "wrongReader", "wrongCompany", "wrongCommit", "wrongExecution"])("rejects %s with no heartbeat/result mutation", async kind => {
    const f = await running(), before = sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get();
    if (kind === "revoke") revoked = true; if (kind === "source") drift = true; if (kind === "ownership") owner = "other"; if (kind === "expired") time += 60_000;
    const changed = { ...f, ...(kind === "staleAttempt" ? { attempt: 2 } : {}), ...(kind === "wrongCompany" ? { companyId: "other" } : {}), ...(kind === "wrongCommit" ? { readerCommit: "other" } : {}), ...(kind === "wrongExecution" ? { executionName: "other" } : {}) };
    const worker = kind === "wrongReader" ? { ...actor, id: "other" } : actor;
    await expect(service.heartbeat(worker, changed)).rejects.toThrow();
    await expect(service.authorizeSource(worker, changed, source.id)).rejects.toThrow();
    await expect(service.complete(worker, changed, [{ sourceId: source.id, payload }])).rejects.toThrow();
    await expect(service.readback(worker, changed)).rejects.toThrow();
    expect(sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get()).toEqual(before);
  });
  it("cancel denies content and complete, while selected source reads remain fenced", async () => {
    const f = await running(); expect(await service.authorizeSource(actor, f, "asset")).toEqual(source);
    await expect(service.authorizeSource(actor, f, "other")).rejects.toThrow("OPENSWX_SOURCE_FORBIDDEN");
    await service.heartbeat(actor, f); await service.cancel(verified, f.jobId);
    await expect(service.authorizeSource(actor, f, "asset")).rejects.toThrow(); await expect(service.complete(actor, f, [{ sourceId: source.id, payload }])).rejects.toThrow();
    expect(sqlite.prepare("SELECT status,result_json FROM openswx_metadata_jobs").get()).toEqual({ status: "cancelled", result_json: null });
  });
  it("rolls back a failed transaction and enforces source/FK bounds below the service", async () => {
    const job = await service.enqueue(verified, { sourceContextType: "drawing_number", sourceContextId: "drawing", sourceAssetIds: ["asset"] });
    const before = sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get();
    await expect(db.transaction(async tx => { await tx.execute("UPDATE openswx_metadata_jobs SET dispatch_state='requested',dispatch_generation=1"); throw Error("injected_after_write"); })).rejects.toThrow("injected_after_write");
    expect(sqlite.prepare("SELECT * FROM openswx_metadata_jobs").get()).toEqual(before);
    expect(() => sqlite.prepare("INSERT INTO openswx_metadata_jobs SELECT 'different', 'wrong-company',session_id,source_set_fingerprint,reader_commit,initiator_principal_id,initiator_pdm_user_id,initiator_json,sources_json,status,attempt_count,locked_by,lease_expires_at,heartbeat_at,dispatch_state,dispatch_generation,dispatch_lease_expires_at,dispatch_requested_at,dispatch_request_window_end,provider_operation,execution_name,completion_digest,completion_receipt_id,completion_audit_json,result_json,result_bytes,completed_at,created_at,updated_at FROM openswx_metadata_jobs WHERE id=?").run(job!.id)).toThrow();
  });
  it("rejects >8 sources, source >256MiB and UTF8 result >2MiB without silent slicing", () => {
    expect(() => encodeOpenSwxCompletion(Array.from({ length: 9 }, (_, n) => ({ ...source, id: String(n), fileAssetId: String(n) })), [])).toThrow("OPENSWX_SOURCE_COUNT_INVALID");
    expect(() => encodeOpenSwxCompletion([{ ...source, bytes: 268435457 }], [])).toThrow("OPENSWX_SOURCE_BINDING_INVALID");
    const giant = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [String(n), "繁".repeat(65000)]));
    expect(() => encodeOpenSwxCompletion([source], [{ sourceId: source.id, payload: { ...payload, globalProperties: giant } }])).toThrow("OPENSWX_RESULT_SIZE_LIMIT");
  });
  it("failed parse keeps seven honest coverage fields, and rejects native schema impersonation", () => {
    const result = JSON.parse(encodeOpenSwxCompletion([source], [{ sourceId: source.id, payload: { schemaVersion: "aipdm.openswx-public-api.v1", status: "failed", diagnostics: ["library_open_rejected"] } }]).json);
    expect(result.results[0].outcome).toBe("failed"); expect(Object.keys(result.results[0].coverage)).toHaveLength(7);
    expect(() => encodeOpenSwxCompletion([source], [{ sourceId: source.id, payload: { ...payload, schemaVersion: "solidworks-native-properties.v1" } }])).toThrow("OPENSWX_READER_SCHEMA_INVALID");
  });
});
