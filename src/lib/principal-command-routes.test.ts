import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCommand: vi.fn(),
  obsoleteDraft: vi.fn(),
  requestRootObsolete: vi.fn(),
  requestNumberObsolete: vi.fn()
}));

vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.requireCommand
}));
vi.mock("@/lib/numbering-async", () => ({
  obsoleteDraftNumberingRecordAsync: mocks.obsoleteDraft,
  requestRootObsoleteApprovalAsync: mocks.requestRootObsolete,
  requestNumberingObsoleteApprovalAsync: mocks.requestNumberObsolete
}));
vi.mock("@/lib/production-slice", () => ({
  isProductionSliceEnforced: () => false,
  isProductionNumberingLifecycleGateOpen: () => true,
  productionSliceDeniedPayload: () => ({})
}));
vi.mock("@/lib/number-state-flow-api", () => ({
  validateNumberStateMutationRequest: () => null
}));
vi.mock("@/lib/pdm-lifecycle-policy", () => ({
  buildNumberingFormalRecordLifecyclePolicy: () => ({})
}));
vi.mock("@/lib/numbering-obsolete-impact", () => ({
  getFormalObsoleteImpactAsync: vi.fn()
}));

import { POST as requestObsolete } from "@/app/api/lifecycle/obsolete-requests/route";
import { POST as obsoleteDraft } from "@/app/api/numbering/records/[rootCode]/obsolete/route";

const actor = { pdmUserId: "profile-one", organizationId: "company-one", principalId: "principal-one" };
const metadata = { actor, idempotencyKey: "operation-one" };

describe("DEV-121 human command route actor propagation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCommand.mockResolvedValue({
      actor, metadata, company: { companyId: "company-one", companyCode: "JENFU" }, response: null
    });
  });

  it("passes the verified actor through formal root-obsolete approval", async () => {
    mocks.requestRootObsolete.mockResolvedValue({
      approvalRequest: { id: "request-one" }, approvalBatch: {},
      impact: { root: { id: "root-one" } }
    });
    const response = await requestObsolete(new Request("https://ai-pdm.test/api/lifecycle/obsolete-requests", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "operation-one" },
      body: JSON.stringify({ entityType: "part_root", reason: "obsolete", entityId: "root-one" })
    }));
    expect(response.status).toBe(201);
    expect(mocks.requireCommand).toHaveBeenCalledWith(expect.any(Request), {
      action: "obsolete_part_root", body: expect.objectContaining({ entityType: "part_root" })
    });
    expect(mocks.requestRootObsolete).toHaveBeenCalledWith(
      expect.objectContaining({ requestedBy: actor.pdmUserId, companyId: actor.organizationId }), metadata
    );
  });

  it("passes the same actor to draft-obsolete instead of constructing pdm:user metadata", async () => {
    mocks.obsoleteDraft.mockResolvedValue({ id: "root-one" });
    const response = await obsoleteDraft(new Request("https://ai-pdm.test/api/numbering/records/R-1/obsolete", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": "operation-one" },
      body: JSON.stringify({ reason: "obsolete", confirmObsolete: true })
    }), { params: Promise.resolve({ rootCode: "R-1" }) });
    expect(response.status).toBe(200);
    expect(mocks.requireCommand).toHaveBeenCalledWith(expect.any(Request), {
      action: "numbering.draft.obsolete", body: expect.objectContaining({ confirmObsolete: true })
    });
    expect(mocks.obsoleteDraft).toHaveBeenCalledWith(
      expect.objectContaining({ obsoletedBy: actor.pdmUserId, companyId: actor.organizationId }), metadata
    );
  });
});
