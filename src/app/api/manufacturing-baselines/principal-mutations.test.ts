import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(),
  legacyAuth: vi.fn(),
  write: vi.fn(),
  capability: vi.fn(),
  setBasis: vi.fn(),
  createBaseline: vi.fn(),
  releaseBaseline: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/auth-async", () => ({ requirePdmRouteAuthorizationAsync: mocks.legacyAuth }));
vi.mock("@/lib/principal-company-read", () => ({ withPrincipalCompanyWrite: mocks.write }));
vi.mock("@/lib/principal-resource-capability", () => ({
  authorizeDynamicResourceCapabilityInSnapshot: mocks.capability
}));
vi.mock("@/lib/shared-3d-baseline", () => ({
  setDrawingPackageModelBasisAsync: mocks.setBasis,
  createManufacturingBaselineDraftAsync: mocks.createBaseline,
  releaseManufacturingBaselineAsync: mocks.releaseBaseline,
  Shared3dBaselineError: class extends Error {
    readonly code: string;
    readonly status: number;
    readonly details: Record<string, unknown> | undefined;
    constructor(code: string, message: string, status = 400, details?: Record<string, unknown>) {
      super(message);
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
}));

import { POST as setModelBasis } from "@/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route";
import { POST as createBaseline } from "@/app/api/manufacturing-baselines/route";
import { POST as releaseBaseline } from "@/app/api/manufacturing-baselines/[baselineId]/release/route";

const snapshot = { kind: "postgres", transactionScope: "postgres" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const verified = {
  profile: { pdmUserId: "profile-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one" }
};
const jsonRequest = (url: string, body: unknown) => new Request(url, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body)
});

describe("Principal shared-model and manufacturing-baseline mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-session");
    mocks.write.mockImplementation(async (_request, _path, _permission, write) =>
      write(snapshot, company, verified));
    mocks.capability.mockResolvedValue(null);
    mocks.setBasis.mockResolvedValue({ id: "basis-one" });
    mocks.createBaseline.mockResolvedValue({ baseline: { id: "baseline-one" }, items: [] });
    mocks.releaseBaseline.mockResolvedValue({ baseline: { id: "baseline-one", status: "Released" }, items: [] });
  });

  it("sets a shared model basis only after drawing and model edit in the verified company snapshot", async () => {
    const request = jsonRequest("https://pdm.test/api/numbering/drawing-revision-packages/pkg-one/model-basis", {
      sharedModelVersionId: "model-one"
    });
    const response = await setModelBasis(request, { params: Promise.resolve({ packageId: "pkg-one" }) });

    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(request,
      "src/app/api/numbering/drawing-revision-packages/[packageId]/model-basis/route.ts",
      "pdm.shared_model.manage", expect.any(Function), { expectedScopeResolver: "package company" });
    expect(mocks.capability).toHaveBeenCalledTimes(1);
    expect(mocks.capability).toHaveBeenCalledWith(snapshot, verified, ["drawing", "model"], "edit",
      { workspaceCode: "company-jenfu" });
    expect(mocks.setBasis).toHaveBeenCalledWith({
      packageId: "pkg-one", actorId: "profile-one", sharedModelVersionId: "model-one",
      twoDOnlyReason: null, confirmTwoDOnly: false
    }, {
      client: snapshot, companyId: "company-jenfu",
      principalAudit: { principalId: "principal-one", companyId: "company-jenfu" }
    });
    expect(mocks.legacyAuth).not.toHaveBeenCalled();
  });

  it("requires edit and review on both groups for the combined 2D-only confirmation", async () => {
    const response = await setModelBasis(jsonRequest(
      "https://pdm.test/api/numbering/drawing-revision-packages/pkg-one/model-basis",
      { twoDOnlyReason: "marking only", confirmTwoDOnly: true }
    ), { params: Promise.resolve({ packageId: "pkg-one" }) });

    expect(response.status).toBe(200);
    expect(mocks.capability.mock.calls).toEqual([
      [snapshot, verified, ["drawing", "model"], "edit", { workspaceCode: "company-jenfu" }],
      [snapshot, verified, ["drawing", "model"], "review", { workspaceCode: "company-jenfu" }]
    ]);
  });

  it("creates a draft with transfer edit and the same verified snapshot", async () => {
    const request = jsonRequest("https://pdm.test/api/manufacturing-baselines", {
      ownerScope: "part_root", ownerCode: "ROOT-1", sharedModelVersionId: "model-one"
    });
    const response = await createBaseline(request);

    expect(response.status).toBe(201);
    expect(mocks.write).toHaveBeenCalledWith(request,
      "src/app/api/manufacturing-baselines/route.ts", "manufacturing.baseline.manage",
      expect.any(Function), { expectedScopeResolver: "baseline company" });
    expect(mocks.capability).toHaveBeenCalledWith(snapshot, verified, ["transfer"], "edit",
      { workspaceCode: "company-jenfu" });
    expect(mocks.createBaseline).toHaveBeenCalledWith(expect.objectContaining({
      ownerScope: "part_root", ownerCode: "ROOT-1", sharedModelVersionId: "model-one",
      actorId: "profile-one"
    }), {
      client: snapshot, companyId: "company-jenfu",
      principalAudit: { principalId: "principal-one", companyId: "company-jenfu" }
    });
  });

  it("releases only after model and transfer publish in the verified company snapshot", async () => {
    const request = new Request("https://pdm.test/api/manufacturing-baselines/baseline-one/release", { method: "POST" });
    const response = await releaseBaseline(request, {
      params: Promise.resolve({ baselineId: "baseline-one" })
    });

    expect(response.status).toBe(200);
    expect(mocks.write).toHaveBeenCalledWith(request,
      "src/app/api/manufacturing-baselines/[baselineId]/release/route.ts",
      "manufacturing.baseline.release", expect.any(Function),
      { expectedScopeResolver: "baseline company" });
    expect(mocks.capability).toHaveBeenCalledWith(snapshot, verified, ["transfer", "model"], "publish",
      { workspaceCode: "company-jenfu" });
    expect(mocks.releaseBaseline).toHaveBeenCalledWith({
      baselineId: "baseline-one", actorId: "profile-one"
    }, {
      client: snapshot, companyId: "company-jenfu",
      principalAudit: { principalId: "principal-one", companyId: "company-jenfu" }
    });
  });

  it("does not create a baseline after a dynamic capability denial", async () => {
    mocks.capability.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await createBaseline(jsonRequest("https://pdm.test/api/manufacturing-baselines", {
      ownerCode: "PN-1", sharedModelVersionId: "model-one"
    }));

    expect(response.status).toBe(403);
    expect(mocks.createBaseline).not.toHaveBeenCalled();
  });

  it("does not set a model basis after a dynamic capability denial", async () => {
    mocks.capability.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await setModelBasis(jsonRequest(
      "https://pdm.test/api/numbering/drawing-revision-packages/pkg-one/model-basis",
      { sharedModelVersionId: "model-one" }
    ), { params: Promise.resolve({ packageId: "pkg-one" }) });

    expect(response.status).toBe(403);
    expect(mocks.setBasis).not.toHaveBeenCalled();
  });

  it("does not release a baseline after a dynamic capability denial", async () => {
    mocks.capability.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await releaseBaseline(new Request(
      "https://pdm.test/api/manufacturing-baselines/baseline-one/release", { method: "POST" }
    ), { params: Promise.resolve({ baselineId: "baseline-one" }) });

    expect(response.status).toBe(403);
    expect(mocks.releaseBaseline).not.toHaveBeenCalled();
  });

  it("preserves the legacy non-Principal create path", async () => {
    mocks.token.mockReturnValue(null);
    mocks.legacyAuth.mockResolvedValue({ response: null, user: { id: "legacy-profile" } });

    const response = await createBaseline(jsonRequest("https://pdm.test/api/manufacturing-baselines", {
      ownerCode: "PN-1", sharedModelVersionId: "model-one"
    }));

    expect(response.status).toBe(201);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.createBaseline).toHaveBeenCalledWith(expect.objectContaining({ actorId: "legacy-profile" }));
  });

  it("preserves the legacy non-Principal release path", async () => {
    mocks.token.mockReturnValue(null);
    mocks.legacyAuth.mockResolvedValue({ response: null, user: { id: "legacy-profile" } });

    const response = await releaseBaseline(new Request(
      "https://pdm.test/api/manufacturing-baselines/baseline-one/release", { method: "POST" }
    ), { params: Promise.resolve({ baselineId: "baseline-one" }) });

    expect(response.status).toBe(200);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.releaseBaseline).toHaveBeenCalledWith({
      baselineId: "baseline-one", actorId: "legacy-profile"
    });
  });
});
