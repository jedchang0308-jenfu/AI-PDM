import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), resolve: vi.fn() }));
vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/submission-gate", () => ({
  resolveSubmissionReadiness: mocks.resolve
}));

import { POST } from "@/app/api/submission-readiness/resolve/route";

describe("submission readiness Principal boundary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not parse or evaluate an unauthorized payload", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" },
      { status: 403 }));
    const request = new Request("https://ai-pdm.test/api/submission-readiness/resolve", {
      method: "POST", body: "invalid-json"
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(request.bodyUsed).toBe(false);
    expect(mocks.authorize).toHaveBeenCalledWith(request,
      "src/app/api/submission-readiness/resolve/route.ts", "submission.create", "POST");
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it("evaluates a payload only after the exact Principal capability is allowed", async () => {
    mocks.authorize.mockResolvedValue({ principalId: "principal-one" });
    mocks.resolve.mockReturnValue({ ready: true });
    const response = await POST(new Request(
      "https://ai-pdm.test/api/submission-readiness/resolve", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "research" })
      }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.resolve).toHaveBeenCalledWith({ mode: "research" });
  });
});
