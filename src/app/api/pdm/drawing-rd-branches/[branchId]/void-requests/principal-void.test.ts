import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ principalRoute: vi.fn(), requestVoid: vi.fn(),
  legacyActor: vi.fn() }));
vi.mock("@/lib/pdm-principal-dev087-route", () => ({
  withPrincipalDev087Route: mocks.principalRoute
}));
vi.mock("@/lib/drawing-revision-work", () => ({
  DrawingRevisionWorkService: class { requestVoidPrincipal = mocks.requestVoid; }
}));
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));

import { POST } from "@/app/api/pdm/drawing-rd-branches/[branchId]/void-requests/route";

const verified = { session: { principalId: "principal-one", assuranceLevel: "aal2" },
  profile: { pdmUserId: "profile-one", companyId: "company-one" } };
const tx = { kind: "postgres", transactionScope: "postgres" };
function request(body: unknown) {
  const header = Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
    .toString("base64url");
  return new Request("https://pdm.example/api/pdm/drawing-rd-branches/branch-one/void-requests", {
    method: "POST", headers: { cookie: `__session=${header}.payload.signature`,
      "content-type": "application/json", "if-match": "2",
      "idempotency-key": "void-one", "x-pdm-workbench-contract": "contract-one" },
    body: JSON.stringify(body)
  });
}
const params = { params: Promise.resolve({ branchId: "branch-one" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.principalRoute.mockImplementation(async (_request, _token, _policy, execute) =>
    execute(tx, verified));
  mocks.requestVoid.mockResolvedValue({ requestId: "request-one",
    reviewCycleId: "cycle-one", rowVersion: 1 });
});

describe("Principal RD-void request route", () => {
  it("uses the exact obsolete grant and verified transaction without old actor access", async () => {
    const response = await POST(request({
      rowKey: "cw_11111111-1111-4111-8111-111111111111"
    }), params);
    expect(response.status).toBe(200);
    expect(mocks.principalRoute).toHaveBeenCalledWith(expect.any(Request),
      expect.any(String), expect.objectContaining({
        path: "src/app/api/pdm/drawing-rd-branches/[branchId]/void-requests/route.ts",
        method: "POST", permissionCode: "numbering.draft.obsolete", readOnly: false
      }), expect.any(Function));
    expect(mocks.requestVoid).toHaveBeenCalledWith("branch-one",
      "cw_11111111-1111-4111-8111-111111111111", verified,
      expect.objectContaining({ expectedRowVersion: 2, idempotencyKey: "void-one" }));
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("rejects extra or malformed fields before creating a review", async () => {
    const response = await POST(request({ rowKey: "row-one", ownerUserId: "other" }), params);
    expect(response.status).toBe(422);
    expect(mocks.requestVoid).not.toHaveBeenCalled();
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });
});
