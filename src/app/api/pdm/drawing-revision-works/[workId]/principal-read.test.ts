import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ token: vi.fn(), principalRoute: vi.fn(),
  routePolicy: vi.fn(), legacyActor: vi.fn(), uploadFile: vi.fn(), removeFile: vi.fn() }));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalSessionTokenFromRequest: mocks.token
}));
vi.mock("@/lib/pdm-principal-dev087-route", () => ({
  withPrincipalDev087Route: mocks.principalRoute,
  principalDev087RoutePolicyAvailable: mocks.routePolicy
}));
vi.mock("@/lib/drawing-revision-work", () => ({
  DrawingRevisionWorkService: class {
    uploadFilePrincipal = mocks.uploadFile;
    removeFilePrincipal = mocks.removeFile;
  }
}));
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));

import { GET, PATCH } from "@/app/api/pdm/drawing-revision-works/[workId]/route";
import { POST as cancelWork } from "@/app/api/pdm/drawing-revision-works/[workId]/cancel/route";
import { POST as submitWork } from "@/app/api/pdm/drawing-revision-works/[workId]/submit/route";
import { POST as uploadWorkFile } from "@/app/api/pdm/drawing-revision-works/[workId]/files/route";
import { DELETE as removeWorkFile } from "@/app/api/pdm/drawing-revision-works/[workId]/files/[fileBindingId]/route";
import { GET as getTargets } from "@/app/api/pdm/drawings/[drawingId]/revision-targets/route";
import { POST as createWork } from "@/app/api/pdm/drawings/[drawingId]/revision-works/route";

describe("principal drawing-work HTTP dispatch", () => {
  it("routes a v2 session through the reviewed principal read policy", async () => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-token");
    mocks.principalRoute.mockResolvedValue(Response.json({ principal: true }));
    const request = new Request("https://pdm.example/api/pdm/drawing-revision-works/work-one");
    const response = await GET(request, { params: Promise.resolve({ workId: "work-one" }) });
    expect(response.status).toBe(200);
    expect(mocks.principalRoute).toHaveBeenCalledWith(request, "v2-token", {
      path: "src/app/api/pdm/drawing-revision-works/[workId]/route.ts",
      method: "GET", permissionCode: "numbering.workspace.view", readOnly: true
    }, expect.any(Function));
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it.each([
    ["targets", getTargets, "GET", true],
    ["create", createWork, "POST", false]
  ] as const)("routes drawing %s through principal create capability",
    async (_name, route, method, readOnly) => {
      vi.clearAllMocks();
      mocks.token.mockReturnValue("v2-token");
      mocks.principalRoute.mockResolvedValue(Response.json({ principal: true }));
      const request = new Request(`https://pdm.example/api/pdm/drawings/drawing-one/${
        method === "GET" ? "revision-targets" : "revision-works"}`, { method });
      const response = await route(request, {
        params: Promise.resolve({ drawingId: "drawing-one" })
      });
      expect(response.status).toBe(200);
      expect(mocks.principalRoute).toHaveBeenCalledWith(request, "v2-token",
        expect.objectContaining({ method, permissionCode: "numbering.workspace.create", readOnly }),
        expect.any(Function));
      expect(mocks.legacyActor).not.toHaveBeenCalled();
    });

  it.each([
    ["update", PATCH, "PATCH", "numbering.workspace.update"],
    ["cancel", cancelWork, "POST", "numbering.workspace.cancel"],
    ["submit", submitWork, "POST", "numbering.candidate.review.submit"]
  ] as const)("routes drawing %s through principal mutation capability",
    async (_name, route, method, permissionCode) => {
      vi.clearAllMocks();
      mocks.token.mockReturnValue("v2-token");
      mocks.principalRoute.mockResolvedValue(Response.json({ principal: true }));
      const suffix = _name === "update" ? "" : `/${_name}`;
      const request = new Request(
        `https://pdm.example/api/pdm/drawing-revision-works/work-one${suffix}`,
        { method });
      const response = await route(request, { params: Promise.resolve({ workId: "work-one" }) });
      expect(response.status).toBe(200);
      expect(mocks.principalRoute).toHaveBeenCalledWith(request, "v2-token",
        expect.objectContaining({ method, permissionCode, readOnly: false }),
        expect.any(Function));
      expect(mocks.legacyActor).not.toHaveBeenCalled();
    });

  it("routes a v2 file upload through the reviewed policy and principal file service", async () => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-token");
    mocks.routePolicy.mockReturnValue(true);
    mocks.uploadFile.mockResolvedValue({ reused: false });
    const body = new FormData();
    body.set("file", new File(["drawing"], "drawing.pdf", { type: "application/pdf" }));
    const request = new Request(
      "https://pdm.example/api/pdm/drawing-revision-works/work-one/files",
      { method: "POST", headers: { "if-match": "2", "idempotency-key": "file-one",
        "x-pdm-workbench-contract": "contract-one" }, body });
    const response = await uploadWorkFile(request,
      { params: Promise.resolve({ workId: "work-one" }) });
    expect(response.status).toBe(200);
    expect(mocks.uploadFile).toHaveBeenCalledWith("work-one",
      expect.objectContaining({ file: expect.any(File) }), "v2-token",
      expect.objectContaining({ expectedRowVersion: 2, idempotencyKey: "file-one" }));
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });

  it("routes v2 file removal through principal ownership without the legacy actor", async () => {
    vi.clearAllMocks();
    mocks.token.mockReturnValue("v2-token");
    mocks.routePolicy.mockReturnValue(true);
    mocks.removeFile.mockResolvedValue({ removed: true });
    const request = new Request(
      "https://pdm.example/api/pdm/drawing-revision-works/work-one/files/binding-one",
      { method: "DELETE", headers: { "if-match": "2",
        "idempotency-key": "remove-one", "x-pdm-workbench-contract": "contract-one" } });
    const response = await removeWorkFile(request, { params: Promise.resolve({
      workId: "work-one", fileBindingId: "binding-one"
    }) });
    expect(response.status).toBe(200);
    expect(mocks.removeFile).toHaveBeenCalledWith(
      "work-one", "binding-one", "v2-token",
      expect.objectContaining({ expectedRowVersion: 2, idempotencyKey: "remove-one" }));
    expect(mocks.legacyActor).not.toHaveBeenCalled();
  });
});
