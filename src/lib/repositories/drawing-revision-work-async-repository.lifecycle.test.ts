import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDefaultDatabaseProvider } from "@/lib/db-provider";
import { ensureDev107DrawingRecognitionLineageSchema, ensureOpenSwxMetadataSchema } from "@/lib/db";
import { SQLiteAsyncDatabaseClient } from "@/lib/db-async-provider";
import { OpenSwxMetadataAsyncRepository } from "@/lib/repositories/openswx-metadata-async-repository";
import { OPENSWX_READER } from "@/lib/openswx-metadata-contract";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { DrawingRevisionWorkAsyncRepository } from "@/lib/repositories/drawing-revision-work-async-repository";

function fakeClient(kind: "postgres" | "sqlite" = "postgres") {
  const query = vi.fn();
  return {
    client: { kind, transactionScope: kind === "postgres" ? "postgres" : "local",
      query, queryOne: vi.fn(), execute: vi.fn() } as unknown as AsyncDatabaseClient,
    query
  };
}

function formalMasterRow(overrides: Record<string, unknown> = {}) {
  return {
    drawing_id: "drawing-one",
    drawing_company_id: "company-one",
    formal_drawing_number_id: "master-one",
    mapped_drawing_number: "D-001",
    master_id: "master-one",
    master_company_id: "company-one",
    master_drawing_number: "D-001",
    master_status: "Draft",
    master_updated_at: "2026-10-03 01:02:03",
    master_purpose_code: "M",
    master_purpose_description: "Main",
    master_is_primary_manufacturing: 1,
    formal_number_match_count: 1,
    ...overrides
  };
}

