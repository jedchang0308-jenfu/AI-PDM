-- Harden set_updated_at function search_path for Supabase
-- Source: db/postgres/003_harden_set_updated_at_search_path.sql
-- Source SHA-256: 83d2883f59b7078898f4abf9b7cb8620ddf58b6f1f8a426f286417f37b4bbcdf
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

-- Harden trigger function execution context for Supabase Security Advisor.
-- Applied to AI_PDM_STAGING by Supabase MCP migration 20260615040619_harden_set_updated_at_search_path.

ALTER FUNCTION public.set_updated_at()
SET search_path = public, pg_temp;
