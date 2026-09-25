import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  evaluate: vi.fn(), readWork: vi.fn(), resolveWorkBasis: vi.fn(),
  readSourceState: vi.fn(), listCandidates: vi.fn(), create: vi.fn(),
  update: vi.fn(), cancel: vi.fn(), assertWorkMutationBasis: vi.fn(),
  hydrate: vi.fn(), issueContract: vi.fn(), verifyContract: vi.fn(),
  runPrincipal: vi.fn(), recognition: vi.fn(), requiredFiles: vi.fn(),
  selectPrincipalReviewer: vi.fn(), selectLegacyReviewer: vi.fn(),
  buildReviewPackage: vi.fn(), reviewCreate: vi.fn(), reviewGet: vi.fn(),
  recordTerminalReceipt: vi.fn(), parsePackage: vi.fn(), verifyPackage: vi.fn(),
  assertPackageRecognition: vi.fn(), assertFormalizationAllowed: vi.fn(),
  formalize: vi.fn(), beginApproval: vi.fn(),
  withVerified: vi.fn(), deleteObject: vi.fn(), assertWorkFileSnapshot: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/file-storage", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/file-storage")>(),
  createFileStorageService: () => ({ deleteObject: mocks.deleteObject })
}));

vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/repositories/drawing-revision-work-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/drawing-revision-work-async-repository")>(),
  DrawingRevisionWorkAsyncRepository: class {
    readWork = mocks.readWork;
    resolveWorkBasis = mocks.resolveWorkBasis;
    readSourceState = mocks.readSourceState;
    listCandidates = mocks.listCandidates;
    create = mocks.create;
    update = mocks.update;
    cancel = mocks.cancel;
    assertWorkMutationBasis = mocks.assertWorkMutationBasis;
    assertFormalizationAllowed = mocks.assertFormalizationAllowed;
    formalize = mocks.formalize;
    assertWorkFileSnapshot = mocks.assertWorkFileSnapshot;
  }
}));
vi.mock("@/lib/drawing-change-impact", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/drawing-change-impact")>(),
  hydrateDrawingChangeImpactForWork: mocks.hydrate
}));
vi.mock("@/lib/pdm-workbench-authority-control", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-workbench-authority-control")>(),
  issueCanonicalWorkbenchContract: mocks.issueContract,
  verifyCanonicalWorkbenchCommandContract: mocks.verifyContract
}));
vi.mock("@/lib/pdm-principal-dev087-command", () => ({
  runPrincipalDev087Command: mocks.runPrincipal
}));
vi.mock("@/lib/pdm-file-ownership", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-file-ownership")>(),
  assertRequiredDrawingFiles: mocks.requiredFiles
}));
vi.mock("@/lib/pdm-review-package", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package")>(),
  assertDrawingRecognitionWriteReady: mocks.recognition,
  buildReviewPackage: mocks.buildReviewPackage,
  verifyReviewPackageIntegrity: mocks.verifyPackage,
  assertReviewPackageRecognitionReady: mocks.assertPackageRecognition
}));
vi.mock("@/lib/pdm-review-package-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package-contract")>(),
  parseReviewPackageSnapshot: mocks.parsePackage
}));
vi.mock("@/lib/pdm-work-review", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-work-review")>(),
  beginDev087Approval: mocks.beginApproval
}));
vi.mock("@/lib/repositories/pdm-principal-reviewer-selector", () => ({
  selectPrincipalReviewerInSnapshot: mocks.selectPrincipalReviewer
}));
vi.mock("@/lib/repositories/pdm-work-review-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/pdm-work-review-async-repository")>(),
  PdmWorkReviewAsyncRepository: class {
    selectReviewer = mocks.selectLegacyReviewer;
    create = mocks.reviewCreate;
    get = mocks.reviewGet;
    recordTerminalReceipt = mocks.recordTerminalReceipt;
  }
}));

