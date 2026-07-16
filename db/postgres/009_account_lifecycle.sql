-- Add account lifecycle controls, session revocation cutoffs and password recovery requests.
-- This migration is additive and keeps direct Supabase Data API access denied.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS session_invalid_before TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_lifecycle_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS system_role_enabled INTEGER NOT NULL DEFAULT 1 CHECK (system_role_enabled IN (0, 1)),
  ADD COLUMN IF NOT EXISTS account_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_status_changed_by TEXT REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS account_status_reason TEXT;

ALTER TABLE public.auth_identities
  ADD COLUMN IF NOT EXISTS identity_lifecycle_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.account_recovery_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  identity_id TEXT REFERENCES public.auth_identities(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL DEFAULT 'admin_password_reset' CHECK (request_type IN ('admin_password_reset', 'account_recovery')),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'revoked', 'expired')),
  created_by TEXT REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_by TEXT REFERENCES public.users(id),
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_users_account_status
  ON public.users(account_status, system_role_enabled);
CREATE INDEX IF NOT EXISTS idx_account_recovery_requests_user_status
  ON public.account_recovery_requests(user_id, status, expires_at);

ALTER TABLE public.account_recovery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_recovery_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_recovery_requests FROM anon, authenticated;

COMMENT ON TABLE public.account_recovery_requests IS
  'Server-side account recovery and admin password reset requests. Only token hashes are persisted; clear reset URLs are never stored.';

COMMIT;
