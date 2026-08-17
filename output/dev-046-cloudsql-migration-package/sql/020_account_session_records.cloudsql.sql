-- DEV-046 Cloud SQL candidate generated from db/postgres/020_account_session_records.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:1

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

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:31
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:32
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:33
REVOKE ALL ON TABLE public.account_session_records FROM PUBLIC;

COMMENT ON TABLE public.account_session_records IS
  'Server-owned account session visibility and revocation records. Only hashed session identifiers, coarse device labels and coarse IP summaries are persisted.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:38
