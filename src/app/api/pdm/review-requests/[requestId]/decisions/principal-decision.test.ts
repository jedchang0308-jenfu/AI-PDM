import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withVerified: vi.fn(), evaluate: vi.fn(), verifyContract: vi.fn(),
  getReview: vi.fn(), decidePart: vi.fn(), decideDrawing: vi.fn(),
  replay: vi.fn(), legacyActor: vi.fn()
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
vi.mock("@/lib/repositories/pdm-work-review-async-repository", () => ({
  PdmWorkReviewAsyncRepository: class { get = mocks.getReview; }
}));
vi.mock("@/lib/part-change-work", () => ({
  PartChangeWorkService: class { decidePrincipal = mocks.decidePart; }
}));
vi.mock("@/lib/drawing-revision-work", () => ({
  DrawingRevisionWorkService: class { decidePrincipal = mocks.decideDrawing; }
}));
vi.mock("@/lib/pdm-principal-dev087-command", () => ({
  runPrincipalDev087Command: mocks.replay
}));
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));

import { POST } from "@/app/api/pdm/review-requests/[requestId]/decisions/route";

const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one", assuranceLevel: "aal2" }
};
const tx = { kind: "postgres", transactionScope: "postgres" };
function request() {
  const header = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
    .toString("base64url");
  return new Request("https://pdm.example/api/pdm/review-requests/review-one/decisions", {
    method: "POST", headers: { cookie: `__session=${header}.payload.signature`,
      "content-type": "application/json", "if-match": "1", "idempotency-key": "decision-one",
      "x-pdm-workbench-contract": "contract-one" },
    body: JSON.stringify({ decision: "approve" })
  });
}
const params = { params: Promise.resolve({ requestId: "review-one" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(tx, verified));
  mocks.evaluate.mockResolvedValue([{ allowed: true, decisionCode: "allowed" }]);
  mocks.getReview.mockResolvedValue({ requestKind: "part_change", reviewerUserId: "profile-one" });
  mocks.decidePart.mockResolvedValue({ acknowledged: true });
  mocks.decideDrawing.mockResolvedValue({ acknowledged: true });
  mocks.verifyContract.mockResolvedValue(undefined);
});

describe("principal DEV-087 decision route", () => {
  it("rechecks published capability, assigned reviewer and command in one serializable snapshot", async () => {
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.withVerified).toHaveBeenCalledWith({ token: expect.any(String) },
      expect.any(Function), { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "approval.request.decide" }]);
    expect(mocks.decidePart).toHaveBeenCalledWith("review-one", "approve", verified,
      expect.objectContaining({ expectedRowVersion: 1, idempotencyKey: "decision-one" }));
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("rejects AAL1 and a different assigned reviewer without entering the old route", async () => {
    mocks.withVerified.mockImplementationOnce(async (_input, evaluate) =>
      evaluate(tx, { ...verified, session: { ...verified.session, assuranceLevel: "aal1" } }));
    expect((await POST(request(), params)).status).toBe(403);
    expect(mocks.evaluate).not.toHaveBeenCalled();
    mocks.getReview.mockResolvedValueOnce({ requestKind: "part_change", reviewerUserId: "other-profile" });
    expect((await POST(request(), params)).status).toBe(404);
    expect(mocks.decidePart).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("reads an exact principal receipt when the completed request is gone", async () => {
    mocks.getReview.mockResolvedValueOnce(null);
    mocks.replay.mockResolvedValueOnce({ acknowledged: true });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.replay).toHaveBeenCalledWith(tx, verified,
      expect.objectContaining({ command: "review.decision", effectKey: "review:review-one" }),
      expect.any(Function));
    expect(mocks.decidePart).not.toHaveBeenCalled();
  });

  it("dispatches an assigned drawing review to the principal drawing decision", async () => {
    mocks.getReview.mockResolvedValueOnce({
      requestKind: "drawing_revision", reviewerUserId: "profile-one"
    });
    expect((await POST(request(), params)).status).toBe(200);
    expect(mocks.decideDrawing).toHaveBeenCalledWith(
      "review-one", "approve", verified,
      expect.objectContaining({ expectedRowVersion: 1, idempotencyKey: "decision-one" }));
    expect(mocks.decidePart).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });
});
