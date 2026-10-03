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

import { JenfuEntitlementRepositoryError } from "@/lib/repositories/jenfu-entitlement-repository";
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

  it("checks current permission before one native receipt/CAS command in a serializable transaction", async () => {
    expect(await provisionPrincipalAccount({ body } as never)).toEqual(result);
    expect(mocks.verified).toHaveBeenCalledWith(expect.anything(), expect.any(Function),
      { readOnly: false, isolationLevel: "serializable" });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, actor,
      [{ permissionKind: "action", permissionCode: "accounts.invitation.manage" }]);
    expect(mocks.candidates).not.toHaveBeenCalled();
    const [sql, params] = snapshot.queryOne.mock.calls[0];
    expect(sql).toContain("ai_pdm_core.provision_principal_account_v1");
    expect(params.actorPrincipalId).toBe("principal-admin");
    expect(params.actorIssuer).toBe("issuer-admin");
    expect(JSON.parse(params.requestJson)).toMatchObject({
      companyId: "company-jenfu", principalRef: candidate, accountEnabled: false
    });
    expect(JSON.parse(params.requestJson)).not.toHaveProperty("role");
  });

  it("denies absent capability before the owner command", async () => {
    mocks.evaluate.mockResolvedValue([{ allowed: false }]);
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "permission_not_granted", httpStatus: 403 });
    expect(snapshot.queryOne).not.toHaveBeenCalled();
  });

  it("preserves native exact source-CAS denial", async () => {
    snapshot.queryOne.mockRejectedValueOnce(new Error("AIPDM_PROVISION_SOURCE_DRIFT"));
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code: "source_drift", httpStatus: 409 });
    expect(snapshot.queryOne).toHaveBeenCalledTimes(1);
    expect(mocks.candidates).not.toHaveBeenCalled();
  });

  it("retains all six published microsecond digits in the native CAS payload", async () => {
    const precise = { ...candidate, publishedAt: "2026-09-25T01:23:45.891123Z" };
    expect(await provisionPrincipalAccount({ body: { ...body, principalRef: precise } } as never))
      .toEqual(result);
    expect(snapshot.queryOne).toHaveBeenCalledTimes(1);
    expect(JSON.parse(snapshot.queryOne.mock.calls[0][1].requestJson)).toMatchObject({
      principalRef: precise, accountEnabled: false
    });
  });

  it("lets the native owner replay a frozen operation after its producer publication changes", async () => {
    mocks.candidates.mockResolvedValue([{
      ...candidate, mappingVersion: 8, publishedAt: "2026-09-25T01:23:45.000001Z"
    }]);
    snapshot.queryOne.mockResolvedValueOnce({ receipt: { ...result, replayed: true } });
    expect(await provisionPrincipalAccount({ body } as never)).toEqual({ ...result, replayed: true });
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(JSON.parse(snapshot.queryOne.mock.calls[0][1].requestJson)).toMatchObject({
      principalRef: candidate, operationId: body.operationId
    });
  });

  it.each([
    ["AIPDM_PROVISION_PERMISSION_DENIED", "permission_not_granted", 403],
    ["AIPDM_PROVISION_ACTOR_INVALID", "permission_not_granted", 403],
    ["AIPDM_PROVISION_OPERATION_CONFLICT", "operation_conflict", 409]
  ])("preserves owner authority and frozen-operation failure %s", async (message, code, httpStatus) => {
    snapshot.queryOne.mockRejectedValueOnce(new Error(String(message)));
    await expect(provisionPrincipalAccount({ body } as never))
      .rejects.toMatchObject({ code, httpStatus });
  });

  it.each(["entitlement_assignment_not_found", "entitlement_contract_mismatch", "entitlement_authority_unavailable"] as const)
  ("preserves typed producer failure %s before mutation", async (code) => {
    const failure = new JenfuEntitlementRepositoryError(code);
    mocks.evaluate.mockRejectedValueOnce(failure);
    await expect(provisionPrincipalAccount({ body } as never)).rejects.toBe(failure);
    expect(mocks.candidates).not.toHaveBeenCalled();
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
