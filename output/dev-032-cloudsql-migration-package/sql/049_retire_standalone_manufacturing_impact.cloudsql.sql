-- DEV-046 Cloud SQL candidate generated from db/postgres/049_retire_standalone_manufacturing_impact.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Retire the standalone manufacturing-impact workbench permissions.
-- Formal obsolete dependency snapshots and drawing-revision F/F/F impact remain authoritative.

DELETE FROM public.role_permissions
WHERE permission_code IN (
  'numbering.impact',
  'numbering.impact.analyze',
  'numbering.impact.apply'
);
