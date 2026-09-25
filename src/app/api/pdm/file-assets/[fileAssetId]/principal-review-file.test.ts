import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), getReview: vi.fn(),
  getApprovalDetail: vi.fn(), queryOne: vi.fn(), parsePackage: vi.fn(), verifyPackage: vi.fn(),
  readObject: vi.fn(), legacyAuthorization: vi.fn()
}));
const tx = { kind: "postgres", transactionScope: "postgres", queryOne: mocks.queryOne };
vi.mock("@/lib/db-async-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db-async-provider")>(),
  getAsyncDatabaseClient: () => tx
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
vi.mock("@/lib/repositories/pdm-work-review-async-repository", () => ({
  PdmWorkReviewAsyncRepository: class { get = mocks.getReview; }
}));
vi.mock("@/lib/repositories/approval-platform-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/approval-platform-async-repository")>(),
  AsyncApprovalPlatformRepository: class { getRequestDetail = mocks.getApprovalDetail; }
}));
vi.mock("@/lib/pdm-review-package-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package-contract")>(),
  parseReviewPackageSnapshot: mocks.parsePackage
}));
vi.mock("@/lib/pdm-review-package", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package")>(),
  verifyReviewPackageIntegrity: mocks.verifyPackage
}));
vi.mock("@/lib/file-storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/file-storage")>(),
  storagePointerFromRecord: () => ({ key: "object-one" }),
  createFileStorageServiceForPointer: () => ({ readObject: mocks.readObject })
}));
vi.mock("@/lib/auth-async", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth-async")>(),
  requirePdmRouteAuthorizationAsync: mocks.legacyAuthorization
}));

import { GET } from "@/app/api/pdm/file-assets/[fileAssetId]/route";

function request(context = "review_package") {
  const header = Buffer.from(JSON.stringify({
    type: "JENFU-AI-PDM-PRINCIPAL", version: 2
  })).toString("base64url");
  const query = new URLSearchParams({ context,
    contextId: context === "drawing_revision_work" ? "work-one" :
      context === "approval_evidence" ? "approval-one" : "drawing-one",
    bindingId: "binding-one" });
  if (context === "review_package") query.set("reviewRequestId", "review-one");
  return new Request(`https://pdm.example/api/pdm/file-assets/asset-one?${query}`, {
    headers: { cookie: `__session=${header}.payload.signature` }
  });
}
const params = { params: Promise.resolve({ fileAssetId: "asset-one" }) };
const source = { id: "asset-one", company_id: "company-one",
  linked_entity_id: "drawing-one", content_hash: "hash-one",
  storage_provider: "test", storage_key: "object-one",
  file_name: "drawing.pdf", file_ext: "pdf", mime_type: "application/pdf" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(tx, {
    profile: { pdmUserId: "profile-one", companyId: "company-one" },
    session: { principalId: "principal-one", assuranceLevel: "aal2" }
  }));
  mocks.evaluate.mockResolvedValue([{ allowed: true }, { allowed: true }]);
  mocks.getReview.mockResolvedValue({ requestKind: "drawing_revision",
    reviewerUserId: "profile-one", requestStatus: "pending", snapshotPayload: {},
    snapshotHash: "package-hash" });
  mocks.getApprovalDetail.mockResolvedValue({ companyId: "company-one",
    actionCode: "numbering.candidate_bundle_review",
    impactSnapshots: [{ snapshot: { candidateRevisions: [
      { files: [{ sourceFileAssetId: "asset-one" }] }
    ] } }] });
  mocks.parsePackage.mockReturnValue({ kind: "v2" });
  mocks.queryOne.mockImplementation(async (sql) => String(sql).includes("SELECT snapshot_payload")
    ? { snapshot_payload: {}, snapshot_hash: "package-hash" } : source);
  mocks.verifyPackage.mockReturnValue({ targets: [{ targetKey: "drawing:drawing-one",
    workspace: { files: [{ bindingId: "binding-one", sourceFileAssetId: "asset-one",
      contentHash: "hash-one" }], attachments: [] } }] });
  mocks.readObject.mockResolvedValue(Buffer.from("review-file"));
});

