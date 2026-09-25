import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { JenfuPrincipalSessionClaims } from "@/lib/jenfu-principal-session";

export function hashJenfuPrincipalSessionId(sessionId: string) {
  if (typeof sessionId !== "string" || sessionId.length < 16 || sessionId.length > 512) {
    throw new Error("PRINCIPAL_SESSION_ID_INVALID");
  }
  return crypto.createHash("sha256").update(`pdm-principal-session-v2:${sessionId}`).digest("hex");
}

type PrincipalSessionRow = {
  principal_id: string;
  principal_auth_epoch: number | string;
  lifecycle_version: number | string;
  profile_version: number | string;
  authenticated_at: Date | string;
  issued_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  assurance_level: "aal1" | "aal2";
  assurance_policy_hash: string;
};

function milliseconds(value: Date | string) {
  return value instanceof Date ? value.getTime() : Date.parse(value);
}

export class JenfuPrincipalSessionRegistry {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "execute" | "queryOne">) {}

  async register(claims: JenfuPrincipalSessionClaims) {
    if (this.client.kind !== "postgres") throw new Error("PRINCIPAL_SESSION_REGISTRY_UNAVAILABLE");
    await this.client.execute(`
      INSERT INTO ai_pdm_core.principal_session_records
        (principal_id,session_id_hash,principal_auth_epoch,lifecycle_version,
         profile_version,authenticated_at,issued_at,expires_at,assurance_level,assurance_policy_hash)
      VALUES
        (:principalId,:sessionIdHash,:authEpoch,:lifecycleVersion,
         :profileVersion,:authenticatedAt,:issuedAt,:expiresAt,:assuranceLevel,:assurancePolicyHash)
    `, {
      principalId: claims.principalId,
      sessionIdHash: hashJenfuPrincipalSessionId(claims.sessionId),
      authEpoch: claims.authEpoch,
      lifecycleVersion: claims.accountLifecycleVersion,
      profileVersion: claims.profileVersion,
      authenticatedAt: new Date(claims.authenticatedAt * 1000).toISOString(),
      issuedAt: new Date(claims.issuedAt * 1000).toISOString(),
      expiresAt: new Date(claims.expiresAt * 1000).toISOString(),
      assuranceLevel: claims.assuranceLevel,
      assurancePolicyHash: claims.assurancePolicyHash
    });
  }

  async isActive(claims: JenfuPrincipalSessionClaims, nowMs = Date.now()) {
    if (this.client.kind !== "postgres" || !Number.isSafeInteger(nowMs)) return false;
    const row = await this.client.queryOne<PrincipalSessionRow>(`
      SELECT principal_id,principal_auth_epoch,lifecycle_version,profile_version,
             authenticated_at,issued_at,expires_at,revoked_at,assurance_level,assurance_policy_hash
      FROM ai_pdm_core.principal_session_records
      WHERE principal_id=:principalId AND session_id_hash=:sessionIdHash
    `, {
      principalId: claims.principalId,
      sessionIdHash: hashJenfuPrincipalSessionId(claims.sessionId)
    });
    return Boolean(row && row.principal_id === claims.principalId && row.revoked_at === null &&
      Number(row.principal_auth_epoch) === claims.authEpoch &&
      Number(row.lifecycle_version) === claims.accountLifecycleVersion &&
      Number(row.profile_version) === claims.profileVersion &&
      milliseconds(row.authenticated_at) === claims.authenticatedAt * 1000 &&
      milliseconds(row.issued_at) === claims.issuedAt * 1000 &&
      milliseconds(row.expires_at) === claims.expiresAt * 1000 &&
      milliseconds(row.expires_at) > nowMs &&
      row.assurance_level === claims.assuranceLevel &&
      row.assurance_policy_hash === claims.assurancePolicyHash);
  }

  async revoke(claims: JenfuPrincipalSessionClaims, reason: string) {
    if (this.client.kind !== "postgres" || !reason.trim()) {
      throw new Error("PRINCIPAL_SESSION_REVOKE_INVALID");
    }
    await this.client.execute(`
      UPDATE ai_pdm_core.principal_session_records
      SET revoked_at=clock_timestamp(),revoke_reason=:reason
      WHERE principal_id=:principalId AND session_id_hash=:sessionIdHash
        AND revoked_at IS NULL
    `, {
      principalId: claims.principalId,
      sessionIdHash: hashJenfuPrincipalSessionId(claims.sessionId),
      reason: reason.trim()
    });
  }

  async revokeOther(input: {
    principalId: string;
    recordId: string;
    currentSessionId: string;
    reason: string;
  }): Promise<boolean> {
    const currentHash = hashJenfuPrincipalSessionId(input.currentSessionId);
    const reason = input.reason.trim();
    if (this.client.kind !== "postgres" || !input.principalId || input.principalId.length > 255 ||
      !/^[0-9a-f]{64}$/u.test(input.recordId) || input.recordId === currentHash ||
      reason.length < 1 || reason.length > 500) {
      throw new Error("PRINCIPAL_SESSION_REVOKE_INVALID");
    }
    const changed = await this.client.queryOne<{ session_id_hash: string }>(`
      UPDATE ai_pdm_core.principal_session_records
      SET revoked_at=clock_timestamp(),revoke_reason=:reason
      WHERE principal_id=:principalId AND session_id_hash=:recordId
        AND session_id_hash<>:currentHash AND revoked_at IS NULL
      RETURNING session_id_hash
    `, { principalId: input.principalId, recordId: input.recordId, currentHash, reason });
    return changed?.session_id_hash === input.recordId;
  }
}
