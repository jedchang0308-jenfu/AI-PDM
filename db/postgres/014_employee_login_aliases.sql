-- Add company-scoped employee login aliases, short-lived single-use intents and shared rate limits.
-- Aliases only route users to provider authentication and never authenticate a principal directly.

BEGIN;

CREATE TABLE IF NOT EXISTS public.employee_login_aliases (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  alias_type TEXT NOT NULL DEFAULT 'employee_number' CHECK (alias_type = 'employee_number'),
  alias_normalized TEXT NOT NULL,
  pdm_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_route TEXT NOT NULL DEFAULT 'firebase_google' CHECK (provider_route = 'firebase_google'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL REFERENCES public.users(id),
  retired_at TIMESTAMPTZ,
  retired_by TEXT REFERENCES public.users(id),
  reason TEXT NOT NULL,
  row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0),
  UNIQUE (company_id, alias_normalized)
);

CREATE TABLE IF NOT EXISTS public.employee_login_intents (
  id TEXT PRIMARY KEY,
  alias_id TEXT NOT NULL REFERENCES public.employee_login_aliases(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pdm_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_route TEXT NOT NULL CHECK (provider_route = 'firebase_google'),
  token_hash TEXT NOT NULL UNIQUE,
  return_path TEXT NOT NULL DEFAULT '/',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'expired')),
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.employee_login_rate_limits (
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  identifier_hash TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  attempt_count INTEGER NOT NULL CHECK (attempt_count > 0),
  blocked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, identifier_hash)
);

CREATE INDEX IF NOT EXISTS idx_employee_login_aliases_user
  ON public.employee_login_aliases(pdm_user_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_login_intents_expiry
  ON public.employee_login_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_employee_login_rate_limits_expiry
  ON public.employee_login_rate_limits(blocked_until, updated_at);

ALTER TABLE public.employee_login_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_login_aliases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_login_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_login_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.employee_login_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_login_rate_limits FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.employee_login_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.employee_login_intents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.employee_login_rate_limits FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.employee_login_aliases IS
  'Server-only company-scoped login routing aliases. An alias is not a credential, provider subject or authorization key.';
COMMENT ON TABLE public.employee_login_intents IS
  'Server-only five-minute single-use login intents. Only SHA-256 token hashes are persisted.';
COMMENT ON TABLE public.employee_login_rate_limits IS
  'Server-only shared login rate-limit buckets keyed by HMAC-protected identifier and client context.';

COMMIT;
