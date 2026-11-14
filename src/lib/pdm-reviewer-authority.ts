import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { PdmRevocationCommand } from "@/lib/pdm-session-revocation-contract";

const contractVersion = "orgmaster.ai-pdm-reviewer-authority.v1";
const utcMicros = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
const isoTime = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/u;
const opaque = /^[A-Za-z0-9._:@/-]{1,255}$/u;
const hex = /^[0-9a-f]{64}$/u;
type Account = { employee_id: string; account_type: "human_personal" | "human_privileged" };
export type ReviewerGrant = {
  employee_id: string; subject_kind: "employee" | "principal"; target_principal_id: string | null;
  stable_role_id: string; role_code: string; catalog_version: string;
  scope_kind: "global" | "workspace" | "project"; scope_key: string | null;
  grant_kind: "direct" | "delegated"; admin_catalog_sha256: string | null; role_definition_hash: string | null;
};
type Interval = { valid_from: string; valid_until: string | null; accounts: Account[]; grants: ReviewerGrant[] };
type Principal = { principal_id: string; intervals: Interval[] };
type Envelope = { contract_version: string; source_version: string; as_of: string; principals: unknown;
  next_after_principal_id?: string | null; operation_id?: string };

function invalid(): never { throw new Error("PRINCIPAL_REVIEWER_PROJECTION_UNAVAILABLE"); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
const matches = (value: unknown, pattern: RegExp): value is string => typeof value === "string" && pattern.test(value);
const nonBlank = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 255 && value.trim() === value;
function timestamp(value: unknown): string {
  if (!matches(value, isoTime) || !Number.isFinite(Date.parse(value))) invalid();
  const [, seconds, fraction] = /^(.*?)(?:\.(\d+))?(?:Z|\+00:00)$/u.exec(value)!;
  if (new Date(value).toISOString().slice(0, 19) !== seconds) invalid();
  return `${seconds}.${(fraction ?? "").padEnd(6, "0")}Z`;
}

function parseEnvelope(row: Envelope | null, limit: number) {
  if (!row || row.contract_version !== contractVersion ||
      !matches(row.source_version, /^(0|[1-9]\d{0,18})$/u) || BigInt(row.source_version) > 9223372036854775807n ||
      !Array.isArray(row.principals) || row.principals.length > limit) invalid();
  const asOf = timestamp(row.as_of);
  let previous = "";
  const principals = row.principals.map((item): Principal => {
    const principal = record(item);
    const principalId = principal.principal_id;
    if (!matches(principalId, opaque) || principalId <= previous || !Array.isArray(principal.intervals)) invalid();
    previous = principalId;
    let boundary: string | null = asOf;
    const intervals = principal.intervals.map((value): Interval => {
      const interval = record(value);
      const start = timestamp(interval.valid_from);
      const end = interval.valid_until === null ? null : timestamp(interval.valid_until);
      if (start !== boundary || (end !== null && end <= start) ||
          !Array.isArray(interval.accounts) || !Array.isArray(interval.grants)) invalid();
      boundary = end;
      const accountKeys = new Set<string>();
      const accounts = interval.accounts.map((value): Account => {
        const { employee_id, account_type } = record(value);
        const key = JSON.stringify([employee_id, account_type]);
        if (!matches(employee_id, opaque) || (account_type !== "human_personal" && account_type !== "human_privileged") ||
            accountKeys.has(key)) invalid();
        accountKeys.add(key);
        return { employee_id, account_type };
      });
      const grantKeys = new Set<string>();
      const grants = interval.grants.map(value => {
        const grant = record(value);
        const { employee_id, subject_kind, target_principal_id, stable_role_id, role_code, catalog_version,
          scope_kind, scope_key, grant_kind, admin_catalog_sha256, role_definition_hash } = grant;
        const key = JSON.stringify([employee_id, stable_role_id, role_code, scope_kind, scope_key]);
        if (!matches(employee_id, opaque) || !nonBlank(stable_role_id) || !nonBlank(role_code) ||
            !nonBlank(catalog_version) || (subject_kind !== "principal" && subject_kind !== "employee") ||
            (subject_kind === "principal" ? target_principal_id !== principalId : target_principal_id !== null) ||
            !["global", "workspace", "project"].includes(String(scope_kind)) ||
            (scope_kind === "global" ? scope_key !== null : !nonBlank(scope_key)) ||
            (grant_kind !== "direct" && grant_kind !== "delegated") ||
            (admin_catalog_sha256 !== null && !matches(admin_catalog_sha256, hex)) ||
            (role_definition_hash !== null && !matches(role_definition_hash, hex)) || grantKeys.has(key)) invalid();
        grantKeys.add(key);
        return grant as ReviewerGrant;
      });
      return { valid_from: start, valid_until: end, accounts, grants };
    });
    if (intervals.length > 0 && boundary !== null) invalid();
    return { principal_id: principalId, intervals };
  });
  return { asOf, principals, version: row.source_version };
}

async function store(tx: AsyncDatabaseClient, principals: Principal[], version: string, operationId: string | null) {
  const changed = await tx.query<{ principal_id: string }>(`
    INSERT INTO ai_pdm_core.reviewer_authority(principal_id,source_version)
    SELECT entry.principal_id,CAST(:version AS bigint)
    FROM jsonb_to_recordset(CAST(:principals AS jsonb)) entry(principal_id text)
    ORDER BY entry.principal_id COLLATE "C"
    ON CONFLICT(principal_id) DO UPDATE SET source_version=EXCLUDED.source_version,pending_operation_id=NULL
    WHERE (CAST(:operationId AS uuid) IS NOT NULL AND
           ai_pdm_core.reviewer_authority.pending_operation_id=CAST(:operationId AS uuid))
      OR (CAST(:operationId AS uuid) IS NULL
        AND ai_pdm_core.reviewer_authority.source_version<=EXCLUDED.source_version
        AND ai_pdm_core.reviewer_authority.pending_operation_id IS NULL)
    RETURNING principal_id
  `, { version, operationId, principals: JSON.stringify(principals) });
  if (operationId !== null && changed.length !== principals.length) invalid();
  const ids = changed.map(row => row.principal_id);
  await tx.execute("DELETE FROM ai_pdm_core.reviewer_authority_intervals WHERE principal_id=ANY(CAST(:ids AS text[]))", { ids });
  await tx.execute(`
    INSERT INTO ai_pdm_core.reviewer_authority_intervals (principal_id,valid_from,valid_until,accounts,grants)
    SELECT principal.principal_id,period.valid_from,period.valid_until,period.accounts,period.grants
    FROM jsonb_to_recordset(CAST(:principals AS jsonb)) principal(principal_id text,intervals jsonb)
    CROSS JOIN LATERAL jsonb_to_recordset(principal.intervals)
      period(valid_from timestamptz,valid_until timestamptz,accounts jsonb,grants jsonb)
    WHERE principal.principal_id=ANY(CAST(:ids AS text[]))
  `, { ids, principals: JSON.stringify(principals) });
}

export async function initializeReviewerAuthority(database: AsyncDatabaseClient, refresh = false) {
  await database.transaction(async tx => {
    await tx.execute("SET LOCAL statement_timeout='30s'");
    await lockReviewerProjection(tx);
    const exists = await tx.queryOne("SELECT initial_source_version FROM ai_pdm_core.reviewer_authority_state");
    if (exists && !refresh) return;
    let version: string | null = null, asOf: string | null = null, after: string | null = null;
    do {
      const row: Envelope | null = await tx.queryOne<Envelope>(`
        SELECT contract_version,source_version,next_after_principal_id,principals,
          to_char(as_of AT TIME ZONE 'UTC',:utcMicros) AS as_of
        FROM orgmaster_contract.read_ai_pdm_reviewer_snapshot_v1(:version,CAST(:asOf AS timestamptz),:after,128)
      `, { version, asOf, after, utcMicros });
      const page = parseEnvelope(row, 128);
      const cursor: string | null | undefined = row?.next_after_principal_id;
      if ((version !== null && page.version !== version) || (asOf !== null && page.asOf !== asOf) ||
          (after !== null && (!page.principals[0] || page.principals[0].principal_id <= after)) ||
          (cursor !== null && (!cursor || cursor !== page.principals.at(-1)?.principal_id))) invalid();
      version = page.version;
      asOf = page.asOf;
      await store(tx, page.principals, version, null);
      after = cursor ?? null;
    } while (after !== null);
    const confirmation = await tx.queryOne<{ source_version: string }>(`
      SELECT source_version FROM orgmaster_contract.read_ai_pdm_reviewer_snapshot_v1(:version,CAST(:asOf AS timestamptz),NULL,1)
    `, { version, asOf });
    if (confirmation?.source_version !== version) invalid();
    await tx.execute(`
      WITH skipped AS (
        UPDATE ai_pdm_core.reviewer_authority SET source_version=CAST(:version AS bigint)
        WHERE pending_operation_id IS NULL AND source_version<CAST(:version AS bigint)
        RETURNING principal_id
      )
      DELETE FROM ai_pdm_core.reviewer_authority_intervals interval
      USING skipped WHERE interval.principal_id=skipped.principal_id
    `, { version });
    await tx.execute(`INSERT INTO ai_pdm_core.reviewer_authority_state VALUES(true,CAST(:version AS bigint))
      ON CONFLICT(singleton) DO UPDATE SET initial_source_version=EXCLUDED.initial_source_version
      WHERE ai_pdm_core.reviewer_authority_state.initial_source_version<=EXCLUDED.initial_source_version`, { version });
  }, { isolationLevel: "read_committed", readOnly: false });
}

export async function lockReviewerProjection(tx: AsyncDatabaseClient) {
  await tx.execute("SELECT pg_advisory_xact_lock(hashtext('ai-pdm.reviewer-authority.initial'))");
}

export async function updateReviewerAuthority(tx: AsyncDatabaseClient, command: PdmRevocationCommand) {
  if (command.phase === "cancelled") {
    await tx.execute(`UPDATE ai_pdm_core.reviewer_authority SET pending_operation_id=NULL
      WHERE pending_operation_id=CAST(:operationId AS uuid) AND principal_id=ANY(CAST(:principalIds AS text[]))`, command);
  }
  if (command.phase !== "published") return;
  const row = await tx.queryOne<Envelope>(`
    SELECT contract_version,operation_id,source_version,principals,
      to_char(as_of AT TIME ZONE 'UTC',:utcMicros) AS as_of
    FROM orgmaster_contract.read_ai_pdm_reviewer_publication_v1(CAST(:operationId AS uuid),:publicationVersion)
  `, { ...command, utcMicros });
  const page = parseEnvelope(row, 4096);
  if (row?.operation_id !== command.operationId || page.version !== command.publicationVersion ||
      page.principals.length !== command.principalIds.length ||
      page.principals.some((principal, index) => principal.principal_id !== command.principalIds[index])) invalid();
  await store(tx, page.principals, page.version, command.operationId);
}
