import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), policy: vi.fn(), principalRead: vi.fn(), evaluate: vi.fn(),
  list: vi.fn(), detail: vi.fn(), legacyError: vi.fn(), serviceOptions: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", () => ({ principalSessionTokenFromRequest: mocks.token }));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicyFromRequest: mocks.policy }));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.principalRead }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/pdm-canonical-workbench", () => ({
  PdmCanonicalWorkbenchService: class {
    constructor(readonly snapshot: unknown, options: unknown) { mocks.serviceOptions(options); }
    list(url: URL, entityType: string, actor: unknown) {
      return mocks.list(this.snapshot, url, entityType, actor);
    }
    detail(rowKey: string, entityType: string, actor: unknown) {
      return mocks.detail(this.snapshot, rowKey, entityType, actor);
    }
  }
}));
vi.mock("@/lib/pdm-dev087-route", () => ({ dev087RouteError: mocks.legacyError }));

import { principalCanonicalWorkbenchResponse } from "@/lib/pdm-principal-canonical-workbench-read";

const partRoute = "src/app/api/parts/workbench/route.ts";
const drawingRoute = "src/app/api/numbering/drawings/workbench/route.ts";
const snapshot = { transactionScope: "postgres" };
const company = { companyId: "company-1" };
const verified = {
  session: { principalId: "principal-1" },
  profile: { pdmUserId: "historical-profile-1", role: "system_admin" }
};

function allowCodes(...allowedCodes: string[]) {
  mocks.evaluate.mockImplementation(async (_snapshot, _verified, permissions) =>
    permissions.map(({ permissionCode }: { permissionCode: string }) => ({
      permissionCode, principalId: verified.session.principalId,
      allowed: allowedCodes.includes(permissionCode)
    })));
}

describe("Principal canonical workbench read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("verified-session-token");
    mocks.policy.mockImplementation((_request, permissionCode) => ({
      path: permissionCode === "numbering.search" ? partRoute : drawingRoute,
      authorizationMode: "permission", scopeResolver: "workspace"
    }));
    mocks.principalRead.mockImplementation(async (_request, _permission, read) =>
      read(snapshot, company, verified));
    mocks.list.mockResolvedValue({ data: { groups: [] } });
  });

  it("rejects a missing Principal session before any workbench or policy read", async () => {
    mocks.token.mockReturnValueOnce(null);
    const response = await principalCanonicalWorkbenchResponse(
      new Request("https://example.test/api/parts/workbench"), partRoute, "part",
      () => mocks.list());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: "auth_session_invalid" });
    expect(mocks.policy).not.toHaveBeenCalled();
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("uses the verified principal grants and one snapshot for Part rows", async () => {
    allowCodes("numbering.workspace.create", "numbering.workspace.update");
    const request = new Request("https://example.test/api/parts/workbench");
    const response = await principalCanonicalWorkbenchResponse(request, partRoute, "part",
      (service, actor) => service.list(new URL(request.url), "part", actor));

    expect(response?.status).toBe(200);
    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.search", expect.any(Function));
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, verified, expect.arrayContaining([
      { permissionKind: "action", permissionCode: "numbering.workspace.create" },
      { permissionKind: "action", permissionCode: "numbering.workspace.update" }
    ]));
    expect(mocks.serviceOptions).toHaveBeenCalledWith({ queuePreviewJobs: false });
    expect(mocks.list).toHaveBeenCalledWith(snapshot, expect.any(URL), "part", {
      id: "historical-profile-1", companyId: "company-1", canEditNonOwned: false,
      permissions: expect.objectContaining({
        createWork: true, updateWork: true, decideReview: false,
        obsoleteDrawing: false, obsoleteFormalPart: false
      })
    });
  });

  it("does not derive Drawing edit or non-owner rights from the historical profile role", async () => {
    allowCodes("numbering.workspace.create", "numbering.workspace.update");
    const request = new Request("https://example.test/api/numbering/drawings/workbench");
    await principalCanonicalWorkbenchResponse(request, drawingRoute, "drawing",
      (service, actor) => service.list(new URL(request.url), "drawing", actor));

    expect(mocks.principalRead).toHaveBeenCalledWith(request, "numbering.drawings.view", expect.any(Function));
    expect(mocks.list).toHaveBeenCalledWith(snapshot, expect.any(URL), "drawing",
      expect.objectContaining({
        canEditNonOwned: false,
        permissions: expect.objectContaining({ createWork: false, updateWork: false })
      }));
  });

  it("rejects an unreviewed route before consulting the Principal snapshot", async () => {
    mocks.policy.mockReturnValue(null);
    const response = await principalCanonicalWorkbenchResponse(
      new Request("https://example.test/api/parts/workbench"), partRoute, "part",
      () => mocks.list());
    expect(response?.status).toBe(503);
    expect(mocks.principalRead).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
});
