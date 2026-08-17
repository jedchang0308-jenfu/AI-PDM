-- DEV-046 Cloud SQL candidate generated from db/postgres/003_harden_set_updated_at_search_path.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- Harden trigger function execution context for Supabase Security Advisor.
-- Applied to AI_PDM_STAGING by Supabase MCP migration 20260615040619_harden_set_updated_at_search_path.

ALTER FUNCTION public.set_updated_at()
SET search_path = public, pg_temp;