describe("principal review package file read", () => {
  it("reads only an assigned v2 package file after the verified snapshot closes", async () => {
    let snapshotOpen = false;
    mocks.withVerified.mockImplementationOnce(async (_input, evaluate) => {
      snapshotOpen = true;
      const result = await evaluate(tx, {
        profile: { pdmUserId: "profile-one", companyId: "company-one" },
        session: { principalId: "principal-one", assuranceLevel: "aal2" }
      });
      snapshotOpen = false;
      return result;
    });
    mocks.readObject.mockImplementationOnce(async () => {
      expect(snapshotOpen).toBe(false);
      return Buffer.from("review-file");
    });
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("review-file");
    expect(mocks.withVerified).toHaveBeenCalledWith({ token: expect.any(String) },
      expect.any(Function), { readOnly: true, isolationLevel: "repeatable_read" });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, expect.any(Object), [
      { permissionKind: "action", permissionCode: "approval.inbox.view" },
      { permissionKind: "action", permissionCode: "approval.request.decide" }
    ]);
    expect(mocks.queryOne.mock.calls.some(([sql]) =>
      String(sql).includes("revision.drawing_id = :contextId") &&
      String(sql).includes("file.removed_at IS NULL") &&
      String(sql).includes("asset.deleted_at IS NULL"))).toBe(true);
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("denies missing capability or a file absent from the immutable package", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }, { allowed: false }]);
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.readObject).not.toHaveBeenCalled();
    mocks.verifyPackage.mockReturnValueOnce({ targets: [] });
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.readObject).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("reads approval evidence only through principal capability, company and request snapshot", async () => {
    const response = await GET(request("approval_evidence"), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("review-file");
    expect(mocks.getApprovalDetail).toHaveBeenCalledWith("approval-one", "company-one");
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, expect.any(Object), [
      { permissionKind: "action", permissionCode: "approval.request.decide" }
    ]);
    expect(mocks.queryOne.mock.calls.some(([sql]) =>
      String(sql).includes("asset.id = :bindingId") &&
      String(sql).includes("candidate_file.company_id = :companyId") &&
      String(sql).includes("revision_package.company_id = :companyId") &&
      String(sql).includes("submission.company_id = :companyId") &&
      String(sql).includes("asset.deleted_at IS NULL"))).toBe(true);
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not inspect the approval case when principal permission is absent", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false }]);
    expect((await GET(request("approval_evidence"), params)).status).toBe(404);
    expect(mocks.getApprovalDetail).not.toHaveBeenCalled();
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it("never loads approval evidence outside its exact company or snapshot", async () => {
    mocks.getApprovalDetail.mockResolvedValueOnce({ companyId: "company-other",
      actionCode: "numbering.candidate_bundle_review", impactSnapshots: [] });
    expect((await GET(request("approval_evidence"), params)).status).toBe(404);
    mocks.getApprovalDetail.mockResolvedValueOnce({ companyId: "company-one",
      actionCode: "numbering.candidate_bundle_review", impactSnapshots: [] });
    expect((await GET(request("approval_evidence"), params)).status).toBe(404);
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it("hides snapshot-listed evidence without an asset-to-company relation", async () => {
    mocks.queryOne.mockResolvedValueOnce(null);
    expect((await GET(request("approval_evidence"), params)).status).toBe(404);
    expect(mocks.getApprovalDetail).toHaveBeenCalled();
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it.each([
    ["candidate_revision", "numbering.drawings.view"],
    ["drawing_revision", "numbering.drawings.view"],
    ["drawing_revision_package", "numbering.drawings.view"],
    ["drawing_attachment", "numbering.drawings.view"],
    ["part_attachment", "numbering.search"]
  ])("reads exact %s file with its principal capability", async (context, permissionCode) => {
    const response = await GET(request(context), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("review-file");
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, expect.any(Object), [
      { permissionKind: "action", permissionCode }
    ]);
    expect(mocks.getReview).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not fetch a direct file when permission or exact binding is missing", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false }]);
    expect((await GET(request("drawing_attachment"), params)).status).toBe(404);
    mocks.queryOne.mockResolvedValueOnce(null);
    expect((await GET(request("part_attachment"), params)).status).toBe(404);
    expect(mocks.readObject).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not turn a review request parameter into direct attachment access", async () => {
    const url = new URL(request("part_attachment").url);
    url.searchParams.set("reviewRequestId", "review-one");
    const rejected = new Request(url, { headers: request("part_attachment").headers });
    expect((await GET(rejected, params)).status).toBe(503);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("lets the current principal-owned work read its exact file without a legacy role", async () => {
    mocks.queryOne.mockResolvedValueOnce({ ...source,
      work_id: "work-one", owner_user_id: "profile-one" });
    const response = await GET(request("drawing_revision_work"), params);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("review-file");
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, expect.any(Object), [
      { permissionKind: "action", permissionCode: "numbering.workspace.view" }
    ]);
    expect(mocks.getReview).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("hides a work file when its current owner is another profile", async () => {
    mocks.queryOne.mockResolvedValueOnce({ ...source,
      work_id: "work-one", owner_user_id: "profile-other" });
    expect((await GET(request("drawing_revision_work"), params)).status).toBe(404);
    expect(mocks.readObject).not.toHaveBeenCalled();
  });

  it("does not load bytes for another reviewer or a legacy review package", async () => {
    mocks.getReview.mockResolvedValueOnce({ reviewerUserId: "profile-other",
      requestStatus: "pending", requestKind: "drawing_revision" });
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.queryOne).not.toHaveBeenCalled();
    mocks.parsePackage.mockReturnValueOnce({ kind: "legacy" });
    expect((await GET(request(), params)).status).toBe(404);
    expect(mocks.queryOne).not.toHaveBeenCalled();
    expect(mocks.readObject).not.toHaveBeenCalled();
  });
});
