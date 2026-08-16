-- Harden trigger function execution context for Supabase Security Advisor.
-- Applied to AI_PDM_STAGING by Supabase MCP migration 20260615040619_harden_set_updated_at_search_path.

ALTER FUNCTION public.set_updated_at()
SET search_path = public, pg_temp;
