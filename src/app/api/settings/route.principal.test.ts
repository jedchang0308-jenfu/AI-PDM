import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyAuthorization: vi.fn(),
  principalRead: vi.fn(),
  settings: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({
  requirePdmRouteAuthorizationAsync: mocks.legacyAuthorization
}));
vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyRead: mocks.principalRead
}));
vi.mock("@/lib/system-settings-async", () => ({
  getAllSystemSettingsAsync: mocks.settings,
  setSystemSettingAsync: vi.fn()
}));

import { GET } from "@/app/api/settings/route";

describe("principal-only settings read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads protected settings with the authorized principal snapshot", async () => {
    const snapshot = { kind: "postgres" };
    mocks.settings.mockResolvedValue({ gdrive_pending_folder_id: "folder-one" });
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot));

    const response = await GET(new Request("https://ai-pdm.test/api/settings"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).settings.gdrive_pending_folder_id).toBe("folder-one");
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "settings.manage" }],
      expect.any(Function));
    expect(mocks.settings).toHaveBeenCalledWith(snapshot);
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not read settings after a denied principal decision", async () => {
    mocks.principalRead.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await GET(new Request("https://ai-pdm.test/api/settings"));
    expect(response.status).toBe(403);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not accept a legacy session at this endpoint", async () => {
    mocks.principalRead.mockResolvedValue(null);
    const response = await GET(new Request("https://ai-pdm.test/api/settings"));
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("auth_session_invalid");
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });
});
