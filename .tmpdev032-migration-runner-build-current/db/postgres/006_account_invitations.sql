BEGIN;

CREATE TABLE IF NOT EXISTS account_invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Engineer', 'R&D Manager', 'Admin', 'Manufacturing', 'Procurement')),
  company_id TEXT NOT NULL DEFAULT 'company-jenfu',
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by TEXT NOT NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by TEXT,
  accepted_at TIMESTAMPTZ,
  revoked_by TEXT,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT account_invitations_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id),
  CONSTRAINT account_invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES users(id),
  CONSTRAINT account_invitations_accepted_by_fkey FOREIGN KEY (accepted_by) REFERENCES users(id),
  CONSTRAINT account_invitations_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_invitations_pending_email
  ON account_invitations(email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_account_invitations_status_expires
  ON account_invitations(status, expires_at);

ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_invitations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_invitations FROM anon, authenticated;

COMMENT ON TABLE public.account_invitations IS
  'Server-side account invitation records. Only SHA-256 token hashes are stored; direct Data API access is denied.';

COMMIT;
