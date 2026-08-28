-- DEV-046 Cloud SQL candidate generated from db/postgres/048_solidworks_credential_ui_activation.sql
-- Proposal only. Review before any live apply.
-- Supabase Data API roles and RLS force statements are intentionally absent for Cloud SQL BFF runtime.

-- DEV-035: UI-only secure activation, native probe jobs, and worker capability acknowledgement.
-- Version 049 is intentional: production version 038 is permanently occupied
-- by 038_bom_controlled_cad_source.
-- Additive migration. Existing references and lifecycle history are preserved.

ALTER TABLE public.secret_references
  DROP CONSTRAINT IF EXISTS secret_references_vault_provider_check;

ALTER TABLE public.secret_references
  ADD CONSTRAINT secret_references_vault_provider_check
  CHECK (vault_provider IN ('local_test_double', 'windows_dpapi', 'google_secret_manager', 'supabase_vault'));

CREATE TABLE IF NOT EXISTS public.settings_secret_probe_jobs (
  id text PRIMARY KEY,
  secret_reference_id text NOT NULL REFERENCES public.secret_references(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'running', 'passed', 'failed', 'blocked', 'expired')),
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 2,
  result_code text,
  reader_version text,
  created_by text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_active
  ON public.settings_secret_probe_jobs(secret_reference_id)
  WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_claim
  ON public.settings_secret_probe_jobs(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_settings_secret_probe_jobs_reference
  ON public.settings_secret_probe_jobs(secret_reference_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.worker_capability_heartbeats (
  worker_id text NOT NULL,
  worker_kind text NOT NULL,
  capability_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('ready', 'blocked', 'degraded')),
  applied_secret_kind text,
  applied_secret_version integer,
  applied_secret_fingerprint text,
  reader_version text,
  issue_code text,
  last_applied_at timestamptz,
  last_seen_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_id, capability_code)
);
CREATE INDEX IF NOT EXISTS idx_worker_capability_heartbeats_capability
  ON public.worker_capability_heartbeats(capability_code, last_seen_at DESC);
