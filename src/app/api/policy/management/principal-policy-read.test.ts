import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  token: vi.fn(), input: vi.fn(), failure: vi.fn(),
  authMode: vi.fn(), platformMode: vi.fn(), entitlementMode: vi.fn(),
  policy: vi.fn(), verifiedRead: vi.fn(), readFile: vi.fn(), stat: vi.fn()
}));
vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile, stat: mocks.stat
}));
vi.mock("@/lib/auth-config", () => ({
  getAuthMode: mocks.authMode, getJenfuPlatformAuthMode: mocks.platformMode
}));
vi.mock("@/lib/entitlement-config", () => ({ getJenfuEntitlementMode: mocks.entitlementMode }));
vi.mock("@/lib/jenfu-principal-http", () => ({
  principalSessionTokenFromRequest: mocks.token,
  principalRequestInput: mocks.input,
  principalRequestFailure: mocks.failure
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.verifiedRead
}));
vi.mock("@/lib/jenfu-route-permission-map", () => ({ resolveJenfuRoutePolicy: mocks.policy }));

import { GET, PUT } from "./route";
import { JenfuPrincipalRequestError } from "@/lib/jenfu-principal-request-guard";

const request = () => new Request("https://ai-pdm.test/api/policy/management");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.token.mockReturnValue("principal-token");
  mocks.input.mockReturnValue({ token: "principal-token" });
  mocks.failure.mockImplementation(() =>
    Response.json({ code: "auth_session_invalid" }, { status: 401 }));
  mocks.authMode.mockReturnValue("firebase_bff");
  mocks.platformMode.mockReturnValue("on");
  mocks.entitlementMode.mockReturnValue("enforce");
  mocks.policy.mockReturnValue({
    authorizationMode: "authenticated_domain", scopeResolver: "verified session"
  });
  mocks.verifiedRead.mockResolvedValue(true);
  mocks.readFile.mockResolvedValue("# Published policy");
  mocks.stat.mockResolvedValue({ mtime: new Date("2026-09-29T00:00:00.000Z") });
});

describe("source-controlled PDM management policy", () => {
  it("verifies the Principal session before reading the bundled policy", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      content: "# Published policy", canEdit: false,
      sourcePath: ".ai-doc/reference/pdm-management-policy-draft.md"
    });
    expect(mocks.policy).toHaveBeenCalledWith(
      "src/app/api/policy/management/route.ts", "GET", {});
    expect(mocks.verifiedRead).toHaveBeenCalledOnce();
    expect(mocks.readFile).toHaveBeenCalledAfter(mocks.verifiedRead);
  });

  it("rejects absent or invalid Principal session before reading policy bytes", async () => {
    mocks.token.mockReturnValueOnce(null);
    expect((await GET(request())).status).toBe(401);
    mocks.verifiedRead.mockRejectedValueOnce(new JenfuPrincipalRequestError("auth_session_invalid"));
    expect((await GET(request())).status).toBe(401);
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("fails closed when runtime mode or route policy drifts", async () => {
    mocks.platformMode.mockReturnValueOnce("off");
    expect((await GET(request())).status).toBe(503);
    mocks.policy.mockReturnValueOnce(null);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.verifiedRead).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("retires container-local edits with no file mutation", async () => {
    const response = await PUT();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      code: "PDM_POLICY_FILE_EDITOR_RETIRED"
    });
    expect(mocks.verifiedRead).not.toHaveBeenCalled();
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
