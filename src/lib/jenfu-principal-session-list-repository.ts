import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type SessionRow = {
  principal_id: string;
  session_id_hash: string;
  assurance_level: string;
  issued_at: Date | string;
  last_seen_at: Date | string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

export type PrincipalSessionListItem = {
  id: string;
  authProvider: "principal";
  assuranceLevel: "aal1" | "aal2";
  deviceType: "unknown";
  deviceLabel: string;
  userAgentHint: string;
  ipSummary: null;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  current: boolean;
};

function iso(value: Date | string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("PRINCIPAL_SESSION_READBACK_INVALID");
  return date.toISOString();
}

/** Read only the verified principal's sessions; hashes are record selectors, never bearer tokens. */
export class JenfuPrincipalSessionListRepository {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "query">) {}

  async list(principalId: string, currentSessionIdHash: string): Promise<PrincipalSessionListItem[]> {
    if (this.client.kind !== "postgres" || !principalId || principalId.length > 255 ||
      !/^[0-9a-f]{64}$/u.test(currentSessionIdHash)) {
      throw new Error("PRINCIPAL_SESSION_READBACK_UNAVAILABLE");
    }
    const rows = await this.client.query<SessionRow>(`
      SELECT principal_id,session_id_hash,assurance_level,issued_at,last_seen_at,expires_at,revoked_at
      FROM ai_pdm_core.principal_session_records
      WHERE principal_id=:principalId
      ORDER BY issued_at DESC,session_id_hash DESC
      LIMIT 20
    `, { principalId });
    return rows.map((row) => {
      if (row.principal_id !== principalId || !/^[0-9a-f]{64}$/u.test(row.session_id_hash) ||
        (row.assurance_level !== "aal1" && row.assurance_level !== "aal2")) {
        throw new Error("PRINCIPAL_SESSION_READBACK_INVALID");
      }
      return {
        id: row.session_id_hash,
        authProvider: "principal" as const,
        assuranceLevel: row.assurance_level,
        deviceType: "unknown" as const,
        deviceLabel: "公司身分工作階段",
        userAgentHint: "已驗證登入",
        ipSummary: null,
        issuedAt: iso(row.issued_at),
        lastSeenAt: iso(row.last_seen_at),
        expiresAt: iso(row.expires_at),
        revokedAt: row.revoked_at ? iso(row.revoked_at) : null,
        current: row.session_id_hash === currentSessionIdHash
      };
    });
  }
}
