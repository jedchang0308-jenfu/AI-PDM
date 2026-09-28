import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ action: vi.fn(), command: vi.fn() }));

vi.mock("@/lib/numbering-permission-guard", () => ({
  requireNumberingActionAsync: mocks.action
}));
vi.mock("@/lib/platform-command-context", () => ({
  requireNumberingPlatformCommandAsync: mocks.command
}));

import { requireNumberStateCommandAccessAsync, requireNumberStateReadAccessAsync } from "@/lib/number-state-flow-api";

const request = new Request("https://example.test/api/numbering/drafts");

describe("number-state authorization failures", () => {
  beforeEach(() => vi.clearAllMocks());

  it("preserves a dependency failure instead of reporting a permission denial", async () => {
    mocks.action.mockResolvedValue({ user: null, response: Response.json({ code: "principal_route_not_migrated" }, { status: 503 }) });
    const access = await requireNumberStateReadAccessAsync(request, "numbering.workspace.view");
    expect(access.response?.status).toBe(503);
    expect(await access.response?.json()).toMatchObject({ error: { code: "numbering_authority_unavailable", retryable: true } });
  });

  it("keeps an actual permission denial distinct from an unavailable authority", async () => {
    mocks.command.mockResolvedValue({ response: Response.json({ code: "permission_not_granted" }, { status: 403 }) });
    const access = await requireNumberStateCommandAccessAsync(request, "numbering.workspace.update", {});
    expect(access.response?.status).toBe(403);
    expect(await access.response?.json()).toMatchObject({ error: { code: "numbering_permission_denied", retryable: false } });
  });
});
