-- DEV-046 Cloud SQL candidate generated from db/postgres/032_remove_part_cost.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- The Cloud SQL migration runner wraps the ordered migration set in one transaction.
SET search_path = public;

DROP TABLE IF EXISTS public.part_cost_change_requests;
DROP TABLE IF EXISTS public.part_standard_costs;
DROP TABLE IF EXISTS public.part_cost_tiers;
DROP TABLE IF EXISTS public.part_cost_profiles;
