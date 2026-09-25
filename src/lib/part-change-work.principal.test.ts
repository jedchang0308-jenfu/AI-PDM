import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const mocks = vi.hoisted(() => ({
  evaluate: vi.fn(), verifyContract: vi.fn(), runPrincipal: vi.fn(),
  getReview: vi.fn(), returnForCorrection: vi.fn(), parsePackage: vi.fn(), verifyPackage: vi.fn(),
  getWork: vi.fn(), createReview: vi.fn(), selectLegacyReviewer: vi.fn(),
  selectPrincipalReviewer: vi.fn(), buildPackage: vi.fn(),
  createWork: vi.fn(), updateWork: vi.fn(), cancelWork: vi.fn(), issueContract: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/pdm-workbench-authority-control", () => ({
  verifyCanonicalWorkbenchCommandContract: mocks.verifyContract,
  issueCanonicalWorkbenchContract: mocks.issueContract
}));
vi.mock("@/lib/pdm-principal-dev087-command", () => ({
  runPrincipalDev087Command: mocks.runPrincipal
}));
vi.mock("@/lib/repositories/pdm-work-review-async-repository", () => ({
  PdmWorkReviewAsyncRepository: class {
    get = mocks.getReview;
    create = mocks.createReview;
    selectReviewer = mocks.selectLegacyReviewer;
  }
}));
vi.mock("@/lib/repositories/part-change-work-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/part-change-work-async-repository")>(),
  PartChangeWorkAsyncRepository: class {
    readWork = mocks.getWork;
    create = mocks.createWork;
    update = mocks.updateWork;
    cancel = mocks.cancelWork;
  }
}));
vi.mock("@/lib/repositories/pdm-principal-reviewer-selector", () => ({
  selectPrincipalReviewerInSnapshot: mocks.selectPrincipalReviewer
}));
vi.mock("@/lib/pdm-work-review", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-work-review")>(),
  returnDev087WorkForCorrection: mocks.returnForCorrection
}));
vi.mock("@/lib/pdm-review-package-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package-contract")>(),
  parseReviewPackageSnapshot: mocks.parsePackage
}));
vi.mock("@/lib/pdm-review-package", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package")>(),
  verifyReviewPackageIntegrity: mocks.verifyPackage,
  buildReviewPackage: mocks.buildPackage,
  reviewPackageV2WriteEnabled: () => false
}));

import { PartChangeWorkService } from "@/lib/part-change-work";

const tx = { kind: "postgres", transactionScope: "postgres",
  execute: vi.fn(), queryOne: vi.fn(), query: vi.fn() } as unknown as AsyncDatabaseClient;
const verified = { profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one", assuranceLevel: "aal2" } } as VerifiedPrincipalRequest;
const context = { idempotencyKey: "decision-one", contractToken: "contract-one",
  expectedRowVersion: 3 };
const payload = {
  partName: "Updated part", itemKind: "manufactured", customSpecification: null,
  isUniversal: false, materialCode: null, materialLabel: null, colorCode: null,
  colorLabel: null, surfaceTreatment: null, variantNote: null
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.evaluate.mockResolvedValue([{ allowed: true }]);
  mocks.verifyContract.mockResolvedValue(undefined);
  mocks.getReview.mockResolvedValue({ id: "review-one", requestKind: "part_change",
    reviewerUserId: "profile-one", requestStatus: "pending", rowVersion: 3,
    snapshotPayload: { previous: "legacy review content" } });
  mocks.returnForCorrection.mockResolvedValue({ acknowledged: true });
  mocks.getWork.mockResolvedValue({
    id: "work-one", part_id: "part-one", owner_user_id: "profile-one",
    row_version: 3, proposed_payload: { name: "Updated part" }
  });
  mocks.createReview.mockResolvedValue({
    id: "review-created", reviewCycleId: "cycle-one", rowVersion: 1
  });
  mocks.selectPrincipalReviewer.mockResolvedValue("reviewer-profile");
  mocks.buildPackage.mockResolvedValue({ packageHash: "a".repeat(64) });
  mocks.createWork.mockResolvedValue({ workId: "work-one", rowVersion: 1 });
  mocks.updateWork.mockResolvedValue({ workId: "work-one", rowVersion: 4 });
  mocks.cancelWork.mockResolvedValue({ cancelled: true });
  mocks.issueContract.mockResolvedValue("contract-one");
  mocks.parsePackage.mockReturnValue({ kind: "v2" });
  mocks.verifyPackage.mockReturnValue({ decisionBasis: { hash: "canonical-hash" } });
  mocks.runPrincipal.mockImplementation(async (client, _actor, _input, execute) => execute(client));
});

