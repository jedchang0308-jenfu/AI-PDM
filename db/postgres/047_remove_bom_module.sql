-- DEV-095 / ADR-PDM-BOM-RETIREMENT-001
-- Destructive retirement approved by the product owner on 2026-08-24.
-- The production operator must create and verify a recoverable Cloud SQL backup
-- before executing this migration. The migration runner owns the transaction.

DELETE FROM approval_platform_requests
WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')
   OR domain_code = 'bom';

DELETE FROM approval_platform_packages
WHERE action_code IN ('bom.release_review', 'bom.obsolete_review');

DELETE FROM approval_delegations
WHERE action_code IN ('bom.release_review', 'bom.obsolete_review');

DO $$
BEGIN
  IF to_regclass('public.approval_matrix_rules') IS NOT NULL THEN
    EXECUTE $delete$
      DELETE FROM approval_matrix_rules
      WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')
    $delete$;
  END IF;
END
$$;

DELETE FROM approval_platform_actions
WHERE action_code IN ('bom.release_review', 'bom.obsolete_review')
   OR domain_code = 'bom';

DELETE FROM review_confirmation_events
WHERE action = 'confirm_bom_no_revision';

ALTER TABLE review_confirmation_events
  DROP CONSTRAINT IF EXISTS review_confirmation_events_action_check;

ALTER TABLE review_confirmation_events
  ADD CONSTRAINT review_confirmation_events_action_check
  CHECK (
    action IN (
      'confirm_original_part_reuse',
      'return_for_replacement_part',
      'request_more_information',
      'approve_replacement_part_and_drawing_release'
    )
  );

DELETE FROM audit_logs
WHERE lower(action) LIKE '%bom%';

DROP TABLE IF EXISTS bom_reconfirmation_flags;
DROP TABLE IF EXISTS bom_identity_migration_issues;
DROP TABLE IF EXISTS bom_create_effects;
DROP TABLE IF EXISTS bom_release_snapshots;
DROP TABLE IF EXISTS bom_review_requests;
DROP TABLE IF EXISTS bom_edit_events;
DROP TABLE IF EXISTS bom_import_jobs;
DROP TABLE IF EXISTS bom_draft_floating_topics;
DROP TABLE IF EXISTS bom_lines_tree;
DROP TABLE IF EXISTS bom_lines;
DROP TABLE IF EXISTS bom_headers;
DROP TABLE IF EXISTS bom_drafts;
DROP TABLE IF EXISTS bom_import_profiles;

ALTER TABLE part_numbers
  DROP COLUMN IF EXISTS bom_usage_policy;
