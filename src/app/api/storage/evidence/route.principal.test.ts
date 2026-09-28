import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), dashboard: vi.fn() }));

vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/storage-evidence-dashboard", () => ({
  getStorageEvidenceDashboard: mocks.dashboard
}));

import { GET } from "@/app/api/storage/evidence/route";

describe("storage evidence Principal authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("never reads storage evidence after a denied grant", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const request = new Request("https://ai-pdm.test/api/storage/evidence");
    const response = await GET(request);
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledWith(request,
      "src/app/api/storage/evidence/route.ts", "settings.storage_evidence.view");
    expect(mocks.dashboard).not.toHaveBeenCalled();
  });

  it("reads the dashboard only after Principal authorization", async () => {
    mocks.authorize.mockResolvedValue({ principalId: "principal-one", profileId: "profile-one" });
    mocks.dashboard.mockResolvedValue({ reportType: "file-storage-evidence-dashboard" });
    const response = await GET(new Request("https://ai-pdm.test/api/storage/evidence"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.dashboard).toHaveBeenCalledOnce();
  });
});
