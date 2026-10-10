import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vectors from "../../contracts/jenfu-sso-handoff/v2/conformance-vectors.json";
import { parseJenfuPrincipalHandoff } from "@/lib/jenfu-principal-handoff";

const mocks = vi.hoisted(() => ({
  typed: vi.fn(), state: vi.fn(), account: vi.fn(),
  ensureFirstLogin: vi.fn(), assignments: vi.fn(), register: vi.fn()
}));
vi.mock("@/lib/jenfu-principal-admission-repository", () => ({
  JenfuPrincipalAdmissionRepository: class { requireActiveTypedPrincipal = mocks.typed; }
}));
vi.mock("@/lib/jenfu-auth-epoch-repository", () => ({
  JenfuAuthEpochRepository: class { readCanonicalPrincipalState = mocks.state; }
}));
vi.mock("@/lib/jenfu-principal-account-repository", () => ({
  JenfuPrincipalAccountError: class extends Error {
    constructor(readonly code: string) { super(code); this.name = "JenfuPrincipalAccountError"; }
  },
  JenfuPrincipalAccountRepository: class {
    requireActive = mocks.account;
    ensureFirstLogin = mocks.ensureFirstLogin;
  }
}));
vi.mock("@/lib/repositories/jenfu-entitlement-repository", () => ({
  JenfuEntitlementRepositoryError: class extends Error {
    constructor(readonly code: string) { super(code); this.name = "JenfuEntitlementRepositoryError"; }
  },
  JenfuEntitlementRepository: class {
    listEffectiveAssignments = mocks.assignments;
  }
}));
vi.mock("@/lib/jenfu-principal-session-registry", () => ({
  JenfuPrincipalSessionRegistry: class { register = mocks.register; }
}));

