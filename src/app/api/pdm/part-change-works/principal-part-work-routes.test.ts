import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), principalRoute: vi.fn(), legacyActor: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalSessionTokenFromRequest: mocks.token
}));
vi.mock("@/lib/pdm-principal-dev087-route", () => ({
  withPrincipalDev087Route: mocks.principalRoute
}));
vi.mock("@/lib/pdm-dev087-route", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/pdm-dev087-route")>(),
  resolveDev087RouteActor: mocks.legacyActor
}));

import { POST as createWork } from "@/app/api/pdm/parts/[partId]/change-works/route";
import { GET as readWork, PATCH as updateWork } from "@/app/api/pdm/part-change-works/[workId]/route";
import { POST as submitWork } from "@/app/api/pdm/part-change-works/[workId]/submit/route";
import { POST as cancelWork } from "@/app/api/pdm/part-change-works/[workId]/cancel/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockReturnValue("v2-token");
  mocks.principalRoute.mockResolvedValue(Response.json({ principal: true }));
});

describe("principal part-work HTTP dispatch", () => {
  it.each([
    ["create", createWork, "POST", "numbering.workspace.create", false],
    ["read", readWork, "GET", "numbering.workspace.view", true],
    ["update", updateWork, "PATCH", "numbering.workspace.update", false],
    ["submit", submitWork, "POST", "numbering.candidate.review.submit", false],
    ["cancel", cancelWork, "POST", "numbering.workspace.cancel", false]
  ] as const)("sends %s through the verified principal lane only",
    async (_name, route, method, permissionCode, readOnly) => {
      const request = new Request("https://pdm.example/api/pdm/part-change-works/work-one",
        { method });
      const response = await route(request, {
        params: Promise.resolve({ workId: "work-one", partId: "part-one" })
      });
      expect(response.status).toBe(200);
      expect(mocks.principalRoute).toHaveBeenCalledWith(request, "v2-token",
        expect.objectContaining({ method, permissionCode, readOnly }), expect.any(Function));
      expect(mocks.legacyActor).not.toHaveBeenCalled();
    });
});