import { DrawingRevisionWorkService } from "@/lib/drawing-revision-work";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const verified = {
  session: { contractVersion: "jenfu.ai-pdm-session.v2", assuranceLevel: "aal2" },
  profile: { pdmUserId: "profile-one", companyId: "company-one" }
} as VerifiedPrincipalRequest;
const client = { kind: "postgres", transactionScope: "postgres",
  queryOne: vi.fn(async () => ({ code: "DRAWING-ONE" })),
  query: vi.fn(async () => []), execute: vi.fn(async () => undefined)
} as unknown as AsyncDatabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.evaluate.mockResolvedValue([
    { allowed: true }, { allowed: false }, { allowed: true }, { allowed: false }
  ]);
  mocks.readWork.mockResolvedValue({ owner_user_id: "profile-one",
    drawing_id: "drawing-one", id: "work-one", revision_id: "revision-one",
    predecessor_revision_id: null, target_claim_id: null,
    proposed_payload: {}, target_label: "1.1",
    row_version: 2, handling: "owner" });
  mocks.resolveWorkBasis.mockResolvedValue({ basisState: "current" });
  mocks.hydrate.mockResolvedValue({ changeImpactRequired: false,
    changeImpact: null, relatedParts: [], affectedParts: [] });
  mocks.issueContract.mockResolvedValue("contract-one");
  mocks.verifyContract.mockResolvedValue(undefined);
  mocks.readSourceState.mockResolvedValue({
    drawing_id: "drawing-one", handling: "none", work_id: null,
    data_layer: "drawing_production", base_production_revision_id: null,
    current_production_revision_id: null, revision: "1",
    current_production_revision: "1", current_production_row_id: null,
    row_version: 1
  });
  mocks.listCandidates.mockResolvedValue([{ kind: "rd", enabled: true, reason: null,
    target: { major: 1, minor: 1, label: "1.1" } }]);
  mocks.create.mockResolvedValue({ workId: "work-created" });
  mocks.update.mockResolvedValue({ workId: "work-one", rowVersion: 3 });
  mocks.cancel.mockResolvedValue({ workId: "work-one", cancelled: true });
  mocks.selectPrincipalReviewer.mockResolvedValue("reviewer-principal-profile");
  mocks.selectLegacyReviewer.mockResolvedValue("reviewer-legacy-profile");
  mocks.buildReviewPackage.mockResolvedValue({ packageHash: "review-package-hash" });
  mocks.reviewCreate.mockResolvedValue({ id: "request-one", reviewCycleId: "cycle-one",
    rowVersion: 1 });
  mocks.reviewGet.mockResolvedValue({ id: "request-one", requestKind: "drawing_revision",
    reviewerUserId: "profile-one", requestStatus: "pending", rowVersion: 1,
    workId: "work-one", snapshotPayload: {}, snapshotHash: "package-hash" });
  mocks.parsePackage.mockReturnValue({ kind: "v2" });
  mocks.verifyPackage.mockReturnValue({ decisionBasis: {
    hash: "irrelevant-for-return" } });
  mocks.runPrincipal.mockImplementation(async (_tx, _verified, _input, execute) => execute(client));
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(client, verified));
});

