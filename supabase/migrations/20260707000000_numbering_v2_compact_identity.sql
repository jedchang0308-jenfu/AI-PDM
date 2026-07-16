-- Add compact PDM numbering v2 seed and allow M/R drawing purpose codes
-- Source: db/postgres/004_numbering_v2_compact_identity.sql
-- Source SHA-256: ae8a46c3aceb1524e1318470eb57217e47177a85087f7558dd16e0ca9b2446e0
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

INSERT INTO numbering_rule_versions (id, rule_code, title, status, rule_json)
VALUES (
  'numbering-rule-v2',
  'PDM-NUMBERING-V2',
  'PDM compact numbering rule v2',
  'active',
  '{"rootDigits":5,"partCode":"P","drawingPurposeCodes":["M","R"],"partSequenceDigits":2,"drawingSequenceDigits":2,"reservedSequences":["00"],"formats":{"root":"{root}","part":"{root}-P{seq}","drawing":"{root}-{purpose}{seq}"},"compatibility":{"v1ManufacturingCodes":["MA"],"v1ReferenceCodes":["OT"]}}'
)
ON CONFLICT (id) DO UPDATE SET
  rule_code = EXCLUDED.rule_code,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  rule_json = EXCLUDED.rule_json,
  updated_at = now();

UPDATE numbering_rule_versions
SET status = 'retired', retired_at = COALESCE(retired_at, now()), updated_at = now()
WHERE id = 'numbering-rule-v1';

UPDATE numbering_rule_versions
SET status = 'active', retired_at = NULL, updated_at = now()
WHERE id = 'numbering-rule-v2';

WITH default_rules (
  id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker
) AS (
  VALUES
    ('approval-rule-update-name-dvt', 'DVT item name update', 'update_name', 'DVT', NULL, NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1),
    ('approval-rule-update-name-release', 'Release item name update', 'update_name', 'Release', NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-update-name-released', 'Released item name update', 'update_name', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-update-spec-released', 'Released specification update', 'update_spec', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-obsolete-part-dvt', 'DVT part obsolescence', 'obsolete_part_number', 'DVT', NULL, NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1),
    ('approval-rule-obsolete-part-release', 'Release part obsolescence', 'obsolete_part_number', 'Release', NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-obsolete-ma-drawing-dvt', 'DVT MA drawing obsolescence manager', 'obsolete_ma_drawing', 'DVT', NULL, NULL, NULL, 1, 'rd_manager', 1, 0, 1, 1),
    ('approval-rule-obsolete-ma-drawing-admin', 'MA drawing obsolescence admin', 'obsolete_ma_drawing', NULL, NULL, NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-merge-part-referenced', 'Referenced part merge', 'merge_part_number', NULL, NULL, NULL, 'has_reference', 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-dvt-missing-ma-override', 'DVT missing MA override', 'dvt_missing_ma_override', 'DVT', NULL, 'manufactured', 'missing_primary_ma', 1, 'pdm_admin', 1, 0, 1, 1),
    ('approval-rule-dvt-promotion', 'DVT promotion approval', 'dvt_promotion', 'DVT', 'PendingReview', NULL, NULL, 1, 'rd_manager', 1, 0, 1, 1),
    ('approval-rule-release-missing-ma-confirm', 'Release missing MA confirmation', 'release_missing_ma_confirm', 'Release', NULL, NULL, 'missing_primary_ma', 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-release', 'Release approval', 'release', 'Release', NULL, NULL, NULL, 1, 'rd_manager', 0, 1, 1, 1),
    ('approval-rule-shared-model-release', 'Shared 3D model release', 'pdm.shared_model.release', 'Release', NULL, NULL, NULL, 1, 'rd_manager', 0, 1, 1, 1),
    ('approval-rule-model-exception-confirm', '2D-only model exception confirmation', 'pdm.drawing_package.model_exception.confirm', 'Release', NULL, NULL, 'two_d_only_model_exception', 1, 'rd_manager', 1, 1, 1, 1),
    ('approval-rule-manufacturing-baseline-release', 'Manufacturing baseline release', 'pdm.manufacturing_baseline.release', 'Release', NULL, NULL, NULL, 1, 'rd_manager', 0, 1, 1, 1),
    ('approval-rule-post-release-change-manager', 'Post-release change manager', 'post_release_change', NULL, 'Released', NULL, NULL, 1, 'rd_manager', 1, 1, 1, 1),
    ('approval-rule-post-release-change-admin', 'Post-release change admin', 'post_release_change', NULL, 'Released', NULL, NULL, 1, 'pdm_admin', 1, 1, 1, 1),
    ('approval-rule-released-same-drawing-variant', 'Released same drawing variant', 'same_drawing_variant_after_release', NULL, 'Released', NULL, NULL, 1, 'rd_manager', 1, 1, 1, 1),
    ('approval-rule-main-drawing-restore', 'Main drawing invalid restore', 'main_drawing_restore', NULL, 'MainDrawingInvalid', NULL, NULL, 1, 'pdm_admin', 1, 0, 1, 1)
)
INSERT INTO approval_rules (
  id, rule_version_id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker
)
SELECT
  id, 'numbering-rule-v1', rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker
FROM default_rules
ON CONFLICT (id) DO NOTHING;

INSERT INTO approval_rules (
  id, rule_version_id, rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, created_at, updated_at
)
SELECT
  'v2-' || id, 'numbering-rule-v2', rule_name, action_code, phase, record_status, item_kind, risk_flag,
  requires_approval, approver_role, blocks_usage, blocks_release, shows_warning, export_marker, created_by, now(), now()
FROM approval_rules
WHERE rule_version_id = 'numbering-rule-v1'
ON CONFLICT (id) DO NOTHING;

ALTER TABLE drawing_numbers
  DROP CONSTRAINT IF EXISTS drawing_numbers_purpose_code_check;

ALTER TABLE drawing_numbers
  ADD CONSTRAINT drawing_numbers_purpose_code_check
  CHECK (purpose_code IN ('MA', 'OT', 'M', 'R'));

COMMIT;
