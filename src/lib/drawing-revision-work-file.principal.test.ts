import crypto from "node:crypto";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), verifyContract: vi.fn(),
  readWork: vi.fn(), assertWorkMutationBasis: vi.fn(),
  runPrincipal: vi.fn(), runLegacy: vi.fn(),
  putObject: vi.fn(), verifyObjectHash: vi.fn(), deleteObject: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string, _request: Request) => ({ token })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/pdm-workbench-authority-control", () => ({
  verifyCanonicalWorkbenchCommandContract: mocks.verifyContract
}));
vi.mock("@/lib/repositories/drawing-revision-work-async-repository", () => ({
  DrawingRevisionWorkAsyncRepository: class {
    readWork = mocks.readWork;
    assertWorkFileSnapshot = vi.fn().mockResolvedValue(undefined);
    assertWorkMutationBasis = mocks.assertWorkMutationBasis;
  }
}));
vi.mock("@/lib/storage-upload-policy", () => ({
  getStorageUploadPolicy: () => ({ maxUploadFileMb: 10 }),
  validateStorageUploadFile: () => ({ ok: true })
}));
vi.mock("@/lib/file-storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/file-storage")>(),
  createFileStorageService: () => ({
    putObject: mocks.putObject,
    verifyObjectHash: mocks.verifyObjectHash,
    deleteObject: mocks.deleteObject
  })
}));
vi.mock("@/lib/pdm-principal-dev087-command", () => ({
  runPrincipalDev087Command: mocks.runPrincipal
}));
vi.mock("@/lib/pdm-canonical-command", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-canonical-command")>(),
  runDev087IdempotentCommand: mocks.runLegacy
}));

import { uploadDrawingRevisionWorkFilePrincipal } from "@/lib/drawing-revision-work-file";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createAsyncDatabaseClient } from "@/lib/db-async-provider";

const client = {
  kind: "postgres", transactionScope: "postgres",
  queryOne: vi.fn(async () => null)
} as unknown as AsyncDatabaseClient;
const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: { principalId: "principal-one", assuranceLevel: "aal1" }
};
const payload = Buffer.from("%PDF-1.7 drawing-pdf");
function input() {
  return { client, token: "v2-token", request: new Request("http://127.0.0.1:12000/api/pdm/drawing-revision-works/work-one/files", { method: "POST" }), workId: "work-one",
    file: new File([payload], "drawing.pdf", { type: "application/pdf" }),
    context: { contractToken: "contract-one", expectedRowVersion: 2,
      idempotencyKey: "file-one" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.queryOne).mockResolvedValue(null);
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(client, verified));
  mocks.evaluate.mockResolvedValue([{ allowed: true }]);
  mocks.verifyContract.mockResolvedValue(undefined);
  mocks.readWork.mockResolvedValue({ owner_user_id: "profile-one",
    revision_id: "revision-one", row_version: 2, handling: "owner" });
  mocks.putObject.mockResolvedValue({ key: "staged-one", provider: "test",
    bytes: payload.length, sha256: crypto.createHash("sha256").update(payload).digest("hex") });
  mocks.verifyObjectHash.mockResolvedValue(true);
  mocks.deleteObject.mockResolvedValue(undefined);
});

