BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
  CHECK (account_status IN ('active', 'suspended', 'expired', 'offboarded'));

CREATE TABLE IF NOT EXISTS public.auth_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('local_password', 'google_oauth', 'invite')),
  provider_subject TEXT NOT NULL,
  login_identifier TEXT,
  email_normalized TEXT,
  verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT auth_identities_provider_subject_key UNIQUE (provider, provider_subject),
  CONSTRAINT auth_identities_user_provider_key UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_auth_identities_login
  ON public.auth_identities(provider, login_identifier, status);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user
  ON public.auth_identities(user_id, status);

INSERT INTO public.auth_identities (
  id, user_id, provider, provider_subject, login_identifier, email_normalized,
  verified_at, status, created_at, updated_at
)
SELECT
  'identity-local-' || users.id,
  users.id,
  'local_password',
  lower(users.email),
  lower(users.email),
  lower(users.email),
  users.created_at,
  'active',
  users.created_at,
  users.updated_at
FROM public.users
WHERE users.email IS NOT NULL
  AND users.password_hash IS NOT NULL
ON CONFLICT (user_id, provider) DO NOTHING;

ALTER TABLE public.auth_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.auth_identities FROM anon, authenticated;

COMMENT ON TABLE public.auth_identities IS
  'Server-side PDM login identities. Authorization remains anchored to users.id; OAuth tokens and secrets are never persisted here.';

COMMIT;
