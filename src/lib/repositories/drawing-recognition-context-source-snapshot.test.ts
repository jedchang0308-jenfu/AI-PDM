import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SQLiteAsyncDatabaseClient } from "../db-async-provider";
import { DrawingRecognitionAsyncRepository } from "./drawing-recognition-async-repository";
let sql: Database.Database, repository: DrawingRecognitionAsyncRepository;
const hash = "a".repeat(64);
const types = ["drawing_number", "drawing_revision", "revision_package", "candidate_revision"] as const;
const ids = { drawing_number: "number", drawing_revision: "revision", revision_package: "package", candidate_revision: "candidate" };
const snapshot = (type: typeof types[number], assetIds: string[] = ["cad"], companyId = "company") => repository.readContextSourceSnapshot({ companyId, sourceContextType: type, sourceContextId: ids[type], sourceAssetIds: assetIds });
beforeEach(() => {
  sql = new Database(":memory:"); sql.pragma("foreign_keys=ON");
  sql.exec(`CREATE TABLE drawings(id TEXT PRIMARY KEY,company_id TEXT,formal_drawing_number_id TEXT,owner_id TEXT,updated_at TEXT,drawing_draft_id TEXT);
    CREATE TABLE drawing_numbers(id TEXT PRIMARY KEY,company_id TEXT,created_by TEXT);
    CREATE TABLE drawing_revisions(id TEXT PRIMARY KEY,company_id TEXT,drawing_id TEXT,source_candidate_revision_id TEXT,source_revision_package_id TEXT);
    CREATE TABLE drawing_revision_packages(id TEXT PRIMARY KEY,company_id TEXT,drawing_number_id TEXT,created_by TEXT);
    CREATE TABLE numbering_candidate_revision_drafts(id TEXT PRIMARY KEY,company_id TEXT,workspace_id TEXT,drawing_draft_id TEXT);
    CREATE TABLE numbering_draft_workspaces(id TEXT PRIMARY KEY,company_id TEXT,owner_id TEXT);
    CREATE TABLE principal_accounts(principal_id TEXT,company_id TEXT,pdm_user_id TEXT);
    CREATE TABLE file_assets(id TEXT PRIMARY KEY,content_hash TEXT,storage_generation TEXT,file_name TEXT,file_ext TEXT,mime_type TEXT,file_size INTEGER,deleted_at TEXT,linked_entity_type TEXT,linked_entity_id TEXT,document_category TEXT,created_at TEXT);
    CREATE TABLE drawing_revision_files(id TEXT PRIMARY KEY,drawing_revision_id TEXT,company_id TEXT,source_file_asset_id TEXT,role TEXT,sort_order INTEGER,removed_at TEXT);
    CREATE TABLE drawing_revision_package_files(package_id TEXT,source_file_asset_id TEXT,role TEXT,sort_order INTEGER);
    CREATE TABLE numbering_candidate_revision_files(candidate_revision_id TEXT,company_id TEXT,source_file_asset_id TEXT,role TEXT,sort_order INTEGER,removed_at TEXT);
    CREATE TABLE canonical_workbench_states(revision_id TEXT,company_id TEXT,work_id TEXT,entity_type TEXT,canonical_entity_id TEXT,branch_id TEXT);
    CREATE TABLE drawing_revision_works(id TEXT,company_id TEXT,drawing_id TEXT,owner_user_id TEXT,branch_id TEXT);
    CREATE TABLE drawing_revision_work_files(work_id TEXT,file_binding_id TEXT,ordinal INTEGER);
    CREATE TABLE drawing_recognition_sessions(id TEXT,status TEXT);`);
  // Unmodified empty fixture snapshot passes all master/root/residue/global FK gates before seed.
  for (const table of ["drawings", "drawing_numbers", "drawing_revisions", "principal_accounts"]) expect(sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get()).toEqual({ n: 0 });
  expect(sql.pragma("foreign_key_check")).toEqual([]); expect(sql.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%migration%'").all()).toEqual([]);
  // Mutation ledger: only this in-memory fixture gets typed parents, owner and synthetic metadata.
  sql.exec(`INSERT INTO drawing_numbers VALUES('number','company','user');
    INSERT INTO drawings VALUES('drawing','company','number','user','2026-10-05','draft');
    INSERT INTO drawing_revisions VALUES('revision','company','drawing',NULL,NULL);
    INSERT INTO drawing_revision_packages VALUES('package','company','number','user');
    INSERT INTO numbering_draft_workspaces VALUES('workspace','company','user');
    INSERT INTO numbering_candidate_revision_drafts VALUES('candidate','company','workspace','draft');
    INSERT INTO principal_accounts VALUES('principal','company','user');
    INSERT INTO file_assets VALUES('cad','${hash}','1','fixture.sldprt','sldprt',NULL,12,NULL,'drawing_number','number','cad_3d','2026-10-05');
    INSERT INTO drawing_revision_files VALUES('binding','revision','company','cad','cad_3d',0,NULL);
    INSERT INTO drawing_revision_package_files VALUES('package','cad','cad_3d',0);
    INSERT INTO numbering_candidate_revision_files VALUES('candidate','company','cad','cad_3d',0,NULL);
    INSERT INTO drawing_recognition_sessions VALUES('existing-dm','queued');`);
  repository = new DrawingRecognitionAsyncRepository(new SQLiteAsyncDatabaseClient(sql));
});
afterEach(() => { expect(sql.prepare("SELECT * FROM drawing_recognition_sessions").all()).toEqual([{ id: "existing-dm", status: "queued" }]); expect(sql.pragma("foreign_key_check")).toEqual([]); sql.close(); });
describe("readonly current context CAD snapshot (SQLite control proof, no Principal auth mock)", () => {
  it("a dangling current canonical work reference denies instead of borrowing the formal owner", async () => {
    sql.exec("INSERT INTO canonical_workbench_states VALUES('revision','company','missing-work','drawing','drawing','branch')");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ code: "OPENSWX_CONTEXT_OWNER_UNKNOWN", status: 403 });
  });
  it("current canonical revision work owns auxiliary reads even when the formal drawing owner is absent", async () => {
    sql.exec("UPDATE drawings SET owner_id=NULL; INSERT INTO drawing_revision_works VALUES('work','company','drawing','user','branch'); INSERT INTO canonical_workbench_states VALUES('revision','company','work','drawing','drawing','branch')");
    expect((await snapshot("drawing_revision")).context.ownerPrincipalId).toBe("principal");
    sql.exec("UPDATE drawings SET owner_id='other'; INSERT INTO principal_accounts VALUES('other-principal','company','other')");
    expect((await snapshot("drawing_revision")).context.ownerPrincipalId).toBe("principal");
  });
  it("an unknown, ambiguous or mismatched current canonical work cannot fall back to a formal owner", async () => {
    sql.exec("INSERT INTO drawing_revision_works VALUES('work','company','drawing','unknown','branch'); INSERT INTO canonical_workbench_states VALUES('revision','company','work','drawing','drawing','branch')");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawing_revision_works SET owner_user_id='user',company_id='foreign'");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawing_revision_works SET company_id='company',drawing_id='other'");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawing_revision_works SET drawing_id='drawing',branch_id='stale-branch'");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawing_revision_works SET branch_id='branch'; INSERT INTO canonical_workbench_states VALUES('revision','company','work','drawing','drawing','branch')");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
  });
  it("all four real context membership queries return canonical company owner and immutable descriptor", async () => {
    for (const type of types) {
      const result = await snapshot(type);
      expect(result.context).toEqual({ companyId: "company", sourceContextType: type, sourceContextId: ids[type], ownerPrincipalId: "principal" });
      expect(result.sources).toEqual([{ id: "cad", fileAssetId: "cad", sha256: hash, bytes: 12, extension: "sldprt", storageGeneration: "1", sourceRole: "cad_3d", sortOrder: 0 }]);
      await expect(snapshot(type, ["cad"], "foreign")).rejects.toMatchObject({ status: 404 });
    }
  });
  it("unselected PDF add/remove cannot change selected CAD fingerprint or selected ordinal", async () => {
    const before = await snapshot("drawing_number");
    sql.exec(`INSERT INTO file_assets VALUES('pdf','${hash}',NULL,'fixture.pdf','pdf',NULL,12,NULL,'drawing_number','number','pdf','2026-10-01')`);
    expect(await snapshot("drawing_number")).toEqual(before);
    sql.exec("UPDATE file_assets SET deleted_at='2026-10-06' WHERE id='pdf'");
    expect(await snapshot("drawing_number")).toEqual(before);
  });
  it("explicit PDF/duplicates/missing/oversize selections reject without filtering", async () => {
    sql.exec(`INSERT INTO file_assets VALUES('pdf','${hash}',NULL,'fixture.pdf','pdf',NULL,12,NULL,'drawing_number','number','pdf','2026-10-01')`);
    for (const selection of [["cad", "pdf"], ["cad", "cad"], ["missing"], []]) await expect(snapshot("drawing_number", selection)).rejects.toBeDefined();
    sql.exec("UPDATE file_assets SET file_size=268435457 WHERE id='cad'");
    await expect(snapshot("drawing_number")).rejects.toMatchObject({ status: 413 });
  });
  it("canonical owner and every removed or foreign-company membership fail closed", async () => {
    sql.exec("UPDATE drawings SET owner_id='unknown'");
    for (const type of types) await expect(snapshot(type)).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawings SET owner_id='user'; UPDATE drawing_revision_files SET company_id='foreign'");
    await expect(snapshot("drawing_revision")).rejects.toMatchObject({ status: 403 });
    sql.exec("UPDATE drawing_revision_files SET company_id='company',removed_at='2026-10-06'; UPDATE numbering_candidate_revision_files SET removed_at='2026-10-06'; DELETE FROM drawing_revision_package_files; UPDATE file_assets SET linked_entity_id='foreign'");
    for (const type of types) await expect(snapshot(type)).rejects.toMatchObject({ status: 403 });
  });
});
