import { describe, expect, it } from "vitest";
import { principalAssurancePolicyHash } from "@/lib/jenfu-principal-assurance";
import { issueJenfuPrincipalSession, verifyJenfuPrincipalSession } from "@/lib/jenfu-principal-session";
import { hashJenfuPrincipalSessionId } from "@/lib/jenfu-principal-session-registry";
import { withVerifiedJenfuPrincipalRequest } from "@/lib/jenfu-principal-request-guard";
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
  assuranceLevel: "aal2", secondFactor: "google_workspace_mfa",
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
      if (sql.includes("v_active_principal_accounts_v1")) return overrides.typed === undefined ? [{
        contract_version: "organization.active-principal.v1", principal_issuer: claims.identityIssuer,
        principal_subject: claims.identitySubject, principal_id: claims.principalId,
        employee_id: claims.employeeId, employee_status: "active", account_type: "human_privileged",
        mapping_version: 3, published_at: "2026-09-24T12:00:00.000Z"
      }] : overrides.typed;
      if (sql.includes("v_ai_pdm_entitlement_authority_v1")) return [{
        contract_version: "jenfu.platform-entitlement.v1", application_id: "ai-pdm",
        authority_source: "legacy_authority", authority_version: 1,
        employee_id: claims.employeeId, updated_at: "2026-09-24T12:00:00.000Z",
        operation_id: null
      }];
      throw new Error("unexpected query");
    },
    queryOne: async (sql: string, params?: Record<string, unknown>) => {
      observed.queries.push(sql);
      if (sql.includes("read_principal_auth_state_v3")) return overrides.epoch === undefined
        ? { principal_id: claims.principalId, auth_epoch: 0, revoked_before: null } : overrides.epoch;
      if (sql.includes("FROM ai_pdm_core.principal_accounts")) return overrides.account === undefined ? {
        principal_id: claims.principalId, pdm_user_id: "profile-one", employee_id: claims.employeeId,
        account_type: "human_privileged", company_id: claims.companyId,
        lifecycle_version: 3, profile_version: 2, account_status: "active",
        system_role_enabled: true, minimum_assurance: "aal2", session_invalid_before: null
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
      if (sql.includes("FROM ai_pdm_core.principal_role_assignments")) return {
        privileged: overrides.privileged ?? false
      };
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
    expect(observed.queries.join("\n")).not.toContain("profile.role");
    expect(observed.queries.join("\n")).toContain("owner.company_id=profile.company_id");
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

  it("rejects a changed target policy before reading any authorization data", async () => {
    const { client, observed } = database();
    await expect(request(client, { ...trustPolicy, enabled: false }))
      .rejects.toMatchObject({ code: "auth_session_invalid" });
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

  it("rejects an AAL1 session when the selected principal ACL has a current privileged role", async () => {
    const personal = { principal_id: claims.principalId, pdm_user_id: "profile-one",
      employee_id: claims.employeeId, account_type: "human_personal", company_id: claims.companyId,
      lifecycle_version: 3, profile_version: 2, account_status: "active",
      system_role_enabled: true, minimum_assurance: "aal1", session_invalid_before: null };
    const typed = [{ contract_version: "organization.active-principal.v1",
      principal_issuer: claims.identityIssuer, principal_subject: claims.identitySubject,
      principal_id: claims.principalId, employee_id: claims.employeeId,
      employee_status: "active", account_type: "human_personal",
      mapping_version: 3, published_at: "2026-09-24T12:00:00.000Z" }];
    const input = { token: aal1Token, keyRing: ring, identityIssuer: claims.identityIssuer,
      trustPolicy, nowSeconds: now };
    const high = database({ claims: aal1Claims, account: personal, typed, privileged: true });
    await expect(withVerifiedJenfuPrincipalRequest({ ...input, database: high.client },
      async () => "unexpected")).rejects.toMatchObject({ code: "auth_session_invalid" });
    const normal = database({ claims: aal1Claims, account: personal, typed, privileged: false });
    await expect(withVerifiedJenfuPrincipalRequest({ ...input, database: normal.client },
      async () => "allowed_to_continue_to_permission_decision"))
      .resolves.toBe("allowed_to_continue_to_permission_decision");
  });
});
