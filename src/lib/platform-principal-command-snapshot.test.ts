import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { createPdmCommand, createPlatformActorContext } from "@/lib/platform-command";

const mocks = vi.hoisted(() => ({
  withRequest: vi.fn(),
  evaluate: vi.fn(),
  requireActive: vi.fn(),
  findOrganization: vi.fn(),
  findCompleted: vi.fn(),
  claim: vi.fn(),
  enqueue: vi.fn(),
  complete: vi.fn()
}));

vi.mock("@/lib/jenfu-principal-request-guard", () => ({
  withVerifiedJenfuPrincipalRequest: mocks.withRequest
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluatePrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountRepository: class {
    requireActive = mocks.requireActive;
  }
}));
vi.mock("@/lib/repositories/platform-mapping-async-repository", () => ({
  PlatformMappingAsyncRepository: class {
    findCurrentOrganization = mocks.findOrganization;
  }
}));
vi.mock("@/lib/repositories/platform-outbox-async-repository", () => ({
  PlatformOutboxAsyncRepository: class {
    findCompletedCommand = mocks.findCompleted;
    claimCommand = mocks.claim;
    enqueue = mocks.enqueue;
    completeCommand = mocks.complete;
  }
}));

import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";

const principalId = "principal-one";
const pdmUserId = "pdm-user-one";
const companyId = "company-one";
const verified = {
  profile: { pdmUserId, companyId },
  session: {
    contractVersion: "jenfu.ai-pdm-session.v2" as const, appId: "ai-pdm" as const,
    sessionId: "session-one", identityIssuer: "issuer", identitySubject: "subject",
    principalId, employeeId: "employee-one", authEpoch: 1,
    issuedAt: "2026-09-24T00:00:00.000Z", expiresAt: "2026-09-25T00:00:00.000Z",
    assuranceLevel: "aal2" as const
  }
};
const token = `${Buffer.from(JSON.stringify({ type: "JENFU-AI-PDM-PRINCIPAL", version: 2 }))
  .toString("base64url")}.payload.signature`;
const route = { request: new Request("https://ai-pdm.test/api/admin/accounts/pdm-user-one/lifecycle", {
  method: "POST", headers: { cookie: `pdm_session=${token}` }
}), routePath: "src/app/api/admin/accounts/[userId]/lifecycle/route.ts",
  method: "POST", permissionCode: "accounts.lifecycle.manage" };

function command(overridePrincipalId = principalId) {
  return createPdmCommand({ commandName: "pdm.test.principal-mutation",
    idempotencyKey: "operation-one",
    actor: createPlatformActorContext({ pdmUserId, organizationId: companyId,
      principalId: overridePrincipalId,
      authorizationActor: {
        identityIssuer: "issuer", identitySubject: "subject", principalId: overridePrincipalId,
        employeeId: "employee-one", localPrincipalId: pdmUserId, companyId,
        sessionSchemaVersion: 2
      } }), payload: { value: 1 } });
}

function client(isolation = "repeatable read") {
  return { kind: "postgres", queryOne: vi.fn(async (sql: string) => {
    if (sql.includes("current_setting('transaction_isolation')")) return { isolation_level: isolation };
    if (sql.includes("read_principal_cutover_for_command_v1")) return {
      status: "principal_active", principal_id: principalId
    };
    return null;
  }), execute: vi.fn(), query: vi.fn() } as unknown as AsyncDatabaseClient;
}

function input(database: AsyncDatabaseClient,
  mutate: (snapshot: AsyncDatabaseClient) => Promise<{ ok: boolean }> = async () => ({ ok: true })) {
  return { client: database, command: command(), execute: mutate,
    event: () => ({ aggregateType: "test", aggregateId: "one", eventType: "changed", payload: {} }),
    principalRequest: { token, keyRing: {} as never,
      identityIssuer: "issuer", trustPolicy: {} as never, database },
    principalAuthorization: route };
}

