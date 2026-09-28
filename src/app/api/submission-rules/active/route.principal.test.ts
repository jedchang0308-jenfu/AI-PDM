import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rules: vi.fn() }));
vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/submission-gate", () => ({
  getActiveSubmissionRuleSet: mocks.rules
}));

import { GET } from "@/app/api/submission-rules/active/route";

describe("active submission rules Principal boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not resolve rules when the published Principal grant denies access", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    const request = new Request("https://ai-pdm.test/api/submission-rules/active?mode=research");
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(request,
      "src/app/api/submission-rules/active/route.ts", "submission.view");
    expect(mocks.rules).not.toHaveBeenCalled();
  });

  it("resolves the requested rules only after Principal authorization", async () => {
    mocks.authorize.mockResolvedValue({ principalId: "principal-one" });
    mocks.rules.mockReturnValue({ version: "phase1" });
    const response = await GET(new Request(
      "https://ai-pdm.test/api/submission-rules/active?mode=research&phase=draft&caseType=sample"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.rules).toHaveBeenCalledWith({
      mode: "research", phase: "draft", caseType: "sample"
    });
  });
});
