import { describe, expect, it, vi } from "vitest";
import { principalAssurancePolicyHash } from "@/lib/jenfu-principal-assurance";
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
import { principalRequestFailure } from "@/lib/jenfu-principal-http";
import { JenfuPrincipalAccountError } from "@/lib/jenfu-principal-account-repository";
import { JenfuPrincipalAdmissionError } from "@/lib/jenfu-principal-admission-repository";
import type { AsyncDatabaseClient, AsyncDatabaseTransactionOptions } from "@/lib/db-async-provider";

const now = 1_800_000_000;
const ring = { issuer: "https://pdm.example.test", audience: "ai-pdm",
  currentKeyId: "current", keys: { current: "a".repeat(40) } };
const trustPolicy = { enabled: true, domains: ["jenfu.com.tw"], allowAal1PrivilegedPilot: false };
const token = issueJenfuPrincipalSession({
  principalId: "principal-one", employeeId: "employee-one",
  identityIssuer: "https://issuer.example.test", identitySubject: "subject-one",
  authEpoch: 0, accountLifecycleVersion: 3, profileVersion: 2,
  companyId: "company-one", authenticatedAt: now - 100,
  assuranceLevel: "aal1", secondFactor: null,
  assurancePolicyHash: principalAssurancePolicyHash(trustPolicy), maxAgeSeconds: 600
}, ring, now);
const claims = verifyJenfuPrincipalSession(token, ring, { nowSeconds: now });
const aal1Token = issueJenfuPrincipalSession({
  principalId: claims.principalId, employeeId: claims.employeeId,
  identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject,
  authEpoch: claims.authEpoch, accountLifecycleVersion: claims.accountLifecycleVersion,
  profileVersion: claims.profileVersion, companyId: claims.companyId,
  authenticatedAt: claims.authenticatedAt, assuranceLevel: "aal1", secondFactor: null,
  assurancePolicyHash: claims.assurancePolicyHash, maxAgeSeconds: 600
}, ring, now);
const aal1Claims = verifyJenfuPrincipalSession(aal1Token, ring, { nowSeconds: now });
const request = (client: AsyncDatabaseClient, policy = trustPolicy) =>
  withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
    identityIssuer: claims.identityIssuer, trustPolicy: policy, database: client, nowSeconds: now },
  async (_transaction, verified) => verified);

