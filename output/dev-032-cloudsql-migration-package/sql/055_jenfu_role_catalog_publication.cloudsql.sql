-- DEV-046 Cloud SQL candidate generated from db/postgres/055_jenfu_role_catalog_publication.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.
-- Jenfu platform database roles are mapped to the managed Cloud SQL pdm_migration/pdm_runtime roles.

-- DEV-005 S1: AI-PDM app-owned role catalog publication.
-- Additive and idempotent.  This migration only creates the publication
-- boundary; it does not import users, Position data, or assignments and it
-- does not change the legacy authorization source.
-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:5
SELECT pg_advisory_xact_lock(hashtext('ai-pdm:dev-005:role-catalog-publication'));
SET LOCAL ROLE pdm_migration;

DO $cloudsql_bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_namespace
     WHERE nspname = 'ai_pdm_contract'
  ) OR NOT has_schema_privilege('pdm_migration', 'ai_pdm_contract', 'USAGE')
    OR NOT has_schema_privilege('pdm_migration', 'ai_pdm_contract', 'CREATE') THEN
    RAISE EXCEPTION 'CLOUDSQL_ADMIN_BOOTSTRAP_SCHEMA_MISSING_OR_INACCESSIBLE:ai_pdm_contract';
  END IF;
END
$cloudsql_bootstrap$;
-- CLOUDSQL_ADMIN_BOOTSTRAP_RETAINS_AI_PDM_CONTRACT_SCHEMA_OWNERSHIP;

CREATE TABLE IF NOT EXISTS ai_pdm_contract.role_catalog_publications (
  catalog_version TEXT PRIMARY KEY,
  contract_version TEXT NOT NULL,
  application_id TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  catalog_sha256 TEXT NOT NULL CHECK (catalog_sha256 ~ '^[a-f0-9]{64}$'),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'retired')),
  published_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  CHECK (contract_version = 'jenfu.platform-entitlement.v1'),
  CHECK (application_id = 'ai-pdm'),
  CHECK (status <> 'active' OR retired_at IS NULL)
);

CREATE TABLE IF NOT EXISTS ai_pdm_contract.role_catalog_entries (
  catalog_version TEXT NOT NULL REFERENCES ai_pdm_contract.role_catalog_publications(catalog_version),
  display_order INTEGER NOT NULL CHECK (display_order >= 0),
  stable_role_id TEXT NOT NULL,
  role_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  assignable BOOLEAN NOT NULL,
  risk TEXT NOT NULL CHECK (risk IN ('normal', 'high', 'critical')),
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('employee', 'principal')),
  recommendation_allowed BOOLEAN NOT NULL,
  delegation_allowed BOOLEAN NOT NULL,
  allowed_scope_kinds JSONB NOT NULL,
  assignment_tier TEXT NOT NULL CHECK (assignment_tier IN ('app_admin', 'cross_app_override')),
  permissions JSONB NOT NULL,
  metadata JSONB,
  role_definition_hash TEXT NOT NULL CHECK (role_definition_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (catalog_version, stable_role_id),
  UNIQUE (catalog_version, role_code),
  CHECK (jsonb_typeof(allowed_scope_kinds) = 'array'),
  CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE TABLE IF NOT EXISTS ai_pdm_contract.active_role_catalog (
  application_id TEXT PRIMARY KEY CHECK (application_id = 'ai-pdm'),
  catalog_version TEXT NOT NULL REFERENCES ai_pdm_contract.role_catalog_publications(catalog_version),
  activated_at TIMESTAMPTZ NOT NULL,
  activated_by TEXT,
  activation_reason TEXT NOT NULL,
  CHECK (length(trim(activation_reason)) BETWEEN 1 AND 240)
);

CREATE UNIQUE INDEX IF NOT EXISTS role_catalog_one_active_version
  ON ai_pdm_contract.role_catalog_publications (application_id)
  WHERE status = 'active';

CREATE OR REPLACE VIEW ai_pdm_contract.v_application_role_catalog_v1 AS
SELECT
  p.contract_version,
  p.application_id,
  p.catalog_version,
  p.published_at,
  p.catalog_sha256,
  e.display_order,
  e.stable_role_id,
  e.role_code,
  e.display_name,
  e.assignable,
  e.risk,
  e.subject_kind,
  e.recommendation_allowed,
  e.delegation_allowed,
  e.allowed_scope_kinds,
  e.assignment_tier,
  e.permissions,
  e.metadata,
  e.role_definition_hash
FROM ai_pdm_contract.active_role_catalog active
JOIN ai_pdm_contract.role_catalog_publications p
  ON p.application_id = active.application_id
 AND p.catalog_version = active.catalog_version
 AND p.status = 'active'
JOIN ai_pdm_contract.role_catalog_entries e
  ON e.catalog_version = p.catalog_version
WHERE p.application_id = 'ai-pdm';

ALTER TABLE ai_pdm_contract.role_catalog_publications OWNER TO pdm_migration;
ALTER TABLE ai_pdm_contract.role_catalog_entries OWNER TO pdm_migration;
ALTER TABLE ai_pdm_contract.active_role_catalog OWNER TO pdm_migration;
ALTER VIEW ai_pdm_contract.v_application_role_catalog_v1 OWNER TO pdm_migration;

-- CLOUDSQL_ADMIN_BOOTSTRAP_REVOKED_PUBLIC_AI_PDM_CONTRACT_SCHEMA_ACCESS;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_pdm_contract FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA ai_pdm_contract
  FROM pdm_runtime;
-- CLOUDSQL_ADMIN_BOOTSTRAP_GRANTED_RUNTIME_AI_PDM_CONTRACT_SCHEMA_USAGE;
GRANT SELECT ON ai_pdm_contract.v_application_role_catalog_v1
  TO pdm_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA ai_pdm_contract
  REVOKE ALL ON TABLES FROM PUBLIC;

COMMENT ON VIEW ai_pdm_contract.v_application_role_catalog_v1 IS
  'AI-PDM runtime read-only catalog projection; assignment catalogVersion is provenance only.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:122
