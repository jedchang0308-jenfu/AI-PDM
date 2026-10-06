import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureOpenSwxMetadataSchema } from "./db";
import { SQLiteAsyncDatabaseClient } from "./db-async-provider";
import { OpenSwxMetadataAsyncRepository } from "./repositories/openswx-metadata-async-repository";
import { OPENSWX_READER } from "./openswx-metadata-contract";
import { canonicalOpenSwxExecution, OpenSwxJobProvider, OPENSWX_JOB_CANONICAL as jobName, OPENSWX_JOB_REQUEST, recoverOpenSwxDispatch, reconcileOpenSwxEmptyClaim } from "./openswx-metadata-dispatch";
let sql: Database.Database, db: SQLiteAsyncDatabaseClient, time: number;
const hash = "a".repeat(64), executionName = `${jobName}/executions/auxiliary-fixture`;
beforeEach(async () => {
  sql = new Database(":memory:"); sql.pragma("foreign_keys=ON");
  sql.exec("CREATE TABLE drawing_recognition_sessions(id TEXT PRIMARY KEY,company_id TEXT,source_context_type TEXT,source_context_id TEXT); CREATE TABLE principal_accounts(company_id TEXT,pdm_user_id TEXT,principal_id TEXT,UNIQUE(company_id,pdm_user_id,principal_id)); CREATE TABLE drawing_recognition_sources(id TEXT,company_id TEXT,session_id TEXT,file_asset_id TEXT,content_hash TEXT,file_size INTEGER,storage_generation TEXT,file_ext TEXT)");
  // Empty source snapshot, no master rows/root refs/residue; FK gate before fixture mutation.
  expect(sql.pragma("foreign_key_check")).toEqual([]); expect(sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%migration%'").all()).toEqual([]);
  sql.exec(`CREATE TABLE drawings(id TEXT PRIMARY KEY,company_id TEXT); CREATE TABLE drawing_numbers(id TEXT PRIMARY KEY,company_id TEXT,created_by TEXT);
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
  ensureOpenSwxMetadataSchema(sql);
  sql.exec(`INSERT INTO drawing_recognition_sessions(id,company_id) VALUES('session','company'); INSERT INTO principal_accounts VALUES('company','user','principal'); INSERT INTO drawing_recognition_sources VALUES('source','company','session','asset','${hash}',12,NULL,'sldprt')`);
  sql.exec(`INSERT INTO drawing_numbers VALUES('drawing','company','user'); INSERT INTO file_assets VALUES('asset','${hash}',12,'sldprt',NULL,NULL,'drawing_number','drawing')`);
  db = new SQLiteAsyncDatabaseClient(sql); time = Date.parse("2026-10-05T00:01:00Z");
  await new OpenSwxMetadataAsyncRepository(db).insert({ id: "job", sourceContextType: "drawing_number", sourceContextId: "drawing", sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit, sources: [{ id: "asset", fileAssetId: "asset", sha256: hash, bytes: 12, extension: "sldprt", storageGeneration: null, sourceRole: "main", sortOrder: 0 }], initiator: { companyId: "company", pdmUserId: "user", principalId: "principal", employeeId: "employee", identityIssuer: "sql-fixture", identitySubject: "sql-fixture", profileVersion: 1, accountLifecycleVersion: 1, authEpoch: 0, authenticatedAt: "2026-10-05T00:00:00Z", sessionIssuedAt: "2026-10-05T00:00:00Z" }, now: new Date(time).toISOString() });
});
afterEach(() => { expect(sql.pragma("foreign_key_check")).toEqual([]); sql.close(); });
const deps = () => ({ enabled: true, now: () => time, authorize: async () => {} }); // Declared control seam, not runtime authority proof.
describe("OpenSWX fixed provider and durable dispatch", () => {
  it("blocked CAS rejects stale generation/unknown/provider outcome and preserves a concurrent cancellation", async () => {
    const repository = new OpenSwxMetadataAsyncRepository(db), now = new Date(time).toISOString();
    const admission = (await repository.dispatchAdmission(now, new Date(time + 30_000).toISOString()))!.job;
    const original = await repository.read("job", "company");
    await repository.dispatchBlocked({ ...admission, dispatchGeneration: 0 }, now);
    expect(await repository.read("job", "company")).toEqual(original);
    for (const state of ["dispatch_unknown", "requested"]) {
      sql.prepare("UPDATE openswx_metadata_jobs SET dispatch_state=?,provider_operation=?").run(state, state === "requested" ? "projects/9536592944/locations/asia-east1/operations/known" : null);
      const before = await repository.read("job", "company"); await repository.dispatchBlocked(admission, now);
      expect(await repository.read("job", "company")).toEqual(before);
    }
    sql.prepare("UPDATE openswx_metadata_jobs SET dispatch_state='requested',provider_operation=NULL,status='cancelled'").run();
    await repository.dispatchBlocked(admission, now);
    expect(await repository.read("job", "company")).toMatchObject({ status: "cancelled", dispatchState: "terminal", dispatchGeneration: 1 });
  });
  it("request abort after authority propagates and cannot execute provider", async () => {
    const controller = new AbortController(); let runs = 0;
    expect(await recoverOpenSwxDispatch(db, { ...deps(), signal: controller.signal, authorize: async () => controller.abort(), provider: { run: async () => { runs++; return ""; }, readback: async () => null } })).toEqual({ state: "dispatch_unknown" });
    expect(runs).toBe(0); expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.dispatchState).toBe("requested");
  });
  it("empty claim never admits due work and unknown/pending never returns empty smoke", async () => {
    let calls = 0;
    const provider = { run: async () => { calls++; return ""; }, readback: async () => { calls++; return null; } };
    expect(await reconcileOpenSwxEmptyClaim(db, { ...deps(), provider })).toEqual({ state: "empty" });
    expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.dispatchGeneration).toBe(0);
    await new OpenSwxMetadataAsyncRepository(db).dispatchAdmission(new Date(time).toISOString(), new Date(time + 30_000).toISOString());
    expect(await reconcileOpenSwxEmptyClaim(db, { ...deps(), provider })).toEqual({ state: "pending" });
    sql.prepare("UPDATE openswx_metadata_jobs SET dispatch_state='dispatch_unknown'").run();
    expect(await reconcileOpenSwxEmptyClaim(db, { ...deps(), provider })).toEqual({ state: "pending" }); expect(calls).toBe(0);
  });
  it("empty claim only reconciles saved exact terminal and never runs/re-admits", async () => {
    let runs = 0;
    sql.prepare("UPDATE openswx_metadata_jobs SET dispatch_state='dispatched',execution_name=?").run(executionName);
    const provider = { run: async () => { runs++; return ""; }, readback: async () => ({ name: executionName, createTime: new Date(time).toISOString(), completionTime: new Date(time).toISOString(), reconciling: false, conditions: [{ type: "Completed", state: "CONDITION_FAILED" }] }) };
    expect(await reconcileOpenSwxEmptyClaim(db, { ...deps(), provider })).toEqual({ state: "empty" });
    const saved = await new OpenSwxMetadataAsyncRepository(db).read("job", "company");
    expect(saved).toMatchObject({ dispatchState: "due", dispatchGeneration: 0, attemptCount: 1 }); expect(runs).toBe(0);
  });
  it("deadline after authority prevents provider run; deadline after provider keeps saved admission", async () => {
    let runs = 0, reads = 0;
    const provider = { run: async () => { runs++; time += 20_001; return "operation"; }, readback: async () => { reads++; return null; } };
    expect(await recoverOpenSwxDispatch(db, { ...deps(), provider, authorize: async () => { time += 20_001; } })).toEqual({ state: "dispatch_unknown" });
    expect(runs).toBe(0);
    sql.prepare("UPDATE openswx_metadata_jobs SET dispatch_state='due'").run();
    expect(await recoverOpenSwxDispatch(db, { ...deps(), provider })).toEqual({ state: "dispatch_unknown" });
    expect(runs).toBe(1); expect(reads).toBe(0); expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.dispatchState).toBe("requested");
  });
  it("disabled default does not take admission or call transport", async () => { expect(await recoverOpenSwxDispatch(db, { enabled: false })).toEqual({ state: "disabled" }); expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.dispatchGeneration).toBe(0); });
  it("canonicalizes only the named/numeric exact own Job", () => {
    expect(canonicalOpenSwxExecution(executionName.replace(jobName, OPENSWX_JOB_REQUEST))).toBe(executionName);
    for (const name of [executionName.replace("9536592944", "123"), executionName.replace("ai-pdm-prod-openswx-metadata", "sibling"), executionName + "/tasks/0", "../other"]) expect(() => canonicalOpenSwxExecution(name)).toThrow();
  });
  it("POST uses fixed named Job and empty body; readback never lists operations", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const provider = new OpenSwxJobProvider({ accessToken: async () => "fake-local-token", request: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json(String(url).endsWith(":run") ? { name: "projects/9536592944/locations/asia-east1/operations/local" } : String(url).includes("/executions?") ? { executions: [{ name: executionName, createTime: new Date(time).toISOString() }] } : { name: jobName });
    } });
    expect(await recoverOpenSwxDispatch(db, { ...deps(), provider })).toEqual({ state: "executing" });
    expect(calls[0]).toMatchObject({ url: `https://run.googleapis.com/v2/${OPENSWX_JOB_REQUEST}:run`, init: { method: "POST", body: "{}", redirect: "error" } });
    expect(calls.some(c => c.url.includes("/operations"))).toBe(false);
    expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.executionName).toBe(executionName);
  });
  it("unknown POST and repeated zero/ambiguous readbacks never execute again", async () => {
    let posts = 0;
    const provider = { run: async () => { posts++; throw Error("unknown-local-outcome"); }, readback: async () => null };
    for (let n = 0; n < 3; n++) { expect(await recoverOpenSwxDispatch(db, { ...deps(), provider })).toEqual({ state: "dispatch_unknown" }); time += 300_000; }
    expect(posts).toBe(1);
  });
  it("only exact terminal readback permits bounded next attempt", async () => {
    let posts = 0;
    const provider = { run: async () => { posts++; return "projects/9536592944/locations/asia-east1/operations/local"; }, readback: async () => ({ name: executionName, createTime: new Date(time).toISOString(), completionTime: new Date(time).toISOString(), reconciling: false, conditions: [{ type: "Completed", state: "CONDITION_FAILED" }] }) };
    await recoverOpenSwxDispatch(db, { ...deps(), provider }); await recoverOpenSwxDispatch(db, { ...deps(), provider });
    expect(await recoverOpenSwxDispatch(db, { ...deps(), provider })).toEqual({ state: "idle" }); expect(posts).toBe(2);
    expect((await new OpenSwxMetadataAsyncRepository(db).read("job", "company"))?.status).toBe("failed");
  });
  it("authority rejection occurs before POST", async () => {
    let calls = 0;
    expect(await recoverOpenSwxDispatch(db, { ...deps(), authorize: async () => { throw Error("revoked"); }, provider: { run: async () => { calls++; return ""; }, readback: async () => null } })).toEqual({ state: "blocked" }); expect(calls).toBe(0);
    expect(await new OpenSwxMetadataAsyncRepository(db).read("job", "company")).toMatchObject({ status: "failed", dispatchState: "terminal", dispatchGeneration: 1, executionName: null });
    expect(await recoverOpenSwxDispatch(db, { ...deps(), provider: { run: async () => { calls++; return ""; }, readback: async () => null } })).toEqual({ state: "idle" }); expect(calls).toBe(0);
  });
});