function database(overrides: Record<string, unknown> = {}) {
  const currentClaims = (overrides.claims ?? claims) as typeof claims;
  const observed: { queries: string[]; options?: AsyncDatabaseTransactionOptions; inTransaction: boolean } = { queries: [], inTransaction: false };
  const client = {
    kind: "postgres",
    execute: async () => undefined,
    query: async (sql: string) => {
      observed.queries.push(sql);
      if (sql.includes("v_active_principal_accounts_v1") && overrides.typedReadError) throw overrides.typedReadError;
      if (sql.includes("v_active_principal_accounts_v1")) return overrides.typed === undefined ? [{
        contract_version: "organization.active-principal.v1", principal_issuer: claims.identityIssuer,
        principal_subject: claims.identitySubject, principal_id: claims.principalId,
        employee_id: claims.employeeId, employee_status: "active", account_type: "human_privileged",
        mapping_version: 3, published_at: "2026-09-24T12:00:00.000Z"
      }] : overrides.typed;
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) return [{
        contract_version: "jenfu.platform-entitlement.v1", application_id: "ai-pdm",
        authority_source: "orgmaster_authority", authority_version: 1,
        employee_id: claims.employeeId, updated_at: "2026-09-24T12:00:00.000Z",
        operation_id: null
      }];
      if (sql.includes("transaction_timestamp()")) return [{
        decision_at: new Date(now * 1000).toISOString()
      }];
      if (sql.includes("v_ai_pdm_principal_effective_grants_v4")) return overrides.assignments ?? [{
        contract_version: "jenfu.orgmaster.ai-pdm-principal-grants.v4",
        assignment_version_id: "version-one", assignment_version: 1,
        assignment_id: "assignment-one", grant_kind: "direct", delegation_id: null,
        application_id: "ai-pdm", principal_id: claims.principalId,
        employee_id: claims.employeeId, subject_kind: "employee", target_principal_id: null,
        stable_role_id: overrides.privileged ? "role-rd-manager" : "role-rd",
        role_code: overrides.privileged ? "rd_manager" : "rd",
        catalog_version: "catalog-one", scope_kind: "workspace", scope_key: "company-one",
        valid_from: "2026-09-24T00:00:00.000Z", valid_until: null,
        published_at: "2026-09-24T00:00:00.000Z"
      }];
      throw new Error("unexpected query");
    },
    queryOne: async (sql: string, params?: Record<string, unknown>) => {
      observed.queries.push(sql);
      if (sql.includes("FROM ai_pdm_core.principal_accounts") && overrides.accountReadError) {
        throw overrides.accountReadError;
      }
      if (sql.includes("read_principal_auth_state_v3")) return overrides.epoch === undefined
        ? { principal_id: claims.principalId, auth_epoch: 0, revoked_before: null } : overrides.epoch;
      if (sql.includes("FROM ai_pdm_core.principal_accounts")) return overrides.account === undefined ? {
        principal_id: claims.principalId, pdm_user_id: "profile-one", employee_id: claims.employeeId,
        account_type: "human_privileged", company_id: claims.companyId,
        lifecycle_version: 3, profile_version: 2, account_status: "active",
        system_role_enabled: true, minimum_assurance: "aal1", session_invalid_before: null
      } : overrides.account;
      if (sql.includes("FROM ai_pdm_core.principal_session_records")) {
        expect(params?.sessionIdHash).toBe(hashJenfuPrincipalSessionId(currentClaims.sessionId));
        return overrides.session === undefined ? {
          principal_id: claims.principalId, principal_auth_epoch: 0,
          lifecycle_version: 3, profile_version: 2,
          authenticated_at: new Date(currentClaims.authenticatedAt * 1000),
          issued_at: new Date(currentClaims.issuedAt * 1000),
          expires_at: new Date(currentClaims.expiresAt * 1000), revoked_at: null,
          assurance_level: currentClaims.assuranceLevel,
          assurance_policy_hash: currentClaims.assurancePolicyHash
        } : overrides.session;
      }
      if (sql.includes("FROM ai_pdm_core.users profile")) return overrides.profile === undefined
        ? { id: "profile-one", company_id: "company-one" } : overrides.profile;
      throw new Error("unexpected query");
    },
    transaction: async (fn: (tx: AsyncDatabaseClient) => unknown, options: AsyncDatabaseTransactionOptions) => {
      observed.options = options;
      observed.inTransaction = true;
      try { return await fn(client as never); }
      finally { observed.inTransaction = false; }
    }
  };
  return { client: client as never as AsyncDatabaseClient, observed };
}

