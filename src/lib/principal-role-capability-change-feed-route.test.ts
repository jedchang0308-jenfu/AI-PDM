import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  changeFeed: vi.fn(),
  commandReceipt: vi.fn(),
  workspace: vi.fn(),
  privilegedWorkspace: vi.fn()
}));

vi.mock("@/lib/principal-company-read", () => ({
  authorizePrincipalWorkspaceExternalRead: mocks.authorize
}));
vi.mock("@/lib/repositories/ai-pdm-role-capability-repository", () => ({
  getRoleCapabilityChangeFeed: mocks.changeFeed,
  getRoleCapabilityCommandReceipt: mocks.commandReceipt
}));
vi.mock("@/lib/ai-pdm-role-capability-service", () => ({
  readRoleCapabilityWorkspace: mocks.workspace,
  readPrivilegedRoleCapabilityWorkspace: mocks.privilegedWorkspace
}));

import { GET } from "@/app/api/settings/access/role-capabilities/change-feed/route";
import { GET as getWorkspace } from "@/app/api/settings/access/role-capabilities/route";
import { GET as getCommandReceipt } from "@/app/api/settings/access/role-capabilities/commands/[commandId]/route";

const request = () => new Request("https://ai-pdm.test/api/settings/access/role-capabilities/change-feed?after=4&limit=12");

describe("principal-only role capability change feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never calls OrgMaster when the principal grant is denied", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.changeFeed).not.toHaveBeenCalled();
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/settings/access/role-capabilities/change-feed/route.ts",
      "settings.admin_matrix");
  });

  it("reads the bounded feed only after the principal workspace grant", async () => {
    mocks.authorize.mockResolvedValue({ principalId: "principal-one", profileId: "profile-one",
      company: { companyId: "company-one" } });
    mocks.changeFeed.mockResolvedValue({ items: [], nextCursor: null, hasMore: false });

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.changeFeed).toHaveBeenCalledWith(4, 12);
  });

  it("does not read role workspace data after a denied principal grant", async () => {
    mocks.authorize.mockResolvedValue(Response.json({ code: "permission_not_granted" }, { status: 403 }));

    const response = await getWorkspace(new Request("https://ai-pdm.test/api/settings/access/role-capabilities"));

    expect(response.status).toBe(403);
    expect(mocks.workspace).not.toHaveBeenCalled();
    expect(mocks.privilegedWorkspace).not.toHaveBeenCalled();
  });

  it("reads the role workspace after the admin-matrix grant", async () => {
    mocks.authorize.mockResolvedValue({ principalId: "principal-one", profileId: "profile-one",
      company: { companyId: "company-one" } });
    mocks.workspace.mockResolvedValue({ dataState: "ready", roles: [] });

    const response = await getWorkspace(new Request("https://ai-pdm.test/api/settings/access/role-capabilities"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.workspace).toHaveBeenCalledTimes(1);
    expect(mocks.authorize).toHaveBeenCalledWith(expect.any(Request),
      "src/app/api/settings/access/role-capabilities/route.ts", "settings.admin_matrix");
  });

  it("keeps command receipts private until the same principal grant succeeds", async () => {
    const receiptRequest = new Request("https://ai-pdm.test/api/settings/access/role-capabilities/commands/command-one");
    const context = { params: Promise.resolve({ commandId: "command-one" }) };
    mocks.authorize.mockResolvedValueOnce(Response.json({ code: "permission_not_granted" }, { status: 403 }));

    const denied = await getCommandReceipt(receiptRequest, context);

    expect(denied.status).toBe(403);
    expect(mocks.commandReceipt).not.toHaveBeenCalled();

    mocks.authorize.mockResolvedValueOnce({ principalId: "principal-one", profileId: "profile-one",
      company: { companyId: "company-one" } });
    mocks.commandReceipt.mockResolvedValueOnce({ commandId: "command-one", status: "completed" });

    const allowed = await getCommandReceipt(receiptRequest, context);

    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect(mocks.commandReceipt).toHaveBeenCalledWith("command-one");
    expect(mocks.authorize).toHaveBeenLastCalledWith(expect.any(Request),
      "src/app/api/settings/access/role-capabilities/commands/[commandId]/route.ts",
      "settings.admin_matrix");
  });
});
