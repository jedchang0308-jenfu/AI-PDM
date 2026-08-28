-- DEV-046 Cloud SQL candidate generated from db/postgres/040_supervisor_workflow_authority.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-081: R&D Manager and system administrators may manage same-company
-- PDM work across owners. The existing explicit action-permission boundary is
-- preserved; this migration completes the R&D Manager workflow authority by
-- granting the publication action already held by PDM/system administrators.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:6

INSERT INTO public.role_permissions (
  id,
  role_id,
  permission_kind,
  permission_code,
  allowed,
  created_at,
  updated_at
)
SELECT
  'default-perm-rd_manager-action-numbering-publish',
  role.id,
  'action',
  'numbering.publish',
  1,
  now(),
  now()
FROM public.roles role
WHERE role.role_code = 'rd_manager'
ON CONFLICT (role_id, permission_kind, permission_code)
DO UPDATE SET allowed = 1, updated_at = excluded.updated_at;

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:30
