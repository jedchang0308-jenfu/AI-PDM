-- Add server-owned account session records for managed auth session visibility
-- Source: db/postgres/020_account_session_records.sql
-- Source SHA-256: db916f91dbccdbb09d7cbfd1dee0fde9d748b28d80e5610b2437a1966567eb78
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

CREATE TABLE IF NOT EXISTS public.account_session_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id_hash TEXT NOT NULL UNIQUE,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('legacy_managed', 'firebase_bff')),
  assurance_level TEXT NOT NULL CHECK (assurance_level IN ('aal1', 'aal2')),
  device_type TEXT NOT NULL DEFAULT 'unknown' CHECK (device_type IN ('desktop', 'mobile', 'tablet', 'unknown')),
  device_label TEXT NOT NULL DEFAULT '未知裝置',
  user_agent_hash TEXT,
  user_agent_hint TEXT NOT NULL DEFAULT '',
  ip_hash TEXT,
  ip_summary TEXT,
  issued_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by TEXT REFERENCES public.users(id),
  revoke_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_account_session_records_user
  ON public.account_session_records(user_id, revoked_at, expires_at, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_account_session_records_company
  ON public.account_session_records(company_id, auth_provider, last_seen_at DESC);

ALTER TABLE public.account_session_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_session_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_session_records FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.account_session_records IS
  'Server-owned account session visibility and revocation records. Only hashed session identifiers, coarse device labels and coarse IP summaries are persisted.';

COMMIT;
