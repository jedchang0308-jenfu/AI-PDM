-- DEV-068 drawing/CAD recognition candidate review and atomic formalization.
SET search_path = public;

CREATE TABLE IF NOT EXISTS drawing_recognition_sessions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  source_context_type TEXT NOT NULL CHECK (source_context_type IN ('candidate_revision', 'revision_package', 'drawing_revision', 'drawing_number')),
  source_context_id TEXT NOT NULL,
  source_lineage_key TEXT NOT NULL,
  drawing_id TEXT REFERENCES drawings(id) ON DELETE RESTRICT,
  drawing_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  source_set_fingerprint TEXT NOT NULL,
  deduplication_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'extracting', 'review_ready', 'extraction_partial', 'extraction_failed', 'ready_to_formalize', 'formalized', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 100,
  not_before TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  supersedes_session_id TEXT REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  conflict_count INTEGER NOT NULL DEFAULT 0 CHECK (conflict_count >= 0),
  unclassified_count INTEGER NOT NULL DEFAULT 0 CHECK (unclassified_count >= 0),
  error_code TEXT,
  error_summary TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  formalized_by TEXT REFERENCES users(id) ON DELETE RESTRICT,
  formalized_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  UNIQUE (company_id, deduplication_key)
);

CREATE TABLE IF NOT EXISTS drawing_recognition_sources (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  storage_generation TEXT,
  file_name TEXT NOT NULL,
  file_ext TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size >= 0),
  source_role TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  adapter_plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, file_asset_id)
);

CREATE TABLE IF NOT EXISTS drawing_recognition_adapter_results (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES drawing_recognition_sources(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  adapter_code TEXT NOT NULL,
  adapter_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'partial', 'unsupported', 'failed', 'timeout')),
  observation_count INTEGER NOT NULL DEFAULT 0 CHECK (observation_count >= 0),
  diagnostics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (session_id, source_id, adapter_code)
);

CREATE TABLE IF NOT EXISTS drawing_recognition_observations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  source_id TEXT NOT NULL REFERENCES drawing_recognition_sources(id) ON DELETE RESTRICT,
  adapter_result_id TEXT NOT NULL REFERENCES drawing_recognition_adapter_results(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  raw_text TEXT NOT NULL,
  raw_value TEXT,
  normalized_value TEXT,
  location_kind TEXT NOT NULL DEFAULT 'file',
  page_number INTEGER,
  sheet_name TEXT,
  configuration_name TEXT,
  geometry_json JSONB,
  confidence_band TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_band IN ('high', 'medium', 'low', 'unknown')),
  extractor_code TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  raw_payload_hash TEXT,
  raw_payload_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE RESTRICT,
  captured_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS drawing_recognition_candidates (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('identity_relation', 'part_attribute', 'drawing_revision', 'controlled_note', 'engineering_evidence', 'unclassified')),
  field_key TEXT,
  field_label TEXT NOT NULL,
  raw_value TEXT,
  proposed_value TEXT,
  normalized_value TEXT,
  proposed_owner_type TEXT,
  proposed_owner_id TEXT,
  applicability_scope TEXT NOT NULL DEFAULT 'overall',
  variant_status TEXT NOT NULL DEFAULT 'unrecognized' CHECK (variant_status IN ('same', 'changed', 'added', 'explicit_not_applicable', 'unrecognized')),
  confidence_band TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_band IN ('high', 'medium', 'low', 'unknown')),
  review_state TEXT NOT NULL DEFAULT 'proposed' CHECK (review_state IN ('proposed', 'accepted', 'corrected', 'mapped', 'ignored', 'deferred', 'conflict', 'blocked')),
  current_formal_value TEXT,
  current_formal_fingerprint TEXT,
  group_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drawing_recognition_candidate_observations (
  candidate_id TEXT NOT NULL REFERENCES drawing_recognition_candidates(id) ON DELETE RESTRICT,
  observation_id TEXT NOT NULL REFERENCES drawing_recognition_observations(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, observation_id)
);

CREATE TABLE IF NOT EXISTS drawing_recognition_decisions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES drawing_recognition_candidates(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('accept', 'correct', 'map', 'create_field', 'reassign', 'set_baseline', 'not_applicable', 'ignore', 'defer', 'restore')),
  before_json JSONB NOT NULL,
  after_json JSONB NOT NULL,
  reason TEXT,
  expected_session_version INTEGER NOT NULL CHECK (expected_session_version >= 1),
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drawing_recognition_formalization_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL,
  impact_fingerprint TEXT NOT NULL,
  target_fingerprints_json JSONB NOT NULL,
  applied_changes_json JSONB NOT NULL,
  exclusions_json JSONB NOT NULL,
  result_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS pdm_attribute_definitions (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  stable_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'part_attribute' CHECK (category = 'part_attribute'),
  value_type TEXT NOT NULL DEFAULT 'text' CHECK (value_type = 'text'),
  aliases_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  legacy_target_key TEXT CHECK (legacy_target_key IS NULL OR legacy_target_key IN ('material', 'color', 'surface_treatment', 'variant_note')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, stable_key)
);

