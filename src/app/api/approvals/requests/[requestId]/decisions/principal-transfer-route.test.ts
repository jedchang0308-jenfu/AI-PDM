import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  oldAuth: vi.fn(), commandAccess: vi.fn(), decide: vi.fn(), readDetail: vi.fn(),
  sliceConfigured: false, sliceActive: false
}));
vi.mock("@/lib/auth-async", () => ({
  requireAuthAsync: mocks.oldAuth,
  requirePdmRouteAuthorizationAsync: vi.fn()
}));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.commandAccess
}));
vi.mock("@/lib/transfer-package-phase1d", () => ({
  decideTransferPackageReview: mocks.decide
}));
vi.mock("@/lib/approval-platform", () => ({
  getApprovalPlatformRequestDetailForCompanyAsync: mocks.readDetail,
  decideApprovalPlatformRequestAsync: vi.fn()
}));
vi.mock("@/lib/number-state-flow-api", () => ({
  validateNumberStateMutationRequest: () => null
}));
vi.mock("@/lib/production-slice", () => ({
  isProductionSliceEnforced: () => mocks.sliceConfigured,
  isProductionSliceActive: () => mocks.sliceActive,
  isProductionNumberingLifecycleGateOpen: () => false,
  isProductionNumberingLifecycleApprovalAction: () => false,
  productionSliceDeniedPayload: () => ({ code: "slice_closed" })
}));

import { POST } from "@/app/api/approvals/requests/[requestId]/decisions/route";

const requestId = "APR-TRF-00000000-0000-4000-8000-000000000001";
function request() {
  return new Request(`https://pdm.example/api/approvals/requests/${requestId}/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "transfer-decision-one" },
    body: JSON.stringify({ decision: "approved" })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sliceConfigured = false;
  mocks.sliceActive = false;
  mocks.oldAuth.mockResolvedValue({ response: Response.json({ code: "old_auth_rejected" }, { status: 503 }) });
  mocks.commandAccess.mockResolvedValue({ response: null,
    actor: { organizationId: "company-jenfu" }, metadata: { idempotencyKey: "transfer-decision-one" } });
  mocks.readDetail.mockResolvedValue({ id: requestId, status: "approved" });
});

describe("Principal transfer-review decision route", () => {
  it("reaches the Principal command before the historical session guard", async () => {
    const response = await POST(request(), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(200);
    expect(mocks.oldAuth).not.toHaveBeenCalled();
    expect(mocks.commandAccess).toHaveBeenCalledWith(expect.any(Request), expect.objectContaining({
      permissionCode: "approval.request.decide", discriminator: "approval_decision:transfer_package"
    }));
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ requestId,
      metadata: { idempotencyKey: "transfer-decision-one" } }));
    expect(mocks.readDetail).toHaveBeenCalledWith(requestId, "company-jenfu");
  });

  it("keeps the bound Principal decision reachable in the active production slice", async () => {
    mocks.sliceConfigured = true;
    mocks.sliceActive = true;
    const response = await POST(request(), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(200);
    expect(mocks.commandAccess).toHaveBeenCalledOnce();
    expect(mocks.oldAuth).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown production slice mode", async () => {
    mocks.sliceConfigured = true;
    const response = await POST(request(), { params: Promise.resolve({ requestId }) });
    expect(response.status).toBe(403);
    expect(mocks.commandAccess).not.toHaveBeenCalled();
  });

  it("does not let an old unbound request enter the Principal transfer command", async () => {
    const oldId = "APR-TRF-historical";
    const response = await POST(request(), { params: Promise.resolve({ requestId: oldId }) });
    expect(response.status).toBe(503);
    expect(mocks.commandAccess).not.toHaveBeenCalled();
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
