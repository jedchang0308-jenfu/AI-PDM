import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn() }));

vi.mock("@/lib/number-state-flow-api", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requireNumberStateCommandAccessAsync: mocks.access
}));
vi.mock("@/lib/transfer-packages", async (importOriginal) => ({
  ...(await importOriginal<object>()), createTransferPackageDraft: mocks.create
}));

import { POST } from "@/app/api/transfer-packages/route";

function request(origin = "https://ai-pdm.test") {
  return new Request("https://ai-pdm.test/api/transfer-packages", {
    method: "POST", headers: { "content-type": "application/json", origin,
      "idempotency-key": "create-one" },
    body: JSON.stringify({ title: "Design change", caseType: "design_change_case",
      caseReason: "Customer change", sourceReferenceStatus: "provided", sourceReference: "ECO-1" })
  });
}

describe("Principal transfer package create route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ response: null,
      actor: { pdmUserId: "pdm-jed", organizationId: "company-jenfu", principalId: "principal-jed" },
      company: { companyId: "company-jenfu" }, metadata: { idempotencyKey: "create-one" } });
    mocks.create.mockResolvedValue({ id: "package-one" });
  });

  it("passes the verified Principal command context to draft creation", async () => {
    const result = await POST(request());
    expect(result.status).toBe(201);
    expect(mocks.access).toHaveBeenCalledWith(expect.any(Request),
      "transfer.package.create", expect.objectContaining({ title: "Design change" }));
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { idempotencyKey: "create-one" },
      actor: { userId: "pdm-jed", companyId: "company-jenfu", role: "Principal",
        principalId: "principal-jed" }
    }));
  });

  it("does not invoke the command after denial or cross-origin validation failure", async () => {
    mocks.access.mockResolvedValueOnce({ response: Response.json({ error: "permission_not_granted" }, { status: 403 }) });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect((await POST(request("https://evil.test"))).status).toBe(403);
    expect(mocks.access).toHaveBeenCalledTimes(1);
  });

  it("returns a denial if the Principal grant is revoked before command commit", async () => {
    mocks.create.mockRejectedValueOnce(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"));
    const result = await POST(request());
    expect(result.status).toBe(403);
    expect((await result.json()).error).toBe("permission_not_granted");
  });
});
