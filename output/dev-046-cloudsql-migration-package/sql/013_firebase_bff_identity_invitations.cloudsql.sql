-- DEV-046 Cloud SQL candidate generated from db/postgres/013_firebase_bff_identity_invitations.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:1

CREATE TABLE IF NOT EXISTS public.firebase_identity_invitations (
  invitation_id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE,
  pdm_user_id TEXT NOT NULL UNIQUE,
  setup_state TEXT NOT NULL CHECK (setup_state IN ('requested', 'identity_created', 'password_setup_link_sent', 'active', 'compensated', 'failed')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT firebase_identity_invitations_invitation_fkey
    FOREIGN KEY (invitation_id) REFERENCES public.account_invitations(id) ON DELETE CASCADE,
  CONSTRAINT firebase_identity_invitations_user_fkey
    FOREIGN KEY (pdm_user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_firebase_identity_invitations_state
  ON public.firebase_identity_invitations(setup_state, updated_at);

-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:20
-- CLOUDSQL_REMOVED_RLS_SOURCE_LINE:21
-- CLOUDSQL_REWROTE_SUPABASE_ROLE_SOURCE_LINE:22
REVOKE ALL ON TABLE public.firebase_identity_invitations FROM PUBLIC;

COMMENT ON TABLE public.firebase_identity_invitations IS
  'Server-only Firebase invitation saga state; direct Data API access is denied.';

-- CLOUDSQL_REMOVED_TRANSACTION_WRAPPER_SOURCE_LINE:27