describe("principal drawing file staging boundary", () => {
  it.each([["pdf", false], ["dwg", false], ["pdf", true]] as const)("replaces legacy duplicate %s bindings with rollback=%s and preserves source/history bytes", async (extension, rollback) => {
    const database = new Database(":memory:");
    const actual = createAsyncDatabaseClient({ kind: "sqlite", database });
    database.exec(`
      CREATE TABLE drawings(id TEXT, company_id TEXT, part_root_id TEXT);
      CREATE TABLE drawing_revision_works(id TEXT, company_id TEXT, drawing_id TEXT, revision_id TEXT, owner_user_id TEXT, handling TEXT, row_version INTEGER, target_label TEXT, updated_at TEXT);
      CREATE TABLE canonical_workbench_states(company_id TEXT, work_id TEXT, handling TEXT, row_version INTEGER, updated_at TEXT);
      CREATE TABLE file_assets(id TEXT PRIMARY KEY, storage_provider TEXT, original_path TEXT, storage_bucket TEXT, storage_key TEXT, storage_generation TEXT, storage_metageneration TEXT, file_name TEXT, file_ext TEXT, mime_type TEXT, file_size INTEGER, content_hash TEXT, linked_entity_type TEXT, linked_entity_id TEXT, document_category TEXT, display_name TEXT, description TEXT, revision TEXT, uploaded_by TEXT, deleted_at TEXT, deleted_by TEXT, deleted_reason TEXT, updated_at TEXT);
      CREATE TABLE drawing_revision_files(id TEXT PRIMARY KEY, company_id TEXT, drawing_revision_id TEXT, source_file_asset_id TEXT, role TEXT, role_source TEXT, display_name TEXT, description TEXT, sort_order INTEGER, is_primary INTEGER, created_by TEXT, removed_at TEXT, removed_by TEXT, updated_at TEXT);
      CREATE TABLE drawing_revision_work_files(work_id TEXT, file_binding_id TEXT, ordinal INTEGER, content_hash TEXT);
      INSERT INTO drawings VALUES('drawing-one','company-one',NULL);
      INSERT INTO drawing_revision_works VALUES('work-one','company-one','drawing-one','revision-one','profile-one','owner',2,'1',NULL);
      INSERT INTO canonical_workbench_states VALUES('company-one','work-one','owner',2,NULL);
    `);
    const role = extension === "pdf" ? "pdf" : "dwg_dxf";
    const bytes = extension === "pdf" ? payload : Buffer.from("AC1032 native DWG fixture");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    // One canonical asset belongs to the approved source and must stay readable.
    for (const [index, revision] of ["revision-source", "revision-one"].entries()) {
      database.prepare(`INSERT INTO file_assets(id,file_name,file_ext,file_size,content_hash,linked_entity_type,linked_entity_id) VALUES(?,?,?,?,?,'drawing_revision',?)`).run(`old-${index}`,`A.${extension}`,extension,bytes.length,hash,revision);
      database.prepare(`INSERT INTO drawing_revision_files(id,company_id,drawing_revision_id,source_file_asset_id,role,sort_order) VALUES(?,'company-one','revision-one',?,?,?)`).run(`binding-${index}`,`old-${index}`,role,index);
      database.prepare(`INSERT INTO drawing_revision_work_files VALUES('work-one',?,?,?)`).run(`binding-${index}`,index,hash);
    }
    mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(actual, verified));
    mocks.readWork.mockImplementation(async tx => tx.queryOne("SELECT * FROM drawing_revision_works WHERE id='work-one'"));
    mocks.runPrincipal.mockImplementation(async (_tx, _verified, _command, action) => actual.transaction(action));
    mocks.putObject.mockImplementation(async ({ key, bytes: uploaded }) => ({ key, provider: "test", bytes: uploaded.length, sha256: crypto.createHash("sha256").update(uploaded).digest("hex") }));
    try {
      if (rollback) {
        database.exec("CREATE TRIGGER reject_new_asset BEFORE INSERT ON file_assets BEGIN SELECT RAISE(ABORT, 'fixture_insert_failure'); END");
        await expect(uploadDrawingRevisionWorkFilePrincipal({ ...input(), client: actual, file: new File([bytes], `A.${extension}`) }))
          .rejects.toThrow('fixture_insert_failure');
        expect(database.prepare("SELECT count(*) AS n FROM drawing_revision_files WHERE removed_at IS NULL").get()).toEqual({ n: 2 });
        expect(database.prepare("SELECT count(*) AS n FROM drawing_revision_work_files").get()).toEqual({ n: 2 });
        expect(database.prepare("SELECT row_version FROM drawing_revision_works").get()).toEqual({ row_version: 2 });
        expect(database.prepare("SELECT count(*) AS n FROM file_assets WHERE deleted_at IS NOT NULL").get()).toEqual({ n: 0 });
        return;
      }
      const result = await uploadDrawingRevisionWorkFilePrincipal({ ...input(), client: actual, file: new File([bytes], `A.${extension}`) });
      expect(result).toMatchObject({ reused: false, rowVersion: 3 });
      if (extension === "pdf") {
        expect(database.prepare("SELECT mime_type FROM file_assets WHERE id=?").get(result.file.sourceFileAssetId)).toEqual({ mime_type: "application/pdf" });
        expect(mocks.putObject).toHaveBeenCalledWith(expect.objectContaining({ contentType: "application/pdf" }));
      }
      expect(database.prepare("SELECT count(*) AS n FROM drawing_revision_files WHERE removed_at IS NULL").get()).toEqual({ n: 1 });
      expect(database.prepare("SELECT count(*) AS n FROM drawing_revision_work_files").get()).toEqual({ n: 1 });
      expect(database.prepare("SELECT count(*) AS n FROM drawing_revision_files WHERE removed_at IS NOT NULL").get()).toEqual({ n: 2 });
      expect(database.prepare("SELECT deleted_at FROM file_assets WHERE id='old-0'").get()).toEqual({ deleted_at: null });
      expect(database.prepare("SELECT content_hash FROM file_assets WHERE id='old-1'").get()).toEqual({ content_hash: hash });
      expect(mocks.deleteObject).not.toHaveBeenCalled();
    } finally { database.close(); }
  });
  it("rejects a PDF filename whose bytes are not a PDF before staging", async () => {
    const invalid = new File(["not-a-pdf"], "drawing.pdf", { type: "application/pdf" });
    await expect(uploadDrawingRevisionWorkFilePrincipal({ ...input(), file: invalid }))
      .rejects.toMatchObject({ code: "FORMAL_PDF_REQUIRED", status: 422 });
    expect(mocks.putObject).not.toHaveBeenCalled();
  });

  it("rejects missing principal capability before staging file bytes", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false }]);
    await expect(uploadDrawingRevisionWorkFilePrincipal(input()))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.runLegacy).not.toHaveBeenCalled();
  });

  it("preserves stable staged bytes when authority changes before the write snapshot", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(uploadDrawingRevisionWorkFilePrincipal(input()))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.withVerified).toHaveBeenCalledTimes(2);
    expect(mocks.withVerified).toHaveBeenLastCalledWith(
      { token: "v2-token", database: client }, expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.runPrincipal).not.toHaveBeenCalled();
    expect(mocks.runLegacy).not.toHaveBeenCalled();
  });

  it("lets a custom matrix editor upload to another owner's work through a principal receipt", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: true, roleCode: "new-file-editor" }]);
    mocks.readWork.mockResolvedValue({ owner_user_id: "profile-other", revision_id: "revision-one", row_version: 2, handling: "owner" });
    vi.mocked(client.queryOne).mockImplementation(async (sql) => {
      const text = String(sql);
      if (text.includes("SELECT file.id, file.source_file_asset_id")) return {
        id: "binding-one", source_file_asset_id: "asset-one", display_name: "Drawing"
      };
      if (text.includes("SELECT file.id")) return { id: "binding-one" };
      return null;
    });
    mocks.runPrincipal.mockImplementation(async (_tx, _verified, _command, execute) =>
      execute(client));
    const result = await uploadDrawingRevisionWorkFilePrincipal(input());
    expect(result).toMatchObject({ reused: true,
      file: { id: "binding-one", sourceFileAssetId: "asset-one" } });
    expect(mocks.withVerified).toHaveBeenCalledTimes(2);
    expect(mocks.runPrincipal).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "drawing.file.upload",
        idempotencyKey: "file-one" }), expect.any(Function));
    expect(mocks.runLegacy).not.toHaveBeenCalled();
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.evaluate).toHaveBeenCalledWith(client, verified, [
      { permissionKind: "action", permissionCode: "numbering.workspace.update", resourceGroup: "drawing" }
    ]);
  });
  it("reuses a stable Principal/company/work/command blob on unknown-outcome replay", async () => {
    mocks.runPrincipal.mockResolvedValue({reused:true,file:{sourceFileAssetId:"asset-one"}});
    await uploadDrawingRevisionWorkFilePrincipal(input());
    await uploadDrawingRevisionWorkFilePrincipal({...input(),file:new File([payload],"renamed.pdf",{type:"application/pdf"})});
    const keys=mocks.putObject.mock.calls.map(([value])=>value.key);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toContain("drawing-revision-works/company-one/work-one/FA-");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
  it("persists the immutable GCS pointer for normal file and preview readers", async () => {
    mocks.putObject.mockResolvedValue({key:"immutable-source",provider:"google_cloud_storage",bucket:"own-files",
      localPath:"gcs://own-files/immutable-source?generation=42",generation:"42",metageneration:"1",
      bytes:payload.length,sha256:crypto.createHash("sha256").update(payload).digest("hex")});
    const execute=vi.fn().mockResolvedValue(undefined);
    Object.assign(client,{execute,query:vi.fn().mockResolvedValue([])});
    mocks.runPrincipal.mockImplementation(async (_tx,_verified,_command,action)=>action(client));
    await uploadDrawingRevisionWorkFilePrincipal(input());
    const entry=execute.mock.calls.find(([sql])=>String(sql).includes("INSERT INTO file_assets"));
    expect(entry?.[0]).toContain("storage_generation, storage_metageneration");
    expect(entry?.[1]).toMatchObject({storageBucket:"own-files",storageGeneration:"42",storageMetageneration:"1",
      originalPath:"gcs://own-files/immutable-source?generation=42"});
  });
  it("rejects different immutable bytes as a conflict without deleting another attempt's blob", async () => {
    mocks.putObject.mockRejectedValueOnce(new Error("GCS_IMMUTABLE_OBJECT_CONFLICT"));
    await expect(uploadDrawingRevisionWorkFilePrincipal(input())).rejects.toMatchObject({status:409});
    expect(mocks.runPrincipal).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("does not overwrite the original blob when a conflicting request changes bytes", async () => {
    mocks.runPrincipal.mockResolvedValue({reused:true,file:{sourceFileAssetId:"asset-one"}});
    await uploadDrawingRevisionWorkFilePrincipal(input());
    const changed=Buffer.from("%PDF-1.7 different drawing");
    mocks.putObject.mockResolvedValueOnce({key:"changed-stage",provider:"test",bytes:changed.length,
      sha256:crypto.createHash("sha256").update(changed).digest("hex")});
    await uploadDrawingRevisionWorkFilePrincipal({...input(),file:new File([changed],"drawing.pdf",{type:"application/pdf"})});
    expect(mocks.putObject.mock.calls[0][0].key).not.toBe(mocks.putObject.mock.calls[1][0].key);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

});