describe("DEV-121 principal request verification", () => {
  it("uses one read-only snapshot and does not authorize from the old user role/status", async () => {
    const { client, observed } = database();
    const result = await request(client);
    expect(result.session.principalId).toBe("principal-one");
    expect(result.session).not.toHaveProperty("localPrincipalId");
    expect(result.profile).toEqual({ pdmUserId: "profile-one", companyId: "company-one" });
    expect(observed.options).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
    expect(observed.queries.join("\n")).not.toContain("firebase_platform_principals");
    expect(observed.queries.join("\n")).not.toContain("user_role_assignments");
    expect(observed.queries.join("\n")).not.toContain("principal_role_assignments");
    expect(observed.queries.join("\n")).not.toContain("profile.role");
    expect(observed.queries.join("\n")).toContain("owner.company_id=profile.company_id");
    expect(observed.queries.join("\n")).toContain("FROM ai_pdm_core.principal_accounts account");
    expect(observed.queries.join("\n")).not.toContain("principal_identity_cutovers");
    expect(observed.queries.join("\n")).not.toContain("user_company_memberships");
  });

  it("fails closed on stale canonical epoch, missing typed source and a bad local link", async () => {
    for (const override of [
      { epoch: { principal_id: "principal-one", auth_epoch: 1, revoked_before: null } },
      { typed: [] },
      { account: null },
      { profile: null }
    ]) {
      await expect(request(database(override).client))
        .rejects.toThrow();
    }
  });

  it.each(["suspended", "expired", "offboarded", "system_role_disabled"])(
    "returns invalid-session HTTP 401 for a validated %s account without entering authorization", async state => {
      const { client } = database({ account: {
        principal_id: claims.principalId, pdm_user_id: "profile-one", employee_id: claims.employeeId,
        account_type: "human_privileged", company_id: claims.companyId,
        lifecycle_version: 4, profile_version: 2,
        account_status: state === "system_role_disabled" ? "active" : state,
        system_role_enabled: false, minimum_assurance: "aal1", session_invalid_before: new Date(now * 1000)
      }, session: { revoked_at: new Date(now * 1000) } });
      const effect = vi.fn(async () => "must_not_run");
      const failure = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
        identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now }, effect)
        .then(() => { throw new Error("inactive account admitted"); }, error => error);
      const response = principalRequestFailure(failure);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ code: "auth_session_invalid" });
      expect(effect).not.toHaveBeenCalled();
    });

  it.each([null, { principal_id: claims.principalId, account_status: "suspended" }])(
    "keeps missing or malformed inactive metadata as HTTP 503", async account => {
      const effect = vi.fn(async () => "must_not_run");
      const failure = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
        identityIssuer: claims.identityIssuer, trustPolicy, database: database({ account }).client, nowSeconds: now }, effect)
        .then(() => { throw new Error("malformed account admitted"); }, error => error);
      const response = principalRequestFailure(failure);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ code: "principal_dependency_unavailable" });
      expect(effect).not.toHaveBeenCalled();
    });

  it("keeps a query failure HTTP 503 even when the session registry is revoked", async () => {
    const { client } = database({ session: { revoked_at: new Date(now * 1000) },
      accountReadError: new Error("private database failure") });
    const effect = vi.fn(async () => "must_not_run");
    const failure = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now }, effect)
      .then(() => { throw new Error("database failure admitted"); }, error => error);
    expect(principalRequestFailure(failure).status).toBe(503);
    expect(effect).not.toHaveBeenCalled();
  });

  it.each([
    [{ typed: [] }, 401],
    [{ typedReadError: new Error("private directory query failure") }, 503],
    [{ typed: [{}, {}] }, 503],
    [{ typed: [{ contract_version: "malformed" }] }, 503]
  ])("classifies known producer inactivity separately from failed or ambiguous reads", async (override, status) => {
    const effect = vi.fn(async () => "must_not_run");
    const failure = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy,
      database: database(override as Record<string, unknown>).client, nowSeconds: now }, effect)
      .then(() => { throw new Error("ineligible producer admitted"); }, error => error);
    expect(principalRequestFailure(failure).status).toBe(status);
    expect(effect).not.toHaveBeenCalled();
  });

  it("rejects a session minted under the retired assurance policy before authorization reads", async () => {
    const oldPolicyToken = issueJenfuPrincipalSession({
      principalId: claims.principalId, employeeId: claims.employeeId,
      identityIssuer: claims.identityIssuer, identitySubject: claims.identitySubject,
      authEpoch: claims.authEpoch, accountLifecycleVersion: claims.accountLifecycleVersion,
      profileVersion: claims.profileVersion, companyId: claims.companyId,
      authenticatedAt: claims.authenticatedAt, assuranceLevel: "aal1", secondFactor: null,
      assurancePolicyHash: "b".repeat(64), maxAgeSeconds: 600
    }, ring, now);
    const { client, observed } = database();
    await expect(withVerifiedJenfuPrincipalRequest({ token: oldPolicyToken, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now },
    async () => "must_not_run")).rejects.toMatchObject({ code: "auth_session_invalid" });
    expect(observed.queries).toHaveLength(0);
  });

  it("runs the permission callback in the same read-only snapshot after admission", async () => {
    const { client, observed } = database();
    const result = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now },
    async (transaction, verified) => {
      expect(transaction).toBe(client);
      expect(observed.inTransaction).toBe(true);
      expect(verified.session.principalId).toBe(claims.principalId);
      expect(verified.profile.pdmUserId).toBe("profile-one");
      return "permission_decision_from_same_snapshot";
    });
    expect(result).toBe("permission_decision_from_same_snapshot");
    expect(observed.options).toEqual({ isolationLevel: "repeatable_read", readOnly: true });
  });

  it("can keep a principal-owned command in one repeatable-read write transaction", async () => {
    const { client, observed } = database();
    const result = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now },
    async (transaction, verified) => {
      expect(transaction).toBe(client);
      expect(observed.inTransaction).toBe(true);
      return verified.session.principalId;
    }, { readOnly: false });
    expect(result).toBe("principal-one");
    expect(observed.options).toEqual({ isolationLevel: "repeatable_read", readOnly: false });
  });

  it("can bind a principal owner command to one serializable write transaction", async () => {
    const { client, observed } = database();
    const result = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: client, nowSeconds: now },
    async (_transaction, verified) => verified.session.principalId,
    { readOnly: false, isolationLevel: "serializable" });
    expect(result).toBe("principal-one");
    expect(observed.options).toEqual({ isolationLevel: "serializable", readOnly: false });
  });

  it("keeps a permission evaluator's explicit denial distinct from an unavailable dependency", async () => {
    const denied = new Error("permission_denied");
    await expect(withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: database().client, nowSeconds: now },
    async () => { throw denied; })).rejects.toBe(denied);
  });

  it.each([new JenfuPrincipalAccountError("principal_account_inactive"),
    new JenfuPrincipalAdmissionError("principal_not_active", 403)])(
    "preserves a command's same-snapshot typed inactive denial as HTTP 401", async inactive => {
    const failure = await withVerifiedJenfuPrincipalRequest({ token, keyRing: ring,
      identityIssuer: claims.identityIssuer, trustPolicy, database: database().client, nowSeconds: now },
    async () => { throw inactive; }, { readOnly: false })
      .then(() => { throw new Error("inactive command admitted"); }, error => error);
    expect(principalRequestFailure(failure).status).toBe(401);
    });

  it("admits AAL1 for privileged accounts but denies a zero-grant snapshot explicitly", async () => {
    const input = { token: aal1Token, keyRing: ring, identityIssuer: claims.identityIssuer,
      trustPolicy, nowSeconds: now };
    const high = database({ claims: aal1Claims, privileged: true });
    await expect(withVerifiedJenfuPrincipalRequest({ ...input, database: high.client },
      async () => "allowed_to_continue_to_permission_decision"))
      .resolves.toBe("allowed_to_continue_to_permission_decision");
    const noGrant = database({ claims: aal1Claims, assignments: [] });
    const protectedEffect = vi.fn(async () => "must_not_run");
    await expect(withVerifiedJenfuPrincipalRequest({ ...input, database: noGrant.client }, protectedEffect))
      .rejects.toMatchObject({ code: "permission_not_granted" });
    expect(protectedEffect).not.toHaveBeenCalled();
  });
});


it("normalizes only verified authentication and account-version data for durable consent",async()=>{
  const {client}=database();const verified=await request(client as AsyncDatabaseClient);
  expect(verified.session.authenticatedAt).toBe(new Date(claims.authenticatedAt*1000).toISOString());
  expect(verified.session.accountLifecycleVersion).toBe(claims.accountLifecycleVersion);
  expect(verified.session).not.toHaveProperty("token");
});
