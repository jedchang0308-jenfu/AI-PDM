import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

/** Temporary v1 admission fence. This reader must be removed with the v1 runtime. */
export class JenfuLegacyCutoverError extends Error {
  constructor(readonly code: "legacy_session_retired" | "legacy_cutover_unavailable") {
    super(code);
  }
}

export type LegacyCutoverReader = {
  requireLegacyCompatible(pdmUserId: string, principalId: string): Promise<void>;
};

export class JenfuLegacyCutoverRepository implements LegacyCutoverReader {
  constructor(private readonly client: Pick<AsyncDatabaseClient, "kind" | "queryOne">) {}

  async requireLegacyCompatible(pdmUserId: string, principalId: string): Promise<void> {
    if (this.client.kind !== "postgres") throw new JenfuLegacyCutoverError("legacy_cutover_unavailable");
    if (!pdmUserId || !principalId || pdmUserId.length > 255 || principalId.length > 255) {
      throw new JenfuLegacyCutoverError("legacy_session_retired");
    }
    let row: { status: string; principal_id: string | null } | null;
    try {
      row = await this.client.queryOne<{ status: string; principal_id: string | null }>(`
        SELECT status, principal_id
        FROM ai_pdm_core.principal_identity_cutovers
        WHERE pdm_user_id = :pdmUserId
      `, { pdmUserId });
    } catch {
      throw new JenfuLegacyCutoverError("legacy_cutover_unavailable");
    }
    if (row?.status !== "legacy_compatible" || row.principal_id !== principalId) {
      throw new JenfuLegacyCutoverError("legacy_session_retired");
    }
  }
}