describe("principal drawing revision work read", () => {
  it("rejects a missing view grant before reading domain data", async () => {
    mocks.evaluate.mockResolvedValueOnce([
      { allowed: false }, { allowed: true }, { allowed: true }, { allowed: true }
    ]);
    await expect(new DrawingRevisionWorkService(client).readPrincipal("work-one", verified))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.readWork).not.toHaveBeenCalled();
  });

  it("rejects a different work owner without deriving non-owner power from the legacy role", async () => {
    mocks.readWork.mockResolvedValueOnce({ owner_user_id: "profile-other" });
    await expect(new DrawingRevisionWorkService(client).readPrincipal("work-one", verified))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.resolveWorkBasis).not.toHaveBeenCalled();
  });

  it("projects only granted interactions for the verified principal and owner", async () => {
    const result = await new DrawingRevisionWorkService(client).readPrincipal("work-one", verified);
    expect(mocks.evaluate).toHaveBeenCalledWith(client, verified, [
      { permissionKind: "action", permissionCode: "numbering.workspace.view" },
      { permissionKind: "action", permissionCode: "numbering.workspace.update" },
      { permissionKind: "action", permissionCode: "numbering.candidate.review.submit" },
      { permissionKind: "action", permissionCode: "numbering.workspace.cancel" }
    ]);
    expect(result.data.readonly).toBe(true);
    expect(result.data.interaction).toMatchObject({
      canMutateContent: false, canSubmit: true, canCancel: false,
      canApprove: false, canReturn: false
    });
    expect(mocks.issueContract).toHaveBeenCalledWith(client,
      { companyId: "company-one", actorId: "profile-one" });
  });

  it("binds target proof and create receipt to the same verified profile", async () => {
    const rowKey = "cw_11111111-1111-4111-8111-111111111111";
    const service = new DrawingRevisionWorkService(client);
    const target = await service.targetsPrincipal("drawing-one", rowKey, verified);
    const candidateToken = target.data.candidates[0].candidateToken;
    expect(candidateToken).toMatch(/^[^.]+\.[^.]+$/u);
    const result = await service.createPrincipal("drawing-one", {
      sourceRowKey: rowKey, selectionMode: "recommended", candidateToken
    }, verified, { contractToken: "contract-one", expectedRowVersion: 1,
      idempotencyKey: "create-one" });
    expect(result).toEqual({ workId: "work-created" });
    expect(mocks.runPrincipal).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "drawing.create",
        idempotencyKey: "create-one", effectKey: "drawing:drawing-one:1.1" }),
      expect.any(Function));
    expect(mocks.create).toHaveBeenCalledWith(client, expect.objectContaining({
      companyId: "company-one", ownerUserId: "profile-one",
      sourceRowId: "11111111-1111-4111-8111-111111111111"
    }));
  });

  it("never creates a work from a source row belonging to another company or drawing", async () => {
    mocks.readSourceState.mockResolvedValueOnce({ drawing_id: "drawing-other" });
    await expect(new DrawingRevisionWorkService(client).createPrincipal("drawing-one", {
      sourceRowKey: "cw_11111111-1111-4111-8111-111111111111",
      selectionMode: "manual_minor", requestedMinor: 2
    }, verified, { contractToken: "contract-one", expectedRowVersion: 1,
      idempotencyKey: "create-one" })).rejects.toMatchObject({ status: 409 });
    expect(mocks.runPrincipal).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("updates only a locked work owned by the verified principal profile", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    const result = await new DrawingRevisionWorkService(client).updatePrincipal(
      "work-one", { purposeCode: "RD" }, verified,
      { contractToken: "contract-one", expectedRowVersion: 2, idempotencyKey: "update-one" });
    expect(result).toEqual({ workId: "work-one", rowVersion: 3 });
    expect(mocks.readWork).toHaveBeenCalledWith(client, "company-one", "work-one", true);
    expect(mocks.runPrincipal).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "drawing.update", idempotencyKey: "update-one" }),
      expect.any(Function));
    expect(mocks.update).toHaveBeenCalledWith(client,
      expect.objectContaining({ companyId: "company-one", workId: "work-one",
        expectedRowVersion: 2 }));
  });

  it.each(["update", "cancel"] as const)("rejects %s on a different owner before writing", async (command) => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    mocks.readWork.mockResolvedValueOnce({ owner_user_id: "profile-other" });
    const service = new DrawingRevisionWorkService(client);
    const context = { contractToken: "contract-one", expectedRowVersion: 2,
      idempotencyKey: `${command}-one` };
    const action = command === "update"
      ? service.updatePrincipal("work-one", {}, verified, context)
      : service.cancelPrincipal("work-one", verified, context);
    await expect(action).rejects.toMatchObject({ status: 403 });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.cancel).not.toHaveBeenCalled();
  });

  it("cancels a locked owned work with a principal-bound receipt", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    const result = await new DrawingRevisionWorkService(client).cancelPrincipal(
      "work-one", verified, { contractToken: "contract-one", expectedRowVersion: 2,
        idempotencyKey: "cancel-one" });
    expect(result).toEqual({ workId: "work-one", cancelled: true });
    expect(mocks.runPrincipal).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "drawing.cancel", idempotencyKey: "cancel-one" }),
      expect.any(Function));
    expect(mocks.cancel).toHaveBeenCalledWith(client,
      { companyId: "company-one", workId: "work-one", expectedRowVersion: 2 });
  });

  it("rejects drawing submission without current AAL2 before any reviewer lookup", async () => {
    const lowAssurance = { ...verified, session: { ...verified.session,
      assuranceLevel: "aal1" } } as VerifiedPrincipalRequest;
    await expect(new DrawingRevisionWorkService(client).submitPrincipal(
      "work-one", lowAssurance, { contractToken: "contract-one",
        expectedRowVersion: 2, idempotencyKey: "submit-one" }))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.selectPrincipalReviewer).not.toHaveBeenCalled();
  });

  it("submits through the principal reviewer and v2 package without legacy role selection", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    const result = await new DrawingRevisionWorkService(client).submitPrincipal(
      "work-one", verified, { contractToken: "contract-one",
        expectedRowVersion: 2, idempotencyKey: "submit-one" });
    expect(result).toEqual({ requestId: "request-one", reviewCycleId: "cycle-one",
      rowVersion: 1 });
    expect(mocks.readWork).toHaveBeenCalledWith(client, "company-one", "work-one", true);
    expect(mocks.selectPrincipalReviewer).toHaveBeenCalledWith(client,
      { companyId: "company-one", ownerUserId: "profile-one" });
    expect(mocks.selectLegacyReviewer).not.toHaveBeenCalled();
    expect(mocks.buildReviewPackage).toHaveBeenCalledWith(client,
      expect.objectContaining({ companyId: "company-one",
        requestKind: "drawing_revision", workId: "work-one" }));
    expect(mocks.reviewCreate).toHaveBeenCalledWith(client,
      expect.objectContaining({ reviewerUserId: "reviewer-principal-profile",
        snapshotHash: "review-package-hash" }));
  });

  it("rejects a review assigned to another profile before principal drawing effects", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    mocks.reviewGet.mockResolvedValueOnce({
      requestKind: "drawing_revision", reviewerUserId: "profile-other",
      requestStatus: "pending", rowVersion: 1, workId: "work-one"
    });
    await expect(new DrawingRevisionWorkService(client).decidePrincipal(
      "request-one", "approve", verified, { contractToken: "contract-one",
        expectedRowVersion: 1, idempotencyKey: "decision-one" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.beginApproval).not.toHaveBeenCalled();
    expect(mocks.formalize).not.toHaveBeenCalled();
  });

  it("requires a v2 review package before drawing approval", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    mocks.parsePackage.mockReturnValueOnce({ kind: "legacy" });
    await expect(new DrawingRevisionWorkService(client).decidePrincipal(
      "request-one", "approve", verified, { contractToken: "contract-one",
        expectedRowVersion: 1, idempotencyKey: "decision-one" }))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.verifyPackage).not.toHaveBeenCalled();
    expect(mocks.formalize).not.toHaveBeenCalled();
  });

  it("approves a verified principal drawing review with the exact snapshot", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    mocks.verifyPackage.mockReturnValueOnce({ decisionBasis: {
      hash: dev087RequestHash({ payload: {}, revisionId: "revision-one", claimId: null })
    } });
    const result = await new DrawingRevisionWorkService(client).decidePrincipal(
      "request-one", "approve", verified, { contractToken: "contract-one",
        expectedRowVersion: 1, idempotencyKey: "decision-one" });
    expect(result).toEqual({ acknowledged: true });
    expect(mocks.assertPackageRecognition).toHaveBeenCalled();
    expect(mocks.assertFormalizationAllowed).toHaveBeenCalledWith(client,
      expect.objectContaining({ owner_user_id: "profile-one" }));
    expect(mocks.formalize).toHaveBeenCalledWith(client,
      expect.objectContaining({ companyId: "company-one" }));
    expect(mocks.recordTerminalReceipt).toHaveBeenCalled();
    expect(mocks.selectLegacyReviewer).not.toHaveBeenCalled();
  });

  it("commits a principal file tombstone before deleting owned storage bytes", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }]);
    mocks.readWork.mockResolvedValueOnce({ owner_user_id: "profile-one",
      row_version: 2, handling: "owner", revision_id: "revision-one" });
    vi.mocked(client.queryOne).mockResolvedValueOnce({
      file_binding_id: "binding-one", drawing_revision_id: "revision-one",
      source_file_asset_id: "asset-one", storage_key: "owned-file-key",
      linked_entity_type: "drawing_revision", linked_entity_id: "revision-one"
    });
    let committed = false;
    mocks.withVerified.mockImplementationOnce(async (_input, evaluate) => {
      const result = await evaluate(client, verified);
      committed = true;
      return result;
    });
    mocks.deleteObject.mockImplementationOnce(async () => {
      expect(committed).toBe(true);
    });
    const result = await new DrawingRevisionWorkService(client).removeFilePrincipal(
      "work-one", "binding-one", "v2-token", {
        contractToken: "contract-one", expectedRowVersion: 2,
        idempotencyKey: "remove-one" });
    expect(result).toMatchObject({ removed: true, rowVersion: 3 });
    expect(mocks.runPrincipal).toHaveBeenCalledWith(client, verified,
      expect.objectContaining({ command: "drawing.file.remove" }), expect.any(Function));
    expect(mocks.deleteObject).toHaveBeenCalledWith("owned-file-key");
  });
});
