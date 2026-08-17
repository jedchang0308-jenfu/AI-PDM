-- DEV-046 Cloud SQL candidate generated from db/postgres/034_root_vocabulary_human_label.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Rename the user-facing root label without changing the stored machine contract.
-- DEV-063/2026-08-12: rename the root and same-root-part human labels.
SET search_path = public;

UPDATE public.approval_platform_actions
SET title = '圖料根號作廢審核',
    updated_at = now()
WHERE action_code = 'numbering.obsolete_part_root'
  AND title IN ('主根作廢審核', '圖料根號作廢審核');
