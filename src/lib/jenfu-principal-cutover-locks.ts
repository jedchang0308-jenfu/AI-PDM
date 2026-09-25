import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

// Order is part of the owner cutover contract. Each table is locked only for
// the short apply transaction, after the operation and sorted subject locks.
const LOCAL_SOURCE_RELATIONS = [
  "ai_pdm_core.principal_identity_cutovers",
  "ai_pdm_core.principal_accounts",
  "ai_pdm_core.users",
  "ai_pdm_core.platform_principal_mappings",
  "ai_pdm_core.auth_identities",
  "ai_pdm_core.user_company_memberships",
  "ai_pdm_core.user_role_assignments",
  "ai_pdm_core.principal_role_assignments",
  "ai_pdm_core.approval_delegations",
  "ai_pdm_core.principal_approval_delegations",
  "ai_pdm_core.roles",
  "ai_pdm_core.role_permissions",
  "ai_pdm_core.role_scope_rules",
  "ai_pdm_core.role_priority_versions",
  "ai_pdm_core.active_role_catalog",
  "ai_pdm_core.role_catalog_publications",
  "ai_pdm_core.role_catalog_entries",
  "ai_pdm_core.account_session_records",
  "ai_pdm_core.principal_session_records"
] as const;

type IsolationRow = { isolation_level: string; read_only: string };
type LockReadbackRow = { held: number | string; expected: number };
type OperationRow = {
  operation_kind: string;
  input_hash: string;
  cohort_hash: string;
  result_json: Record<string, unknown>;
};

function exactId(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 255 &&
    value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}

/** Owner-only apply preparation. Never call this from an application runtime. */
export async function lockPrincipalCutoverOwnerSources(
  client: AsyncDatabaseClient,
  operationId: string,
  pdmUserIds: readonly string[],
  expectedInputHash: string,
  expectedCohortHash: string
): Promise<{ status: "replayed"; result: Record<string, unknown> } | { status: "locked" }> {
  if (client.kind !== "postgres" || !exactId(operationId) ||
    !/^[0-9a-f]{64}$/u.test(expectedInputHash) ||
    !/^[0-9a-f]{64}$/u.test(expectedCohortHash) ||
    pdmUserIds.length < 1 || pdmUserIds.length > 32 ||
    pdmUserIds.some((id) => !exactId(id)) ||
    new Set(pdmUserIds).size !== pdmUserIds.length) {
    throw new Error("PRINCIPAL_CUTOVER_LOCK_INPUT_INVALID");
  }
  const isolation = await client.queryOne<IsolationRow>(`
    SELECT current_setting('transaction_isolation') AS isolation_level,
           current_setting('transaction_read_only') AS read_only
  `);
  if (isolation?.isolation_level !== "read committed" || isolation.read_only !== "off") {
    throw new Error("PRINCIPAL_CUTOVER_ISOLATION_INVALID");
  }
  await client.execute(`
    SELECT pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('aipdm-dev121-cutover-operation'),
      pg_catalog.hashtext(:operationId))
  `, { operationId });
  const receipt = await client.queryOne<OperationRow>(`
    SELECT operation_kind,input_hash,cohort_hash,result_json
    FROM ai_pdm_core.principal_identity_operations
    WHERE operation_id=:operationId
  `, { operationId });
  if (receipt) {
    if (receipt.operation_kind !== "cutover" || receipt.input_hash !== expectedInputHash ||
      receipt.cohort_hash !== expectedCohortHash || !receipt.result_json ||
      typeof receipt.result_json !== "object" || Array.isArray(receipt.result_json)) {
      throw new Error("PRINCIPAL_CUTOVER_OPERATION_CONFLICT");
    }
    // A committed replay never re-runs source or takes cohort/table locks.
    return { status: "replayed", result: receipt.result_json };
  }
  for (const id of [...pdmUserIds].sort()) {
    await client.execute(`
      SELECT pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext('aipdm-dev121-subject'), pg_catalog.hashtext(:pdmUserId))
    `, { pdmUserId: id });
  }
  for (const relation of LOCAL_SOURCE_RELATIONS) {
    await client.execute(`LOCK TABLE ${relation} IN SHARE ROW EXCLUSIVE MODE`);
  }
  return { status: "locked" };
}

export const PRINCIPAL_CUTOVER_LOCKED_RELATIONS = LOCAL_SOURCE_RELATIONS;

/** Fail closed if a READ COMMITTED source reader was not preceded by every owner lock. */
export async function requirePrincipalCutoverSourceLocks(
  client: Pick<AsyncDatabaseClient, "kind" | "queryOne">
) {
  if (client.kind !== "postgres") throw new Error("PRINCIPAL_CUTOVER_LOCKS_MISSING");
  const relations = LOCAL_SOURCE_RELATIONS.map((relation) => `'${relation}'::regclass`).join(",");
  const row = await client.queryOne<LockReadbackRow>(`
    SELECT count(DISTINCT relation)::integer AS held,
           ${LOCAL_SOURCE_RELATIONS.length} AS expected
    FROM pg_catalog.pg_locks
    WHERE pid=pg_catalog.pg_backend_pid() AND granted
      AND mode='ShareRowExclusiveLock'
      AND relation=ANY(ARRAY[${relations}])
  `);
  if (Number(row?.held) !== LOCAL_SOURCE_RELATIONS.length ||
    row?.expected !== LOCAL_SOURCE_RELATIONS.length) {
    throw new Error("PRINCIPAL_CUTOVER_LOCKS_MISSING");
  }
}