import { issueSessionForPrincipalHandoff } from "@/lib/jenfu-principal-handoff-session-service";
import { JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";

const nowMs = Date.parse(vectors.clock);
const handoff = parseJenfuPrincipalHandoff(vectors.valid, vectors.valid.issuer, nowMs);
const keyRing = { issuer: "ai-pdm-session", audience: "ai-pdm", currentKeyId: "current",
  keys: { current: "k".repeat(48) } };
const trustPolicy = { enabled: true, domains: ["example.test"], allowAal1PrivilegedPilot: false };
function assignment(roleCode: string) { return {
  contractVersion: "jenfu.orgmaster.ai-pdm-principal-grants.v4", applicationId: "ai-pdm",
  assignmentVersionId: "version-one", assignmentVersion: 1, assignmentId: "assignment-one",
  grantKind: "direct", delegationId: null,
  principalId: handoff.identity.principalId, employeeId: handoff.identity.employeeId,
  subjectKind: "employee", targetPrincipalId: null, stableRoleId: `role-${roleCode}`,
  roleCode, catalogVersion: "catalog-one", scopeKind: "workspace",
  scopeKey: "company-one", validFrom: "2026-09-24T00:00:00.000Z", validUntil: null,
  publishedAt: "2026-09-24T00:00:00.000Z"
}; }
const snapshot = { kind: "postgres", execute: vi.fn(async () => undefined),
  query: vi.fn(async () => [{ decision_at: vectors.clock }]),
  queryOne: vi.fn(async (_sql: string) => ({ id: "pdm-user-one", company_id: "company-one" })) };
const transaction = vi.fn(async (fn: (client: typeof snapshot) => Promise<unknown>) => fn(snapshot));
const database = { kind: "postgres", transaction } as never;
const base = { handoff, database, expectedIdentityIssuer: handoff.identity.identityIssuer,
  keyRing, trustPolicy, nowMs };

describe("DEV-121 principal handoff session issuance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.typed.mockReset();
    mocks.state.mockReset();
    mocks.account.mockReset();
    mocks.ensureFirstLogin.mockReset();
    mocks.assignments.mockReset();
    mocks.register.mockReset();
    mocks.typed.mockResolvedValue({ principalId: "principal-one", employeeId: "employee-one",
      accountType: "human_personal", identityIssuer: handoff.identity.identityIssuer,
      identitySubject: handoff.identity.identitySubject, mappingVersion: 1,
      publishedAt: "2026-09-24T00:00:00.000Z" });
    mocks.state.mockResolvedValue({ authEpoch: 0, revokedBefore: null });
    mocks.account.mockResolvedValue({ principalId: "principal-one", pdmUserId: "pdm-user-one",
      employeeId: "employee-one", accountType: "human_personal", companyId: "company-one",
      lifecycleVersion: 3, profileVersion: 2, minimumAssurance: "aal1", sessionInvalidBefore: null });
    mocks.assignments.mockResolvedValue([assignment("rd")]);
    mocks.ensureFirstLogin.mockResolvedValue({ created: true, pdmUserId: "pdm-user-one" });
    snapshot.queryOne.mockResolvedValue({ id: "pdm-user-one", company_id: "company-one" });
  });

  it("commits one principal-only session after exact producer and profile readback", async () => {
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims).toMatchObject({ principalId: "principal-one", employeeId: "employee-one",
      authEpoch: 0, companyId: "company-one", accountLifecycleVersion: 3, profileVersion: 2 });
    expect(result.claims).not.toHaveProperty("pdmUserId");
    expect(mocks.register).toHaveBeenCalledWith(result.claims);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "serializable" });
    expect(mocks.account).toHaveBeenCalledWith(handoff.identity.principalId);
    expect(snapshot.queryOne.mock.calls[0][0]).not.toContain("principal_identity_cutovers");
    expect(snapshot.queryOne.mock.calls[0][0]).toContain("owner.company_id=profile.company_id");
    expect(mocks.assignments).toHaveBeenCalledWith(expect.objectContaining({ principalId: "principal-one" }));
  });

  it("rejects mismatched producer identity or epoch before session registration", async () => {
    mocks.typed.mockResolvedValueOnce({ principalId: "principal-other", employeeId: "employee-one", accountType: "human_personal" });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("STALE_HANDOFF");
    mocks.state.mockResolvedValueOnce({ authEpoch: 1, revokedBefore: null });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("STALE_HANDOFF");
    mocks.state.mockResolvedValueOnce({ authEpoch: 0, revokedBefore: handoff.authentication.authenticatedAt });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("STALE_HANDOFF");
    expect(mocks.ensureFirstLogin).not.toHaveBeenCalled();
    expect(mocks.assignments).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it.each(["principal_not_active", "principal_directory_unavailable"])(
    "does not provision or issue a session when the published identity lookup rejects with %s",
    async (code) => {
      mocks.typed.mockRejectedValueOnce(Object.assign(new Error(code), { code }));

      await expect(issueSessionForPrincipalHandoff(base)).rejects.toMatchObject({ code });

      expect(mocks.state).not.toHaveBeenCalled();
      expect(mocks.account).not.toHaveBeenCalled();
      expect(mocks.assignments).not.toHaveBeenCalled();
      expect(mocks.ensureFirstLogin).not.toHaveBeenCalled();
      expect(snapshot.queryOne).not.toHaveBeenCalled();
      expect(mocks.register).not.toHaveBeenCalled();
    }
  );

  it("does not read a profile or register a session when the account activation check denies", async () => {
    mocks.account.mockRejectedValueOnce(new JenfuPrincipalAccountError("principal_account_inactive"));
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("principal_account_inactive");
    expect(snapshot.queryOne).not.toHaveBeenCalled();
    expect(mocks.ensureFirstLogin).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("creates the missing local account only after a valid published grant, then issues the first session", async () => {
    const publishedAt = "2026-10-08T12:34:56.123456Z";
    mocks.typed.mockResolvedValueOnce({ principalId: "principal-one", employeeId: "employee-one",
      accountType: "human_personal", identityIssuer: handoff.identity.identityIssuer,
      identitySubject: handoff.identity.identitySubject, mappingVersion: 1, publishedAt });
    mocks.account
      .mockRejectedValueOnce(new JenfuPrincipalAccountError("principal_account_missing"))
      .mockResolvedValueOnce({ principalId: "principal-one", pdmUserId: "pdm-user-one",
        employeeId: "employee-one", accountType: "human_personal", companyId: "company-one",
        lifecycleVersion: 1, profileVersion: 1, minimumAssurance: "aal1", sessionInvalidBefore: null });

    const result = await issueSessionForPrincipalHandoff(base);

    expect(result.claims).toMatchObject({ principalId: "principal-one", employeeId: "employee-one",
      accountLifecycleVersion: 1, profileVersion: 1 });
    expect(mocks.assignments).toHaveBeenCalledOnce();
    expect(mocks.ensureFirstLogin).toHaveBeenCalledWith(expect.objectContaining({
      principalId: "principal-one", employeeId: "employee-one",
      identityIssuer: handoff.identity.identityIssuer,
      identitySubject: handoff.identity.identitySubject,
      publishedAt,
      verifiedEmail: handoff.authentication.email
    }));
    expect(mocks.assignments.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.ensureFirstLogin.mock.invocationCallOrder[0]);
    expect(mocks.account).toHaveBeenCalledTimes(2);
    expect(mocks.register).toHaveBeenCalledOnce();
  });

  it("does not create an account when the published PDM grant is absent", async () => {
    mocks.account.mockRejectedValueOnce(new JenfuPrincipalAccountError("principal_account_missing"));
    mocks.assignments.mockResolvedValueOnce([]);

    await expect(issueSessionForPrincipalHandoff(base))
      .rejects.toMatchObject({ code: "permission_not_granted" });

    expect(mocks.ensureFirstLogin).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects a proof that expires before the session transaction begins", async () => {
    await expect(issueSessionForPrincipalHandoff({ ...base, nowMs: Date.parse(handoff.expiresAt) }))
      .rejects.toThrow("HANDOFF_EXPIRED");
    expect(transaction).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("issues AAL1 for privileged roles while still validating the published grant snapshot", async () => {
    mocks.typed.mockResolvedValue({ principalId: "principal-one", employeeId: "employee-one", accountType: "human_privileged" });
    mocks.account.mockResolvedValue({ principalId: "principal-one", pdmUserId: "pdm-user-one",
      employeeId: "employee-one", accountType: "human_privileged", companyId: "company-one",
      lifecycleVersion: 3, profileVersion: 2, minimumAssurance: "aal1", sessionInvalidBefore: null });
    mocks.assignments.mockResolvedValue([assignment("rd_manager")]);
    const result = await issueSessionForPrincipalHandoff(base);
    expect(result.claims).toMatchObject({ assuranceLevel: "aal1", secondFactor: null });
    expect(mocks.assignments).toHaveBeenCalledOnce();
    await expect(issueSessionForPrincipalHandoff({ ...base,
      trustPolicy: { ...trustPolicy, enabled: false } })).resolves.toMatchObject({
        claims: { assuranceLevel: "aal1", secondFactor: null }
      });
  });

  it("rejects a claimed AAL2 handoff with no recognized factor", async () => {
    const fakeAal2 = { ...handoff, authentication: {
      ...handoff.authentication, assuranceLevel: "aal2" as const, secondFactor: null
    } };
    await expect(issueSessionForPrincipalHandoff({ ...base, handoff: fakeAal2 }))
      .rejects.toThrow("HANDOFF_FACTOR_INVALID");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("rejects mixed published assignment versions before issuing a session", async () => {
    mocks.assignments.mockResolvedValue([assignment("rd_manager"),
      { ...assignment("rd"), assignmentId: "assignment-two", assignmentVersion: 2 }]);
    await expect(issueSessionForPrincipalHandoff(base))
      .rejects.toThrow("PRINCIPAL_ASSURANCE_SOURCE_INVALID");
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("denies a Principal with no published assignment before issuing a session", async () => {
    mocks.assignments.mockResolvedValue([]);
    await expect(issueSessionForPrincipalHandoff(base))
      .rejects.toMatchObject({ code: "permission_not_granted" });
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("does not use a historical profile from another company", async () => {
    snapshot.queryOne.mockResolvedValueOnce({ id: "pdm-user-one", company_id: "other-company" });
    await expect(issueSessionForPrincipalHandoff(base)).rejects.toThrow("PRINCIPAL_PROFILE_INVALID");
    expect(mocks.register).not.toHaveBeenCalled();
  });

});

const producerProofPath = process.env.DEV015_HANDOFF_PROOF_INPUT;
if (producerProofPath) {
  it("issues a Principal-only session from the actual Platform producer proof", async () => {
    vi.clearAllMocks();
    const proof = (JSON.parse(readFileSync(producerProofPath, "utf8")) as { "ai-pdm": unknown })["ai-pdm"];
    const issuer = (proof as { issuer: string }).issuer;
    const issuedAt = Date.parse((proof as { issuedAt: string }).issuedAt);
    const produced = parseJenfuPrincipalHandoff(proof, issuer, issuedAt + 1_000);
    mocks.typed.mockResolvedValue({ principalId: produced.identity.principalId,
      employeeId: produced.identity.employeeId, accountType: "human_personal" });
    mocks.state.mockResolvedValue({ authEpoch: produced.authState.authEpoch, revokedBefore: null });
    mocks.account.mockResolvedValue({ principalId: produced.identity.principalId, pdmUserId: "pdm-user-one",
      employeeId: produced.identity.employeeId, accountType: "human_personal", companyId: "company-one",
      lifecycleVersion: 3, profileVersion: 2, minimumAssurance: "aal1", sessionInvalidBefore: null });
    mocks.assignments.mockResolvedValue([{ ...assignment("rd"), principalId: produced.identity.principalId,
      employeeId: produced.identity.employeeId }]);
    snapshot.queryOne.mockResolvedValue({ id: "pdm-user-one", company_id: "company-one" });
    const result = await issueSessionForPrincipalHandoff({ ...base, handoff: produced,
      expectedIdentityIssuer: produced.identity.identityIssuer, nowMs: issuedAt + 1_000 });
    expect(result.claims).toMatchObject({ principalId: produced.identity.principalId,
      employeeId: produced.identity.employeeId, authEpoch: produced.authState.authEpoch });
    expect(result.claims).not.toHaveProperty("pdmUserId");
    expect(mocks.register).toHaveBeenCalledWith(result.claims);
  });
}
