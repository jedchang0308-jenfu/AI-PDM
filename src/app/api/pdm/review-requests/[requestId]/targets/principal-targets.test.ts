import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), getReview: vi.fn(),
  legacyActor: vi.fn(), parsePackage: vi.fn(), verifyPackage: vi.fn(),
  readCurrent: vi.fn(), compare: vi.fn(), issueContract: vi.fn(),
  readWork: vi.fn(), resolveWorkBasis: vi.fn()
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
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));
vi.mock("@/lib/repositories/pdm-work-review-async-repository", () => ({
  PdmWorkReviewAsyncRepository: class { get = mocks.getReview; }
}));
vi.mock("@/lib/repositories/drawing-revision-work-async-repository", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/repositories/drawing-revision-work-async-repository")>(),
  DrawingRevisionWorkAsyncRepository: class {
    readWork = mocks.readWork;
    resolveWorkBasis = mocks.resolveWorkBasis;
  }
}));
vi.mock("@/lib/pdm-review-package-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package-contract")>(),
  parseReviewPackageSnapshot: mocks.parsePackage
}));
vi.mock("@/lib/pdm-review-package", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package")>(),
  verifyReviewPackageIntegrity: mocks.verifyPackage,
  readCurrentReviewTarget: mocks.readCurrent,
  compareReviewTarget: mocks.compare
}));
vi.mock("@/lib/pdm-workbench-authority-control", () => ({
  issueCanonicalWorkbenchContract: mocks.issueContract
}));

import { GET as targetGET } from "@/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/route";
import { GET as comparisonGET } from "@/app/api/pdm/review-requests/[requestId]/targets/[entityType]/[entityId]/comparison/route";

const tx = { kind: "postgres", transactionScope: "postgres" };
const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-one" },
  session: { principalId: "principal-one", assuranceLevel: "aal2" }
};
const params = { params: Promise.resolve({ requestId: "review-one",
  entityType: "drawing", entityId: "drawing-one" }) };
function request(comparison = false) {
  const header = Buffer.from(JSON.stringify({
    type: "JENFU-AI-PDM-PRINCIPAL", version: 2
  })).toString("base64url");
  return new Request(`https://pdm.example/api/pdm/review-requests/review-one/targets/drawing/drawing-one${comparison ? "/comparison" : ""}`, {
    headers: { cookie: `__session=${header}.payload.signature` }
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(tx, verified));
  mocks.evaluate.mockResolvedValue([{ allowed: true, decisionCode: "allowed" }]);
  mocks.getReview.mockResolvedValue({ id: "review-one", requestKind: "drawing_revision",
    requestStatus: "pending", reviewerUserId: "profile-one", companyId: "company-one",
    workId: "work-one", rowVersion: 4, snapshotPayload: {}, snapshotHash: "package-hash" });
  mocks.parsePackage.mockReturnValue({ kind: "v2" });
  mocks.verifyPackage.mockReturnValue({ schemaVersion: "pdm-review-package-v2",
    targets: [{ targetKey: "drawing:drawing-one", scope: "submitted",
      evidenceHash: "evidence-hash", workspace: { identity: { code: "D-001" } } }] });
  mocks.readCurrent.mockResolvedValue({ identity: { code: "D-001" } });
  mocks.readWork.mockResolvedValue({ id: "work-one" });
  mocks.resolveWorkBasis.mockResolvedValue({ basisState: "current" });
  mocks.compare.mockReturnValue({ changed: false, status: "unchanged" });
  mocks.issueContract.mockResolvedValue("contract-one");
});

describe("principal review target and comparison", () => {
  it("reads both views with principal reviewer authority in read-only snapshots", async () => {
    const target = await targetGET(request(), params);
    const comparison = await comparisonGET(request(true), params);
    expect(target.status).toBe(200);
    expect((await target.json()).meta.contractToken).toBe("contract-one");
    expect(comparison.status).toBe(200);
    expect((await comparison.json()).data.snapshot.identity.code).toBe("D-001");
    expect(mocks.withVerified).toHaveBeenCalledTimes(2);
    expect(mocks.withVerified).toHaveBeenCalledWith({ token: expect.any(String) },
      expect.any(Function), { readOnly: true, isolationLevel: "repeatable_read" });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
    expect(mocks.readCurrent).toHaveBeenCalledWith(tx, {
      companyId: "company-one", entityType: "drawing", entityId: "drawing-one",
      workId: "work-one"
    });
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("denies missing decide permission before loading a review", async () => {
    mocks.evaluate.mockResolvedValueOnce([{ allowed: true }])
      .mockResolvedValueOnce([{ allowed: false }]);
    expect((await targetGET(request(), params)).status).toBe(403);
    expect(mocks.getReview).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("hides another reviewer's target and rejects a legacy package", async () => {
    mocks.getReview.mockResolvedValueOnce({ requestKind: "drawing_revision",
      requestStatus: "pending", reviewerUserId: "profile-other" });
    expect((await comparisonGET(request(true), params)).status).toBe(404);
    expect(mocks.readCurrent).not.toHaveBeenCalled();
    mocks.parsePackage.mockReturnValueOnce({ kind: "legacy" });
    expect((await targetGET(request(), params)).status).toBe(409);
    expect(mocks.readCurrent).not.toHaveBeenCalled();
  });

  it("shows a stale drawing basis without an approval action", async () => {
    mocks.resolveWorkBasis.mockResolvedValueOnce({ basisState: "stale" });
    const response = await targetGET(request(), params);
    expect(response.status).toBe(200);
    expect((await response.json()).data.interaction).toMatchObject({
      mode: "review_stale_cleanup", canApprove: false,
      reasonCode: "DRAWING_PRODUCTION_BASE_STALE"
    });
  });
});
