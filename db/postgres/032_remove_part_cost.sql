-- The Cloud SQL migration runner wraps the ordered migration set in one transaction.
SET search_path = public;

DROP TABLE IF EXISTS public.part_cost_change_requests;
DROP TABLE IF EXISTS public.part_standard_costs;
DROP TABLE IF EXISTS public.part_cost_tiers;
DROP TABLE IF EXISTS public.part_cost_profiles;
