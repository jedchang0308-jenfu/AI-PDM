import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAction: vi.fn(),
  checkAction: vi.fn(),
  getBatch: vi.fn(),
  decide: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({ forbidden: () => Response.json({ error: "forbidden" }, { status: 403 }) }));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => ({ kind: "default" }),
  resolveNumberingCompanyContextAsync: async () => ({ company: { companyId: "company-jenfu" }, response: null })
}));
vi.mock("@/lib/numbering-async", () => ({
  getNumberingApprovalBatchAsync: mocks.getBatch,
  resubmitRejectedNumberingApprovalBatchItemsAsync: vi.fn()
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingActionAsync: mocks.requireAction,
  canUserUseNumberingActionAsync: mocks.checkAction
}));
vi.mock("@/lib/approval-platform", () => ({
  decideApprovalPlatformLegacyNumberingBatchAsync: mocks.decide
}));

import { PATCH } from "@/app/api/numbering/approval-batches/[batchId]/route";

const request = () => new Request("https://example.test/api/numbering/approval-batches/batch-1", {
  method: "PATCH", headers: { "content-type": "application/json" },
  body: JSON.stringify({ action: "approved", approverRole: "system_admin" })
});
const params = { params: Promise.resolve({ batchId: "batch-1" }) };

describe("DEV-121 approval role provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAction.mockResolvedValue({ user: { id: "profile-1", role: "Admin" }, response: null });
    mocks.checkAction.mockResolvedValue({ allowed: true, roleCode: "qa" });
    mocks.getBatch.mockResolvedValue({ id: "batch-1", projectCode: "PROJECT-1", actionCode: "release" });
    mocks.decide.mockResolvedValue({ id: "batch-1" });
  });

  it("records only the role chosen by the permission decision, never the body or profile", async () => {
    const response = await PATCH(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.checkAction).toHaveBeenCalledWith({ id: "profile-1", role: "Admin" },
      "approval.request.decide", { projectCode: "PROJECT-1", actionCode: "release" });
    expect(mocks.decide).toHaveBeenCalledWith(expect.objectContaining({ approverRole: "qa" }));
  });

  it("refuses a decision with no proved role", async () => {
    mocks.checkAction.mockResolvedValue({ allowed: true, roleCode: null });
    const response = await PATCH(request(), params);
    expect(response.status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });
});
