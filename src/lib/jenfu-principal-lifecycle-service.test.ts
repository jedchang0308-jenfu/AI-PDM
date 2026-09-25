import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verified: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.verified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));

import { updatePrincipalAccountLifecycle } from "@/lib/jenfu-principal-lifecycle-service";

const body = { operationId: "lifecycle-one", action: "suspend", reason: "operator review" };
const receipt = { operationId: "lifecycle-one", principalId: "principal-target",
  pdmUserId: "pdm-target", accountStatus: "suspended", lifecycleVersion: 2,
  reason: "operator review", committedAt: "2026-09-25T01:23:45.000Z", replayed: false,
  current: { accountStatus: "suspended", lifecycleVersion: 2 } };

describe("principal account lifecycle service", () => {
  const snapshot = { kind: "postgres", queryOne: vi.fn() };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verified.mockImplementation(async (_input, evaluate) => evaluate(snapshot, {
      profile: { companyId: "company-jenfu" }, session: {
        principalId: "principal-admin", identityIssuer: "issuer-admin",
        identitySubject: "subject-admin", sessionId: "session-admin-1234567890"
      }
    }));
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    snapshot.queryOne.mockResolvedValue({ receipt });
  });

  it("uses a verified principal and current lifecycle permission in one serializable transaction", async () => {
    expect(await updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target", body } as never)).toEqual(receipt);
    expect(mocks.verified).toHaveBeenCalledWith(expect.anything(), expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, expect.anything(),
      [{ permissionKind: "action", permissionCode: "accounts.lifecycle.manage" }]);
    const [sql, params] = snapshot.queryOne.mock.calls[0];
    expect(sql).toContain("ai_pdm_core.update_principal_account_lifecycle_v1");
    expect(params).toMatchObject({ operationId: "lifecycle-one", pdmUserId: "pdm-target",
      companyId: "company-jenfu", actorPrincipalId: "principal-admin" });
    expect(params).not.toHaveProperty("role");
  });

  it("rejects missing capability and an unbound owner receipt", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    await expect(updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "permission_not_granted", httpStatus: 403 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    snapshot.queryOne.mockResolvedValue({ receipt: { ...receipt, pdmUserId: "other" } });
    await expect(updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "principal_lifecycle_unavailable", httpStatus: 503 });
    snapshot.queryOne.mockResolvedValue({ receipt: { ...receipt, reason: "forged reason" } });
    await expect(updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "principal_lifecycle_unavailable", httpStatus: 503 });
    snapshot.queryOne.mockResolvedValue({ receipt: { ...receipt, committedAt: "not-a-date" } });
    await expect(updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "principal_lifecycle_unavailable", httpStatus: 503 });
  });

  it("does not accept a caller-supplied actor, role or changed operation payload", async () => {
    await expect(updatePrincipalAccountLifecycle({ pdmUserId: "pdm-target",
      body: { ...body, actorId: "principal-admin" } } as never))
      .rejects.toMatchObject({ code: "invalid_request", httpStatus: 400 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
  });
});
