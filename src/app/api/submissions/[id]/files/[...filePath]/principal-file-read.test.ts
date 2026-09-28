import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), authorize: vi.fn(), fileClient: vi.fn(),
  file: vi.fn(), pointer: vi.fn(), storage: vi.fn(), readObject: vi.fn(),
  downloadUrl: vi.fn(), audit: vi.fn(), legacyAuth: vi.fn(), legacyFile: vi.fn()
}));

vi.mock("@/lib/auth-config", () => ({ getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode }));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: () => ({ token: "principal-session" }),
  principalRequestFailure: () => Response.json({ code: "principal_dependency_unavailable" }, { status: 503 })
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({ withVerifiedJenfuPrincipalRequest: mocks.verifiedRead }));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/principal-submission-access", () => ({ authorizePrincipalSubmissionReadInSnapshot: mocks.authorize }));
vi.mock("@/lib/repositories/submission-file-async-repository", () => ({
  AsyncSubmissionFileRepository: class {
    constructor(client: unknown) { mocks.fileClient(client); }
    getSubmissionFile = mocks.file;
  }
}));
vi.mock("@/lib/file-storage", () => ({
  storagePointerFromRecord: mocks.pointer,
  createFileStorageServiceForPointer: mocks.storage
}));
vi.mock("@/lib/file-response", () => ({
  buildFileResponse: () => Response.json({ downloaded: true }),
  getStoredSubmissionFile: mocks.legacyFile,
  isPdfFile: () => true
}));
vi.mock("@/lib/storage-access-audit", () => ({
  auditStorageAccess: mocks.audit,
  resolveStorageAccessAuditProvenance: () => ({ source: "runtime", qcRunId: null })
}));
vi.mock("@/lib/auth-async", () => ({ requireAuthAsync: mocks.legacyAuth }));

import { GET } from "@/app/api/submissions/[id]/files/[...filePath]/route";

const path = "src/app/api/submissions/[id]/files/[...filePath]/route.ts";
const snapshot = { source: "verified-principal-snapshot" };
const verified = {
  profile: { pdmUserId: "profile-1", companyId: "company-1" },
  session: { principalId: "principal-1" }
};
const bytes = Buffer.from("verified historical file");
const file = () => ({ id: "file-1", submission_id: "submission-1", original_filename: "drawing.pdf",
  file_role: "pdf", file_size: bytes.byteLength,
  sha256: createHash("sha256").update(bytes).digest("hex") });
const request = () => new Request("https://ai-pdm.test/api/submissions/submission-1/files/file-1");
const context = { params: Promise.resolve({ id: "submission-1", filePath: ["file-1"] }) };

describe("Principal historical submission file read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.entitlementMode.mockReturnValue("enforce");
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission",
      scopeResolver: "submission company" });
    mocks.verifiedRead.mockImplementation(async (_input, read) => read(snapshot, verified));
    mocks.authorize.mockResolvedValue({ company_id: "company-1", submitted_by: "profile-1" });
    mocks.file.mockResolvedValue(file());
    mocks.pointer.mockReturnValue({ provider: "local_repository", bucket: null, key: "file-key" });
    mocks.storage.mockReturnValue({ readObject: mocks.readObject,
      createDownloadUrl: mocks.downloadUrl });
    mocks.readObject.mockResolvedValue(bytes);
    mocks.downloadUrl.mockResolvedValue({ provider: "local_repository", mode: "server_stream",
      expiresAt: null, expiresInSeconds: 0, authorizationHeaderRequired: false,
      auditRequired: true, bucket: null });
  });

  it("binds the file to the authorized submission and audits its Principal before returning bytes", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(path, "GET",
      { expectedPermissionCode: "submission.view" });
    expect(mocks.authorize).toHaveBeenCalledWith(snapshot, verified, "submission-1");
    expect(mocks.fileClient).toHaveBeenCalledWith(snapshot);
    expect(mocks.file).toHaveBeenCalledWith({ submissionId: "submission-1", fileId: "file-1" });
    expect(mocks.storage).toHaveBeenCalledWith({ provider: "local_repository", bucket: null,
      key: "file-key" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      principalId: "principal-1", historicalProfileId: "profile-1",
      companyId: "company-1", submissionId: "submission-1", fileId: "file-1" }));
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("does not read a file or storage after authorization denial", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ error: "permission_not_granted" }, { status: 403 }));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.file).not.toHaveBeenCalled();
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it("rejects a missing or mismatched file binding before external storage I/O", async () => {
    mocks.file.mockResolvedValueOnce(null);
    expect((await GET(request(), context)).status).toBe(404);
    mocks.file.mockResolvedValue({ ...file(), submission_id: "submission-2" });
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it("rejects changed bytes before creating access or audit evidence", async () => {
    mocks.readObject.mockResolvedValue(Buffer.from("tampered"));
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.downloadUrl).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("fails closed when the audit write fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    expect((await GET(request(), context)).status).toBe(503);
  });

  it("rejects a missing session or route-policy drift without falling back to the old caller", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request(), context)).status).toBe(401);
    mocks.policy.mockReturnValue(null);
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });
});
