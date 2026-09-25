import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verified: vi.fn(), evaluate: vi.fn(), candidates: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.verified
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-principal-candidate-repository", () => ({
  JenfuPrincipalCandidateRepository: class { listByPrincipal = mocks.candidates; }
}));

import { provisionPrincipalAccount } from "@/lib/jenfu-principal-provision-service";

const candidate = {
  principalId: "principal-target", identityIssuer: "issuer-target", identitySubject: "subject-target",
  employeeId: "employee-target", accountType: "human_personal" as const,
  mappingVersion: 7, publishedAt: "2026-09-25T01:23:45.000Z"
};
const body = { contractVersion: "ai-pdm.principal-provision.v1", operationId: "operation-123",
  principalRef: candidate, displayName: "New profile", contactEmail: null };
const result = { operationId: "operation-123", principalId: "principal-target",
  pdmUserId: "user-new", committedAt: "2026-09-25T01:24:00.000Z", replayed: false,
  current: { accountStatus: "suspended", lifecycleVersion: 1, profileVersion: 1 } };

describe("principal-only account owner service", () => {
  const snapshot = { kind: "postgres", queryOne: vi.fn() };
  const actor = { profile: { companyId: "company-jenfu" }, session: {
    principalId: "principal-admin", identityIssuer: "issuer-admin",
    identitySubject: "subject-admin", sessionId: "session-id-1234567890"
  } };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verified.mockImplementation(async (_input, callback) => callback(snapshot, actor));
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.candidates.mockResolvedValue([candidate]);
    snapshot.queryOne.mockResolvedValue({ receipt: result });
  });

  it("checks exact permission and producer tuple before one owner command in a serializable transaction", async () => {
    expect(await provisionPrincipalAccount({ body } as never)).toEqual(result);
    expect(mocks.verified).toHaveBeenCalledWith(expect.anything(), expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, actor,
      [{ permissionKind: "action", permissionCode: "accounts.invitation.manage" }]);
    expect(mocks.candidates).toHaveBeenCalledWith("principal-target");
    const [sql, params] = snapshot.queryOne.mock.calls[0];
    expect(sql).toContain("ai_pdm_core.provision_principal_account_v1");
    expect(params.actorPrincipalId).toBe("principal-admin");
    expect(params.actorIssuer).toBe("issuer-admin");
    expect(JSON.parse(params.requestJson)).toMatchObject({
      companyId: "company-jenfu", principalRef: candidate, accountEnabled: false
    });
    expect(JSON.parse(params.requestJson)).not.toHaveProperty("role");
  });

  it("denies absent capability or changed published source before owner mutation", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "permission_not_granted", httpStatus: 403 });
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.candidates.mockResolvedValue([{ ...candidate, mappingVersion: 8 }]);
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "source_drift", httpStatus: 409 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
  });

  it("rejects attempts to supply a legacy identity or role", async () => {
    await expect(provisionPrincipalAccount({ body: { ...body, role: "Admin" } } as never))
      .rejects.toMatchObject({ code: "invalid_request", httpStatus: 400 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
  });

  it("fails closed if the owner receipt does not match the requested operation and principal", async () => {
    snapshot.queryOne.mockResolvedValueOnce({ receipt: { ...result, principalId: "principal-other" } });
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "principal_provision_unavailable", httpStatus: 503 });
    snapshot.queryOne.mockResolvedValueOnce({ receipt: { ...result, operationId: "operation-other" } });
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "principal_provision_unavailable", httpStatus: 503 });
  });

  it("retries a concurrent unique collision only with a fresh verified transaction", async () => {
    const collision = Object.assign(new Error("duplicate key"), { code: "23505" });
    snapshot.queryOne.mockRejectedValueOnce(collision).mockResolvedValueOnce({ receipt: { ...result, replayed: true } });
    await expect(provisionPrincipalAccount({ body } as never))
      .resolves.toMatchObject({ replayed: true, operationId: "operation-123" });
    expect(mocks.verified).toHaveBeenCalledTimes(2);
    expect(mocks.evaluate).toHaveBeenCalledTimes(2);
  });
});
