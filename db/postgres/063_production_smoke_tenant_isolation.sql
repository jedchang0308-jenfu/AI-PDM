-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible
-- DEV-116 supports exactly one classified physical lane: the pre-062 public
-- layout or the post-062 ai_pdm_core layout. It never moves relations.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL idle_in_transaction_session_timeout = '60s';
SELECT pg_advisory_xact_lock(hashtext('dev116-production-smoke-tenant'), hashtext(current_database()));

DO $dev116$
DECLARE
  target_schema text;
  public_count integer;
  core_count integer;
  audit_relation regclass;
  company_relation regclass;
  immutable_before text;
  immutable_after text;
BEGIN
  SELECT count(*) INTO public_count
  FROM unnest(ARRAY['companies', 'audit_logs', 'submissions', 'numbering_sequences']) AS relation_name
  WHERE to_regclass(format('public.%I', relation_name)) IS NOT NULL;

  SELECT count(*) INTO core_count
  FROM unnest(ARRAY['companies', 'audit_logs', 'submissions', 'numbering_sequences']) AS relation_name
  WHERE to_regclass(format('ai_pdm_core.%I', relation_name)) IS NOT NULL;

  IF public_count = 4 AND core_count = 0 THEN
    target_schema := 'public';
  ELSIF core_count = 4 AND public_count = 0 THEN
    target_schema := 'ai_pdm_core';
  ELSE
    RAISE EXCEPTION 'DEV116_SCHEMA_LAYOUT_AMBIGUOUS:public=%:core=%', public_count, core_count
      USING ERRCODE = '55000';
  END IF;

  audit_relation := to_regclass(format('%I.audit_logs', target_schema));
  company_relation := to_regclass(format('%I.companies', target_schema));

  EXECUTE format(
    'SELECT md5(coalesce(string_agg(id || chr(31) || coalesce(submission_id, chr(30)) || chr(31) || coalesce(actor_id, chr(30)) || chr(31) || action || chr(31) || detail_json::text || chr(31) || created_at::text, chr(29) ORDER BY id), chr(28))) FROM %I.audit_logs',
    target_schema
  ) INTO immutable_before;

  EXECUTE format(
    'ALTER TABLE %I.companies ADD COLUMN IF NOT EXISTS company_kind text NOT NULL DEFAULT ''business''',
    target_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.audit_logs ADD COLUMN IF NOT EXISTS company_id text',
    target_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.audit_logs ADD COLUMN IF NOT EXISTS scope_kind text NOT NULL DEFAULT ''legacy_unscoped''',
    target_schema
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = company_relation
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%company_kind%production_smoke%'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.companies ADD CONSTRAINT dev116_companies_kind_check CHECK (company_kind IN (''business'', ''production_smoke''))',
      target_schema
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = audit_relation
      AND contype = 'f'
      AND pg_get_constraintdef(oid) LIKE '%(company_id)%companies%'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.audit_logs ADD CONSTRAINT dev116_audit_company_fk FOREIGN KEY (company_id) REFERENCES %I.companies(id) ON DELETE RESTRICT',
      target_schema,
      target_schema
    );
  END IF;

  -- A submission is the strongest historical company authority. A conflicting
  -- detail hint is corruption, not a reason to guess.
  public_count := NULL;
  EXECUTE format(
    $sql$
      SELECT 1
      FROM %I.audit_logs AS audit
      JOIN %I.submissions AS submission ON submission.id = audit.submission_id
      WHERE coalesce(nullif(btrim(audit.detail_json ->> 'companyId'), ''), nullif(btrim(audit.detail_json ->> 'company_id'), '')) IS NOT NULL
        AND coalesce(nullif(btrim(audit.detail_json ->> 'companyId'), ''), nullif(btrim(audit.detail_json ->> 'company_id'), '')) <> submission.company_id
      LIMIT 1
    $sql$,
    target_schema,
    target_schema
  ) INTO public_count;
  IF public_count IS NOT NULL THEN
    RAISE EXCEPTION 'DEV116_AUDIT_COMPANY_CONFLICT' USING ERRCODE = '23514';
  END IF;

  EXECUTE format(
    $sql$
      UPDATE %I.audit_logs AS audit
      SET company_id = submission.company_id,
          scope_kind = 'tenant'
      FROM %I.submissions AS submission
      WHERE submission.id = audit.submission_id
        AND audit.scope_kind = 'legacy_unscoped'
        AND audit.company_id IS NULL
        AND submission.company_id IS NOT NULL
    $sql$,
    target_schema,
    target_schema
  );

  EXECUTE format(
    $sql$
      UPDATE %I.audit_logs AS audit
      SET company_id = company.id,
          scope_kind = 'tenant'
      FROM %I.companies AS company
      WHERE audit.scope_kind = 'legacy_unscoped'
        AND audit.company_id IS NULL
        AND audit.action LIKE 'numbering.%%'
        AND company.id = coalesce(
          nullif(btrim(audit.detail_json ->> 'companyId'), ''),
          nullif(btrim(audit.detail_json ->> 'company_id'), '')
        )
    $sql$,
    target_schema,
    target_schema
  );

  EXECUTE format(
    'UPDATE %I.audit_logs SET scope_kind = ''tenant'' WHERE company_id IS NOT NULL AND scope_kind = ''legacy_unscoped''',
    target_schema
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = audit_relation
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%scope_kind%legacy_unscoped%company_id%'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.audit_logs ADD CONSTRAINT dev116_audit_scope_check CHECK ((scope_kind = ''tenant'' AND company_id IS NOT NULL) OR (scope_kind IN (''global'', ''legacy_unscoped'') AND company_id IS NULL))',
      target_schema
    );
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_company_scope_created ON %I.audit_logs(company_id, scope_kind, action, created_at)',
    target_schema
  );

  public_count := NULL;
  EXECUTE format(
    'SELECT 1 FROM %I.numbering_sequences WHERE sequence_key NOT LIKE company_id || '':%%'' LIMIT 1',
    target_schema
  ) INTO public_count;
  IF public_count IS NOT NULL THEN
    RAISE EXCEPTION 'DEV116_SEQUENCE_SCOPE_MISMATCH' USING ERRCODE = '23514';
  END IF;

  public_count := NULL;
  EXECUTE format(
    'SELECT 1 FROM %I.audit_logs WHERE NOT ((scope_kind = ''tenant'' AND company_id IS NOT NULL) OR (scope_kind IN (''global'', ''legacy_unscoped'') AND company_id IS NULL)) LIMIT 1',
    target_schema
  ) INTO public_count;
  IF public_count IS NOT NULL THEN
    RAISE EXCEPTION 'DEV116_AUDIT_SCOPE_INVALID' USING ERRCODE = '23514';
  END IF;

  EXECUTE format(
    'SELECT md5(coalesce(string_agg(id || chr(31) || coalesce(submission_id, chr(30)) || chr(31) || coalesce(actor_id, chr(30)) || chr(31) || action || chr(31) || detail_json::text || chr(31) || created_at::text, chr(29) ORDER BY id), chr(28))) FROM %I.audit_logs',
    target_schema
  ) INTO immutable_after;
  IF immutable_before IS DISTINCT FROM immutable_after THEN
    RAISE EXCEPTION 'DEV116_AUDIT_IMMUTABLE_COLUMNS_CHANGED' USING ERRCODE = '55000';
  END IF;
END;
$dev116$;

COMMIT;
