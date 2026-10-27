import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { VerifiedPrincipalRequest } from "@/lib/jenfu-principal-request-guard";

const mocks = vi.hoisted(() => ({
  typed: {} as Record<string, unknown>, account: {} as Record<string, unknown>,
  state: {} as Record<string, unknown>, dynamic: true, allow: true,
  evaluate: vi.fn(), publishedGrants: vi.fn()
}));

vi.mock("@/lib/jenfu-auth-epoch-repository", () => ({
  JenfuAuthEpochRepository: class {
    constructor(_client: unknown) {}
    async readCanonicalPrincipalState() { return mocks.state; }
  }
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountError: class extends Error { constructor(readonly code: string) { super(code); } },
  JenfuPrincipalAccountRepository: class {
    constructor(_client: unknown) {}
    async requireActive() { return mocks.account; }
  }
}));
vi.mock("@/lib/jenfu-principal-admission-repository", () => ({
  JenfuPrincipalAdmissionError: class extends Error { constructor(readonly code: string) { super(code); } },
  JenfuPrincipalAdmissionRepository: class {
    constructor(_client: unknown) {}
    async requireActiveTypedPrincipal() { return mocks.typed; }
  }
}));
vi.mock("@/lib/jenfu-principal-published-grant-validation", () => ({
  validatePrincipalPublishedGrantSnapshot: mocks.publishedGrants
}));
vi.mock("@/lib/jenfu-principal-permission-service", () => ({
  evaluateAdmittedPrincipalWorkspacePermissionsInSnapshot: mocks.evaluate
}));
vi.mock("@/lib/principal-resource-capability", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/principal-resource-capability")>();
  return { ...actual, isDynamicRolePolicyInSnapshot: async () => mocks.dynamic };
});

import { PrincipalJobAuthorityError, parsePrincipalJobInitiator, principalJobInitiatorFromVerifiedRequest,
  requireCurrentPrincipalJobAuthority, type PrincipalJobInitiator } from "@/lib/principal-job-authority";

const initiator: PrincipalJobInitiator = {
  kind: "verified_principal", principalId: "principal-1", employeeId: "employee-1",
  pdmUserId: "profile-1", companyId: "company-1", identityIssuer: "https://issuer.example",
  identitySubject: "subject-1", profileVersion: 3, accountLifecycleVersion: 2, authEpoch: 4,
  authenticatedAt: "2026-10-21T00:00:00.000Z", sessionIssuedAt: "2026-10-21T00:00:00.000Z"
};

const snapshot = {
  kind: "postgres",
  queryOne: vi.fn(async () => ({ id: "profile-1" }))
} as unknown as AsyncDatabaseClient;

function verifiedRequest(): VerifiedPrincipalRequest {
  return {
    profile: { pdmUserId: "profile-1", companyId: "company-1" },
    session: {
      principalId: "principal-1", employeeId: "employee-1", identityIssuer: "https://issuer.example",
      identitySubject: "subject-1", profileVersion: 3, accountLifecycleVersion: 2, authEpoch: 4,
      authenticatedAt: "2026-10-21T00:00:00.000Z", issuedAt: "2026-10-21T00:00:00.000Z"
    } as VerifiedPrincipalRequest["session"]
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.typed = {
    principalId: "principal-1", employeeId: "employee-1", accountType: "human_personal",
    identityIssuer: "https://issuer.example", identitySubject: "subject-1"
  };
  mocks.account = {
    principalId: "principal-1", employeeId: "employee-1", pdmUserId: "profile-1", companyId: "company-1",
    accountType: "human_personal", profileVersion: 3, lifecycleVersion: 2, sessionInvalidBefore: null
  };
  mocks.state = { authEpoch: 4, revokedBefore: null };
  mocks.dynamic = true;
  mocks.allow = true;
  mocks.publishedGrants.mockResolvedValue(undefined);
  mocks.evaluate.mockImplementation(async (_client, _actor, permissions) => permissions.map(
    ({ permissionCode }: { permissionCode: string }) => ({
      permissionCode, principalId: "principal-1", allowed: mocks.allow
    })
  ));
});

