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
  session: { principalId: "principal-one", assuranceLevel: "aal2" }
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

  it("deletes staged bytes when authority changes before the write snapshot", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    await expect(uploadDrawingRevisionWorkFilePrincipal(input()))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.withVerified).toHaveBeenCalledTimes(2);
    expect(mocks.withVerified).toHaveBeenLastCalledWith(
      { token: "v2-token", database: client }, expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.putObject).toHaveBeenCalledTimes(1);
    expect(mocks.deleteObject).toHaveBeenCalledWith("staged-one");
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
});
