import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  legacyAuthorization: vi.fn(),
  principalRead: vi.fn(),
  principalWrite: vi.fn(),
  settings: vi.fn(),
  setSetting: vi.fn(),
  audit: vi.fn(), secretPermissions: vi.fn()
}));

vi.mock("@/lib/auth-async", () => ({
  requirePdmRouteAuthorizationAsync: mocks.legacyAuthorization
}));
vi.mock("@/lib/principal-company-read", () => ({
  withPrincipalCompanyRead: mocks.principalRead,
  withPrincipalCompanyWrite: mocks.principalWrite
}));
vi.mock("@/lib/system-settings-async", () => ({
  getAllSystemSettingsAsync: mocks.settings,
  setSystemSettingAsync: mocks.setSetting
}));
vi.mock("@/lib/audit-async", () => ({ createAuditLogAsync: mocks.audit }));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({ evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.secretPermissions }));

import { GET, POST } from "@/app/api/settings/route";

function writeRequest(body: Record<string, unknown>, origin = "https://ai-pdm.test") {
  return new Request("https://ai-pdm.test/api/settings", {
    method: "POST", headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body)
  });
}

describe("principal-only settings read", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PDM_DISABLE_SECRET_MANAGEMENT", "false");
    mocks.secretPermissions.mockResolvedValue([{ allowed: true, principalId: "principal-jed", permissionCode: "settings.secret.manage" }]);
  });

  it("reads protected settings with the authorized principal snapshot", async () => {
    const snapshot = { kind: "postgres" };
    mocks.settings.mockResolvedValue({ gdrive_pending_folder_id: "folder-one" });
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, { companyId: "company-jenfu" }, { session: { principalId: "principal-jed" } }));

    const response = await GET(new Request("https://ai-pdm.test/api/settings"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const body = await response.json();
    expect(body.settings.gdrive_pending_folder_id).toBe("folder-one");
    expect(body.settings.secretManagementAvailable).toBe(true);
    expect(mocks.secretPermissions).toHaveBeenCalledWith(snapshot,
      { session: { principalId: "principal-jed" } }, [{ permissionKind: "action", permissionCode: "settings.secret.manage" }]);
    expect(mocks.principalRead).toHaveBeenCalledWith(expect.any(Request),
      { state: "absent" }, [{ permissionKind: "action", permissionCode: "settings.manage" }],
      expect.any(Function));
    expect(mocks.settings).toHaveBeenCalledWith(snapshot);
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("retains summary access for settings.manage-only without offering secret management", async () => {
    const snapshot = { kind: "postgres" };
    mocks.settings.mockResolvedValue({ gdrive_pending_folder_id: "folder-one" });
    mocks.secretPermissions.mockResolvedValue([{ allowed: false, principalId: "principal-jed", permissionCode: "settings.secret.manage" }]);
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read(snapshot, { companyId: "company-jenfu" }, { session: { principalId: "principal-jed" } }));
    const response = await GET(new Request("https://ai-pdm.test/api/settings"));
    expect(response.status).toBe(200);
    expect((await response.json()).settings).toMatchObject({ gdrive_pending_folder_id: "folder-one", secretManagementAvailable: false });
    expect(mocks.setSetting).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not expose secret management when the server explicitly disables it", async () => {
    vi.stubEnv("PDM_DISABLE_SECRET_MANAGEMENT", "true");
    mocks.settings.mockResolvedValue({});
    mocks.principalRead.mockImplementation(async (_request, _company, _permissions, read) =>
      read({ kind: "postgres" }, { companyId: "company-jenfu" }, { session: { principalId: "principal-jed" } }));
    const response = await GET(new Request("https://ai-pdm.test/api/settings"));
    expect(response.status).toBe(200);
    expect((await response.json()).settings.secretManagementAvailable).toBe(false);
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

  it("writes settings and a principal audit with the same authorized transaction client", async () => {
    const snapshot = { kind: "postgres" };
    mocks.settings.mockResolvedValue({ gdrive_pending_folder_id: "previous" });
    mocks.principalWrite.mockImplementation(async (_request, _route, _code, write) =>
      write(snapshot, { companyId: "company-jenfu" }, {
        session: { principalId: "principal-jed" }, profile: { pdmUserId: "pdm-jed" }
      }));

    const response = await POST(writeRequest({ gdrive_pending_folder_id: "next-folder" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.principalWrite).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/settings/route.ts", "settings.manage", expect.any(Function));
    expect(mocks.settings).toHaveBeenCalledWith(snapshot);
    expect(mocks.setSetting).toHaveBeenCalledWith("gdrive_pending_folder_id", "next-folder", "pdm-jed", snapshot);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      actorId: "principal-jed", action: "SettingsUpdate", scopeKind: "global",
      detail: expect.objectContaining({ companyId: "company-jenfu", profileId: "pdm-jed" })
    }), snapshot);
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("does not read or mutate settings when the principal is denied", async () => {
    mocks.principalWrite.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const response = await POST(writeRequest({ gdrive_pending_folder_id: "blocked" }));
    expect(response.status).toBe(403);
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.setSetting).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.legacyAuthorization).not.toHaveBeenCalled();
  });

  it("rejects cross-origin settings writes before authorization", async () => {
    const response = await POST(writeRequest({ gdrive_pending_folder_id: "blocked" }, "https://evil.test"));
    expect(response.status).toBe(403);
    expect(mocks.principalWrite).not.toHaveBeenCalled();
    expect(mocks.settings).not.toHaveBeenCalled();
  });

  it("does not write a partial invalid folder configuration", async () => {
    const snapshot = { kind: "postgres" };
    mocks.settings.mockResolvedValue({
      gdrive_pending_folder_id: "old-pending", gdrive_released_folder_id: "old-released"
    });
    mocks.principalWrite.mockImplementation(async (_request, _route, _code, write) =>
      write(snapshot, { companyId: "company-jenfu" }, {
        session: { principalId: "principal-jed" }, profile: { pdmUserId: "pdm-jed" }
      }));
    const response = await POST(writeRequest({
      gdrive_pending_folder_id: "new-folder", gdrive_released_folder_id: "new-folder"
    }));
    expect(response.status).toBe(400);
    expect(mocks.setSetting).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
