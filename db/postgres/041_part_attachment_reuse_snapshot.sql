BEGIN;

CREATE TABLE IF NOT EXISTS part_attachment_reuse_snapshots (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  part_number_draft_id TEXT NOT NULL REFERENCES part_number_drafts(id) ON DELETE CASCADE,
  source_part_number_id TEXT NOT NULL REFERENCES part_numbers(id),
  source_token TEXT NOT NULL,
  selection_fingerprint TEXT NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  selected_count INTEGER NOT NULL CHECK (selected_count >= 0),
  new_count INTEGER NOT NULL CHECK (new_count >= 0),
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (part_number_draft_id),
  UNIQUE (company_id, part_number_draft_id, selection_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_part_attachment_reuse_snapshots_source
ON part_attachment_reuse_snapshots(company_id, source_part_number_id, created_at DESC);

CREATE TABLE IF NOT EXISTS part_attachment_reuse_origins (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  snapshot_id TEXT NOT NULL REFERENCES part_attachment_reuse_snapshots(id) ON DELETE CASCADE,
  target_file_asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE RESTRICT,
  origin_kind TEXT NOT NULL CHECK (origin_kind IN ('inherited', 'new')),
  origin_key TEXT NOT NULL,
  source_file_asset_id TEXT REFERENCES file_assets(id) ON DELETE RESTRICT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (origin_kind = 'inherited' AND source_file_asset_id IS NOT NULL)
    OR (origin_kind = 'new' AND source_file_asset_id IS NULL)
  ),
  UNIQUE (snapshot_id, origin_key)
);

CREATE INDEX IF NOT EXISTS idx_part_attachment_reuse_origins_target
ON part_attachment_reuse_origins(company_id, target_file_asset_id);

CREATE INDEX IF NOT EXISTS idx_part_attachment_reuse_origins_source
ON part_attachment_reuse_origins(company_id, source_file_asset_id)
WHERE source_file_asset_id IS NOT NULL;

COMMIT;
