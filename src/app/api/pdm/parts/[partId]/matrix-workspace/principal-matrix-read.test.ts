import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRead: vi.fn(), evaluate: vi.fn(),
  matrix: vi.fn(), legacyActor: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalSessionTokenFromRequest: mocks.token
}));
vi.mock("@/lib/principal-numbering-read", () => ({ withPrincipalNumberingCompanyRead: mocks.principalRead }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/part-number-matrix-workspace", () => ({ readPartNumberMatrixWorkspace: mocks.matrix }));
vi.mock("@/lib/pdm-dev087-route", () => ({
  resolveDev087RouteActor: mocks.legacyActor, dev087RouteError: vi.fn()
}));

import { GET } from "@/app/api/pdm/parts/[partId]/matrix-workspace/route";

beforeEach(() => {
  vi.clearAllMocks();
  const snapshot = { kind: "postgres" };
  const verified = { profile: { pdmUserId: "historical-profile", companyId: "company-jenfu" },
    session: { principalId: "principal-one" } };
  mocks.token.mockReturnValue("verified-session");
  mocks.principalRead.mockImplementation((_request, permission, read) => {
    expect(permission).toBe("numbering.search");
    return read(snapshot, { companyId: "company-jenfu" }, verified);
  });
  mocks.evaluate.mockImplementation(async (_tx, _verified,
    permissions: Array<{ permissionCode: string }>) =>
    permissions.map((permission, index: number) => ({ principalId: "principal-one",
      permissionCode: permission.permissionCode, allowed: index !== 1 })));
  mocks.matrix.mockResolvedValue({ data: { root: { id: "root-one" } } });
});

it("reads the company-scoped matrix under a verified principal and published capabilities", async () => {
  const request = new Request("https://ai-pdm.test/api/pdm/parts/part-one/matrix-workspace?workId=work-one");
  const response = await GET(request, { params: Promise.resolve({ partId: "part-one" }) });

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ data: { root: { id: "root-one" } } });
  expect(mocks.matrix).toHaveBeenCalledWith(expect.objectContaining({
    sourcePartId: "part-one", sourceWorkId: "work-one",
    actor: { id: "historical-profile", companyId: "company-jenfu",
      canEditNonOwned: false, permissions: { create: true, update: false,
        submit: true, cancel: false, decide: false } }
  }));
  expect(mocks.legacyActor).not.toHaveBeenCalled();
});

it("rejects missing Principal session before matrix or old actor access", async () => {
  mocks.token.mockReturnValue(null);
  const request = new Request("https://ai-pdm.test/api/pdm/parts/part-one/matrix-workspace?workId=work-one");
  const response = await GET(request, { params: Promise.resolve({ partId: "part-one" }) });
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: "auth_session_invalid" });
  expect(mocks.principalRead).not.toHaveBeenCalled();
  expect(mocks.matrix).not.toHaveBeenCalled();
  expect(mocks.legacyActor).not.toHaveBeenCalled();
});
