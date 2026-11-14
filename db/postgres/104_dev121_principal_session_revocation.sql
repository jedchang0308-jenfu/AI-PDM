-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core
-- contract-impact: none
-- compatibility: backward-compatible
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE jenfu_ai_pdm_migrator;

ALTER TABLE ai_pdm_core.principal_session_records ADD COLUMN permission_snapshot jsonb;

CREATE FUNCTION ai_pdm_core.lock_principal_session_catalog_v1(p_catalog_version text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM 1 FROM ai_pdm_core.role_catalog_publications
    WHERE application_id = 'ai-pdm' AND status = 'active' AND catalog_version = p_catalog_version
    FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM ai_pdm_core.role_priority_versions WHERE status = 'active' FOR SHARE;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.lock_principal_session_catalog_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.lock_principal_session_catalog_v1(text) TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.revoke_sessions_for_retired_catalog_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  UPDATE ai_pdm_core.principal_session_records
    SET revoked_at = clock_timestamp(), revoke_reason = 'pdm_role_catalog_retired'
    WHERE revoked_at IS NULL AND permission_snapshot->>'catalogVersion' = OLD.catalog_version;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.revoke_sessions_for_retired_catalog_v1() FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER revoke_sessions_for_retired_catalog_v1
  AFTER UPDATE OF status ON ai_pdm_core.role_catalog_publications
  FOR EACH ROW WHEN (OLD.application_id = 'ai-pdm' AND OLD.status = 'active' AND NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION ai_pdm_core.revoke_sessions_for_retired_catalog_v1();

CREATE FUNCTION ai_pdm_core.revoke_sessions_for_retired_priority_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  UPDATE ai_pdm_core.principal_session_records
    SET revoked_at = clock_timestamp(), revoke_reason = 'pdm_role_priority_retired'
    WHERE revoked_at IS NULL AND permission_snapshot IS NOT NULL;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.revoke_sessions_for_retired_priority_v1() FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER revoke_sessions_for_retired_priority_v1
  AFTER UPDATE ON ai_pdm_core.role_priority_versions
  FOR EACH ROW WHEN (OLD.status = 'active' AND
    (NEW.status IS DISTINCT FROM OLD.status OR NEW.priority_json IS DISTINCT FROM OLD.priority_json))
  EXECUTE FUNCTION ai_pdm_core.revoke_sessions_for_retired_priority_v1();

CREATE TABLE ai_pdm_core.principal_session_revocation_events (
  event_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN (
    'prepare', 'published', 'cancelled', 'global_prepare', 'global_logout', 'global_cancelled'
  )),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  operation_hash text NOT NULL CHECK (operation_hash ~ '^[0-9a-f]{64}$'),
  baseline_epoch bigint CHECK (baseline_epoch BETWEEN 0 AND 9007199254740991),
  receipt jsonb NOT NULL,
  CHECK ((phase = 'global_prepare') = (baseline_epoch IS NOT NULL)),
  UNIQUE (operation_id, phase)
);

-- Intentionally independent of principal_accounts: a never-signed-in
-- Principal must be fenced before OrgMaster can publish their new grants.
CREATE TABLE ai_pdm_core.principal_session_issuance_controls (
  principal_id text PRIMARY KEY CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  pending_operation_id uuid,
  pending_global_count integer NOT NULL DEFAULT 0 CHECK (pending_global_count >= 0),
  minimum_auth_epoch bigint NOT NULL DEFAULT 0
    CHECK (minimum_auth_epoch BETWEEN 0 AND 9007199254740991),
  last_publication_version bigint,
  revoked_before timestamptz
);

REVOKE ALL ON ai_pdm_core.principal_session_revocation_events,
  ai_pdm_core.principal_session_issuance_controls FROM PUBLIC, jenfu_ai_pdm_runtime;

-- Both the INSERT trigger and delivery command lock the same row. A
-- concurrent row creation/update aborts an old SERIALIZABLE login snapshot
-- instead of admitting it against stale state.
CREATE FUNCTION ai_pdm_core.guard_principal_session_issuance_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  control ai_pdm_core.principal_session_issuance_controls%ROWTYPE;
BEGIN
  INSERT INTO ai_pdm_core.principal_session_issuance_controls (principal_id)
    VALUES (NEW.principal_id) ON CONFLICT (principal_id) DO NOTHING;
  SELECT * INTO STRICT control FROM ai_pdm_core.principal_session_issuance_controls
    WHERE principal_id = NEW.principal_id FOR SHARE;
  IF control.pending_operation_id IS NOT NULL OR control.pending_global_count > 0 OR
     NEW.principal_auth_epoch < control.minimum_auth_epoch OR
     NEW.authenticated_at <= control.revoked_before THEN
    RAISE EXCEPTION 'AIPDM_PRINCIPAL_SESSION_ISSUANCE_BLOCKED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_principal_session_issuance_v1() FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_principal_session_issuance_v1
  BEFORE INSERT ON ai_pdm_core.principal_session_records
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_principal_session_issuance_v1();

CREATE FUNCTION ai_pdm_core.guard_principal_session_snapshot_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF OLD.permission_snapshot IS DISTINCT FROM NEW.permission_snapshot OR
     (OLD.revoked_at IS NOT NULL AND OLD.revoked_at IS DISTINCT FROM NEW.revoked_at) THEN
    RAISE EXCEPTION 'AIPDM_PRINCIPAL_SESSION_SNAPSHOT_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_principal_session_snapshot_v1() FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_principal_session_snapshot_v1
  BEFORE UPDATE ON ai_pdm_core.principal_session_records
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_principal_session_snapshot_v1();

-- A transaction which has admitted a command holds a shared row lock until
-- commit. A revocation receipt can commit only after those commands finish.
-- FOR SHARE also rejects a repeatable-read writer with a stale row version.
CREATE FUNCTION ai_pdm_core.lock_principal_session_for_command_v1(p_principal text, p_hash text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM 1 FROM ai_pdm_core.principal_session_records
    WHERE principal_id = p_principal AND session_id_hash = p_hash
      AND revoked_at IS NULL AND expires_at > clock_timestamp()
    FOR SHARE;
  RETURN FOUND;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.lock_principal_session_for_command_v1(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.lock_principal_session_for_command_v1(text,text) TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.read_principal_session_revocation_v1(
  p_event uuid, p_operation uuid, p_phase text, p_request_hash text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  prior ai_pdm_core.principal_session_revocation_events%ROWTYPE;
BEGIN
  SELECT * INTO prior FROM ai_pdm_core.principal_session_revocation_events
    WHERE event_id = p_event OR (operation_id = p_operation AND (
      phase = p_phase OR
      (phase IN ('global_logout','global_cancelled') AND p_phase IN ('global_logout','global_cancelled'))
    ))
    ORDER BY (event_id = p_event) DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF prior.event_id IS DISTINCT FROM p_event OR prior.operation_id IS DISTINCT FROM p_operation
    OR prior.phase IS DISTINCT FROM p_phase OR prior.request_hash IS DISTINCT FROM p_request_hash THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOCATION_CONFLICT' USING ERRCODE = '23505';
  END IF;
  RETURN prior.receipt;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.read_principal_session_revocation_v1(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.read_principal_session_revocation_v1(uuid,uuid,text,text)
  TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.apply_principal_session_revocation_v1(
  p_event uuid, p_operation uuid, p_phase text, p_request_hash text, p_operation_hash text,
  p_principals text[], p_epoch bigint, p_revoked_before timestamptz,
  p_baseline_version bigint, p_publication_version bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $function$
DECLARE
  prior jsonb;
  principal text;
  result jsonb;
  global_event boolean := p_phase IN ('global_prepare','global_logout','global_cancelled');
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' OR p_event IS NULL OR
    p_operation IS NULL OR p_phase IS NULL OR NOT (global_event OR p_phase IN ('prepare','published','cancelled')) OR
    p_request_hash IS NULL OR p_request_hash !~ '^[0-9a-f]{64}$' OR
    p_operation_hash IS NULL OR p_operation_hash !~ '^[0-9a-f]{64}$' OR
    coalesce(cardinality(p_principals), 0) NOT BETWEEN 1 AND 4096 OR
    p_principals IS DISTINCT FROM ARRAY(
      SELECT DISTINCT id COLLATE "C" FROM unnest(p_principals) AS p(id)
      WHERE id ~ '^[A-Za-z0-9._:@/-]{1,255}$' ORDER BY 1
    ) OR (global_event AND (cardinality(p_principals) <> 1 OR
      p_epoch IS NULL OR p_epoch NOT BETWEEN 0 AND 9007199254740991 OR
      (p_phase = 'global_logout' AND (p_epoch = 0 OR p_revoked_before IS NULL OR NOT isfinite(p_revoked_before))) OR
      (p_phase <> 'global_logout' AND p_revoked_before IS NOT NULL) OR
      p_baseline_version IS NOT NULL OR p_publication_version IS NOT NULL)) OR
    (NOT global_event AND (p_epoch IS NOT NULL OR p_revoked_before IS NOT NULL OR
      p_baseline_version IS NULL OR p_baseline_version < 0 OR p_publication_version IS NULL OR
      p_publication_version <= p_baseline_version)) THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOCATION_INVALID' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ai_pdm:session-revocation:' || p_operation::text, 0));
  prior := ai_pdm_core.read_principal_session_revocation_v1(p_event, p_operation, p_phase, p_request_hash);
  IF prior IS NOT NULL THEN RETURN prior; END IF;
  IF (p_phase NOT IN ('prepare','global_prepare') AND NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.principal_session_revocation_events event
      WHERE event.operation_id = p_operation
        AND event.phase = CASE WHEN global_event THEN 'global_prepare' ELSE 'prepare' END
        AND event.operation_hash = p_operation_hash
        AND (NOT global_event OR event.baseline_epoch =
          CASE WHEN p_phase = 'global_logout' THEN p_epoch - 1 ELSE p_epoch END)
  )) OR EXISTS (
    SELECT 1 FROM ai_pdm_core.principal_session_revocation_events
      WHERE operation_id = p_operation AND
      (p_phase IN ('prepare','global_prepare') OR phase IN ('published','cancelled','global_logout','global_cancelled'))
  ) THEN
    RAISE EXCEPTION 'AIPDM_SESSION_REVOCATION_CONFLICT' USING ERRCODE = '23505';
  END IF;

  FOREACH principal IN ARRAY p_principals LOOP
    INSERT INTO ai_pdm_core.principal_session_issuance_controls (principal_id)
      VALUES (principal) ON CONFLICT (principal_id) DO NOTHING;
    PERFORM 1 FROM ai_pdm_core.principal_session_issuance_controls
      WHERE principal_id = principal FOR UPDATE;
  END LOOP;

  IF p_phase = 'prepare' THEN
    IF EXISTS (SELECT 1 FROM ai_pdm_core.principal_session_issuance_controls
      WHERE principal_id = ANY(p_principals) AND (pending_operation_id IS NOT NULL OR
        last_publication_version > p_baseline_version)) THEN
      RAISE EXCEPTION 'AIPDM_SESSION_REVOCATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    UPDATE ai_pdm_core.principal_session_issuance_controls SET pending_operation_id = p_operation
      WHERE principal_id = ANY(p_principals);
    UPDATE ai_pdm_core.principal_session_records
      SET revoked_at = clock_timestamp(), revoke_reason = 'platform_permission_change'
      WHERE principal_id = ANY(p_principals) AND revoked_at IS NULL;
  ELSIF p_phase = 'global_prepare' THEN
    UPDATE ai_pdm_core.principal_session_issuance_controls
      SET pending_global_count = pending_global_count + 1
      WHERE principal_id = ANY(p_principals);
    UPDATE ai_pdm_core.principal_session_records
      SET revoked_at = clock_timestamp(), revoke_reason = 'platform_global_logout'
      WHERE principal_id = ANY(p_principals) AND revoked_at IS NULL
        AND principal_auth_epoch <= p_epoch;
  ELSIF global_event THEN
    UPDATE ai_pdm_core.principal_session_issuance_controls
      SET pending_global_count = pending_global_count - 1,
          minimum_auth_epoch = CASE WHEN p_phase = 'global_logout'
            THEN greatest(minimum_auth_epoch, p_epoch) ELSE minimum_auth_epoch END,
          revoked_before = greatest(revoked_before, p_revoked_before)
      WHERE principal_id = ANY(p_principals);
    UPDATE ai_pdm_core.principal_session_records
      SET revoked_at = clock_timestamp(), revoke_reason = 'platform_global_logout'
      WHERE p_phase = 'global_logout' AND principal_id = ANY(p_principals) AND revoked_at IS NULL
        AND (principal_auth_epoch < p_epoch OR authenticated_at <= p_revoked_before);
  ELSE
    IF EXISTS (SELECT 1 FROM ai_pdm_core.principal_session_issuance_controls
      WHERE principal_id = ANY(p_principals) AND pending_operation_id IS DISTINCT FROM p_operation) THEN
      RAISE EXCEPTION 'AIPDM_SESSION_REVOCATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    UPDATE ai_pdm_core.principal_session_issuance_controls SET pending_operation_id = NULL,
      last_publication_version = CASE WHEN p_phase = 'published' THEN p_publication_version ELSE last_publication_version END
      WHERE principal_id = ANY(p_principals);
  END IF;

  result := jsonb_build_object(
    'contractVersion', 'ai-pdm.session-revocation-receipt.v1', 'eventId', p_event,
    'operationId', p_operation, 'phase', p_phase, 'digest', p_request_hash,
    'receiptId', gen_random_uuid(), 'appliedAt',
    to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  INSERT INTO ai_pdm_core.principal_session_revocation_events
    (event_id, operation_id, phase, request_hash, operation_hash, baseline_epoch, receipt)
    VALUES (p_event, p_operation, p_phase, p_request_hash, p_operation_hash,
      CASE WHEN p_phase = 'global_prepare' THEN p_epoch END, result);
  RETURN result;
END;
$function$;
REVOKE ALL ON FUNCTION ai_pdm_core.apply_principal_session_revocation_v1(
  uuid,uuid,text,text,text,text[],bigint,timestamptz,bigint,bigint
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.apply_principal_session_revocation_v1(
  uuid,uuid,text,text,text,text[],bigint,timestamptz,bigint,bigint
) TO jenfu_ai_pdm_runtime;

COMMIT;