describe("principal part-review decision", () => {
  it("uses current principal capability and assigned reviewer in the same command snapshot", async () => {
    const result = await new PartChangeWorkService(tx)
      .decidePrincipal("review-one", "return_for_correction", verified, context);
    expect(result).toEqual({ acknowledged: true });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
    expect(mocks.verifyContract).toHaveBeenCalledWith(tx,
      { companyId: "company-jenfu", actorId: "profile-one", token: "contract-one" });
    expect(mocks.runPrincipal).toHaveBeenCalledWith(tx, verified,
      expect.objectContaining({ command: "review.decision", effectKey: "review:review-one" }),
      expect.any(Function));
    expect(mocks.returnForCorrection).toHaveBeenCalledWith(tx,
      expect.objectContaining({ reviewerUserId: "profile-one" }));
  });

  it("denies a revoked capability or changed reviewer before any business mutation", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false }]);
    await expect(new PartChangeWorkService(tx)
      .decidePrincipal("review-one", "return_for_correction", verified, context))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.runPrincipal).not.toHaveBeenCalled();
    mocks.getReview.mockResolvedValueOnce({ id: "review-one", requestKind: "part_change",
      reviewerUserId: "other-profile", requestStatus: "pending", rowVersion: 3,
      snapshotPayload: {} });
    await expect(new PartChangeWorkService(tx)
      .decidePrincipal("review-one", "return_for_correction", verified, context))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.returnForCorrection).not.toHaveBeenCalled();
  });

  it("rejects a legacy review package under a principal session", async () => {
    mocks.parsePackage.mockReturnValueOnce({ kind: "legacy", value: {} });
    await expect(new PartChangeWorkService(tx)
      .decidePrincipal("review-one", "return_for_correction", verified, context))
      .rejects.toMatchObject({ status: 409 });
    expect(mocks.returnForCorrection).not.toHaveBeenCalled();
  });
});

describe("principal part-review submission", () => {
  it("selects a principal reviewer and writes only an immutable v2 package", async () => {
    const result = await new PartChangeWorkService(tx)
      .submitPrincipal("work-one", verified, context);
    expect(result).toEqual({
      requestId: "review-created", reviewCycleId: "cycle-one", rowVersion: 1
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "numbering.candidate.review.submit" }]);
    expect(mocks.runPrincipal).toHaveBeenCalledWith(tx, verified,
      expect.objectContaining({ command: "part.submit", effectKey: "part-work:work-one:review" }),
      expect.any(Function));
    expect(mocks.selectPrincipalReviewer).toHaveBeenCalledWith(tx,
      { companyId: "company-jenfu", ownerUserId: "profile-one" });
    expect(mocks.selectLegacyReviewer).not.toHaveBeenCalled();
    expect(mocks.buildPackage).toHaveBeenCalledWith(tx,
      expect.objectContaining({ requestKind: "part_change", workId: "work-one" }));
    expect(mocks.createReview).toHaveBeenCalledWith(tx,
      expect.objectContaining({ reviewerUserId: "reviewer-profile",
        snapshotHash: "a".repeat(64) }));
  });

  it("rejects a different owner inside the command before reviewer selection", async () => {
    mocks.getWork.mockResolvedValueOnce({
      owner_user_id: "other-profile", row_version: 3
    });
    await expect(new PartChangeWorkService(tx)
      .submitPrincipal("work-one", verified, context))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.runPrincipal).toHaveBeenCalled();
    expect(mocks.selectPrincipalReviewer).not.toHaveBeenCalled();
  });
});

describe("principal part-work commands", () => {
  it("marks a view-only owner read-only without granting an edit operation", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    const result = await new PartChangeWorkService(tx)
      .readPrincipal("work-one", verified);
    expect(result.data.readonly).toBe(true);
    expect(mocks.evaluate).toHaveBeenNthCalledWith(2, tx, verified,
      [{ permissionKind: "action", permissionCode: "numbering.workspace.update" }]);
  });

  it("creates a work with the verified profile and canonical receipt", async () => {
    const result = await new PartChangeWorkService(tx)
      .createPrincipal("part-one", verified, context, payload);
    expect(result).toEqual({ workId: "work-one", rowVersion: 1 });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "numbering.workspace.create" }]);
    expect(mocks.runPrincipal).toHaveBeenCalledWith(tx, verified,
      expect.objectContaining({ command: "part.create" }), expect.any(Function));
    expect(mocks.createWork).toHaveBeenCalledWith(tx,
      expect.objectContaining({ ownerUserId: "profile-one", companyId: "company-jenfu" }));
  });

  it("requires current owner for updates and cancels inside the transaction", async () => {
    mocks.getWork.mockResolvedValueOnce({ owner_user_id: "other-profile" });
    await expect(new PartChangeWorkService(tx)
      .updatePrincipal("work-one", payload, verified, context))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.updateWork).not.toHaveBeenCalled();
    mocks.getWork.mockResolvedValueOnce({ owner_user_id: "other-profile" });
    await expect(new PartChangeWorkService(tx)
      .cancelPrincipal("work-one", verified, context))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.cancelWork).not.toHaveBeenCalled();
  });

  it("does not execute a write when the published capability is revoked", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: false }]);
    await expect(new PartChangeWorkService(tx)
      .createPrincipal("part-one", verified, context))
      .rejects.toMatchObject({ status: 403 });
    expect(mocks.runPrincipal).not.toHaveBeenCalled();
    expect(mocks.createWork).not.toHaveBeenCalled();
  });
});
