#!/usr/bin/env node

import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

export const DEV076_STAGING_PROJECT = "jenfu-ai-pdm-stg-361825";
export const DEV076_STAGING_CONNECTION = "jenfu-ai-pdm-stg-361825:asia-east1:ai-pdm-stg-postgres";
export const DEV076_STAGING_DATABASE = "ai_pdm";
export const DEV076_RECONCILIATION_VERSION = "dev-076-candidate-relation-reconciliation/v1";

export const DEV076_RELATION_RECONCILIATION_SQL = `
WITH candidate_rows AS (
  SELECT
    w.company_id,
    w.id AS workspace_id,
    w.lifecycle_status,
    root_reservation.candidate_code AS root_code,
    drawing.id AS drawing_id,
    drawing_reservation.candidate_code AS drawing_code,
    drawing.purpose_code,
    part.id AS part_id,
    part_reservation.candidate_code AS part_code,
    part.item_kind,
    relation.id AS relation_id,
    relation.link_type,
    relation.is_primary
  FROM numbering_draft_workspaces w
  LEFT JOIN numbering_draft_roots root ON root.workspace_id = w.id AND root.company_id = w.company_id
  LEFT JOIN number_candidate_reservations root_reservation ON root_reservation.id = root.candidate_reservation_id
  LEFT JOIN numbering_draft_parts part ON part.workspace_id = w.id AND part.company_id = w.company_id
  LEFT JOIN number_candidate_reservations part_reservation ON part_reservation.id = part.candidate_reservation_id
  LEFT JOIN numbering_draft_drawings drawing ON drawing.workspace_id = w.id AND drawing.company_id = w.company_id
  LEFT JOIN number_candidate_reservations drawing_reservation ON drawing_reservation.id = drawing.candidate_reservation_id
  LEFT JOIN numbering_draft_relations relation
    ON relation.workspace_id = w.id
   AND relation.company_id = w.company_id
   AND relation.part_draft_id = part.id
   AND relation.drawing_draft_id = drawing.id
  WHERE w.source_root_id IS NULL AND w.lifecycle_status <> 'published'
),
invalid_relation_scope AS (
  SELECT
    w.company_id,
    w.id AS workspace_id,
    COUNT(*) FILTER (
      WHERE drawing.id IS NULL
        OR part.id IS NULL
        OR drawing.company_id <> relation.company_id
        OR part.company_id <> relation.company_id
        OR drawing.workspace_id <> relation.workspace_id
        OR part.workspace_id <> relation.workspace_id
    )::int AS invalid_scope_count
  FROM numbering_draft_workspaces w
  JOIN numbering_draft_relations relation
    ON relation.workspace_id = w.id AND relation.company_id = w.company_id
  LEFT JOIN numbering_draft_drawings drawing ON drawing.id = relation.drawing_draft_id
  LEFT JOIN numbering_draft_parts part ON part.id = relation.part_draft_id
  WHERE w.source_root_id IS NULL AND w.lifecycle_status <> 'published'
  GROUP BY w.company_id, w.id
),
required_part_health AS (
  SELECT
    w.company_id,
    w.id AS workspace_id,
    part.id AS part_id,
    COUNT(relation.id) FILTER (
      WHERE relation.link_type = 'primary_manufacturing'
        AND relation.is_primary = 1
        AND drawing.purpose_code IN ('M', 'MA')
        AND relation.company_id = w.company_id
        AND relation.workspace_id = w.id
        AND drawing.company_id = w.company_id
        AND drawing.workspace_id = w.id
    )::int AS valid_primary_count
  FROM numbering_draft_workspaces w
  JOIN numbering_draft_parts part ON part.workspace_id = w.id AND part.company_id = w.company_id
  LEFT JOIN numbering_draft_relations relation
    ON relation.workspace_id = w.id AND relation.company_id = w.company_id AND relation.part_draft_id = part.id
  LEFT JOIN numbering_draft_drawings drawing ON drawing.id = relation.drawing_draft_id
  WHERE w.source_root_id IS NULL
    AND w.lifecycle_status <> 'published'
    AND part.item_kind IN ('manufactured', 'outsourced', 'custom')
  GROUP BY w.company_id, w.id, part.id
),
workspace_rollup AS (
  SELECT
    candidate.company_id,
    candidate.workspace_id,
    candidate.lifecycle_status,
    MAX(candidate.root_code) AS root_code,
    COUNT(DISTINCT candidate.drawing_id)::int AS drawing_count,
    COUNT(DISTINCT candidate.part_id)::int AS part_count,
    COUNT(DISTINCT candidate.relation_id)::int AS relation_count,
    COUNT(DISTINCT candidate.relation_id) FILTER (WHERE candidate.link_type = 'primary_manufacturing' AND candidate.is_primary = 1)::int AS primary_relation_count,
    COUNT(DISTINCT candidate.relation_id) FILTER (WHERE candidate.link_type = 'reference')::int AS reference_relation_count,
    COALESCE(MAX(scope.invalid_scope_count), 0)::int AS invalid_scope_count,
    COUNT(DISTINCT health.part_id) FILTER (WHERE health.valid_primary_count = 0)::int AS missing_primary_part_count,
    COUNT(DISTINCT health.part_id) FILTER (WHERE health.valid_primary_count > 1)::int AS duplicate_primary_part_count,
    md5(COALESCE(string_agg(
      concat_ws('|', candidate.company_id, candidate.workspace_id, candidate.lifecycle_status,
        COALESCE(candidate.root_code, ''), COALESCE(candidate.drawing_id, ''), COALESCE(candidate.drawing_code, ''),
        COALESCE(candidate.purpose_code, ''), COALESCE(candidate.part_id, ''), COALESCE(candidate.part_code, ''),
        COALESCE(candidate.item_kind, ''), COALESCE(candidate.relation_id, ''), COALESCE(candidate.link_type, ''),
        COALESCE(candidate.is_primary::text, '')), E'\n'
      ORDER BY candidate.drawing_id, candidate.part_id, candidate.relation_id
    ), '')) AS relation_pair_hash
  FROM candidate_rows candidate
  LEFT JOIN required_part_health health
    ON health.company_id = candidate.company_id
   AND health.workspace_id = candidate.workspace_id
   AND health.part_id = candidate.part_id
  LEFT JOIN invalid_relation_scope scope
    ON scope.company_id = candidate.company_id
   AND scope.workspace_id = candidate.workspace_id
  GROUP BY candidate.company_id, candidate.workspace_id, candidate.lifecycle_status
),
formal_rollup AS (
  SELECT
    COUNT(*)::int AS relation_count,
    md5(COALESCE(string_agg(
      concat_ws('|', root.company_id, root.root_code, drawing.drawing_number, part.part_number, link.link_type), E'\n'
      ORDER BY root.root_code, drawing.drawing_number, part.part_number, link.id
    ), '')) AS relation_pair_hash
  FROM drawing_part_links link
  JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
  JOIN part_numbers part ON part.id = link.part_number_id
  JOIN part_roots root ON root.id = part.part_root_id AND root.id = drawing.part_root_id AND root.company_id = part.company_id AND root.company_id = drawing.company_id
)
SELECT jsonb_build_object(
  'workspace_count', (SELECT COUNT(*)::int FROM workspace_rollup),
  'active_workspace_count', (SELECT COUNT(*)::int FROM workspace_rollup WHERE lifecycle_status = 'active'),
  'cancelled_workspace_count', (SELECT COUNT(*)::int FROM workspace_rollup WHERE lifecycle_status = 'cancelled'),
  'active_invalid_scope_count', (SELECT COALESCE(SUM(invalid_scope_count), 0)::int FROM workspace_rollup WHERE lifecycle_status = 'active'),
  'active_missing_primary_part_count', (SELECT COALESCE(SUM(missing_primary_part_count), 0)::int FROM workspace_rollup WHERE lifecycle_status = 'active'),
  'active_duplicate_primary_part_count', (SELECT COALESCE(SUM(duplicate_primary_part_count), 0)::int FROM workspace_rollup WHERE lifecycle_status = 'active'),
  'target_workspaces', (
    SELECT COALESCE(jsonb_agg(to_jsonb(workspace_rollup) ORDER BY root_code, lifecycle_status, workspace_id), '[]'::jsonb)
    FROM workspace_rollup
    WHERE root_code IN ('A0002', 'A0003', 'A0004')
  ),
  'formal_relations', (SELECT to_jsonb(formal_rollup) FROM formal_rollup),
  'all_candidate_pair_hash', (
    SELECT md5(COALESCE(string_agg(
      concat_ws('|', company_id, workspace_id, lifecycle_status, COALESCE(root_code, ''), relation_pair_hash), E'\n'
      ORDER BY root_code, lifecycle_status, workspace_id
    ), '')) FROM workspace_rollup
  )
) AS result;
`;

