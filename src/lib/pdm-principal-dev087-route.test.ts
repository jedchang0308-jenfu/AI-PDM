import { beforeEach, describe, expect, it, vi } from "vitest";
import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";

const mocks = vi.hoisted(() => ({ withVerified: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-http", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-http")>(),
  principalRequestInput: (token: string) => ({ token })
}));
vi.mock("@/lib/jenfu-principal-request-guard", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/jenfu-principal-request-guard")>(),
  withVerifiedJenfuPrincipalRequest: mocks.withVerified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));

import { withPrincipalDev087Route } from "@/lib/pdm-principal-dev087-route";

const tx = { kind: "postgres", transactionScope: "postgres" };
const verified = { session: { principalId: "principal-one" },
  profile: { pdmUserId: "profile-one", companyId: "company-one" } };
const request = new Request("https://pdm.example/api/pdm/part-change-works/work-one", {
  method: "PATCH"
});
const input = {
  path: "src/app/api/pdm/part-change-works/[workId]/route.ts",
  method: "PATCH" as const,
  permissionCode: "numbering.workspace.update", readOnly: false
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withVerified.mockImplementation(async (_input, evaluate) => evaluate(tx, verified));
  mocks.evaluate.mockResolvedValue([{ allowed: true, decisionCode: "allowed",
    principalId: "principal-one", permissionCode: "numbering.workspace.update" }]);
});

describe("principal DEV-087 route boundary", () => {
  it("uses the reviewed policy and one serializable principal snapshot for mutation", async () => {
    const execute = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    const response = await withPrincipalDev087Route(request, "v2-token", input, execute);
    expect(response.status).toBe(200);
    expect(mocks.withVerified).toHaveBeenCalledWith({ token: "v2-token" },
      expect.any(Function), { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(tx, verified,
      [{ permissionKind: "action", permissionCode: "numbering.workspace.update" }]);
    expect(execute).toHaveBeenCalledWith(tx, verified);
  });

  it("does not execute a command when authority denies the exact capability", async () => {
    mocks.evaluate.mockResolvedValueOnce([{
      allowed: false, decisionCode: "permission_not_granted",
      principalId: "principal-one", permissionCode: "numbering.workspace.update"
    }]);
    const execute = vi.fn();
    const response = await withPrincipalDev087Route(request, "v2-token", input, execute);
    expect(response.status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it("fails closed when a grant belongs to another principal or capability", async () => {
    const execute = vi.fn();
    for (const mismatch of [
      { principalId: "principal-other", permissionCode: input.permissionCode },
      { principalId: "principal-one", permissionCode: "numbering.workspace.create" }
    ]) {
      mocks.evaluate.mockResolvedValueOnce([{ allowed: true,
        decisionCode: "allowed", ...mismatch }]);
      const response = await withPrincipalDev087Route(request, "v2-token", input, execute);
      expect(response.status).toBe(503);
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("maps typed published-grant denial to 403 and keeps authority read failure at 503", async () => {
    const execute = vi.fn();
    mocks.evaluate.mockRejectedValueOnce(
      new JenfuEntitlementRepositoryError("permission_not_granted"));
    const denied = await withPrincipalDev087Route(request, "v2-token", input, execute);
    expect(denied.status).toBe(403);
    await expect(denied.json()).resolves.toEqual({ error: "permission_not_granted" });
    expect(execute).not.toHaveBeenCalled();

    mocks.evaluate.mockRejectedValueOnce(
      new JenfuEntitlementRepositoryError("entitlement_authority_unavailable"));
    const unavailable = await withPrincipalDev087Route(request, "v2-token", input, execute);
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ error: "entitlement_authority_unavailable" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rolls back a write callback that returns an error after a mutation", async () => {
    let committed = false;
    mocks.withVerified.mockImplementationOnce(async (_input, evaluate) => {
      const result = await evaluate(tx, verified);
      committed = true;
      return result;
    });
    const execute = vi.fn().mockResolvedValue(Response.json({ code: "invalid_command" },
      { status: 422 }));
    const response = await withPrincipalDev087Route(request, "v2-token", input, execute);
    expect(response.status).toBe(422);
    expect(execute).toHaveBeenCalledOnce();
    expect(committed).toBe(false);
  });

  it("fails closed when the route does not have the asserted permission policy", async () => {
    const execute = vi.fn();
    const response = await withPrincipalDev087Route(request, "v2-token",
      { ...input, permissionCode: "submission.create" }, execute);
    expect(response.status).toBe(503);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a claimed route that differs from the actual URL or method", async () => {
    const execute = vi.fn();
    const wrongPath = await withPrincipalDev087Route(new Request(
      "https://pdm.example/api/pdm/drawing-revision-works/work-one", { method: "PATCH" }),
    "v2-token", input, execute);
    expect(wrongPath.status).toBe(503);
    const wrongMethod = await withPrincipalDev087Route(new Request(request.url,
      { method: "GET" }), "v2-token", input, execute);
    expect(wrongMethod.status).toBe(503);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a mutation misdeclared as a read-only snapshot", async () => {
    const execute = vi.fn();
    const response = await withPrincipalDev087Route(request, "v2-token",
      { ...input, readOnly: true }, execute);
    expect(response.status).toBe(503);
    expect(mocks.withVerified).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
