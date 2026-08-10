-- Add Firebase BFF invitation saga state and deny direct Data API access
-- Source: db/postgres/013_firebase_bff_identity_invitations.sql
-- Source SHA-256: e2fff90a763a071fe57abeebeacd9d689fab63a872a73be8ddf78938d56e615d
-- This file is synchronized by npm.cmd run supabase:migrations:sync.

BEGIN;

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

ALTER TABLE public.firebase_identity_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firebase_identity_invitations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.firebase_identity_invitations FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.firebase_identity_invitations IS
  'Server-only Firebase invitation saga state; direct Data API access is denied.';

COMMIT;
