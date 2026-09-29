import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireCommand: vi.fn(),
  addPart: vi.fn(),
  addDrawing: vi.fn(),
  addDrawingPart: vi.fn()
}));

vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.requireCommand
}));
vi.mock("@/lib/numbering-async", () => ({
  addPartNumberToRootAsync: mocks.addPart,
  addDrawingNumberToRootAsync: mocks.addDrawing,
  addDrawingAndPartToRootAsync: mocks.addDrawingPart
}));

import { POST as addPart } from "@/app/api/numbering/roots/[rootCode]/parts/route";
import { POST as addDrawing } from "@/app/api/numbering/roots/[rootCode]/drawings/route";
import { POST as addDrawingPart } from "@/app/api/numbering/roots/[rootCode]/drawing-part/route";

const actor = { pdmUserId: "profile-one", organizationId: "company-one", principalId: "principal-one" };
const metadata = { actor, idempotencyKey: "operation-one" };
const context = { params: Promise.resolve({ rootCode: "R-1" }) };

function request(path: string, body: Record<string, unknown>) {
  return new Request("https://ai-pdm.test/api/numbering/roots/R-1/" + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("Principal-only contextual numbering append", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireCommand.mockResolvedValue({
      actor, metadata, company: { companyId: "company-one", companyCode: "JENFU" }, response: null
    });
    mocks.addPart.mockResolvedValue({ reusedFromIdempotency: false });
    mocks.addDrawing.mockResolvedValue({ reusedFromIdempotency: false });
    mocks.addDrawingPart.mockResolvedValue({ reusedFromIdempotency: false });
  });

  it.each([
    ["parts", addPart, { linkDrawingNumber: "D-1" }, mocks.addPart],
    ["drawings", addDrawing, { purposeCode: "M", linkPartNumber: "P-1" }, mocks.addDrawing],
    ["drawing-part", addDrawingPart, { purposeCode: "M" }, mocks.addDrawingPart]
  ] as const)("requires the second capability for linked %s", async (path, handler, body, mutation) => {
    const response = await handler(request(path, body), context);
    expect(response.status).toBe(201);
    expect(mocks.requireCommand).toHaveBeenCalledWith(expect.any(Request), {
      action: "numbering.create", body,
      additionalPermissionCodes: ["numbering.link_variant"]
    });
    expect(mutation).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-one", createdBy: "profile-one" }), metadata
    );
  });

  it.each([
    ["parts", addPart, {}, mocks.addPart],
    ["drawings", addDrawing, { purposeCode: "M", linkPartNumber: "P-1", linkRelationType: "none" }, mocks.addDrawing]
  ] as const)("does not request link_variant when %s creates no relation", async (
    path, handler, body, mutation
  ) => {
    const response = await handler(request(path, body), context);
    expect(response.status).toBe(201);
    expect(mocks.requireCommand).toHaveBeenCalledWith(expect.any(Request), {
      action: "numbering.create", body, additionalPermissionCodes: []
    });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it("returns 403 and no successful write when link_variant is revoked in the command snapshot", async () => {
    mocks.addDrawingPart.mockRejectedValueOnce(new Error("PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"));
    const response = await addDrawingPart(request("drawing-part", { purposeCode: "M" }), context);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "permission_denied" });
  });
});