CREATE TABLE IF NOT EXISTS pdm_part_attribute_values (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_number_id TEXT NOT NULL REFERENCES part_numbers(id) ON DELETE RESTRICT,
  attribute_definition_id TEXT NOT NULL REFERENCES pdm_attribute_definitions(id) ON DELETE RESTRICT,
  applicability_state TEXT NOT NULL DEFAULT 'value' CHECK (applicability_state IN ('value', 'not_applicable')),
  value_text TEXT,
  unit_text TEXT,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  last_formalization_event_id TEXT NOT NULL REFERENCES drawing_recognition_formalization_events(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, part_number_id, attribute_definition_id),
  CHECK ((applicability_state = 'value' AND value_text IS NOT NULL) OR applicability_state = 'not_applicable')
);

CREATE TABLE IF NOT EXISTS pdm_drawing_revision_metadata_values (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  drawing_revision_id TEXT NOT NULL REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  metadata_key TEXT NOT NULL CHECK (metadata_key IN ('unit', 'scale', 'projection_method', 'drawn_date', 'reviewed_date')),
  value_text TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  last_formalization_event_id TEXT NOT NULL REFERENCES drawing_recognition_formalization_events(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, drawing_revision_id, metadata_key)
);

CREATE TABLE IF NOT EXISTS pdm_controlled_notes (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_number_id TEXT REFERENCES part_numbers(id) ON DELETE RESTRICT,
  drawing_id TEXT REFERENCES drawings(id) ON DELETE RESTRICT,
  drawing_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  note_text TEXT NOT NULL,
  applicability_scope TEXT NOT NULL DEFAULT 'overall',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded')),
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  last_formalization_event_id TEXT NOT NULL REFERENCES drawing_recognition_formalization_events(id) ON DELETE RESTRICT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (((part_number_id IS NOT NULL)::int + (drawing_id IS NOT NULL)::int + (drawing_revision_id IS NOT NULL)::int) = 1)
);

CREATE TABLE IF NOT EXISTS pdm_engineering_evidence (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  part_number_id TEXT REFERENCES part_numbers(id) ON DELETE RESTRICT,
  drawing_id TEXT REFERENCES drawings(id) ON DELETE RESTRICT,
  drawing_revision_id TEXT REFERENCES drawing_revisions(id) ON DELETE RESTRICT,
  session_id TEXT NOT NULL REFERENCES drawing_recognition_sessions(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES drawing_recognition_candidates(id) ON DELETE RESTRICT,
  observation_id TEXT NOT NULL REFERENCES drawing_recognition_observations(id) ON DELETE RESTRICT,
  evidence_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  page_number INTEGER,
  sheet_name TEXT,
  configuration_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (((part_number_id IS NOT NULL)::int + (drawing_id IS NOT NULL)::int + (drawing_revision_id IS NOT NULL)::int) = 1)
);

CREATE TABLE IF NOT EXISTS drawing_recognition_formalization_links (
  event_id TEXT NOT NULL REFERENCES drawing_recognition_formalization_events(id) ON DELETE RESTRICT,
  candidate_id TEXT NOT NULL REFERENCES drawing_recognition_candidates(id) ON DELETE RESTRICT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  change_kind TEXT NOT NULL CHECK (change_kind IN ('create', 'update', 'not_applicable', 'evidence')),
  before_value TEXT,
  after_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, candidate_id, target_type, target_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_claim ON drawing_recognition_sessions(status, not_before, priority, created_at);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_context ON drawing_recognition_sessions(company_id, source_context_type, source_context_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_drawing ON drawing_recognition_sessions(company_id, drawing_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sessions_successor ON drawing_recognition_sessions(supersedes_session_id);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sources_session ON drawing_recognition_sources(session_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_sources_asset ON drawing_recognition_sources(company_id, file_asset_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_observations_session ON drawing_recognition_observations(session_id, source_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_candidates_session ON drawing_recognition_candidates(session_id, category, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_candidates_owner ON drawing_recognition_candidates(company_id, proposed_owner_type, proposed_owner_id);
CREATE INDEX IF NOT EXISTS idx_drawing_recognition_decisions_session ON drawing_recognition_decisions(session_id, decided_at, id);
CREATE INDEX IF NOT EXISTS idx_pdm_part_attribute_values_part ON pdm_part_attribute_values(company_id, part_number_id, attribute_definition_id);
CREATE INDEX IF NOT EXISTS idx_pdm_engineering_evidence_session ON pdm_engineering_evidence(company_id, session_id, candidate_id);

INSERT INTO role_permissions (id, role_id, permission_kind, permission_code, allowed)
SELECT 'default-perm-' || r.role_code || '-action-' || replace(p.permission_code, '.', '-'), r.id, 'action', p.permission_code, 1
FROM roles r
CROSS JOIN (VALUES
  ('numbering.recognition.run'),
  ('numbering.recognition.review'),
  ('numbering.recognition.formalize')
) AS p(permission_code)
WHERE r.role_code IN ('rd', 'rd_manager', 'pdm_admin', 'system_admin')
ON CONFLICT (role_id, permission_kind, permission_code) DO NOTHING;

CREATE OR REPLACE FUNCTION dev068_reject_append_only_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DRAWING_RECOGNITION_APPEND_ONLY';
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'drawing_recognition_sources', 'drawing_recognition_adapter_results', 'drawing_recognition_observations',
    'drawing_recognition_candidate_observations', 'drawing_recognition_decisions',
    'drawing_recognition_formalization_events', 'drawing_recognition_formalization_links', 'pdm_engineering_evidence'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_append_only ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION dev068_reject_append_only_mutation()', table_name, table_name);
  END LOOP;
END;
$$;
