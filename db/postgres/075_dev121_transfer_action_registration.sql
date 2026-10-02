-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: internal canonical transfer review action registration; no grant change
-- compatibility: backward-compatible
-- governance-review: AIPDM/DEV-121#principal-transfer-action-registration

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- Migration 017 registered this action in the historical sequence. The fresh
-- owner baseline folds its schema but not this static business metadata.
-- Preserve existing configuration and fail on drift rather than re-enable it
-- or overwrite a deliberate owner change. This row grants no permission.
INSERT INTO ai_pdm_core.approval_platform_actions (
  action_code, domain_code, title, description, handler_key, risk_level,
  allow_batch, requires_impact_snapshot, enabled, metadata_json
) VALUES (
  'transfer.package_review', 'transfer', '技術移轉包審核',
  'Review an immutable aggregate transfer snapshot without publishing master records.',
  'transfer.package-review', 'high', 1, 1, 1, '{}'
)
ON CONFLICT (action_code) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.approval_platform_actions
    WHERE action_code = 'transfer.package_review'
      AND domain_code = 'transfer'
      AND title = '技術移轉包審核'
      AND description = 'Review an immutable aggregate transfer snapshot without publishing master records.'
      AND handler_key = 'transfer.package-review'
      AND risk_level = 'high'
      AND allow_batch = 1 AND requires_impact_snapshot = 1 AND enabled = 1
      AND metadata_json::jsonb = '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'DEV121_TRANSFER_ACTION_CONFIGURATION_DRIFT';
  END IF;
END $$;

COMMIT;
