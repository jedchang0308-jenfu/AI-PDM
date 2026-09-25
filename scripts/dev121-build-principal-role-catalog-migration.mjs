import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrincipalRoleCatalog } from './dev121-build-principal-role-catalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'config/access-control/jenfu-role-catalog.v1.json')
const catalogPath = join(root, 'config/access-control/jenfu-role-catalog.v4.json')
const migrationPath = join(root, 'db/postgres/066_dev121_principal_role_catalog_v4.sql')
const v3 = 'ai-pdm.role-catalog.2026-09-03.v3'
const v3Hash = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'

export function principalCatalogMigration(catalog) {
  assert.equal(catalog.catalogVersion, 'ai-pdm.role-catalog.2026-09-25.v4')
  assert.equal(catalog.catalogSha256, '32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a')
  assert.equal(catalog.roles.length, 9)
  const literal = JSON.stringify(catalog)
  assert.ok(!literal.includes('$dev121_catalog$'))
  return `-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: additive versioned role catalog publication
-- compatibility: new-version
-- governance-review: AIPDM/DEV-121#principal-owner-command-amendment
-- Owner release: apply after migration 065; publish v4 without service traffic.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev121-principal-role-catalog-v4'), hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

DO $dev121_catalog_upgrade$
DECLARE
  catalog jsonb := $dev121_catalog$${literal}$dev121_catalog$::jsonb;
  previous_version text := '${v3}';
  previous_hash text := '${v3Hash}';
  next_version text := catalog->>'catalogVersion';
  next_hash text := catalog->>'catalogSha256';
  current_version text;
  previous_status text;
  previous_observed_hash text;
  next_status text;
  next_observed_hash text;
  previous_count integer;
  next_count integer;
  mismatch_count integer;
  role_value jsonb;
  role_order bigint;
BEGIN
  SELECT catalog_version INTO current_version
    FROM ai_pdm_core.active_role_catalog
    WHERE application_id = 'ai-pdm' FOR UPDATE;
  SELECT status, catalog_sha256 INTO previous_status, previous_observed_hash
    FROM ai_pdm_core.role_catalog_publications
    WHERE catalog_version = previous_version AND application_id = 'ai-pdm' FOR UPDATE;
  SELECT status, catalog_sha256 INTO next_status, next_observed_hash
    FROM ai_pdm_core.role_catalog_publications
    WHERE catalog_version = next_version AND application_id = 'ai-pdm' FOR UPDATE;
  SELECT count(*) INTO previous_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = previous_version;
  SELECT count(*) INTO next_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = next_version;
  IF previous_observed_hash IS DISTINCT FROM previous_hash OR previous_count <> 9 THEN
    RAISE EXCEPTION 'DEV121_CATALOG_V3_BASELINE_MISMATCH';
  END IF;
  IF current_version = previous_version AND previous_status = 'active'
     AND next_status IS NULL AND next_count = 0 THEN
    UPDATE ai_pdm_core.role_catalog_publications
       SET status = 'retired', retired_at = clock_timestamp()
     WHERE catalog_version = previous_version AND application_id = 'ai-pdm';
    INSERT INTO ai_pdm_core.role_catalog_publications
      (catalog_version, contract_version, application_id, published_at,
       catalog_sha256, status, published_by)
    VALUES (next_version, catalog->>'contractVersion', 'ai-pdm',
            (catalog->>'publishedAt')::timestamptz, next_hash, 'active',
            'AIPDM/DEV-121 principal-first catalog v4');
    FOR role_value, role_order IN
      SELECT value, ordinality FROM jsonb_array_elements(catalog->'roles') WITH ORDINALITY
    LOOP
      INSERT INTO ai_pdm_core.role_catalog_entries
        (catalog_version, display_order, stable_role_id, role_code, display_name,
         assignable, risk, subject_kind, recommendation_allowed, delegation_allowed,
         allowed_scope_kinds, assignment_tier, permissions, metadata, role_definition_hash)
      VALUES (next_version, (role_order - 1)::integer,
              role_value->>'stableRoleId', role_value->>'roleCode', role_value->>'displayName',
              (role_value->>'assignable')::boolean, role_value->>'risk',
              role_value->>'subjectKind', (role_value->>'recommendationAllowed')::boolean,
              (role_value->>'delegationAllowed')::boolean,
              role_value->'allowedScopeKinds', role_value->>'assignmentTier',
              role_value->'permissions', role_value->'metadata',
              role_value->>'roleDefinitionHash');
    END LOOP;
    UPDATE ai_pdm_core.active_role_catalog
       SET catalog_version = next_version, activated_at = clock_timestamp(),
           activated_by = 'AIPDM/DEV-121',
           activation_reason = 'principal-first explicit DEV-087 capabilities'
     WHERE application_id = 'ai-pdm' AND catalog_version = previous_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEV121_CATALOG_POINTER_UPDATE_FAILED'; END IF;
  ELSIF current_version <> next_version OR previous_status <> 'retired'
     OR next_status <> 'active' OR next_observed_hash <> next_hash THEN
    RAISE EXCEPTION 'DEV121_CATALOG_STATE_MISMATCH';
  END IF;
  SELECT count(*) INTO next_count FROM ai_pdm_core.role_catalog_entries
    WHERE catalog_version = next_version;
  SELECT count(*) INTO mismatch_count
    FROM jsonb_array_elements(catalog->'roles') WITH ORDINALITY AS expected(role, ordinal)
    LEFT JOIN ai_pdm_core.role_catalog_entries AS observed
      ON observed.catalog_version = next_version
     AND observed.stable_role_id = expected.role->>'stableRoleId'
    WHERE observed.stable_role_id IS NULL
       OR observed.display_order <> expected.ordinal - 1
       OR observed.role_code <> expected.role->>'roleCode'
       OR observed.role_definition_hash <> expected.role->>'roleDefinitionHash'
       OR observed.permissions IS DISTINCT FROM expected.role->'permissions';
  IF next_count <> 9 OR mismatch_count <> 0 OR
     (SELECT count(*) FROM ai_pdm_contract.v_application_role_catalog_v1
       WHERE application_id = 'ai-pdm' AND catalog_version = next_version
         AND catalog_sha256 = next_hash) <> 9 THEN
    RAISE EXCEPTION 'DEV121_CATALOG_V4_READBACK_FAILED';
  END IF;
END;
$dev121_catalog_upgrade$;
COMMIT;
`
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const migrationTexts = [
    readFileSync(join(root, 'db/postgres/012_number_state_flow_phase1a.sql'), 'utf8'),
    readFileSync(join(root, 'db/postgres/016_number_state_flow_phase1c.sql'), 'utf8')
  ]
  const expected = buildPrincipalRoleCatalog(source, migrationTexts)
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  assert.deepEqual(catalog, expected)
  const sql = principalCatalogMigration(catalog)
  if (mode === '--write') writeFileSync(migrationPath, sql)
  assert.equal(readFileSync(migrationPath, 'utf8'), sql)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256, migration: migrationPath })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
