import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

const mocks = vi.hoisted(() => ({
  priority: vi.fn(), entitlement: vi.fn(), localAcl: vi.fn(), catalog: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-role-catalog", () => ({
  requirePublishedPrincipalCatalog: mocks.catalog
}));
vi.mock("@/lib/repositories/access-control-async-repository", () => ({
  AsyncAccessControlRepository: class { getEnforcedRolePriority = mocks.priority; }
}));
vi.mock("@/lib/repositories/jenfu-entitlement-repository", () => ({
  JenfuEntitlementRepository: class { evaluatePermissions = mocks.entitlement; },
  JenfuEntitlementRepositoryError: class extends Error {
    constructor(readonly code: string) { super(code); }
  }
}));
vi.mock("@/lib/repositories/principal-local-acl-repository", () => ({
  PrincipalLocalAclRepository: class { evaluateWorkspace = mocks.localAcl; }
}));

import { selectPrincipalReviewerInSnapshot } from
  "@/lib/repositories/pdm-principal-reviewer-selector";
import { JenfuEntitlementRepositoryError } from
  "@/lib/repositories/jenfu-entitlement-repository";

const candidate = (principalId: string, profileId: string, subject = `${principalId}-subject`) => ({
  principal_id: principalId, pdm_user_id: profileId, employee_id: `${principalId}-employee`,
  identity_issuer: "issuer", identity_subject: subject
});
function client(rows: ReturnType<typeof candidate>[], isolation = "repeatable read") {
  return { kind: "postgres", transactionScope: "postgres",
    queryOne: vi.fn(async () => ({ isolation_level: isolation,
      decision_at: "2026-09-25T00:00:00.000Z" })),
    query: vi.fn(async () => rows)
  } as unknown as AsyncDatabaseClient;
}
const input = { companyId: "company-jenfu", ownerUserId: "owner-profile" };

describe("principal reviewer selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({ roles: [] });
    mocks.priority.mockResolvedValue(["rd_manager", "pdm_admin"]);
    mocks.entitlement.mockImplementation(async ([request]) => [{
      decisionCode: "allowed", role: { roleCode:
        request.actor.principalId === "principal-manager" ? "rd_manager" : "pdm_admin" }
    }]);
    mocks.localAcl.mockResolvedValue([{ allowed: true, roleCode: "rd_manager" }]);
  });

  it("uses current principal account, cutover and typed producer candidates in the caller snapshot", async () => {
    const snapshot = client([
      candidate("principal-admin", "profile-admin"),
      candidate("principal-manager", "profile-manager")
    ]);
    await expect(selectPrincipalReviewerInSnapshot(snapshot, input))
      .resolves.toBe("profile-manager");
    expect(mocks.priority).toHaveBeenCalledWith(["rd_manager", "pdm_admin"]);
    expect(mocks.catalog).toHaveBeenCalledWith(snapshot);
    expect(snapshot.query).toHaveBeenCalledWith(expect.stringContaining(
      "JOIN orgmaster_contract.v_active_principal_accounts_v1 typed"),
    { companyId: input.companyId });
    const sql = vi.mocked(snapshot.query).mock.calls[0][0];
    expect(sql).toContain("cutover.status = 'principal_active'");
    expect(sql).toContain("account.account_status = 'active'");
    expect(sql).not.toContain("users.role");
  });

  it("uses principal-keyed local ACL only for selected legacy authority", async () => {
    mocks.entitlement.mockResolvedValue([{ decisionCode: "legacy_authority" }]);
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-manager", "profile-manager")
    ]), input)).resolves.toBe("profile-manager");
    expect(mocks.localAcl).toHaveBeenCalledWith(expect.objectContaining({
      principalId: "principal-manager", assuranceLevel: "aal2",
      permissions: [{ permissionKind: "action", permissionCode: "approval.request.decide" }]
    }));
  });

  it("does not choose a reviewer when the published v4 catalog is unavailable", async () => {
    mocks.catalog.mockRejectedValue(new Error("principal_dependency_unavailable"));
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-manager", "profile-manager")
    ]), input)).rejects.toThrow("principal_dependency_unavailable");
    expect(mocks.entitlement).not.toHaveBeenCalled();
    expect(mocks.localAcl).not.toHaveBeenCalled();
  });

  it("prefers a different eligible reviewer when role priority is equal", async () => {
    mocks.entitlement.mockResolvedValue([{ decisionCode: "allowed",
      role: { roleCode: "rd_manager" } }]);
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-owner", "owner-profile"),
      candidate("principal-peer", "peer-profile")
    ]), input)).resolves.toBe("peer-profile");
  });

  it("does not nominate an explicitly denied candidate", async () => {
    mocks.entitlement.mockResolvedValue([{ decisionCode: "permission_explicit_deny" }]);
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-manager", "profile-manager")
    ]), input)).rejects.toMatchObject({ status: 409 });
  });

  it("skips a candidate without published authority while retaining a proved peer", async () => {
    mocks.entitlement.mockImplementation(async ([request]) => {
      if (request.actor.principalId === "principal-unknown") {
        throw new JenfuEntitlementRepositoryError("entitlement_authority_unknown");
      }
      return [{ decisionCode: "allowed", role: { roleCode: "rd_manager" } }];
    });
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-unknown", "profile-unknown"),
      candidate("principal-manager", "profile-manager")
    ]), input)).resolves.toBe("profile-manager");
  });

  it("evaluates reviewer eligibility once per principal across aliases", async () => {
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-one", "profile-one", "first"),
      candidate("principal-one", "profile-one", "second")
    ]), input)).resolves.toBe("profile-one");
    expect(mocks.entitlement).toHaveBeenCalledTimes(1);
  });

  it("propagates grant drift reported by the principal-keyed entitlement reader", async () => {
    mocks.entitlement.mockRejectedValue(new JenfuEntitlementRepositoryError("entitlement_contract_mismatch"));
    await expect(selectPrincipalReviewerInSnapshot(client([
      candidate("principal-one", "profile-one", "first"),
      candidate("principal-one", "profile-one", "second")
    ]), input)).rejects.toMatchObject({ code: "entitlement_contract_mismatch" });
  });

  it("fails closed on an unproved snapshot or no eligible principal", async () => {
    const poolFacade = client([]) as AsyncDatabaseClient & { transactionScope?: "postgres" };
    delete poolFacade.transactionScope;
    await expect(selectPrincipalReviewerInSnapshot(poolFacade, input))
      .rejects.toThrow("PRINCIPAL_REVIEWER_SNAPSHOT_REQUIRED");
    await expect(selectPrincipalReviewerInSnapshot(client([], "read committed"), input))
      .rejects.toThrow("PRINCIPAL_REVIEWER_SNAPSHOT_REQUIRED");
    await expect(selectPrincipalReviewerInSnapshot(client([]), input))
      .rejects.toMatchObject({ status: 409 });
  });
});
