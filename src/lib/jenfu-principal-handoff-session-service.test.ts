import { beforeEach, describe, expect, it, vi } from "vitest";
import vectors from "../../contracts/jenfu-sso-handoff/v2/conformance-vectors.json";
import { parseJenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const mocks = vi.hoisted(() => ({
  typed: vi.fn(), state: vi.fn(), account: vi.fn(), authority: vi.fn(),
  assignments: vi.fn(), register: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-admission-repository", () => ({
  JenfuPrincipalAdmissionRepository: class { requireActiveTypedPrincipal = mocks.typed; }
}));
vi.mock("@/lib/jenfu-auth-epoch-repository", () => ({
  JenfuAuthEpochRepository: class { readCanonicalPrincipalState = mocks.state; }
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountRepository: class { requireActive = mocks.account; }
}));
vi.mock("@/lib/repositories/jenfu-entitlement-repository", () => ({
  JenfuEntitlementRepository: class {
    resolveAuthority = mocks.authority;
    listEffectiveAssignments = mocks.assignments;
  }
}));
vi.mock("@/lib/jenfu-principal-session-registry", () => ({
  JenfuPrincipalSessionRegistry: class { register = mocks.register; }
}));

import { issueSessionForPrincipalHandoff } from "@/lib/jenfu-principal-handoff-session-service";

const nowMs = Date.parse(vectors.clock);
const handoff = parseJenfuPrincipalHandoff(vectors.valid, vectors.valid.issuer, nowMs);
const keyRing = { issuer: "ai-pdm-session", audience: "ai-pdm", currentKeyId: "current",
  keys: { current: "k".repeat(48) } };
const trustPolicy = { enabled: true, domains: ["example.test"], allowAal1PrivilegedPilot: false };
function assignment(roleCode: string) { return {
  contractVersion: "jenfu.orgmaster.ai-pdm-principal-grants.v2", applicationId: "ai-pdm",
  assignmentVersionId: "version-one", assignmentVersion: 1, assignmentId: "assignment-one",
  grantKind: "direct", delegationId: null,
  principalId: handoff.identity.principalId, employeeId: handoff.identity.employeeId,
  subjectKind: "employee", targetPrincipalId: null, stableRoleId: `role-${roleCode}`,
  roleCode, catalogVersion: "catalog-one", scopeKind: "workspace",
  scopeKey: "company-one", validFrom: "2026-09-24T00:00:00.000Z", validUntil: null,
  publishedAt: "2026-09-24T00:00:00.000Z", authorityVersion: 1
}; }
const snapshot = { kind: "postgres", execute: vi.fn(async () => undefined),
  query: vi.fn(async () => [{ decision_at: vectors.clock }]),
  queryOne: vi.fn(async (sql: string) => sql.includes("principal_role_assignments")
    ? { privileged: false } : { id: "pdm-user-one", company_id: "company-one" }) };
const transaction = vi.fn(async (fn: (client: typeof snapshot) => Promise<unknown>) => fn(snapshot));
const database = { kind: "postgres", transaction } as never;
const base = { handoff, database, expectedIdentityIssuer: handoff.identity.identityIssuer,
  keyRing, trustPolicy, nowMs };

describe("DEV-121 principal handoff session issuance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.typed.mockResolvedValue({ principalId: "principal-one", employeeId: "employee-one", accountType: "human_personal" });
    mocks.state.mockResolvedValue({ authEpoch: 0, revokedBefore: null });
    mocks.account.mockResolvedValue({ principalId: "principal-one", pdmUserId: "pdm-user-one",
      employeeId: "employee-one", accountType: "human_personal", companyId: "company-one",
      lifecycleVersion: 3, profileVersion: 2, minimumAssurance: "aal1", sessionInvalidBefore: null });
    mocks.authority.mockResolvedValue({ authoritySource: "orgmaster_authority", authorityVersion: 1 });
    mocks.assignments.mockResolvedValue([assignment("rd")]);
    snapshot.queryOne.mockImplementation(async (sql: string) => sql.includes("principal_role_assignments")
      ? { privileged: false } : { id: "pdm-user-one", company_id: "company-one" });
  });

  it("commits one principal-only session after exact producer and profile readback", async () => {
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims).toMatchObject({ principalId: "principal-one", employeeId: "employee-one",
      authEpoch: 0, companyId: "company-one", accountLifecycleVersion: 3, profileVersion: 2 });
    expect(result.claims).not.toHaveProperty("pdmUserId");
    expect(mocks.register).toHaveBeenCalledWith(result.claims);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "repeatable_read" });
    expect(snapshot.queryOne.mock.calls[0][0]).toContain("principal_identity_cutovers");
    expect(snapshot.queryOne.mock.calls[0][0]).toContain("owner.company_id=profile.company_id");
    expect(mocks.assignments).toHaveBeenCalledWith(expect.objectContaining({ principalId: "principal-one" }));
  });

  it("rejects mismatched producer identity or epoch before session registration", async () => {
    mocks.typed.mockResolvedValueOnce({ principalId: "principal-other", employeeId: "employee-one", accountType: "human_personal" });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("STALE_HANDOFF");
    mocks.state.mockResolvedValueOnce({ authEpoch: 1, revokedBefore: null });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("STALE_HANDOFF");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects a proof that expires before the session transaction begins", async () => {
    await expect(issueSessionForPrincipalHandoff({ ...base, nowMs: Date.parse(handoff.expiresAt) }))
      .rejects.toThrow("HANDOFF_EXPIRED");
    expect(transaction).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("requires AAL2 when the selected authority has a privileged role", async () => {
    mocks.assignments.mockResolvedValue([assignment("rd_manager")]);
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims).toMatchObject({ assuranceLevel: "aal2", secondFactor: "google_workspace_mfa" });
    await expect(issueSessionForPrincipalHandoff({ ...base,
      trustPolicy: { ...trustPolicy, enabled: false } })).rejects.toThrow("auth_token_invalid");
  });

  it("rejects a mixed authority-version grant before issuing a session", async () => {
    mocks.assignments.mockResolvedValue([{ ...assignment("rd_manager"), authorityVersion: 2 }]);
    await expect(issueSessionForPrincipalHandoff(base))
      .rejects.toThrow("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("reads principal-local roles for legacy authority and respects the local barrier", async () => {
    mocks.authority.mockResolvedValue({ authoritySource: "legacy_authority" });
    mocks.account.mockResolvedValue({ principalId: "principal-one", pdmUserId: "pdm-user-one",
      employeeId: "employee-one", accountType: "human_personal", companyId: "company-one",
      lifecycleVersion: 3, profileVersion: 2, minimumAssurance: "aal1",
      sessionInvalidBefore: new Date(nowMs - 200).toISOString() });
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims.issuedAt * 1000).toBeGreaterThan(nowMs - 200);
    expect(snapshot.queryOne.mock.calls[1][0]).toContain("principal_role_assignments");
    expect(mocks.assignments).not.toHaveBeenCalled();
  });

  it("does not use a historical profile from another company", async () => {
    snapshot.queryOne.mockResolvedValueOnce({ id: "pdm-user-one", company_id: "other-company" });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("PRINCIPAL_PROFILE_INVALID");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("requires AAL2 for a principal-local privileged role", async () => {
    mocks.authority.mockResolvedValue({ authoritySource: "legacy_authority" });
    snapshot.queryOne.mockImplementation(async (sql: string) => sql.includes("principal_role_assignments")
      ? { privileged: true } : { id: "pdm-user-one", company_id: "company-one" });
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims.assuranceLevel).toBe("aal2");
    expect(mocks.assignments).not.toHaveBeenCalled();
  });
});
