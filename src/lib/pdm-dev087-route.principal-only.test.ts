import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authMode: vi.fn(), platformMode: vi.fn(), token: vi.fn(),
  page: vi.fn(), action: vi.fn(), canAction: vi.fn(), company: vi.fn()
}));

vi.mock("@/lib/auth-config", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getAuthMode: mocks.authMode,
  getJenfuPlatformAuthMode: mocks.platformMode
}));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token
}));
vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingPageAsync: mocks.page,
  requireNumberingActionAsync: mocks.action,
  canUserUseNumberingActionAsync: mocks.canAction
}));
vi.mock("@/lib/numbering-company-context", () => ({
  requestedNumberingCompanyCodeFromRequest: () => ({ state: "valid", companyCode: "JENFU" }),
  resolveNumberingCompanyContextAsync: mocks.company
}));

import { resolveDev087RouteActor, resolveRelationMatrixActor } from "@/lib/pdm-dev087-route";

const request = new Request("https://ai-pdm.example/api/pdm/drawings/drawing-one/revision-works");

describe("DEV-087 legacy actor boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authMode.mockReturnValue("firebase_bff");
    mocks.platformMode.mockReturnValue("on");
    mocks.token.mockReturnValue(null);
  });

  it.each(["work", "matrix"] as const)(
    "rejects a missing Principal session before any old permission or profile lookup",
    async (route) => {
      const result = route === "work"
        ? await resolveDev087RouteActor(request, "numbering.drawings.view")
        : await resolveRelationMatrixActor(request);
      expect(result.response?.status).toBe(401);
      expect(result.response?.headers.get("cache-control")).toBe("no-store");
      expect(result.actor).toBeNull();
      expect(mocks.page).not.toHaveBeenCalled();
      expect(mocks.action).not.toHaveBeenCalled();
      expect(mocks.company).not.toHaveBeenCalled();
    }
  );

  it("rejects a Principal session at an unmigrated caller instead of evaluating old roles", async () => {
    mocks.token.mockReturnValue("v2-token");
    const result = await resolveDev087RouteActor(request, "numbering.drawings.view");
    expect(result.response?.status).toBe(503);
    expect(await result.response?.json()).toEqual({ code: "principal_route_not_migrated" });
    expect(mocks.page).not.toHaveBeenCalled();
  });

  it("retains the isolated demo path outside Platform mode", async () => {
    mocks.authMode.mockReturnValue("demo");
    mocks.page.mockResolvedValue({ user: { id: "profile-one", role: "Engineer" }, response: null });
    mocks.company.mockResolvedValue({ company: { companyId: "company-one" }, response: null });
    mocks.canAction.mockResolvedValue({ allowed: true });
    const result = await resolveDev087RouteActor(request, "numbering.drawings.view");
    expect(result.response).toBeNull();
    expect(result.actor?.id).toBe("profile-one");
    expect(mocks.page).toHaveBeenCalledOnce();
  });
});