describe("principal command and mutation use one verified snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withRequest.mockImplementation(async (_input, run, options) => {
      expect(options).toEqual({ readOnly: false, isolationLevel: "repeatable_read" });
      return run(_input.database, verified);
    });
    mocks.evaluate.mockResolvedValue([{ allowed: true }]);
    mocks.requireActive.mockResolvedValue({ principalId, pdmUserId, companyId });
    mocks.findOrganization.mockResolvedValue({ mappingStatus: "active",
      platformOrganizationId: "organization-one" });
    mocks.findCompleted.mockResolvedValue({ completed: false });
    mocks.claim.mockResolvedValue(true);
  });

  it("rechecks route permission, cutover and actor in the write snapshot before the command", async () => {
    const database = client();
    const mutate = vi.fn(async (snapshot: AsyncDatabaseClient) => {
      expect(snapshot).toBe(database);
      expect(mocks.evaluate).toHaveBeenCalledWith(database, verified,
        [{ permissionKind: "action", permissionCode: route.permissionCode }]);
      expect(mocks.requireActive).toHaveBeenCalledWith(principalId);
      return { ok: true };
    });
    await expect(executePdmCommandWithOutbox(input(database, mutate))).resolves.toEqual({
      result: { ok: true }, reusedFromCommandReceipt: false
    });
    expect(mutate).toHaveBeenCalledOnce();
    expect(mocks.complete).toHaveBeenCalledOnce();
    expect(mocks.findOrganization).not.toHaveBeenCalled();
    expect(mocks.claim.mock.calls[0][0].actor.platformOrganizationId).toBeNull();
  });

  it("never sends a v2 principal command through a legacy-compatible mapping", async () => {
    const database = client();
    vi.mocked(database.queryOne).mockImplementation(async (sql: string) => {
      if (sql.includes("current_setting('transaction_isolation')")) return { isolation_level: "repeatable read" };
      if (sql.includes("read_principal_cutover_for_command_v1")) return {
        status: "legacy_compatible", principal_id: null
      };
      return null;
    });
    const mutate = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox(input(database, mutate)))
      .rejects.toThrow("PLATFORM_PRINCIPAL_NOT_ACTIVE");
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.findOrganization).not.toHaveBeenCalled();
  });

  it("does not repeat a completed command whose result is null", async () => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.findCompleted.mockResolvedValue({ completed: true, result: null });
    await expect(executePdmCommandWithOutbox(input(database, mutate))).resolves.toEqual({
      result: null, reusedFromCommandReceipt: true
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it.each([
    ["permission denied", "repeatable read", false, route, "PLATFORM_PRINCIPAL_COMMAND_PERMISSION_DENIED"],
    ["read committed", "read committed", true, route, "PLATFORM_PRINCIPAL_COMMAND_SNAPSHOT_REQUIRED"],
    ["wrong route permission", "repeatable read", true,
      { ...route, permissionCode: "numbering.create" }, "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID"],
    ["read route used for a mutation", "repeatable read", true,
      { request: new Request("https://ai-pdm.test/api/admin/account-invitations", {
          headers: { cookie: `pdm_session=${token}` }
        }), routePath: "src/app/api/admin/account-invitations/route.ts", method: "GET",
        permissionCode: "accounts.invitation.manage" }, "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID"]
  ])("rejects %s without mutating", async (_case, isolation, allowed, authorization, failure) => {
    const database = client(isolation);
    const mutate = vi.fn(async () => ({ ok: true }));
    mocks.evaluate.mockResolvedValue([{ allowed }]);
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      principalAuthorization: authorization })).rejects.toThrow(failure);
    expect(mutate).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("rejects a principal request attached to a legacy actor before selecting a writer", async () => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    const legacyActor = createPlatformActorContext({ pdmUserId, organizationId: companyId,
      principalId, authorizationActor: {
        identityIssuer: "issuer", identitySubject: "subject", principalId,
        employeeId: "employee-one", localPrincipalId: pdmUserId, companyId
      } });
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      command: createPdmCommand({ commandName: "pdm.test.principal-mutation",
        idempotencyKey: "operation-one", actor: legacyActor, payload: { value: 1 } })
    })).rejects.toThrow("PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mocks.withRequest).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([
    ["another route", new Request("https://ai-pdm.test/api/admin/accounts/other", {
      method: "POST", headers: { cookie: `pdm_session=${token}` }
    })],
    ["another cookie", new Request("https://ai-pdm.test/api/admin/accounts/pdm-user-one/lifecycle", {
      method: "POST", headers: { cookie: "pdm_session=other" }
    })]
  ])("rejects a command context from %s", async (_case, request) => {
    const database = client();
    const mutate = vi.fn(async () => ({ ok: true }));
    await expect(executePdmCommandWithOutbox({ ...input(database, mutate),
      principalAuthorization: { ...route, request } })).rejects.toThrow(
      "PLATFORM_PRINCIPAL_COMMAND_CONTEXT_INVALID");
    expect(mutate).not.toHaveBeenCalled();
  });
});
