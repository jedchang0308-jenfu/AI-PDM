import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), policy: vi.fn(), principalRead: vi.fn(), principalRoute: vi.fn(),
  getMatrix: vi.fn(), applyMatrixPrincipal: vi.fn(), issueContract: vi.fn(),
  verifyContract: vi.fn(), legacyActor: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicyFromRequest: mocks.policy }));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.principalRead }));
vi.mock("@/lib/pdm-principal-dev087-route", () => ({ withPrincipalDev087Route: mocks.principalRoute }));
vi.mock("@/lib/repositories/relation-formal-authority-async-repository", () => ({
  RelationFormalAuthorityRepository: class {
    constructor(readonly snapshot: unknown) {}
    getMatrix(input: unknown) { return mocks.getMatrix(this.snapshot, input); }
    applyMatrixPrincipal(input: unknown, verified: unknown) {
      return mocks.applyMatrixPrincipal(this.snapshot, input, verified);
    }
  }
}));
vi.mock("@/lib/pdm-workbench-authority-control", () => ({
  issueCanonicalWorkbenchContract: mocks.issueContract,
  verifyCanonicalWorkbenchCommandContract: mocks.verifyContract
}));
vi.mock("@/lib/pdm-dev087-route", () => ({
  resolveRelationMatrixActor: mocks.legacyActor,
  dev087RouteError: vi.fn()
}));

import { GET, PATCH } from "@/app/api/pdm/relations/[rootId]/matrix/route";

const path = "src/app/api/pdm/relations/[rootId]/matrix/route.ts";
const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-1" };
const verified = { session: { principalId: "principal-1" },
  profile: { companyId: "company-1", pdmUserId: "profile-1" } };
const params = { params: Promise.resolve({ rootId: "root-1" }) };

describe("Principal relation matrix routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("principal-session");
    mocks.policy.mockReturnValue({ path, authorizationMode: "permission", scopeResolver: "workspace" });
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company, verified));
    mocks.principalRoute.mockImplementation(async (_request, _token, _policy, write) =>
      write(snapshot, verified));
    mocks.getMatrix.mockResolvedValue({ rootId: "root-1", matrixEtag: "etag-1", cells: [] });
    mocks.applyMatrixPrincipal.mockResolvedValue({ rootId: "root-1", changedCount: 1 });
    mocks.issueContract.mockResolvedValue("contract-1");
  });

  it("reads only the verified company and issues a contract from the same snapshot", async () => {
    const request = new Request("https://example.test/api/pdm/relations/root-1/matrix");
    const response = await GET(request, params);
    expect(response.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.getMatrix).toHaveBeenCalledWith(snapshot, { companyId: "company-1", rootId: "root-1" });
    expect(mocks.issueContract).toHaveBeenCalledWith(snapshot,
      { companyId: "company-1", actorId: "profile-1" });
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("writes only through the Principal grant, contract and verified company", async () => {
    const changes = [{ drawingNumberId: "drawing-1", partNumberId: "part-1", relationType: "reference" }];
    const request = new Request("https://example.test/api/pdm/relations/root-1/matrix", {
      method: "PATCH", headers: { "if-match": "etag-1", "idempotency-key": "command-1",
        "x-pdm-workbench-contract": "contract-1" }, body: JSON.stringify({ changes })
    });
    const response = await PATCH(request, params);
    expect(response.status).toBe(200);
    expect(mocks.principalRoute).toHaveBeenCalledWith(request, "principal-session", {
      path, method: "PATCH", permissionCode: "numbering.workspace.update", readOnly: false
    }, expect.any(Function));
    expect(mocks.verifyContract).toHaveBeenCalledWith(snapshot, {
      companyId: "company-1", actorId: "profile-1", token: "contract-1"
    });
    expect(mocks.applyMatrixPrincipal).toHaveBeenCalledWith(snapshot, {
      companyId: "company-1", rootId: "root-1", changes,
      ifMatch: "etag-1", idempotencyKey: "command-1"
    }, verified);
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("rejects an unreviewed read route before accessing relation data", async () => {
    mocks.policy.mockReturnValue(null);
    const response = await GET(new Request("https://example.test/api/pdm/relations/root-1/matrix"), params);
    expect(response.status).toBe(503);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.getMatrix).not.toHaveBeenCalled();
  });
});
