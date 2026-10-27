import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";
import { decodePreviewLeaseHeader, parsePreviewLeaseBasis, type PreviewLeaseBasis } from "@/lib/preview-worker-lease";
import { claimPreviewJobAsync, completePreviewJobAsync, enqueuePreviewJobForSourceAsync,
  ensureAutomaticPreviewJobsForSourceAssetsAsync, heartbeatPreviewJobAsync, readClaimedPreviewSourceAsync, readLatestPreviewJobForSourceAsync, recoverStalePreviewJobsAsync } from "@/lib/preview-derivatives";
const storage = vi.hoisted(() => ({ put: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/file-storage", async original => ({ ...await original<typeof import("@/lib/file-storage")>(),
  createFileStorageService: () => ({ putObject: storage.put }),
  createFileStorageServiceForPointer: () => ({ readObject: storage.read }) }));
let database: InstanceType<typeof Database>;
let client: AsyncDatabaseClient;
const hash = "a".repeat(64);
const basis: PreviewLeaseBasis = { companyId: "company-one", sourceFileAssetId: "asset-one", sourceContentHash: hash,
  attemptCount: 1, lockedAt: "2026-10-23T00:00:00.000Z" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/fOQAAAAASUVORK5CYII=", "base64");
const output = { kind: "thumbnail_png" as const, fileName: "preview.png", mimeType: "image/png" as const, contentBase64: png.toString("base64") };
const claim = () => claimPreviewJobAsync(client, { leaseProtocolVersion: 2, workerId: "worker-one",
  companyId: "company-one", supportedKinds: ["native_thumbnail_png"], supportedExtensions: ["slddrw"] });
const source = () => ({ ...database.prepare("SELECT * FROM file_assets").get() as object, company_id: "company-one" }) as Parameters<typeof enqueuePreviewJobForSourceAsync>[1]["source"];
const initiator = { kind: "verified_principal" as const, principalId: "principal-one", employeeId: "employee-one",
  pdmUserId: "profile-one", companyId: "company-one", identityIssuer: "test", identitySubject: "worker-fixture",
  profileVersion: 1, accountLifecycleVersion: 1, authEpoch: 0, authenticatedAt: basis.lockedAt, sessionIssuedAt: basis.lockedAt };
const enqueue = (forceRegenerate = false) => enqueuePreviewJobForSourceAsync(client,
  { source: source(), actorUserId: "profile-one", principalInitiator: initiator, forceRegenerate });
const snapshot = () => JSON.stringify({ jobs: database.prepare("SELECT * FROM preview_jobs").all(),
  source: database.prepare("SELECT * FROM file_assets").all(), derivatives: database.prepare("SELECT * FROM file_derivatives").all() });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("PDM_LOCAL_FAKE_PREVIEW_WORKER", "0");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(basis.lockedAt));
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE drawing_revisions (id TEXT PRIMARY KEY, company_id TEXT NOT NULL);
    CREATE TABLE drawing_revision_files (id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
      drawing_revision_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL, removed_at TEXT,
      role TEXT, sort_order INTEGER);
    CREATE TABLE numbering_candidate_revision_files (id TEXT PRIMARY KEY, company_id TEXT NOT NULL,
      candidate_revision_id TEXT NOT NULL, source_file_asset_id TEXT NOT NULL, removed_at TEXT,
      role TEXT, sort_order INTEGER);
    CREATE TABLE numbering_candidate_revision_drafts (id TEXT PRIMARY KEY, company_id TEXT);
    CREATE TABLE drawing_numbers (id TEXT PRIMARY KEY, company_id TEXT);
    CREATE TABLE part_numbers (id TEXT PRIMARY KEY, company_id TEXT);
    CREATE TABLE file_assets (id TEXT PRIMARY KEY, linked_entity_type TEXT, linked_entity_id TEXT, deleted_at TEXT,
      storage_provider TEXT, storage_key TEXT, original_path TEXT, file_name TEXT, file_ext TEXT, mime_type TEXT,
      file_size INTEGER, content_hash TEXT, hash_algorithm TEXT);
    CREATE TABLE preview_jobs (id TEXT PRIMARY KEY, company_id TEXT, source_file_asset_id TEXT, source_content_hash TEXT,
      requested_kind TEXT, source_extension TEXT, status TEXT, priority INTEGER, attempt_count INTEGER,
      idempotency_key TEXT UNIQUE, generator_profile TEXT, error_code TEXT, error_summary TEXT, created_by TEXT,
      created_at TEXT, updated_at TEXT, completed_at TEXT, metadata_json TEXT, locked_by TEXT, locked_at TEXT,
      worker_completion_json TEXT);
    CREATE TABLE file_derivatives (id TEXT PRIMARY KEY, company_id TEXT, source_file_asset_id TEXT, source_content_hash TEXT,
      derivative_kind TEXT, storage_provider TEXT, storage_key TEXT, original_path TEXT, file_name TEXT, mime_type TEXT,
      file_size INTEGER, content_hash TEXT, hash_algorithm TEXT, width INTEGER, height INTEGER, page_count INTEGER,
      generator_profile TEXT, generator_version TEXT, preview_job_id TEXT, status TEXT, created_at TEXT, created_by_worker TEXT, metadata_json TEXT);
    INSERT INTO drawing_revisions VALUES ('revision-one','company-one');
    INSERT INTO drawing_revision_files VALUES
      ('binding-one','company-one','revision-one','asset-one',NULL,'drawing_2d',1);
    INSERT INTO file_assets VALUES ('asset-one','drawing_revision','revision-one',NULL,'local_repository','source/one',NULL,
      'drawing.slddrw','slddrw','application/octet-stream',10,'${hash}','SHA-256');
  `);
  client = createAsyncDatabaseClient({ kind: "sqlite", database });
  storage.put.mockImplementation(async ({ key, bytes }) => ({ provider: "local_repository", key,
    localPath: "/task-owned/" + key, sha256: "b".repeat(64), bytes: bytes.length }));
});
afterEach(() => { database.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("preview lease v2 parser", () => {
  it("round-trips the canonical header and rejects noncanonical/oversize encodings", () => {
    const encoded = Buffer.from(JSON.stringify({ leaseProtocolVersion: 2, leaseBasis: basis })).toString("base64url");
    expect(decodePreviewLeaseHeader(encoded)).toEqual(basis);
    for (const value of [null, encoded + "=", encoded + "!", "a".repeat(2049), Buffer.from([255]).toString("base64url"),
      Buffer.from('{"leaseProtocolVersion":2}').toString("base64url")]) expect(decodePreviewLeaseHeader(value)).toBeNull();
  });
  it.each([{ attemptCount: 0 }, { attemptCount: 4 }, { attemptCount: 1.1 }, { lockedAt: "2026-10-23T00:00:00Z" },
    { lockedAt: "2026-02-30T00:00:00.000Z" }, { companyId: " 公司 " }, { companyId: "公".repeat(86) },
    { sourceContentHash: "A".repeat(64) }, { extra: true }])("rejects illegal basis: %j", delta => {
    expect(parsePreviewLeaseBasis({ ...basis, ...delta })).toBeNull();
  });
  it("accepts bounded UTF8 ids and guarantees the header can express the claim", () => {
    const accepted = parsePreviewLeaseBasis({ ...basis, companyId: "公".repeat(85) });
    const encoded = Buffer.from(JSON.stringify({ leaseProtocolVersion: 2, leaseBasis: accepted })).toString("base64url");
    expect(accepted).not.toBeNull(); expect(encoded.length).toBeLessThanOrEqual(2048);
    expect(decodePreviewLeaseHeader(encoded)).toEqual(accepted);
  });
});

describe("full generation fences on actual SQLite SQL (not PostgreSQL proof)", () => {
  it("returns the post-update generation and refuses every same-actor old action with zero effects", async () => {
    await enqueue(); const first = (await claim())!;
    expect(first.leaseBasis).toEqual(basis);
    expect(await completePreviewJobAsync(client, { jobId: first.jobId, workerId: "worker-one", leaseBasis: first.leaseBasis,
      status: "cancelled", cancelReason: "operator_shutdown" })).toMatchObject({ accepted: true });
    await enqueue(true); const second = (await claim())!;
    expect(second.leaseBasis.attemptCount).toBe(2);
    const before = snapshot();
    const old = { jobId: first.jobId, workerId: "worker-one", leaseBasis: first.leaseBasis };
    expect(await heartbeatPreviewJobAsync(client, old)).toBe(false);
    await expect(readClaimedPreviewSourceAsync(client, old)).rejects.toThrow("PREVIEW_JOB_CLAIM_LOST");
    for (const status of ["cancelled", "failed", "skipped", "succeeded"] as const) {
      expect(await completePreviewJobAsync(client, { ...old, status, cancelReason: "operator_shutdown",
        errorCode: "old", errorSummary: "old", sourceContentHash: hash, derivatives: [output] })).toMatchObject({ accepted: false });
      expect(snapshot()).toBe(before);
    }
    expect(storage.put).not.toHaveBeenCalled(); expect(storage.read).not.toHaveBeenCalled();
    expect(await heartbeatPreviewJobAsync(client, { ...old, leaseBasis: second.leaseBasis })).toBe(true);
  });
  it("rejects a lease exactly at the 30-second freshness boundary without reviving it", async () => {
    await enqueue(); const current = (await claim())!;
    const input = { jobId: current.jobId, workerId: "worker-one", leaseBasis: current.leaseBasis };
    vi.setSystemTime(Date.now() + 30000); const before = snapshot();
    expect(await heartbeatPreviewJobAsync(client, input)).toBe(false);
    expect(await completePreviewJobAsync(client, { ...input, status: "cancelled", cancelReason: "operator_shutdown" })).toMatchObject({ accepted: false });
    expect(snapshot()).toBe(before);
  });
  it("does not rewind generation or leave an exhausted force reset queued", async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await enqueue(attempt > 1); const current = (await claim())!;
      expect(current.leaseBasis.attemptCount).toBe(attempt);
      await completePreviewJobAsync(client, { jobId: current.jobId, workerId: "worker-one", leaseBasis: current.leaseBasis,
        status: "cancelled", cancelReason: "operator_shutdown" });
    }
    const before = snapshot(); await expect(enqueue(true)).rejects.toThrow("PREVIEW_ATTEMPTS_EXHAUSTED");
    expect(snapshot()).toBe(before); expect(await claim()).toBeNull();
  });
  it("keeps success and replay atomic, clears terminal locks, and never auto-retries storage", async () => {
    await enqueue(); const current = (await claim())!;
    const input = { jobId: current.jobId, workerId: "worker-one", leaseBasis: current.leaseBasis,
      status: "succeeded" as const, sourceContentHash: hash, derivatives: [output] };
    const transaction = vi.spyOn(client, "transaction");
    expect(await completePreviewJobAsync(client, input)).toMatchObject({ accepted: true });
    expect(database.prepare("SELECT status,locked_by,locked_at,completed_at FROM preview_jobs").get())
      .toMatchObject({ status: "succeeded", locked_by: null, locked_at: null, completed_at: basis.lockedAt });
    expect(transaction).toHaveBeenLastCalledWith(expect.any(Function), { isolationLevel: "repeatable_read", readOnly: false });
    const before = snapshot(); expect(await completePreviewJobAsync(client, input)).toMatchObject({ accepted: false });
    expect(snapshot()).toBe(before); expect(storage.put).toHaveBeenCalledOnce();
  });
  it("rolls back DB writes on a confirmed put failure and records readback without retry/delete", async () => {
    await enqueue(); const current = (await claim())!; const before = snapshot();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    storage.put.mockRejectedValueOnce(new Error("UNKNOWN_PUT_OUTCOME"));
    try {
      await expect(completePreviewJobAsync(client, { jobId: current.jobId, workerId: "worker-one", leaseBasis: current.leaseBasis,
        status: "succeeded", sourceContentHash: hash, derivatives: [output] })).rejects.toThrow("UNKNOWN_PUT_OUTCOME");
      expect(snapshot()).toBe(before); expect(storage.put).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("PREVIEW_COMPLETION_OUTCOME_REQUIRES_READBACK", expect.objectContaining({ jobId: current.jobId, attemptCount: 1 }));
    } finally { log.mockRestore(); }
  });
  it("rejects the fake environment and explicit fake producer before any database effects", async () => {
    const before = snapshot();
    await expect(enqueuePreviewJobForSourceAsync(client, { source: source(), actorUserId: "profile-one", principalInitiator: initiator, runFakeWorker: true }))
      .rejects.toThrow("LOCAL_FAKE_PREVIEW_WORKER_RETIRED");
    vi.stubEnv("PDM_LOCAL_FAKE_PREVIEW_WORKER", "1");
    await expect(ensureAutomaticPreviewJobsForSourceAssetsAsync(client, { companyId: "company-one", sourceFileAssetIds: ["asset-one"], actorUserId: "profile-one" }))
      .rejects.toThrow("LOCAL_FAKE_PREVIEW_WORKER_RETIRED");
    expect(snapshot()).toBe(before); expect(storage.put).not.toHaveBeenCalled();
  });
  it.each(["queued","running"])("never claims, recovers, or exposes an old fake %s job",async status=>{
    await enqueue(); database.prepare("UPDATE preview_jobs SET generator_profile='fake_preview_worker',status=?,updated_at='2026-10-22T00:00:00.000Z'").run(status);
    const before=snapshot();expect(await claim()).toBeNull();expect(snapshot()).toBe(before);
    expect(await readLatestPreviewJobForSourceAsync(client,{companyId:basis.companyId,sourceFileAssetId:basis.sourceFileAssetId,sourceContentHash:hash,requestedKind:"native_thumbnail_png"})).toBeNull();
    expect(storage.put).not.toHaveBeenCalled();
  });
  it.each(["source","owner"])("does not mutate the queued job when %s disappears during claim",async variant=>{
    await enqueue();const before=database.prepare("SELECT * FROM preview_jobs").get();const transaction=client.transaction.bind(client);
    vi.spyOn(client,"transaction").mockImplementation((run,options)=>transaction(async tx=>{
      const query=tx.queryOne.bind(tx);let armed=true;
      tx.queryOne=async<T>(sql:string,params?:import("@/lib/db-async-provider").AsyncDatabaseQueryParams):Promise<T|null>=>{
        if(armed&&sql.includes("SELECT * FROM file_assets")){armed=false;database.exec(variant==="source"?"DELETE FROM file_assets":"DELETE FROM drawing_revisions");}
        return query<T>(sql,params);
      };return run(tx);
    },options));
    expect(await claim()).toBeNull();expect(database.prepare("SELECT * FROM preview_jobs").get()).toEqual(before);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it.each(["DELETE FROM file_assets", "UPDATE file_assets SET content_hash='replacement'", "UPDATE drawing_revisions SET company_id='another-company'"])("independently terminates a stale invalid source without worker effects: %s",async fault=>{
    await enqueue();const current=(await claim())!;database.exec(fault);
    const input={jobId:current.jobId,workerId:"worker-one",leaseBasis:current.leaseBasis};const before=snapshot();
    expect(await completePreviewJobAsync(client,{...input,status:"failed",errorCode:"missing_source",errorSummary:"missing"})).toMatchObject({accepted:false});
    expect(snapshot()).toBe(before);vi.setSystemTime(Date.now()+30000);
    expect(await recoverStalePreviewJobsAsync(client,{companyId:"company-one",sourceFileAssetIds:["asset-one"]})).toMatchObject({recovered:0,invalidSourceTerminated:1});
    expect(database.prepare("SELECT status,error_code,locked_by,locked_at FROM preview_jobs").get()).toEqual({status:"failed",error_code:"preview_source_unavailable",locked_by:null,locked_at:null});
    expect(storage.put).not.toHaveBeenCalled();
  });

  it("does not infer rollback when COMMIT actually succeeds but its acknowledgement is lost",async()=>{
    await enqueue();const current=(await claim())!;const transaction=client.transaction.bind(client);
    const spy=vi.spyOn(client,"transaction").mockImplementation(async(run,options)=>{await transaction(run,options);throw new Error("COMMIT_ACK_LOST")});
    const log=vi.spyOn(console,"error").mockImplementation(()=>undefined);
    try{
      await expect(completePreviewJobAsync(client,{jobId:current.jobId,workerId:"worker-one",leaseBasis:current.leaseBasis,status:"succeeded",sourceContentHash:hash,derivatives:[output]})).rejects.toThrow("COMMIT_ACK_LOST");
      expect(database.prepare("SELECT status FROM preview_jobs").get()).toEqual({status:"succeeded"});
      expect(database.prepare("SELECT COUNT(*) AS n FROM file_derivatives").get()).toEqual({n:1});expect(storage.put).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("PREVIEW_COMPLETION_OUTCOME_REQUIRES_READBACK",expect.objectContaining({storedObjects:[expect.objectContaining({key:expect.any(String)})]}));
    }finally{spy.mockRestore();log.mockRestore()}
    expect(await completePreviewJobAsync(client,{jobId:current.jobId,workerId:"worker-one",leaseBasis:current.leaseBasis,status:"failed",errorCode:"late",errorSummary:"late"})).toMatchObject({accepted:false});
    expect(storage.put).toHaveBeenCalledOnce();
  });

});
