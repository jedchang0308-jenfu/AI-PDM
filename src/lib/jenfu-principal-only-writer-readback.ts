import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

type SessionRow = {
  runtime_sessions: number | string;
  migrator_sessions: number | string;
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
        count(*) FILTER (WHERE state IS NULL)::integer AS hidden_sessions,
        count(*) FILTER (WHERE xact_start IS NOT NULL)::integer AS active_transactions,
        count(*) FILTER (WHERE state IS DISTINCT FROM 'idle')::integer AS non_idle_sessions
      FROM pg_catalog.pg_stat_activity
      WHERE datname=current_database() AND backend_type='client backend'
        AND pid<>pg_backend_pid() AND usename IN (:runtime,:migrator)
    `, { runtime: RUNTIME, migrator: MIGRATOR });
    if (rows.length !== 1) throw new Error("principal_only_writer_readback_invalid");
    const row = rows[0];
    const runtimeSessions = count(row.runtime_sessions);
    const migratorSessions = count(row.migrator_sessions);
    const hiddenSessions = count(row.hidden_sessions);
    const activeTransactions = count(row.active_transactions);
    const nonIdleSessions = count(row.non_idle_sessions);
    if (hiddenSessions > runtimeSessions + migratorSessions ||
      activeTransactions > runtimeSessions + migratorSessions ||
      nonIdleSessions > runtimeSessions + migratorSessions) {
      throw new Error("principal_only_writer_readback_invalid");
    }
    return {
      schemaVersion: "ai-pdm.principal-only-writer-readback.v1" as const,
      runtimeSessions, migratorSessions, hiddenSessions,
      activeTransactions, nonIdleSessions,
      ownerLoginSessionsAbsent: runtimeSessions === 0 && migratorSessions === 0 &&
        hiddenSessions === 0 && activeTransactions === 0 && nonIdleSessions === 0
    };
  }, { isolationLevel: "repeatable_read", readOnly: true });
}