export function assertDev076StagingEnvironment(env = process.env) {
  if (env.PDM_MIGRATION_PACKAGE_TARGET !== "staging") throw new Error("DEV076_STAGING_TARGET_REQUIRED");
  if (env.PDM_CLOUD_SQL_INSTANCE_CONNECTION_NAME !== DEV076_STAGING_CONNECTION) throw new Error("DEV076_STAGING_CONNECTION_MISMATCH");
  if ((env.PDM_CLOUD_SQL_DATABASE ?? DEV076_STAGING_DATABASE) !== DEV076_STAGING_DATABASE) throw new Error("DEV076_STAGING_DATABASE_MISMATCH");
  if ((env.PDM_CLOUD_SQL_HOST ?? "127.0.0.1") !== "127.0.0.1") throw new Error("DEV076_CLOUD_SQL_PROXY_REQUIRED");
  if (env.PDM_POSTGRES_URL?.trim() || env.PDM_POSTGRES_ADMIN_URL?.trim() || env.PDM_CLOUD_SQL_PASSWORD?.trim()) {
    throw new Error("DEV076_STATIC_DATABASE_SECRET_FORBIDDEN");
  }
}

export function assertDev076ReconciliationResult(result) {
  const targets = Array.isArray(result?.target_workspaces) ? result.target_workspaces : [];
  for (const rootCode of ["A0002", "A0003", "A0004"]) {
    const active = targets.filter((row) => row.root_code === rootCode && row.lifecycle_status === "active");
    if (active.length !== 1) throw new Error(`DEV076_TARGET_ACTIVE_WORKSPACE_COUNT_INVALID:${rootCode}:${active.length}`);
    const row = active[0];
    if (Number(row.drawing_count) < 1 || Number(row.part_count) < 1 || Number(row.relation_count) < 1) {
      throw new Error(`DEV076_TARGET_RELATION_EMPTY:${rootCode}`);
    }
    if (Number(row.invalid_scope_count) !== 0 || Number(row.missing_primary_part_count) !== 0 || Number(row.duplicate_primary_part_count) !== 0) {
      throw new Error(`DEV076_TARGET_RELATION_INVALID:${rootCode}`);
    }
  }
  if (Number(result.active_invalid_scope_count) !== 0) throw new Error("DEV076_ACTIVE_RELATION_SCOPE_INVALID");
}

