import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ company: vi.fn(), command: vi.fn() }));

vi.mock("@/lib/numbering-company-permission", () => ({
  requireNumberingCompanyPermissionAsync: mocks.company
}));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.command
}));

import { requireNumberStateCommandAccessAsync, requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";

const request = new Request("https://example.test/api/numbering/drafts");

describe("number-state authorization failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves a dependency failure instead of reporting a permission denial", async () => {
    mocks.company.mockResolvedValue({ response: Response.json({ code: "principal_dependency_unavailable" }, { status: 503 }) });
    const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
    expect(access.response?.status).toBe(503);
    expect(await access.response?.json()).toMatchObject({ error: { code: "numbering_authority_unavailable", retryable: true } });
  });

  it("passes only the published principal grant and verified workspace to the resource reader", async () => {
    const authorizationActor = { principalId: "principal-1", sessionSchemaVersion: 2 };
    mocks.company.mockResolvedValue({
      user: { id: "pdm-profile-1", role: "Admin", authorizationActor },
      company: { companyId: "company-jenfu" },
      permission: { allowed: true, roleCode: "rd" }, response: null
    });
    const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
    expect(mocks.company).toHaveBeenCalledWith(request, "action", "numbering.workspace.view");
    expect(access.response).toBeNull();
    expect(access.actor).toMatchObject({ userId: "pdm-profile-1", companyId: "company-jenfu",
      role: "Principal", roles: ["rd"] });
    expect(access.actor?.authorizationActor).toBe(authorizationActor);
    expect(Object.keys(access.actor ?? {})).not.toContain("authorizationActor");
  });

  it("keeps an actual permission denial distinct from an unavailable authority", async () => {
    mocks.command.mockResolvedValue({ response: Response.json({ code: "permission_not_granted" }, { status: 403 }) });
    const access = await requireNumberStateCommandAccessAsync(request, "numbering.workspace.update", {});
    expect(access.response?.status).toBe(403);
    expect(await access.response?.json()).toMatchObject({ error: { code: "numbering_permission_denied", retryable: false } });
  });
});