describe("Drawing revision mapped master lifecycle basis", () => {
  it("permits only a truly unmapped minor when the exact master join has no row", async () => {
    for (const formalId of [null, "missing-or-cross-company"]) {
      const { client, query } = fakeClient();
      query.mockResolvedValueOnce([]);
      vi.mocked(client.queryOne).mockResolvedValueOnce({ formal_drawing_number_id: formalId });
      const read = new DrawingRevisionWorkAsyncRepository(client).readMasterLifecycleBasis(client,
        { companyId: "company-one", drawingId: "drawing-one", targetMinor: 1 });
      if (formalId === null) await expect(read).resolves.toBeNull();
      else await expect(read).rejects.toMatchObject({ status: 409 });
      expect(client.queryOne).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), expect.objectContaining({ companyId: "company-one" }));
    }
  });
  it("locks the exact same-company mapping and normalizes the master hash fields", async () => {
    const { client, query } = fakeClient();
    query.mockResolvedValueOnce([formalMasterRow()]);
    const basis = await new DrawingRevisionWorkAsyncRepository(client)
      .readMasterLifecycleBasis(client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      });
    expect(basis).toEqual({
      intent: "production_release",
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    });
    expect(query.mock.calls[0]?.[0]).toContain(
      "drawing.company_id = :companyId");
    expect(query.mock.calls[0]?.[0]).toContain(
      "master.company_id = drawing.company_id");
    expect(query.mock.calls[0]?.[0]).toContain(
      "FOR UPDATE OF drawing, master");
  });

  it("allows an unmapped minor to retain the existing RD-only path but rejects an unmapped major", async () => {
    const minor = fakeClient();
    minor.query.mockResolvedValueOnce([]);
    vi.mocked(minor.client.queryOne).mockResolvedValueOnce({ formal_drawing_number_id: null });
    await expect(new DrawingRevisionWorkAsyncRepository(minor.client)
      .readMasterLifecycleBasis(minor.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 1
      })).resolves.toBeNull();

    const major = fakeClient();
    major.query.mockResolvedValueOnce([]);
    await expect(new DrawingRevisionWorkAsyncRepository(major.client)
      .readMasterLifecycleBasis(major.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects missing, duplicate, cross-company, and mismatched formal-number mappings", async () => {
    const cases = [
      [],
      [formalMasterRow(), formalMasterRow({ master_id: "master-two" })],
      [formalMasterRow({ master_company_id: "company-other" })],
      [formalMasterRow({ formal_number_match_count: 2 })],
      [formalMasterRow({ mapped_drawing_number: "D-OTHER" })]
    ];
    for (const rows of cases) {
      const { client, query } = fakeClient();
      query.mockResolvedValueOnce(rows);
      await expect(new DrawingRevisionWorkAsyncRepository(client)
        .readMasterLifecycleBasis(client, {
          companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
          required: true
        })).rejects.toMatchObject({ status: 409 });
    }
  });

  it.each(["Obsolete", "Merged", "MainDrawingInvalid", "PendingAdminConfirm",
    "Cancelled"])("does not revive terminal or admin-gated master status %s", async (status) => {
    const { client, query } = fakeClient();
    query.mockResolvedValueOnce([formalMasterRow({ master_status: status })]);
    await expect(new DrawingRevisionWorkAsyncRepository(client)
      .readMasterLifecycleBasis(client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 0,
        required: true
      })).rejects.toMatchObject({ status: 409 });
  });

  it.each(["NeedInfo", "Rejected", "Active", "PendingReview"])("keeps legacy %s outside a major release", async (status) => {
    const { client, query } = fakeClient();
    query.mockResolvedValueOnce([formalMasterRow({ master_status: status })]);
    await expect(new DrawingRevisionWorkAsyncRepository(client)
      .readMasterLifecycleBasis(client, { companyId: "company-one", drawingId: "drawing-one", targetMinor: 0, required: true }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("allows minor rejected correction data and blocks a PendingReview with another open request", async () => {
    const rejected = fakeClient();
    rejected.query.mockResolvedValueOnce([
      formalMasterRow({ master_status: "Rejected" })
    ]);
    await expect(new DrawingRevisionWorkAsyncRepository(rejected.client)
      .readMasterLifecycleBasis(rejected.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 1,
        required: true
      })).resolves.toMatchObject({ masterStatus: "Rejected" });

    const pending = fakeClient();
    pending.query.mockResolvedValueOnce([
      formalMasterRow({ master_status: "PendingReview" })
    ]).mockResolvedValueOnce([{ id: "other-active-review" }]);
    await expect(new DrawingRevisionWorkAsyncRepository(pending.client)
      .readMasterLifecycleBasis(pending.client, {
        companyId: "company-one", drawingId: "drawing-one", targetMinor: 1,
        required: true
      })).rejects.toMatchObject({ status: 409 });
    expect(pending.query).toHaveBeenCalledTimes(2);
  });

  it("updates only the exact mapped master after rechecking its frozen basis", async () => {
    const { client, query } = fakeClient();
    const row = formalMasterRow();
    const lifecycleBasis = {
      intent: "production_release" as const,
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    };
    query.mockResolvedValueOnce([row]).mockResolvedValueOnce([
      { id: "master-one" }
    ]);
    await new DrawingRevisionWorkAsyncRepository(client)
      .releaseMasterForProduction(client, {
        companyId: "company-one", drawingId: "drawing-one", lifecycleBasis
      });
    expect(query.mock.calls[1]?.[0]).toContain("UPDATE drawing_numbers");
    expect(query.mock.calls[1]?.[0]).toContain(
      "WHERE id = :masterId AND company_id = :companyId");
    expect(query.mock.calls[1]?.[0]).not.toContain("part_root");
    expect(query.mock.calls[1]?.[1]).toMatchObject({
      masterId: "master-one", companyId: "company-one", expectedStatus: "Draft"
    });
  });

  it("fails closed if the exact master update returns no row", async () => {
    const { client, query } = fakeClient();
    const lifecycleBasis = {
      intent: "production_release" as const,
      masterId: "master-one",
      masterStatus: "Draft",
      masterHash: dev087RequestHash({
        id: "master-one", recordStatus: "Draft",
        updatedAt: "2026-10-03T01:02:03.000Z",
        purposeCode: "M", purposeDescription: "Main",
        isPrimaryManufacturing: true
      }),
      formalRowVersion: null
    };
    query.mockResolvedValueOnce([formalMasterRow()]).mockResolvedValueOnce([]);
    await expect(new DrawingRevisionWorkAsyncRepository(client)
      .releaseMasterForProduction(client, {
        companyId: "company-one", drawingId: "drawing-one", lifecycleBasis
      })).rejects.toMatchObject({ status: 409 });
  });
});

// Full source SQLite schema plus the actual provider, FK/lineage/immutable triggers and repository.
// No getDb() is called, so importing this file never opens or initializes primary data.
async function withB18SQLite<T>(action: (client: SQLiteAsyncDatabaseClient, snapshot: () => Record<string, unknown[]>, seedJob: (status: string, provenance?: boolean) => Promise<void>) => Promise<T>) {
  const taskRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aipdm-b18-sqlite-"));
  const dataDir = path.join(taskRoot, "data"), repositoryDir = path.join(taskRoot, "repository");
  const previousData = process.env.PDM_DATA_DIR, previousRepository = process.env.PDM_REPOSITORY_DIR;
  process.env.PDM_DATA_DIR = dataDir; process.env.PDM_REPOSITORY_DIR = repositoryDir;
  const ledger: object[] = [];
  const declaration = { project: "AI-PDM", purpose: "B18 real SQLite cancellation transaction", port: null, owningProcessTree: { pid: process.pid },
    cleanupCondition: "provider closed and exact taskRoot removed in finally", PDM_DATA_DIR: dataDir, PDM_REPOSITORY_DIR: repositoryDir, primaryMutation: false };
  const provider = createDefaultDatabaseProvider({ provider: "sqlite", databasePath: path.join(dataDir, "fixture.sqlite"), dataDir, repositoryDir,
    initialize: sqlite => {
      sqlite.exec(fs.readFileSync(path.join(process.cwd(), "db/schema.sql"), "utf8"));
      // Explicit narrow Principal identity parent input used by the existing OpenSWX SQLite contract.
      sqlite.exec("CREATE TABLE principal_accounts(company_id TEXT NOT NULL,pdm_user_id TEXT NOT NULL,principal_id TEXT NOT NULL,UNIQUE(company_id,pdm_user_id,principal_id));");
      ensureDev107DrawingRecognitionLineageSchema(sqlite); ensureOpenSwxMetadataSchema(sqlite);
    } });
  try {
    const sqlite = provider.getConnection(), client = new SQLiteAsyncDatabaseClient(sqlite);
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
    const snapshot = () => Object.fromEntries(tables.map(({ name }) => [name, sqlite.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]));
    const baseline = { masterCounts: ["part_roots", "part_numbers", "drawing_numbers", "drawings"].map(table => sqlite.prepare(`SELECT count(*) n FROM ${table}`).get()),
      rootReferences: sqlite.prepare("SELECT id FROM drawings WHERE part_root_id IS NOT NULL").all(),
      residue: sqlite.prepare("SELECT * FROM pdm_workbench_migration_quarantine").all(), globalForeignKeys: sqlite.pragma("foreign_key_check") };
    expect(baseline.masterCounts).toEqual([{ n: 0 }, { n: 0 }, { n: 0 }, { n: 0 }]);
    expect(baseline.rootReferences).toEqual([]); expect(baseline.residue).toEqual([]); expect(baseline.globalForeignKeys).toEqual([]);
    ledger.push({ unmodifiedSourceSnapshot: baseline });
    const seed = (sql: string) => { ledger.push({ boundary: "INPUT_NOT_CANCELLATION_OUTPUT", sql }); sqlite.exec(sql); };
    const hash = "a".repeat(64);
    seed(`INSERT INTO users(id,display_name,role,company_id) VALUES('b18-owner','B18 owner','Engineer','company-jenfu');
      INSERT INTO principal_accounts VALUES('company-jenfu','b18-owner','b18-principal');
      INSERT INTO drawings(id,company_id,created_by) VALUES('b18-drawing','company-jenfu','b18-owner');
      INSERT INTO drawing_revisions(id,company_id,drawing_id,revision,created_by,updated_by) VALUES('b18-revision','company-jenfu','b18-drawing','0.1','b18-owner','b18-owner');
      INSERT INTO pdm_workbench_aggregates(id,company_id,entity_type,canonical_entity_id,open_branch_count) VALUES('b18-aggregate','company-jenfu','drawing','b18-drawing',1);
      INSERT INTO drawing_rd_branches(id,company_id,drawing_id) VALUES('b18-branch','company-jenfu','b18-drawing');
      INSERT INTO drawing_revision_claims(id,company_id,drawing_id,branch_id,target_major,target_minor,target_label) VALUES('b18-claim','company-jenfu','b18-drawing','b18-branch',0,1,'0.1');
      INSERT INTO drawing_revision_works(id,company_id,drawing_id,branch_id,target_claim_id,owner_user_id,proposed_payload,base_hash) VALUES('b18-work','company-jenfu','b18-drawing','b18-branch','b18-claim','b18-owner','{}','${hash}');
      INSERT INTO canonical_workbench_states(id,company_id,entity_type,canonical_entity_id,data_layer,branch_id,revision_id,work_id,handling) VALUES('b18-state','company-jenfu','drawing','b18-drawing','drawing_rd','b18-branch','b18-revision','b18-work','owner');
      INSERT INTO file_assets(id,file_name,file_ext,mime_type,file_size,content_hash,linked_entity_type,linked_entity_id) VALUES('b18-asset','b18.sldprt','sldprt','application/octet-stream',12,'${hash}','drawing_revision','b18-revision');
      INSERT INTO drawing_revision_files(id,company_id,drawing_revision_id,source_file_asset_id,role,role_source,created_by) VALUES('b18-file','company-jenfu','b18-revision','b18-asset','cad_3d','extension','b18-owner');
      INSERT INTO drawing_revision_work_files VALUES('b18-work','b18-file',0,'${hash}');`);
    const seedJob = async (status: string, provenance = false) => {
      if (provenance) {
        for (const [id, parent] of [["b18-session-one", null], ["b18-session-two", "b18-session-one"]]) seed(`INSERT INTO drawing_recognition_sessions
          (id,company_id,source_context_type,source_context_id,source_lineage_key,drawing_id,drawing_revision_id,source_set_fingerprint,deduplication_key,status,created_by,supersedes_session_id,evidence_origin_session_id)
          VALUES('${id}','company-jenfu','drawing_revision','b18-revision','b18-revision','b18-drawing','b18-revision','${hash}','${id}','extracting','b18-owner',${parent ? `'${parent}'` : "NULL"},${parent ? `'${parent}'` : "NULL"});
          INSERT INTO drawing_recognition_sources(id,session_id,company_id,file_asset_id,content_hash,file_name,file_ext,mime_type,file_size,source_role)
          VALUES('${id}-source','${id}','company-jenfu','b18-asset','${hash}','b18.sldprt','sldprt','application/octet-stream',12,'main');`);
      }
      ledger.push({ purpose: "normal OpenSWX repository inserts real typed fixture INPUT", status, provenance });
      await new OpenSwxMetadataAsyncRepository(client).insert({ id: "b18-job", sessionId: provenance ? "b18-session-two" : null,
        sourceContextType: "drawing_revision", sourceContextId: "b18-revision", sourceSetFingerprint: hash, readerCommit: OPENSWX_READER.commit,
        initiator: { companyId: "company-jenfu", principalId: "b18-principal", pdmUserId: "b18-owner", employeeId: "b18-employee", identityIssuer: "fixture-issuer", identitySubject: "fixture-subject",
          profileVersion: 1, accountLifecycleVersion: 1, authEpoch: 0, authenticatedAt: "2026-10-05T00:00:00Z", sessionIssuedAt: "2026-10-05T00:00:00Z" },
        sources: [{ id: "b18-asset", fileAssetId: "b18-asset", sha256: hash, bytes: 12, extension: "sldprt", storageGeneration: null, sourceRole: "main", sortOrder: 0 }], now: "2026-10-05T00:00:00Z" });
      if (status !== "queued") seed(`UPDATE openswx_metadata_jobs SET status='${status}',dispatch_state='${status === "running" ? "dispatched" : "terminal"}',attempt_count=1,
        locked_by='openswx-metadata-reader',lease_expires_at='2026-10-05T00:00:00Z',execution_name='fixture-execution' WHERE id='b18-job';`);
    };
    try { return await action(client, snapshot, seedJob); }
    finally { expect(sqlite.pragma("foreign_key_check")).toEqual([]); ledger.push({ finalGlobalForeignKeys: sqlite.pragma("foreign_key_check") }); }
  } finally {
    provider.close();
    if (previousData === undefined) delete process.env.PDM_DATA_DIR; else process.env.PDM_DATA_DIR = previousData;
    if (previousRepository === undefined) delete process.env.PDM_REPOSITORY_DIR; else process.env.PDM_REPOSITORY_DIR = previousRepository;
    expect(path.dirname(taskRoot)).toBe(path.resolve(os.tmpdir())); expect(path.basename(taskRoot)).toMatch(/^aipdm-b18-sqlite-/);
    fs.rmSync(taskRoot, { recursive: true, force: true });
    const evidence = process.env.DEV122_OPENSWX_EVIDENCE_DIR ?? path.join(process.cwd(), "output/qa/dev-122/openswx-phase2/b18-sqlite");
    fs.mkdirSync(evidence, { recursive: true }); fs.appendFileSync(path.join(evidence, "fixture-mutations.jsonl"), JSON.stringify({ declaration, ledger, cleanup: !fs.existsSync(taskRoot) }) + "\n");
  }
}
const b18SQLiteCancel = (client: AsyncDatabaseClient) => client.transaction(tx => new DrawingRevisionWorkAsyncRepository(tx).cancel(tx,
  { companyId: "company-jenfu", workId: "b18-work", expectedRowVersion: 1 }));
describe("B18 real SQLite parent work cancellation", () => {
  it.each([false, true])("retains terminal provenance=%s without disabling native FK or immutable triggers", async provenance => withB18SQLite(async (client, snapshot, seedJob) => {
    await seedJob("failed", provenance); const before = snapshot();
    await expect(b18SQLiteCancel(client)).resolves.toEqual({ cancelled: true }); const after = snapshot();
    expect(after.openswx_metadata_jobs).toEqual(before.openswx_metadata_jobs);
    expect(after.drawing_revisions).toEqual([expect.objectContaining({ id: "b18-revision", lifecycle_state: "cancelled" })]);
    expect(after.drawing_revision_works).toEqual([]); expect(after.drawing_revision_files).toEqual([]); expect(after.drawing_revision_claims).toEqual([]);
    expect(after.drawing_rd_branches).toEqual([]); expect(after.pdm_workbench_aggregates).toEqual([expect.objectContaining({ open_branch_count: 0 })]);
    if (provenance) {
      expect(after.drawing_recognition_sources).toEqual(before.drawing_recognition_sources);
      expect(after.drawing_recognition_sessions).toHaveLength(2);
      expect(after.drawing_recognition_sessions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "b18-session-two", status: "cancelled", supersedes_session_id: "b18-session-one", evidence_origin_session_id: "b18-session-one" })]));
      await expect(client.execute("UPDATE openswx_metadata_jobs SET session_id=NULL WHERE id='b18-job'")).rejects.toThrow("openswx_snapshot_immutable");
    }
  }));
  it.each(["queued", "running"])("rejects %s even with expired worker lease and rolls back all tables", async status => withB18SQLite(async (client, snapshot, seedJob) => {
    await seedJob(status); const before = snapshot(); await expect(b18SQLiteCancel(client)).rejects.toMatchObject({ status: 409 }); expect(snapshot()).toEqual(before);
  }));
  it("keeps no-job physical cleanup and decrements the empty branch counter exactly once", async () => withB18SQLite(async (client, snapshot) => {
    await expect(b18SQLiteCancel(client)).resolves.toEqual({ cancelled: true }); const after = snapshot();
    expect(after.drawing_revisions).toEqual([]); expect(after.drawing_revision_works).toEqual([]); expect(after.drawing_revision_claims).toEqual([]); expect(after.drawing_rd_branches).toEqual([]);
    expect(after.pdm_workbench_aggregates).toEqual([expect.objectContaining({ open_branch_count: 0 })]);
    const beforeRetry = snapshot(); await expect(b18SQLiteCancel(client)).rejects.toMatchObject({ status: 409 }); expect(snapshot()).toEqual(beforeRetry);
  }));
  it("uses actual BEGIN IMMEDIATE serialization to observe a preceding queued insertion", async () => withB18SQLite(async (client, snapshot, seedJob) => {
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { entered = resolve; }), unblock = new Promise<void>(resolve => { release = resolve; });
    const insert = client.transaction(async tx => { await seedJob("queued"); expect(tx.kind).toBe("sqlite"); entered(); await unblock; });
    await held; let secondEntered = false;
    const cancel = client.transaction(async tx => { secondEntered = true; return new DrawingRevisionWorkAsyncRepository(tx).cancel(tx, { companyId: "company-jenfu", workId: "b18-work", expectedRowVersion: 1 }); });
    const rejected = expect(cancel).rejects.toMatchObject({ status: 409 });
    await Promise.resolve(); expect(secondEntered).toBe(false); const before = snapshot(); release(); await insert; await rejected; expect(secondEntered).toBe(true); expect(snapshot()).toEqual(before);
  }));
});
