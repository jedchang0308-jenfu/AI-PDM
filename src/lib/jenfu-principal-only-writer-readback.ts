import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type SessionRow = {
  runtime_sessions: number | string;
  migrator_sessions: number | string;
  other_owner_sessions: number | string;
  hidden_sessions: number | string;
  active_transactions: number | string;
  non_idle_sessions: number | string;
};

const RUNTIME = "aipdm-prod-runtime@jenfu-platform-prod.iam";
const MIGRATOR = "aipdm-prod-migrator@jenfu-platform-prod.iam";

function count(value: unknown): number {
  if (typeof value !== "number" &&
    !(typeof value === "string" && /^[0-9]+$/u.test(value))) {
    throw new Error("principal_only_writer_readback_invalid");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("principal_only_writer_readback_invalid");
  }
  return parsed;
}

/**
 * Read-only DB connection census for the owner cutover window. This cannot
 * prove that a stopped service cannot restart or that an external writer is
 * absent; the provider service/Job/scheduler readbacks are separate inputs.
 * Count every connection inheriting either AI-PDM write role, not just the
 * two expected IAM logins, so an unexpected owner writer cannot disappear.
 */
export async function readPrincipalOnlyWriterSessions(database: AsyncDatabaseClient) {
  if (database.kind !== "postgres") {
    throw new Error("principal_only_writer_readback_invalid");
  }
  return database.transaction(async (snapshot) => {
    await snapshot.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    const rows = await snapshot.query<SessionRow>(`
      SELECT
        count(*) FILTER (WHERE usename=:runtime)::integer AS runtime_sessions,
        count(*) FILTER (WHERE usename=:migrator)::integer AS migrator_sessions,
        count(*) FILTER (WHERE usename<>:runtime AND usename<>:migrator)::integer
          AS other_owner_sessions,
        count(*) FILTER (WHERE state IS NULL)::integer AS hidden_sessions,
        count(*) FILTER (WHERE xact_start IS NOT NULL)::integer AS active_transactions,
        count(*) FILTER (WHERE state IS DISTINCT FROM 'idle')::integer AS non_idle_sessions
      FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid() AND (
          usename IN (:runtime,:migrator)
          OR pg_catalog.pg_has_role(usename,'jenfu_ai_pdm_runtime','MEMBER')
          OR pg_catalog.pg_has_role(usename,'jenfu_ai_pdm_migrator','MEMBER')
        )
    `, { runtime: RUNTIME, migrator: MIGRATOR });
    if (rows.length !== 1) throw new Error("principal_only_writer_readback_invalid");
    const row = rows[0];
    const runtimeSessions = count(row.runtime_sessions);
    const migratorSessions = count(row.migrator_sessions);
    const otherOwnerSessions = count(row.other_owner_sessions);
    const hiddenSessions = count(row.hidden_sessions);
    const activeTransactions = count(row.active_transactions);
    const nonIdleSessions = count(row.non_idle_sessions);
    const ownerSessions = runtimeSessions + migratorSessions + otherOwnerSessions;
    if (hiddenSessions > ownerSessions ||
      activeTransactions > ownerSessions ||
      nonIdleSessions > ownerSessions) {
      throw new Error("principal_only_writer_readback_invalid");
    }
    // Business workbench provenance is separate from security identity. Read
    // the real persisted contract; a local fixture's canonical/local-dev seed
    // does not establish that the Production workbench can accept commands.
    const authority = await snapshot.query<{
      id:number;mode:string;expected_commit:string;schema_hash:string;row_version:number|string;
    }>(`SELECT id,mode,expected_commit,schema_hash,row_version
       FROM ai_pdm_core.pdm_workbench_state_authority_control ORDER BY id`);
    if (authority.length > 1 || (authority.length === 1 && (authority[0].id !== 1 ||
        typeof authority[0].mode !== 'string' || typeof authority[0].expected_commit !== 'string' ||
        typeof authority[0].schema_hash !== 'string' || count(authority[0].row_version) < 1))) {
      throw new Error('principal_only_writer_readback_invalid');
    }
    const workbenchAuthority = authority[0] ? {
      mode:authority[0].mode, expectedCommit:authority[0].expected_commit,
      schemaHash:authority[0].schema_hash,rowVersion:count(authority[0].row_version)
    } : null;
    return {
      schemaVersion: "ai-pdm.principal-only-writer-readback.v2" as const,
      workbenchAuthority,
      runtimeSessions, migratorSessions, otherOwnerSessions, hiddenSessions,
      activeTransactions, nonIdleSessions,
      ownerWriterSessionsAbsent: runtimeSessions === 0 && migratorSessions === 0 &&
        otherOwnerSessions === 0 && hiddenSessions === 0 &&
        activeTransactions === 0 && nonIdleSessions === 0
    };
  }, { isolationLevel: "repeatable_read", readOnly: true });
}
