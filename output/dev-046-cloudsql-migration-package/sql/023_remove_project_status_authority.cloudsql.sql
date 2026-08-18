-- DEV-046 Cloud SQL candidate generated from db/postgres/023_remove_project_status_authority.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Remove EVT/DVT/PVT project-status authority from PDM.
-- Project milestones belong to the project-management system; PDM retains
-- document status, approval, release, revision, change-control, and handoff evidence.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:5

DROP INDEX IF EXISTS public.idx_part_roots_status_phase;
DROP INDEX IF EXISTS public.idx_part_numbers_status_phase;
DROP INDEX IF EXISTS public.idx_drawing_numbers_status_phase;

UPDATE public.part_roots
SET record_status = 'Obsolete'
WHERE record_status = 'EVTDisabled';

UPDATE public.part_numbers
SET record_status = 'Obsolete'
WHERE record_status = 'EVTDisabled';

UPDATE public.drawing_numbers
SET record_status = 'Obsolete'
WHERE record_status = 'EVTDisabled';

ALTER TABLE public.part_roots
  DROP CONSTRAINT IF EXISTS part_roots_record_status_check,
  DROP COLUMN IF EXISTS development_phase;

ALTER TABLE public.part_roots
  ADD CONSTRAINT part_roots_record_status_check
  CHECK (record_status IN (
    'Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected',
    'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid'
  ));

ALTER TABLE public.part_numbers
  DROP CONSTRAINT IF EXISTS part_numbers_record_status_check,
  DROP COLUMN IF EXISTS development_phase;

ALTER TABLE public.part_numbers
  ADD CONSTRAINT part_numbers_record_status_check
  CHECK (record_status IN (
    'Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected',
    'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid'
  ));

ALTER TABLE public.drawing_numbers
  DROP CONSTRAINT IF EXISTS drawing_numbers_record_status_check,
  DROP COLUMN IF EXISTS development_phase;

ALTER TABLE public.drawing_numbers
  ADD CONSTRAINT drawing_numbers_record_status_check
  CHECK (record_status IN (
    'Draft', 'NeedInfo', 'Active', 'PendingReview', 'Released', 'Rejected',
    'Obsolete', 'Merged', 'PendingAdminConfirm', 'MainDrawingInvalid'
  ));

CREATE INDEX IF NOT EXISTS idx_part_roots_status
  ON public.part_roots(record_status);
CREATE INDEX IF NOT EXISTS idx_part_numbers_status
  ON public.part_numbers(record_status);
CREATE INDEX IF NOT EXISTS idx_drawing_numbers_status
  ON public.drawing_numbers(record_status);

-- Approval configuration is mutable policy, not immutable decision evidence.
-- Remove project-stage-only rules and preserve remaining release/change rules
-- without a phase condition before the phase column is dropped.
DELETE FROM public.approval_rules
WHERE action_code IN ('dvt_promotion', 'dvt_missing_ma_override')
   OR phase IN ('EVT', 'DVT', 'PVT');

UPDATE public.approval_rules
SET phase = NULL,
    updated_at = now()
WHERE phase IS NOT NULL;

ALTER TABLE public.approval_rules
  DROP COLUMN IF EXISTS phase;

DELETE FROM public.role_permissions
WHERE permission_code IN (
  'numbering.dvt',
  'numbering.dvt.submit',
  'dvt_promotion',
  'dvt_missing_ma_override'
);

-- Historical approval requests and decisions keep their original action codes.
-- Only disable the obsolete action definitions so no new request can be created.
UPDATE public.approval_platform_actions
SET enabled = 0,
    updated_at = now()
WHERE action_code IN (
  'dvt_promotion',
  'dvt_missing_ma_override',
  'numbering.dvt_promotion',
  'numbering.dvt_missing_ma_override'
);

COMMENT ON COLUMN public.part_roots.record_status IS
  'PDM master-data status only; project milestones are owned by the project-management system.';
COMMENT ON COLUMN public.part_numbers.record_status IS
  'PDM master-data status only; project milestones are owned by the project-management system.';
COMMENT ON COLUMN public.drawing_numbers.record_status IS
  'PDM master-data status only; project milestones are owned by the project-management system.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:105