describe("durable Principal job authority", () => {
  it("maps only verified session/profile facts into the durable initiator", () => {
    expect(principalJobInitiatorFromVerifiedRequest(verifiedRequest())).toEqual(initiator);
  });

  it("parses PostgreSQL JSONB objects and JSON text, and rejects malformed or extended identities", () => {
    expect(parsePrincipalJobInitiator(initiator)).toEqual(initiator);
    expect(parsePrincipalJobInitiator(JSON.stringify(initiator))).toEqual(initiator);
    expect(parsePrincipalJobInitiator({ ...initiator, principalId: " " })).toBeNull();
    expect(parsePrincipalJobInitiator({ ...initiator, profileVersion: 0 })).toBeNull();
    expect(parsePrincipalJobInitiator({ ...initiator, extra: "caller-authority" })).toBeNull();
    expect(parsePrincipalJobInitiator("{" )).toBeNull();
  });

  it("re-admits current Principal and requires canonical drawing plus model view for CAD 3D", async () => {
    await requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "drawing_revision", documentCategory: "drawing_2d", capabilityRole: "cad_3d"
    });
    expect(mocks.evaluate).toHaveBeenCalledWith(snapshot, expect.objectContaining({
      principalId: "principal-1", localPrincipalId: "profile-1", companyId: "company-1"
    }), [
      { permissionKind: "action", permissionCode: "pdm.drawing.view" },
      { permissionKind: "action", permissionCode: "pdm.model.view" }
    ], { workspaceCode: "company-1" });
    expect(mocks.publishedGrants).toHaveBeenCalledOnce();
  });

  it("uses download when requested by a caller that must deliver an original resource", async () => {
    await requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "drawing_revision", capabilityRole: "cad_3d", action: "download"
    });
    expect(mocks.evaluate.mock.calls.at(-1)?.[2]).toEqual([
      { permissionKind: "action", permissionCode: "pdm.drawing.download" },
      { permissionKind: "action", permissionCode: "pdm.model.download" }
    ]);
  });

  it.each(["pdm.drawing.view", "pdm.drawing.download", "pdm.model.view", "pdm.model.download"])(
    "denies a user-owned parser after the current %s permission is revoked", async deniedPermission => {
      const resource = { linkedEntityType: "drawing_revision", capabilityRole: "cad_3d", action: "view_and_download" } as const;
      await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, resource)).resolves.toBeUndefined();
      expect(mocks.evaluate.mock.calls.at(-1)?.[2]).toEqual([
        { permissionKind: "action", permissionCode: "pdm.drawing.view" },
        { permissionKind: "action", permissionCode: "pdm.drawing.download" },
        { permissionKind: "action", permissionCode: "pdm.model.view" },
        { permissionKind: "action", permissionCode: "pdm.model.download" }
      ]);
      mocks.evaluate.mockImplementation(async (_client, _actor, permissions) => permissions.map(
        ({ permissionCode }: { permissionCode: string }) => ({ permissionCode, principalId: "principal-1", allowed: permissionCode !== deniedPermission })
      ));
      await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, resource)).rejects.toMatchObject({
        code: "PRINCIPAL_JOB_RESOURCE_VIEW_DENIED", status: 403
      });
    }
  );

  it("retains legacy authorization mode without dynamic catalog permissions", async () => {
    mocks.dynamic = false;
    await requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "part_number", documentCategory: "part"
    });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    expect(mocks.publishedGrants).toHaveBeenCalledOnce();
  });

  it.each([
    ["account type mismatch", () => { mocks.typed = { ...mocks.typed, accountType: "human_privileged" }; }],
    ["profile version change", () => { mocks.account = { ...mocks.account, profileVersion: 4 }; }],
    ["auth epoch change", () => { mocks.state = { ...mocks.state, authEpoch: 5 }; }],
    ["session invalidation", () => { mocks.account = { ...mocks.account, sessionInvalidBefore: "2026-10-21T00:00:00.000Z" }; }]
  ])("rejects stale or mismatched initiator: %s", async (_name, mutate) => {
    mutate();
    await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "drawing_revision", documentCategory: "drawing_2d"
    })).rejects.toMatchObject({ code: "PRINCIPAL_JOB_INITIATOR_REVOKED", status: 403 });
  });

  it("rejects revoked view access and unknown canonical resource with the right status", async () => {
    mocks.allow = false;
    await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "drawing_revision", documentCategory: "drawing_2d"
    })).rejects.toBeInstanceOf(PrincipalJobAuthorityError);
    await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "caller_supplied_group"
    })).rejects.toMatchObject({ code: "PRINCIPAL_JOB_RESOURCE_UNAVAILABLE", status: 503 });
  });

  it("preserves dependency failures as unavailable rather than misreporting them as revocation", async () => {
    mocks.evaluate.mockRejectedValue(new Error("catalog database temporarily unavailable"));
    await expect(requireCurrentPrincipalJobAuthority(snapshot, initiator, {
      linkedEntityType: "drawing_revision", documentCategory: "drawing_2d"
    })).rejects.toMatchObject({ code: "PRINCIPAL_JOB_AUTHORITY_UNAVAILABLE", status: 503 });
  });
});
