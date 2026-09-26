import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verified: vi.fn(), evaluate: vi.fn() }));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.verified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));

import { revokePrincipalAccountSessions } from "@/lib/jenfu-principal-admin-session-revoke";

const body = { operationId: "revoke-target-one", reason: "security review" };
const receipt = { operationId: body.operationId, principalId: "principal-target",
  pdmUserId: "pdm-target", accountStatus: "active", lifecycleVersion: 3,
  reason: body.reason, committedAt: "2026-09-26T01:23:45.000Z", replayed: false,
  current: { accountStatus: "active", lifecycleVersion: 3 } };

describe("principal admin session revocation", () => {
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

  it("requires the dedicated capability and invokes the owner command in a serializable snapshot", async () => {
    expect(await revokePrincipalAccountSessions({ pdmUserId: "pdm-target", body } as never)).toEqual(receipt);
    expect(mocks.verified).toHaveBeenCalledWith(expect.anything(), expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, expect.anything(),
      [{ permissionKind: "action", permissionCode: "accounts.session.revoke" }]);
    const [sql, params] = snapshot.queryOne.mock.calls[0];
    expect(sql).toContain("ai_pdm_core.revoke_principal_account_sessions_v1");
    expect(params).toMatchObject({ ...body, pdmUserId: "pdm-target",
      actorPrincipalId: "principal-admin", companyId: "company-jenfu" });
    expect(params).not.toHaveProperty("role");
  });

  it("rejects denied capability, forged actor and mismatched owner receipt", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    await expect(revokePrincipalAccountSessions({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "permission_not_granted", httpStatus: 403 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    await expect(revokePrincipalAccountSessions({ pdmUserId: "pdm-target",
      body: { ...body, actorId: "principal-admin" } } as never))
      .rejects.toMatchObject({ code: "invalid_request", httpStatus: 400 });
    snapshot.queryOne.mockResolvedValue({ receipt: { ...receipt, pdmUserId: "other" } });
    await expect(revokePrincipalAccountSessions({ pdmUserId: "pdm-target", body } as never))
      .rejects.toMatchObject({ code: "principal_session_revoke_unavailable", httpStatus: 503 });
  });
});
