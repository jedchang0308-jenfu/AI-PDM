import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), getReview: vi.fn(),
  issueContract: vi.fn(), legacyActor: vi.fn(), parsePackage: vi.fn(), verifyPackage: vi.fn(),
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
vi.mock("@/lib/pdm-workbench-authority-control", () => ({
  issueCanonicalWorkbenchContract: mocks.issueContract
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
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));
vi.mock("@/lib/pdm-review-package-contract", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package-contract")>(),
  parseReviewPackageSnapshot: mocks.parsePackage
}));
vi.mock("@/lib/pdm-review-package", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-review-package")>(),
  verifyReviewPackageIntegrity: mocks.verifyPackage
}));

import { GET } from "@/app/api/pdm/review-requests/[requestId]/route";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one", assuranceLevel: "aal2" }
};
const tx = {
  kind: "postgres", transactionScope: "postgres",
  queryOne: vi.fn(), query: vi.fn()
};
function request() {
  const header = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
    .toString("base64url");
  return new Request("https://pdm.example/api/pdm/review-requests/review-one", {
    headers: { cookie: `__session=${header}.payload.signature` }
  });
}
const params = { params: Promise.resolve({ requestId: "review-one" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(tx, verified));
  mocks.evaluate.mockResolvedValue([
    { allowed: true, decisionCode: "allowed" },
    { allowed: true, decisionCode: "allowed" }
  ]);
  mocks.getReview.mockResolvedValue({
    id: "review-one", requestKind: "part_change", requestStatus: "pending",
    reviewerUserId: "profile-one", entityType: "part", canonicalEntityId: "part-one",
    snapshotPayload: { requestedChange: "name" }, rowVersion: 3
  });
  mocks.issueContract.mockResolvedValue("contract-one");
  mocks.parsePackage.mockReturnValue({ kind: "v2" });
  mocks.verifyPackage.mockReturnValue({
    schemaVersion: "pdm-review-package-v2", primaryTargetKey: "part:part-one",
    packageHash: "package-hash", submittedAt: "2026-09-25T00:00:00Z",
    root: { id: "root-one", code: "R-001" }, matrix: {}, targets: []
  });
  mocks.readWork.mockResolvedValue({ id: "work-one" });
  mocks.resolveWorkBasis.mockResolvedValue({ basisState: "current" });
  tx.queryOne.mockResolvedValue({ code: "P-001", name: "Part one" });
  tx.query.mockResolvedValue([]);
});

describe("principal DEV-087 review detail", () => {
  it("reads the assigned part request and contract from the verified principal snapshot", async () => {
    const response = await GET(request(), params);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meta.contractToken).toBe("contract-one");
    expect(body.data.requestId).toBe("review-one");
    expect(mocks.withVerified).toHaveBeenCalledWith({ token: expect.any(String) }, expect.any(Function));
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified, [
      { permissionKind: "action", permissionCode: "approval.inbox.view" },
      { permissionKind: "action", permissionCode: "approval.request.decide" }
    ]);
    expect(mocks.issueContract).toHaveBeenCalledWith(tx, {
      companyId: "company-jenfu", actorId: "profile-one"
    });
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("rejects insufficient assurance or either missing capability before reading the item", async () => {
    mocks.withVerified.mockImplementationOnce(async (_input, evaluate) =>
      evaluate(tx, { ...verified, session: { ...verified.session, assuranceLevel: "aal1" } }));
    expect((await GET(request(), params)).status).toBe(403);
    expect(mocks.getReview).not.toHaveBeenCalled();

    mocks.evaluate.mockResolvedValueOnce([
      { allowed: true, decisionCode: "allowed" },
      { allowed: false, decisionCode: "permission_not_granted" }
    ]);
    expect((await GET(request(), params)).status).toBe(403);
    expect(mocks.getReview).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("hides other reviewers' requests and rejects unmigrated review kinds", async () => {
    mocks.getReview.mockResolvedValueOnce({
      requestKind: "part_change", requestStatus: "pending", reviewerUserId: "other-profile"
    });
    expect((await GET(request(), params)).status).toBe(404);
    mocks.getReview.mockResolvedValueOnce({
      requestKind: "drawing_rd_void", requestStatus: "pending", reviewerUserId: "profile-one"
    });
    expect((await GET(request(), params)).status).toBe(503);
    expect(mocks.issueContract).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("reads a principal drawing review and prevents stale-basis approval", async () => {
    mocks.getReview.mockResolvedValue({
      id: "review-one", requestKind: "drawing_revision", requestStatus: "pending",
      reviewerUserId: "profile-one", entityType: "drawing", canonicalEntityId: "drawing-one",
      workId: "work-one", snapshotPayload: {}, rowVersion: 3
    });
    const current = await GET(request(), params);
    expect(current.status).toBe(200);
    expect((await current.json()).data.interaction.canApprove).toBe(true);
    mocks.resolveWorkBasis.mockResolvedValueOnce({ basisState: "stale" });
    const stale = await GET(request(), params);
    expect(stale.status).toBe(200);
    expect((await stale.json()).data.interaction).toMatchObject({
      canApprove: false, canReturn: true,
      reasonCode: "DRAWING_PRODUCTION_BASE_STALE"
    });
    expect(mocks.readWork).toHaveBeenCalledWith(tx, "company-jenfu", "work-one");
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("rejects an old review snapshot without issuing a new principal contract", async () => {
    mocks.parsePackage.mockReturnValueOnce({ kind: "legacy", value: {} });
    expect((await GET(request(), params)).status).toBe(409);
    expect(mocks.verifyPackage).not.toHaveBeenCalled();
    expect(mocks.issueContract).not.toHaveBeenCalled();
  });
});