export async function runDev076StagingRelationReconciliation(env = process.env) {
  assertDev076StagingEnvironment(env);
  const pool = new pg.Pool({
    host: "127.0.0.1",
    port: Number.parseInt(env.PDM_CLOUD_SQL_PORT || "5432", 10),
    database: DEV076_STAGING_DATABASE,
    user: env.PDM_CLOUD_SQL_USER,
    password: undefined,
    ssl: false,
    max: 1,
    connectionTimeoutMillis: Number.parseInt(env.PDM_CLOUD_SQL_CONNECTION_TIMEOUT_MS || "60000", 10),
    statement_timeout: Number.parseInt(env.PDM_CLOUD_SQL_STATEMENT_TIMEOUT_MS || "60000", 10),
    query_timeout: Number.parseInt(env.PDM_CLOUD_SQL_QUERY_TIMEOUT_MS || "65000", 10),
    application_name: "ai-pdm-dev-076-staging-reconciliation"
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = await client.query("SELECT current_user, current_database(), current_setting('transaction_read_only') AS transaction_read_only");
    const reconciliation = await client.query(DEV076_RELATION_RECONCILIATION_SQL);
    assertDev076ReconciliationResult(reconciliation.rows[0].result);
    await client.query("COMMIT");
    return {
      kind: "DEV076_STAGING_RELATION_RECONCILIATION",
      version: DEV076_RECONCILIATION_VERSION,
      targetProject: DEV076_STAGING_PROJECT,
      sourceRevision: env.PDM_SOURCE_REVISION ?? "unknown",
      productionConnection: false,
      databaseWrites: false,
      identity: identity.rows[0],
      reconciliation: reconciliation.rows[0].result
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  try {
    console.log(JSON.stringify(await runDev076StagingRelationReconciliation(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
