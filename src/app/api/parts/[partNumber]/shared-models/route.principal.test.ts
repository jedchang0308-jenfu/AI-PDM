import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  policy: vi.fn(),
  requestedCompany: vi.fn(),
  principalRead: vi.fn(),
  principalWrite: vi.fn(),
  capability: vi.fn(),
  list: vi.fn(),
  create: vi.fn()
}));

vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));
vi.mock("@/lib/company-context", () => ({ requestedPdmCompanyCodeFromRequest: mocks.requestedCompany }));
vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyRead: mocks.principalRead,
  withPrincipalCompanyWrite: mocks.principalWrite
}));
vi.mock("@/lib/principal-resource-capability", () => ({
  authorizeDynamicResourceCapabilityInSnapshot: mocks.capability
}));
vi.mock("@/lib/shared-3d-baseline", () => ({
  listSharedModelVersionsAsync: mocks.list,
  createSharedModelVersionAsync: mocks.create,
  Shared3dBaselineError: class extends Error {
    readonly code: string;
    readonly status: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
}));

import { GET, POST } from "./route";

const routePath = "src/app/api/parts/[partNumber]/shared-models/route.ts";
const snapshot = { id: "same-snapshot" };
const company = { companyId: "company-jenfu", companyCode: "JENFU", companyKind: "business" };
const verified = {
  profile: { pdmUserId: "pdm-user-one", companyId: "company-jenfu" },
  session: { principalId: "principal-one" }
};
const params = Promise.resolve({ partNumber: "PN-001" });

const request = (method: "GET" | "POST", body?: unknown) => new Request(
  "https://pdm.test/api/parts/PN-001/shared-models",
  body === undefined ? { method } : {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }
);

describe("principal shared-model part route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.policy.mockImplementation((_path: string, method: string) => ({
      path: routePath,
      method,
      authorizationMode: "permission",
      permissionCode: method === "GET" ? "pdm.shared_model.view" : "pdm.shared_model.manage",
      scopeResolver: "Part company"
    }));
    mocks.requestedCompany.mockReturnValue({ state: "valid", companyCode: "JENFU" });
    mocks.principalRead.mockImplementation(async (_request, _companyRequest, _permissions, read) =>
      read(snapshot, company, verified));
    mocks.principalWrite.mockImplementation(async (_request, _path, _permission, write) =>
      write(snapshot, company, verified));
    mocks.capability.mockResolvedValue(null);
    mocks.list.mockResolvedValue({ owner: { companyId: company.companyId }, models: [] });
    mocks.create.mockImplementation(async (_input, options) => {
      await options?.beforeNewRelease?.();
      return { reused: false, model: { id: "model-one" } };
    });
  });

  it("checks model and part view together and reads through the verified snapshot", async () => {
    const response = await GET(request("GET"), { params });

    expect(response.status).toBe(200);
    expect(mocks.policy).toHaveBeenCalledWith(routePath, "GET", {
      expectedPermissionCode: "pdm.shared_model.view"
    });
    expect(mocks.capability).toHaveBeenCalledWith(
      snapshot, verified, ["part", "model"], "view", { workspaceCode: company.companyId }
    );
    expect(mocks.list).toHaveBeenCalledWith(
      { ownerScope: "part_number", ownerCode: "PN-001" },
      { client: snapshot, companyId: company.companyId }
    );
  });

  it("does not read models when either parent or model view is denied", async () => {
    mocks.capability.mockResolvedValue(new Response(null, { status: 403 }));

    const response = await GET(request("GET"), { params });

    expect(response.status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("uses edit on both groups for Draft and writes with the same company snapshot and audit principal", async () => {
    const response = await POST(request("POST", {
      sourceFileAssetId: "asset-one",
      modelRevision: "R1",
      status: "Draft"
    }), { params });

    expect(response.status).toBe(201);
    expect(mocks.principalWrite).toHaveBeenCalledWith(
      expect.any(Request), routePath, "pdm.shared_model.manage", expect.any(Function),
      { expectedScopeResolver: "Part company" }
    );
    expect(mocks.capability.mock.calls).toEqual([
      [snapshot, verified, ["part", "model"], "view", { workspaceCode: company.companyId }],
      [snapshot, verified, ["model"], "edit", { workspaceCode: company.companyId }]
    ]);
    expect(mocks.create).toHaveBeenCalledWith({
      ownerScope: "part_number",
      ownerCode: "PN-001",
      sourceFileAssetId: "asset-one",
      modelRevision: "R1",
      actorId: "pdm-user-one",
      status: "Draft",
      releaseReason: "",
      allowSameHashNewLabel: false
    }, {
      client: snapshot,
      companyId: company.companyId,
      principalAudit: { principalId: "principal-one", companyId: company.companyId }
    });
  });

  it("requires parent and model publish for a Released model", async () => {
    const response = await POST(request("POST", {
      sourceFileAssetId: "asset-one",
      status: "Released"
    }), { params });

    expect(response.status).toBe(201);
    expect(mocks.capability.mock.calls).toEqual([
      [snapshot, verified, ["part", "model"], "view", { workspaceCode: company.companyId }],
      [snapshot, verified, ["model"], "edit", { workspaceCode: company.companyId }],
      [snapshot, verified, ["part", "model"], "publish", { workspaceCode: company.companyId }]
    ]);
    expect(mocks.create).toHaveBeenCalled();
  });

  it("does not require model.publish when reusing an existing Released snapshot", async () => {
    mocks.create.mockResolvedValue({ reused: true, model: { id: "model-one", status: "Released" } });

    const response = await POST(request("POST", {
      sourceFileAssetId: "asset-one",
      status: "Released"
    }), { params });

    expect(response.status).toBe(200);
    expect(mocks.capability.mock.calls).toEqual([
      [snapshot, verified, ["part", "model"], "view", { workspaceCode: company.companyId }],
      [snapshot, verified, ["model"], "edit", { workspaceCode: company.companyId }]
    ]);
  });

  it("does not create after publish denial and rejects unknown status or missing source", async () => {
    mocks.capability.mockImplementation(async (_snapshot, _verified, _groups, action) =>
      action === "publish" ? new Response(null, { status: 403 }) : null);
    expect((await POST(request("POST", { sourceFileAssetId: "asset-one", status: "Released" }), { params })).status).toBe(403);
    expect(mocks.create).toHaveBeenCalled();

    expect((await POST(request("POST", { sourceFileAssetId: "asset-one", status: "Pending" }), { params })).status).toBe(400);
    expect((await POST(request("POST", { status: "Draft" }), { params })).status).toBe(400);
    expect(mocks.principalWrite).toHaveBeenCalledTimes(1);
  });
});
