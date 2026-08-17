-- DEV-046 Cloud SQL candidate generated from db/postgres/010_transfer_package_phase3a0.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:1

CREATE TABLE IF NOT EXISTS transfer_package_counters (
  company_id TEXT NOT NULL REFERENCES companies(id),
  counter_year INTEGER NOT NULL CHECK (counter_year >= 2000),
  next_value INTEGER NOT NULL CHECK (next_value >= 1),
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, counter_year)
);

CREATE TABLE IF NOT EXISTS transfer_packages (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  package_code TEXT NOT NULL,
  title TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('development_case', 'design_change_case')),
  case_reason TEXT NOT NULL,
  source_reference_status TEXT NOT NULL DEFAULT 'not_available'
    CHECK (source_reference_status IN ('provided', 'not_available')),
  source_reference TEXT,
  source_reference_reason TEXT,
  package_status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (package_status IN ('Draft', 'Cancelled')),
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_by TEXT NOT NULL REFERENCES users(id),
  create_idempotency_key TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version >= 1),
  cancel_reason TEXT,
  cancelled_by TEXT REFERENCES users(id),
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (company_id, package_code),
  UNIQUE (company_id, created_by, create_idempotency_key),
  CHECK (
    (source_reference_status = 'provided' AND source_reference IS NOT NULL)
    OR (source_reference_status = 'not_available' AND source_reference_reason IS NOT NULL)
  ),
  CHECK (
    (package_status = 'Cancelled' AND cancel_reason IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
    OR package_status = 'Draft'
  )
);

CREATE TABLE IF NOT EXISTS transfer_package_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  package_id TEXT NOT NULL REFERENCES transfer_packages(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('drawing_number', 'part_number')),
  entity_id TEXT NOT NULL,
  entity_code TEXT NOT NULL,
  display_label TEXT NOT NULL,
  root_code TEXT,
  record_status TEXT,
  added_by TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (package_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS transfer_package_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  package_id TEXT NOT NULL REFERENCES transfer_packages(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('DraftCreated', 'HeaderUpdated', 'ScopeItemAdded', 'ScopeItemRemoved', 'PackageCancelled')),
  actor_id TEXT NOT NULL REFERENCES users(id),
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transfer_packages_company_status_updated
  ON transfer_packages(company_id, package_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_packages_owner_status
  ON transfer_packages(company_id, owner_id, package_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_package_items_package
  ON transfer_package_items(company_id, package_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transfer_package_items_entity
  ON transfer_package_items(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_transfer_package_events_package
  ON transfer_package_events(company_id, package_id, created_at);

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:81
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:82
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:83
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:84
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:85
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:86
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:87
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:88

REVOKE ALL ON transfer_package_counters, transfer_packages, transfer_package_items, transfer_package_events
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:91
  FROM PUBLIC;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:93
