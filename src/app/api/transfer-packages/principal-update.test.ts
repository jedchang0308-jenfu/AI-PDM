import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/number-state-flow-api", async (importOriginal) => ({
  ...(await importOriginal<object>()), requireNumberStateCommandAccessAsync: mocks.access
}));
vi.mock("@/lib/transfer-packages", async (importOriginal) => ({
  ...(await importOriginal<object>()), updateTransferPackageHeader: mocks.update
}));

import { PATCH } from "@/app/api/transfer-packages/[id]/route";

function request(origin = "https://ai-pdm.test") {
  return new Request("https://ai-pdm.test/api/transfer-packages/package-one", {
    method: "PATCH", headers: { "content-type": "application/json", origin,
      "idempotency-key": "header-one" },
    body: JSON.stringify({ title: "Updated", caseType: "design_change_case",
      caseReason: "Customer request", sourceReferenceStatus: "provided",
      sourceReference: "ECO-1", expectedRowVersion: 1 })
  });
}

describe("Principal transfer package header mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "profile-one", organizationId: "company-one", principalId: "principal-one" },
      company: { companyId: "company-one" }, metadata: { idempotencyKey: "header-one" } });
    mocks.update.mockResolvedValue({ id: "package-one", rowVersion: 2 });
  });

  it("forwards only the verified Principal actor and command metadata", async () => {
    const response = await PATCH(request(), { params: Promise.resolve({ id: "package-one" }) });
    expect(response.status).toBe(200);
    expect(mocks.access).toHaveBeenCalledWith(expect.any(Request), "transfer.package.update",
      expect.objectContaining({ expectedRowVersion: 1 }));
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { idempotencyKey: "header-one" },
      actor: { userId: "profile-one", companyId: "company-one", role: "Principal",
        principalId: "principal-one" }
    }));
  });

  it("does not invoke the mutation after denial or failed same-origin validation", async () => {
    mocks.access.mockResolvedValueOnce({ response: Response.json({ code: "permission_not_granted" }, { status: 403 }) });
    expect((await PATCH(request(), { params: Promise.resolve({ id: "package-one" }) })).status).toBe(403);
    expect((await PATCH(request("https://evil.test"),
      { params: Promise.resolve({ id: "package-one" }) })).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
