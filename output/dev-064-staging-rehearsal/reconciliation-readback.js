const { Pool } = require("pg");

const BASELINE_SOURCE_HASH = "a2f321eb55a9a4d9e2561eb184e57522";
const pool = new Pool({
  host: "127.0.0.1",
  port: Number(process.env.PDM_CLOUD_SQL_PORT || 5432),
  database: process.env.PDM_CLOUD_SQL_DATABASE,
  user: process.env.PDM_CLOUD_SQL_USER,
  ssl: false,
  max: 1,
  connectionTimeoutMillis: 60000,
  statement_timeout: 60000,
  query_timeout: 65000,
  application_name: "ai-pdm-dev-064-staging-reconciliation"
});

const reconciliationSql = `
WITH source AS (
  SELECT
    r.*,
    w.lifecycle_status AS workspace_lifecycle_status,
    CASE
      WHEN r.draft_item_type = 'root' THEN (
        SELECT COUNT(*)::int FROM numbering_draft_roots item
        WHERE item.id = r.draft_item_id
          AND item.company_id = r.company_id
          AND item.workspace_id = r.workspace_id
          AND item.candidate_reservation_id = r.id
      )
      WHEN r.draft_item_type = 'part' THEN (
        SELECT COUNT(*)::int FROM numbering_draft_parts item
        WHERE item.id = r.draft_item_id
          AND item.company_id = r.company_id
          AND item.workspace_id = r.workspace_id
          AND item.candidate_reservation_id = r.id
      )
      WHEN r.draft_item_type = 'drawing' THEN (
        SELECT COUNT(*)::int FROM drawings item
        WHERE item.candidate_reservation_id = r.id
          AND item.company_id = r.company_id
          AND item.workspace_id = r.workspace_id
          AND item.drawing_draft_id = r.draft_item_id
      )
      ELSE 0
    END AS mapping_count,
    CASE
      WHEN r.draft_item_type = 'drawing' THEN 'canonical_drawing'
      WHEN r.draft_item_type IN ('root', 'part') THEN 'workspace_bundle_compatibility'
      ELSE 'unmapped'
    END AS mapping_kind,
    CASE
      WHEN r.reservation_state = 'promoted' OR w.lifecycle_status = 'published'
        THEN 'rd_controlled/released'
      WHEN r.reservation_state = 'recycled' OR w.lifecycle_status = 'cancelled'
        THEN 'obsolete/merged/cancelled/history_only'
      WHEN r.reservation_state = 'review_locked'
        THEN 'in_review/auto_finalizing'
      WHEN r.reservation_state = 'approved_locked'
        THEN 'drawing_addendum_required'
      WHEN r.reservation_state = 'active'
        THEN 'building/drawing_preparation/bundle_ready'
      ELSE 'recovery_required'
    END AS adoption_bucket
  FROM number_candidate_reservations r
  LEFT JOIN numbering_draft_workspaces w
    ON w.id = r.workspace_id AND w.company_id = r.company_id
),
source_hash AS (
  SELECT md5(COALESCE(string_agg(md5(row_to_json(r)::text), '' ORDER BY id), '')) AS value
  FROM number_candidate_reservations r
),
bucket_counts AS (
  SELECT adoption_bucket, COUNT(DISTINCT id)::int AS count
  FROM source
  GROUP BY adoption_bucket
),
mapping_counts AS (
  SELECT mapping_kind, COUNT(DISTINCT id)::int AS count
  FROM source
  WHERE mapping_count = 1
  GROUP BY mapping_kind
),
state_counts AS (
  SELECT draft_item_type, reservation_state, COUNT(*)::int AS count
  FROM source
  GROUP BY draft_item_type, reservation_state
)
SELECT jsonb_build_object(
  'source_count', (SELECT COUNT(*)::int FROM source),
  'source_distinct_id_count', (SELECT COUNT(DISTINCT id)::int FROM source),
  'distinct_mapped_count', (SELECT COUNT(DISTINCT id)::int FROM source WHERE mapping_count = 1),
  'bucket_distinct_id_sum', (SELECT COALESCE(SUM(count), 0)::int FROM bucket_counts),
  'unmapped', (SELECT COUNT(*)::int FROM source WHERE mapping_count = 0),
  'duplicate_mapping', (SELECT COUNT(*)::int FROM source WHERE mapping_count > 1),
  'renumbered', (
    SELECT COUNT(*)::int
    FROM source r
    JOIN drawings d ON d.candidate_reservation_id = r.id
    WHERE r.draft_item_type = 'drawing'
      AND d.drawing_number IS DISTINCT FROM r.candidate_code
  ),
  'source_hash', (SELECT value FROM source_hash),
  'baseline_source_hash', '${BASELINE_SOURCE_HASH}',
  'source_row_hash_changed', (SELECT CASE WHEN value = '${BASELINE_SOURCE_HASH}' THEN 0 ELSE 1 END FROM source_hash),
  'bucket_counts', (SELECT COALESCE(jsonb_object_agg(adoption_bucket, count), '{}'::jsonb) FROM bucket_counts),
  'mapping_counts', (SELECT COALESCE(jsonb_object_agg(mapping_kind, count), '{}'::jsonb) FROM mapping_counts),
  'state_counts', (SELECT COALESCE(jsonb_agg(to_jsonb(state_counts) ORDER BY draft_item_type, reservation_state), '[]'::jsonb) FROM state_counts),
  'migration_count', (SELECT COUNT(*)::int FROM pdm_schema_migrations),
  'migration_distinct_version_count', (SELECT COUNT(DISTINCT version)::int FROM pdm_schema_migrations),
  'migration_versions', (SELECT jsonb_agg(version ORDER BY version) FROM pdm_schema_migrations),
  'drawing_count', (SELECT COUNT(*)::int FROM drawings),
  'drawing_revision_count', (SELECT COUNT(*)::int FROM drawing_revisions),
  'drawing_revision_file_count', (SELECT COUNT(*)::int FROM drawing_revision_files),
  'non_drawing_reservation_misprojected_as_drawing', (
    SELECT COUNT(*)::int
    FROM number_candidate_reservations r
    JOIN drawings d ON d.candidate_reservation_id = r.id
    WHERE r.draft_item_type <> 'drawing'
  ),
  'duplicate_active_drawing_numbers', (
    SELECT COUNT(*)::int FROM (
      SELECT company_id, drawing_number
      FROM drawings
      WHERE drawing_number IS NOT NULL AND lifecycle_state <> 'cancelled'
      GROUP BY company_id, drawing_number
      HAVING COUNT(*) > 1
    ) duplicate
  )
) AS result;
`;

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    const identity = await client.query("SELECT current_user, current_database(), pg_is_in_recovery() AS is_replica");
    const reconciliation = await client.query(reconciliationSql);
    await client.query("COMMIT");
    console.log(JSON.stringify({
      kind: "DEV064_STAGING_POST_MIGRATION_RECONCILIATION",
      identity: identity.rows[0],
      reconciliation: reconciliation.rows[0].result
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(async (error) => {
  console.error(error.message);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
