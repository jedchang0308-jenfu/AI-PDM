-- Add ERP-ready platform identity mappings, command receipts and transactional outbox.
-- This migration is additive and keeps direct Supabase Data API access denied.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_principal_mappings (
  platform_principal_id TEXT PRIMARY KEY,
  pdm_user_id TEXT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  mapping_source TEXT NOT NULL DEFAULT 'current_pdm' CHECK (mapping_source IN ('current_pdm', 'shared_iam')),
  mapping_status TEXT NOT NULL DEFAULT 'active' CHECK (mapping_status IN ('active', 'suspended', 'retired')),
  external_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mapping_source, external_subject)
);

CREATE TABLE IF NOT EXISTS public.platform_organization_mappings (
  platform_organization_id TEXT PRIMARY KEY,
  pdm_company_id TEXT NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  mapping_source TEXT NOT NULL DEFAULT 'current_pdm' CHECK (mapping_source IN ('current_pdm', 'shared_core')),
  mapping_status TEXT NOT NULL DEFAULT 'active' CHECK (mapping_status IN ('active', 'suspended', 'retired')),
  external_organization_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mapping_source, external_organization_key)
);

CREATE TABLE IF NOT EXISTS public.platform_command_receipts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  command_name TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  idempotency_key TEXT NOT NULL,
  actor_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  platform_principal_id TEXT REFERENCES public.platform_principal_mappings(platform_principal_id) ON UPDATE CASCADE ON DELETE SET NULL,
  platform_organization_id TEXT NOT NULL REFERENCES public.platform_organization_mappings(platform_organization_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  correlation_id TEXT NOT NULL,
  command_status TEXT NOT NULL DEFAULT 'processing' CHECK (command_status IN ('processing', 'completed')),
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (company_id, command_name, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.platform_outbox_events (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  platform_principal_id TEXT REFERENCES public.platform_principal_mappings(platform_principal_id) ON UPDATE CASCADE ON DELETE SET NULL,
  platform_organization_id TEXT NOT NULL REFERENCES public.platform_organization_mappings(platform_organization_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  correlation_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'publishing', 'published', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, event_type, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_principal_mappings_pdm_user
  ON public.platform_principal_mappings(pdm_user_id, mapping_status);
CREATE INDEX IF NOT EXISTS idx_platform_organization_mappings_company
  ON public.platform_organization_mappings(pdm_company_id, mapping_status);
CREATE INDEX IF NOT EXISTS idx_platform_command_receipts_lookup
  ON public.platform_command_receipts(company_id, command_name, idempotency_key, command_status);
CREATE INDEX IF NOT EXISTS idx_platform_outbox_delivery
  ON public.platform_outbox_events(delivery_status, next_attempt_at, occurred_at);
CREATE INDEX IF NOT EXISTS idx_platform_outbox_aggregate
  ON public.platform_outbox_events(company_id, aggregate_type, aggregate_id, occurred_at);

INSERT INTO public.platform_principal_mappings (
  platform_principal_id, pdm_user_id, mapping_source, mapping_status, created_at, updated_at
)
SELECT 'pdm:' || users.id, users.id, 'current_pdm',
       CASE WHEN users.account_status = 'active' THEN 'active' ELSE 'suspended' END,
       now(), now()
FROM public.users
ON CONFLICT (pdm_user_id) DO NOTHING;

INSERT INTO public.platform_organization_mappings (
  platform_organization_id, pdm_company_id, mapping_source, mapping_status, created_at, updated_at
)
SELECT 'pdm-company:' || companies.id, companies.id, 'current_pdm', 'active', now(), now()
FROM public.companies
ON CONFLICT (pdm_company_id) DO NOTHING;

ALTER TABLE public.platform_principal_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_principal_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_organization_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_organization_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_command_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_outbox_events FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_principal_mappings FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_organization_mappings FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_command_receipts FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_outbox_events FROM anon, authenticated;

COMMENT ON TABLE public.platform_principal_mappings IS
  'Provider-neutral mapping from a future ERP principal to the stable PDM users.id authority.';
COMMENT ON TABLE public.platform_organization_mappings IS
  'Provider-neutral mapping from a future ERP organization to the stable PDM companies.id authority.';
COMMENT ON TABLE public.platform_command_receipts IS
  'Server-only idempotency receipts for controlled PDM commands.';
COMMENT ON TABLE public.platform_outbox_events IS
  'Server-only transactional outbox; rows are inserted atomically with authoritative PDM mutations.';

COMMIT;
