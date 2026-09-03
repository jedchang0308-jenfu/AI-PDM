-- DEV-008 additive display-only last-known-good snapshot. Never used for authorization.
CREATE TABLE IF NOT EXISTS role_capability_display_snapshots (
  application_id TEXT PRIMARY KEY,
  contract_version TEXT NOT NULL,
  reader_version TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  catalog_payload_hash TEXT NOT NULL,
  governance_revision TEXT NOT NULL,
  organization_version_id TEXT NOT NULL,
  organization_revision TEXT NOT NULL,
  projection_cursor INTEGER NOT NULL,
  role_count INTEGER NOT NULL DEFAULT 0,
  source_data_at TIMESTAMPTZ NOT NULL,
  snapshot_stored_at TIMESTAMPTZ NOT NULL,
  canonicalization_version TEXT NOT NULL,
  payload_canonical_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL
);
