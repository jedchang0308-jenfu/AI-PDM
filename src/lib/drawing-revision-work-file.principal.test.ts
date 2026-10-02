import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), verifyContract: vi.fn(),
  readWork: vi.fn(), assertWorkMutationBasis: vi.fn(),
  runPrincipal: vi.fn(), runLegacy: vi.fn(),
  putObject: vi.fn(), verifyObjectHash: vi.fn(), deleteObject: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token })
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

const client = {
  kind: "postgres", transactionScope: "postgres",
  queryOne: vi.fn(async () => null)
} as unknown as AsyncDatabaseClient;
const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: { principalId: "principal-one", assuranceLevel: "aal1" }
};
const payload = Buffer.from("drawing-pdf");
function input() {
  return { client, token: "v2-token", workId: "work-one",
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

  it("replays an existing file through a principal receipt without the legacy command", async () => {
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
    const changed=Buffer.from("different drawing");
    mocks.putObject.mockResolvedValueOnce({key:"changed-stage",provider:"test",bytes:changed.length,
      sha256:crypto.createHash("sha256").update(changed).digest("hex")});
    await uploadDrawingRevisionWorkFilePrincipal({...input(),file:new File([changed],"drawing.pdf",{type:"application/pdf"})});
    expect(mocks.putObject.mock.calls[0][0].key).not.toBe(mocks.putObject.mock.calls[1][0].key);
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

});
