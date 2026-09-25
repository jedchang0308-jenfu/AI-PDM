import { describe, expect, it } from "vitest";
import { hashJenfuPrincipalSessionId, JenfuPrincipalSessionRegistry } from "@/lib/jenfu-principal-session-registry";
import type { JenfuPrincipalSessionClaims } from "@/lib/jenfu-principal-session";

const claims: JenfuPrincipalSessionClaims = {
  version: 2, contractVersion: "jenfu.ai-pdm-session.v2", appId: "ai-pdm",
  tokenIssuer: "https://pdm.example.test", tokenAudience: "ai-pdm",
  sessionId: "session-0123456789abcdef", principalId: "principal-one", employeeId: "employee-one",
  identityIssuer: "https://issuer.example.test", identitySubject: "provider-one",
  epochKind: "principal", authEpoch: 0, accountLifecycleVersion: 3, profileVersion: 2,
  companyId: "company-one", issuedAt: 1_800_000_000, expiresAt: 1_800_000_600,
  authenticatedAt: 1_799_999_900, assuranceLevel: "aal1", secondFactor: null,
  assurancePolicyHash: "a".repeat(64)
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    principal_id: claims.principalId, principal_auth_epoch: claims.authEpoch,
    lifecycle_version: claims.accountLifecycleVersion, profile_version: claims.profileVersion,
    authenticated_at: new Date(claims.authenticatedAt * 1000),
    issued_at: new Date(claims.issuedAt * 1000), expires_at: new Date(claims.expiresAt * 1000),
    revoked_at: null, assurance_level: claims.assuranceLevel,
    assurance_policy_hash: claims.assurancePolicyHash,
    ...overrides
  };
}

describe("DEV-121 principal-keyed target session registry", () => {
  it("stores only the canonical principal and immutable proof stamps", async () => {
    const writes: Array<{ sql: string; params: Record<string, unknown> }> = [];
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres",
      execute: async (sql: string, params: unknown) => { writes.push({ sql, params: params as Record<string, unknown> }); return 1; },
      queryOne: async () => row()
    } as never);
    await registry.register(claims);
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain("principal_session_records");
    expect(writes[0].params).toMatchObject({ principalId: "principal-one", authEpoch: 0,
      lifecycleVersion: 3, profileVersion: 2, assuranceLevel: "aal1", assurancePolicyHash: "a".repeat(64) });
    expect(writes[0].params).not.toHaveProperty("pdmUserId");
    expect(writes[0].params).not.toHaveProperty("localPrincipalId");
    expect(await registry.isActive(claims, claims.issuedAt * 1000)).toBe(true);
  });

  it.each([
    ["missing", null], ["wrong principal", row({ principal_id: "other" })],
    ["stale epoch", row({ principal_auth_epoch: 1 })],
    ["stale lifecycle", row({ lifecycle_version: 4 })],
    ["stale profile", row({ profile_version: 3 })],
    ["wrong assurance", row({ assurance_level: "aal2" })],
    ["wrong policy", row({ assurance_policy_hash: "b".repeat(64) })],
    ["revoked", row({ revoked_at: new Date(claims.issuedAt * 1000) })]
  ])("rejects %s record", async (_name, value) => {
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres", queryOne: async () => value,
      execute: async () => 1 } as never);
    expect(await registry.isActive(claims, claims.issuedAt * 1000)).toBe(false);
  });

  it("rejects expired record and SQLite fallback", async () => {
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres", queryOne: async () => row(),
      execute: async () => 1 } as never);
    expect(await registry.isActive(claims, claims.expiresAt * 1000)).toBe(false);
    const sqlite = new JenfuPrincipalSessionRegistry({ kind: "sqlite", queryOne: async () => row(),
      execute: async () => 1 } as never);
    expect(await sqlite.isActive(claims, claims.issuedAt * 1000)).toBe(false);
    await expect(sqlite.register(claims)).rejects.toThrow("PRINCIPAL_SESSION_REGISTRY_UNAVAILABLE");
  });

  it("uses a dedicated session hash domain and revokes by principal plus hash", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres", queryOne: async () => row(),
      execute: async (_sql: string, params: unknown) => { writes.push(params as Record<string, unknown>); return 1; } } as never);
    await registry.revoke(claims, "local logout");
    expect(writes[0]).toMatchObject({ principalId: "principal-one",
      sessionIdHash: hashJenfuPrincipalSessionId(claims.sessionId), reason: "local logout" });
    expect(hashJenfuPrincipalSessionId(claims.sessionId)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("uses both principal and hash to revoke another session", async () => {
    const otherHash = "b".repeat(64);
    const calls: Array<{ sql: string; params: Record<string, unknown> }> = [];
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres",
      queryOne: async (sql: string, params: unknown) => {
        calls.push({ sql, params: params as Record<string, unknown> });
        return { session_id_hash: otherHash };
      }, execute: async () => 1 } as never);
    expect(await registry.revokeOther({ principalId: claims.principalId, recordId: otherHash,
      currentSessionId: claims.sessionId, reason: "lost device" })).toBe(true);
    expect(calls[0].sql).toContain("principal_id=:principalId AND session_id_hash=:recordId");
    expect(calls[0].params).toMatchObject({ principalId: claims.principalId,
      recordId: otherHash, currentHash: hashJenfuPrincipalSessionId(claims.sessionId) });
  });

  it("rejects the current session before touching the database", async () => {
    const queryOne = async () => { throw new Error("database should not be called"); };
    const registry = new JenfuPrincipalSessionRegistry({ kind: "postgres", queryOne,
      execute: async () => 1 } as never);
    await expect(registry.revokeOther({ principalId: claims.principalId,
      recordId: hashJenfuPrincipalSessionId(claims.sessionId),
      currentSessionId: claims.sessionId, reason: "logout" }))
      .rejects.toThrow("PRINCIPAL_SESSION_REVOKE_INVALID");
  });
});
