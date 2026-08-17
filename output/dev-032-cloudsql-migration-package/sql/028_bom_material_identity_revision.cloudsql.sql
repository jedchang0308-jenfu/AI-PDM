-- DEV-046 Cloud SQL candidate generated from db/postgres/028_bom_material_identity_revision.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-060 / ADR-PDM-MATERIAL-IDENTITY-REVISION-001
-- Dry-run before apply:
--   SELECT d.id, i.company_id, i.part_number, count(pn.id) AS canonical_matches
--   FROM bom_drafts d
--   LEFT JOIN items i ON i.id = d.parent_item_id
--   LEFT JOIN part_numbers pn ON pn.company_id = i.company_id AND upper(pn.part_number) = upper(i.part_number)
--   GROUP BY d.id, i.company_id, i.part_number
--   HAVING count(pn.id) <> 1;
-- Rows returned by the query above are kept readable as manual_review and are never guessed.

ALTER TABLE bom_drafts
  ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS owner_part_number_id TEXT REFERENCES part_numbers(id),
  ADD COLUMN IF NOT EXISTS bom_revision TEXT,
  ADD COLUMN IF NOT EXISTS source_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS identity_authority TEXT NOT NULL DEFAULT 'legacy_submission_bound';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bom_drafts_identity_authority_check') THEN
    ALTER TABLE bom_drafts ADD CONSTRAINT bom_drafts_identity_authority_check
      CHECK (identity_authority IN ('canonical_part_number', 'legacy_submission_bound', 'manual_review'));
  END IF;
END $$;

WITH exact_crosswalk AS (
  SELECT d.id AS draft_id, i.company_id, min(pn.id) AS owner_part_number_id, count(pn.id) AS match_count
  FROM bom_drafts d
  LEFT JOIN items i ON i.id = d.parent_item_id
  LEFT JOIN part_numbers pn
    ON pn.company_id = i.company_id
   AND upper(pn.part_number) = upper(i.part_number)
  GROUP BY d.id, i.company_id
)
UPDATE bom_drafts d
SET company_id = x.company_id,
    owner_part_number_id = CASE WHEN x.match_count = 1 THEN x.owner_part_number_id ELSE NULL END,
    bom_revision = d.parent_revision,
    source_submission_id = d.parent_submission_id,
    identity_authority = CASE WHEN x.match_count = 1 THEN 'legacy_submission_bound' ELSE 'manual_review' END
FROM exact_crosswalk x
WHERE x.draft_id = d.id
  AND d.owner_part_number_id IS NULL;

ALTER TABLE bom_drafts
  ALTER COLUMN parent_item_id DROP NOT NULL,
  ALTER COLUMN parent_submission_id DROP NOT NULL,
  ALTER COLUMN parent_revision DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_canonical_one_active
  ON bom_drafts(owner_part_number_id, upper(bom_revision))
  WHERE owner_part_number_id IS NOT NULL AND bom_revision IS NOT NULL AND is_active = 1 AND status IN ('Draft', 'Rejected');

CREATE UNIQUE INDEX IF NOT EXISTS idx_bom_drafts_canonical_one_pending_review
  ON bom_drafts(owner_part_number_id, upper(bom_revision))
  WHERE owner_part_number_id IS NOT NULL AND bom_revision IS NOT NULL AND status = 'PendingReview';

ALTER TABLE bom_import_jobs
  ADD COLUMN IF NOT EXISTS owner_part_number_id TEXT REFERENCES part_numbers(id),
  ADD COLUMN IF NOT EXISTS bom_revision TEXT,
  ADD COLUMN IF NOT EXISTS source_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  ALTER COLUMN parent_submission_id DROP NOT NULL;

UPDATE bom_import_jobs j
SET owner_part_number_id = d.owner_part_number_id,
    bom_revision = d.bom_revision,
    source_submission_id = j.parent_submission_id
FROM bom_drafts d
WHERE d.id = j.bom_draft_id
  AND j.owner_part_number_id IS NULL;

ALTER TABLE bom_release_snapshots
  ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES companies(id),
  ADD COLUMN IF NOT EXISTS owner_part_number_id TEXT REFERENCES part_numbers(id),
  ADD COLUMN IF NOT EXISTS bom_revision TEXT,
  ADD COLUMN IF NOT EXISTS source_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL,
  ALTER COLUMN parent_item_id DROP NOT NULL,
  ALTER COLUMN parent_submission_id DROP NOT NULL,
  ALTER COLUMN parent_revision DROP NOT NULL;

UPDATE bom_release_snapshots s
SET company_id = d.company_id,
    owner_part_number_id = d.owner_part_number_id,
    bom_revision = d.bom_revision,
    source_submission_id = s.parent_submission_id
FROM bom_drafts d
WHERE d.id = s.bom_draft_id
  AND s.owner_part_number_id IS NULL;

CREATE TABLE IF NOT EXISTS bom_create_effects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  actor_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  draft_id TEXT NOT NULL REFERENCES bom_drafts(id),
  outcome_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, actor_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS bom_identity_migration_issues (
  id TEXT PRIMARY KEY,
  bom_draft_id TEXT NOT NULL UNIQUE REFERENCES bom_drafts(id),
  issue_code TEXT NOT NULL CHECK (issue_code IN ('owner_crosswalk_missing_or_ambiguous')),
  issue_status TEXT NOT NULL DEFAULT 'open' CHECK (issue_status IN ('open', 'resolved')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id)
);

INSERT INTO bom_identity_migration_issues (id, bom_draft_id, issue_code, detail_json)
SELECT
  'bom-identity-issue-' || md5(d.id),
  d.id,
  'owner_crosswalk_missing_or_ambiguous',
  json_build_object('parent_item_id', d.parent_item_id, 'parent_submission_id', d.parent_submission_id)::text
FROM bom_drafts d
WHERE d.identity_authority = 'manual_review'
ON CONFLICT (bom_draft_id) DO NOTHING;

-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:123
REVOKE ALL ON TABLE bom_create_effects FROM PUBLIC;
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:124
REVOKE ALL ON TABLE bom_identity_migration_issues FROM PUBLIC;
