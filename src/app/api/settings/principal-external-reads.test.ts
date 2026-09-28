import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), secrets: vi.fn(), folders: vi.fn() }));

vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/settings-secret-lifecycle", () => ({
  listSettingsSecretStatuses: mocks.secrets,
  SettingsSecretLifecycleError: class extends Error {}
}));
vi.mock("@/lib/gdrive", () => ({ listDriveFolders: mocks.folders }));

import { GET as getSecretStatuses } from "@/app/api/settings/secrets/route";
import { GET as getDriveFolders } from "@/app/api/settings/gdrive/folders/route";

const subject = { principalId: "principal-one", profileId: "profile-one",
  company: { companyId: "company-jenfu" } };

describe("principal-only external settings reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never calls either provider when principal authorization rejects", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));
    const secrets = await getSecretStatuses(new Request("https://ai-pdm.test/api/settings/secrets"));
    const folders = await getDriveFolders(new Request("https://ai-pdm.test/api/settings/gdrive/folders"));
    expect(secrets.status).toBe(403);
    expect(folders.status).toBe(403);
    expect(mocks.secrets).not.toHaveBeenCalled();
    expect(mocks.folders).not.toHaveBeenCalled();
  });

  it("uses distinct published capabilities before reading each provider", async () => {
    mocks.authorize.mockResolvedValue(subject);
    mocks.secrets.mockResolvedValue([{ kind: "storage", status: "enabled" }]);
    mocks.folders.mockResolvedValue([{ id: "folder-one" }]);
    const secretsRequest = new Request("https://ai-pdm.test/api/settings/secrets");
    const foldersRequest = new Request("https://ai-pdm.test/api/settings/gdrive/folders?parentId=folder-parent");

    const secrets = await getSecretStatuses(secretsRequest);
    const folders = await getDriveFolders(foldersRequest);

    expect(secrets.status).toBe(200);
    expect(folders.status).toBe(200);
    expect(secrets.headers.get("cache-control")).toBe("private, no-store");
    expect(folders.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.authorize).toHaveBeenNthCalledWith(1, secretsRequest,
      "src/app/api/settings/secrets/route.ts", "settings.secret.manage");
    expect(mocks.authorize).toHaveBeenNthCalledWith(2, foldersRequest,
      "src/app/api/settings/gdrive/folders/route.ts", "settings.integration.manage");
    expect(mocks.folders).toHaveBeenCalledWith("folder-parent");
  });
});
