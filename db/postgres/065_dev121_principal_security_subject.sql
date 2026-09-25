-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: none (owner-private principal security state)
-- compatibility: additive
-- governance-review: AIPDM/DEV-121#principal-consumer-impact
-- Owner release: forward-only addition after the 15-entry DEV-010 baseline.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev121-principal-security-subject'), hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- The account row is the sole principal-to-profile link. Historical users.id
-- foreign keys remain domain references; they cannot mint a security subject.
-- The composite key makes the principal account's workspace the authoritative
-- security scope while proving it belongs to the same historical PDM profile.
ALTER TABLE ai_pdm_core.users
  ADD CONSTRAINT users_profile_company_pair_v1 UNIQUE (id, company_id);
CREATE TABLE ai_pdm_core.principal_accounts (
  principal_id text PRIMARY KEY CHECK (char_length(principal_id) BETWEEN 1 AND 255),
  pdm_user_id text NOT NULL UNIQUE
    REFERENCES ai_pdm_core.users(id) ON DELETE RESTRICT,
  company_id text NOT NULL
    REFERENCES ai_pdm_core.companies(id) ON DELETE RESTRICT,
  CONSTRAINT principal_profile_company_pair FOREIGN KEY (pdm_user_id, company_id)
    REFERENCES ai_pdm_core.users(id, company_id) ON DELETE RESTRICT,
  employee_id text NOT NULL CHECK (char_length(employee_id) BETWEEN 1 AND 255),
  account_type text NOT NULL CHECK (account_type IN ('human_personal', 'human_privileged')),
  account_status text NOT NULL
    CHECK (account_status IN ('active', 'suspended', 'expired', 'offboarded')),
  lifecycle_version bigint NOT NULL CHECK (lifecycle_version BETWEEN 1 AND 9007199254740991),
  session_invalid_before timestamptz NULL,
  profile_version bigint NOT NULL CHECK (profile_version BETWEEN 1 AND 9007199254740991),
  system_role_enabled boolean NOT NULL,
  minimum_assurance text NOT NULL CHECK (minimum_assurance IN ('aal1', 'aal2')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT principal_account_profile_pair UNIQUE (pdm_user_id, principal_id),
  CONSTRAINT principal_account_provenance_triplet UNIQUE (company_id, pdm_user_id, principal_id),
  CONSTRAINT principal_privileged_assurance CHECK (
    account_type <> 'human_privileged' OR minimum_assurance = 'aal2'
  )
);
ALTER TABLE ai_pdm_core.principal_accounts OWNER TO jenfu_ai_pdm_migrator;
CREATE INDEX principal_accounts_employee_idx
  ON ai_pdm_core.principal_accounts(employee_id, principal_id);

-- Command provenance is the authenticated principal, not the historical
-- platform_principal_mappings alias. Keep the old column for prior receipts
-- and v1 recovery only; a v2 command writes the canonical column directly.
ALTER TABLE ai_pdm_core.platform_command_receipts
  ADD COLUMN principal_id text NULL,
  ALTER COLUMN platform_organization_id DROP NOT NULL,
  ADD CONSTRAINT command_receipt_principal_subject_fk
    FOREIGN KEY (company_id, actor_id, principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT command_receipt_principal_lane_chk
    CHECK (principal_id IS NULL OR
      (actor_id IS NOT NULL AND platform_principal_id IS NULL
       AND platform_organization_id IS NULL));
ALTER TABLE ai_pdm_core.platform_outbox_events
  ADD COLUMN principal_id text NULL,
  ALTER COLUMN platform_organization_id DROP NOT NULL,
  ADD CONSTRAINT outbox_principal_subject_fk
    FOREIGN KEY (company_id, actor_id, principal_id)
    REFERENCES ai_pdm_core.principal_accounts(company_id, pdm_user_id, principal_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT outbox_principal_lane_chk
    CHECK (principal_id IS NULL OR
      (actor_id IS NOT NULL AND platform_principal_id IS NULL
       AND platform_organization_id IS NULL));

CREATE TABLE ai_pdm_core.principal_identity_operations (
  operation_id text PRIMARY KEY CHECK (char_length(operation_id) BETWEEN 1 AND 255),
  operation_kind text NOT NULL CHECK (operation_kind IN ('cutover', 'provision', 'lifecycle')),
  input_hash char(64) NOT NULL CHECK (input_hash ~ '^[0-9a-f]{64}$'),
  cohort_hash char(64) NOT NULL CHECK (cohort_hash ~ '^[0-9a-f]{64}$'),
  result_json jsonb NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  committed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ai_pdm_core.principal_identity_operations OWNER TO jenfu_ai_pdm_migrator;

-- A row is required before a legacy human account may use the temporary v1
-- compatibility reader. principal_active is one-way and never falls back.
CREATE TABLE ai_pdm_core.principal_identity_cutovers (
  pdm_user_id text PRIMARY KEY
    REFERENCES ai_pdm_core.users(id) ON DELETE RESTRICT,
  -- Inventory may record the verified principal before its account is
  -- materialized. Only principal_active requires the local account pair.
  principal_id text UNIQUE NULL CHECK (principal_id IS NULL OR char_length(principal_id) BETWEEN 1 AND 255),
  status text NOT NULL CHECK (status IN ('legacy_compatible', 'principal_active')),
  active_principal_id text GENERATED ALWAYS AS (
    CASE WHEN status = 'principal_active' THEN principal_id ELSE NULL END
  ) STORED,
  source_hash char(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  operation_id text NULL
    REFERENCES ai_pdm_core.principal_identity_operations(operation_id)
    DEFERRABLE INITIALLY DEFERRED,
  activated_at timestamptz NULL,
  row_version bigint NOT NULL DEFAULT 1 CHECK (row_version BETWEEN 1 AND 9007199254740991),
  CONSTRAINT principal_cutover_active_profile_pair FOREIGN KEY (pdm_user_id, active_principal_id)
    REFERENCES ai_pdm_core.principal_accounts(pdm_user_id, principal_id)
    DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT principal_cutover_active_complete CHECK (
    status = 'legacy_compatible'
    OR (principal_id IS NOT NULL AND operation_id IS NOT NULL AND activated_at IS NOT NULL)
  )
);
ALTER TABLE ai_pdm_core.principal_identity_cutovers OWNER TO jenfu_ai_pdm_migrator;
CREATE INDEX principal_identity_cutovers_operation_idx
  ON ai_pdm_core.principal_identity_cutovers(operation_id);

-- A command keeps this row locked until its transaction commits. The runtime
-- gets only EXECUTE; FOR SHARE must not require direct UPDATE privilege on the
-- cutover table. In SERIALIZABLE, a concurrently changed row aborts the stale
-- reader rather than allowing a command to continue on the old marker.
CREATE FUNCTION ai_pdm_core.read_principal_cutover_for_command_v1(p_pdm_user_id text)
RETURNS TABLE(status text, principal_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_pdm_user_id IS NULL OR char_length(p_pdm_user_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'AIPDM_PRINCIPAL_CUTOVER_SUBJECT_INVALID'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
    SELECT cutover.status, cutover.principal_id
    FROM ai_pdm_core.principal_identity_cutovers cutover
    WHERE cutover.pdm_user_id = p_pdm_user_id
    FOR SHARE;
END;
$function$;
ALTER FUNCTION ai_pdm_core.read_principal_cutover_for_command_v1(text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.read_principal_cutover_for_command_v1(text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.read_principal_cutover_for_command_v1(text)
  TO jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.guard_principal_identity_state_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'principal_identity_operations' THEN
    RAISE EXCEPTION 'AIPDM_PRINCIPAL_OPERATION_APPEND_ONLY'
      USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'principal_identity_cutovers' THEN
    IF TG_OP = 'DELETE' OR OLD.status = 'principal_active' THEN
      RAISE EXCEPTION 'AIPDM_PRINCIPAL_CUTOVER_ONE_WAY'
        USING ERRCODE = '23514';
    END IF;
    IF NEW.pdm_user_id IS DISTINCT FROM OLD.pdm_user_id
       OR (OLD.principal_id IS NOT NULL
           AND NEW.principal_id IS DISTINCT FROM OLD.principal_id)
       OR NEW.row_version <> OLD.row_version + 1 THEN
      RAISE EXCEPTION 'AIPDM_PRINCIPAL_CUTOVER_BINDING_INVALID'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'principal_accounts' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'AIPDM_PRINCIPAL_ACCOUNT_LINK_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    IF ROW(NEW.principal_id, NEW.pdm_user_id, NEW.company_id, NEW.employee_id)
       IS DISTINCT FROM
       ROW(OLD.principal_id, OLD.pdm_user_id, OLD.company_id, OLD.employee_id) THEN
      RAISE EXCEPTION 'AIPDM_PRINCIPAL_ACCOUNT_LINK_IMMUTABLE'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AIPDM_PRINCIPAL_IDENTITY_TABLE_INVALID'
    USING ERRCODE = '23514';
END;
$function$;
ALTER FUNCTION ai_pdm_core.guard_principal_identity_state_v1()
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_principal_identity_state_v1()
  FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_principal_operation_append_only_v1
  BEFORE UPDATE OR DELETE ON ai_pdm_core.principal_identity_operations
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_principal_identity_state_v1();
CREATE TRIGGER guard_principal_cutover_one_way_v1
  BEFORE UPDATE OR DELETE ON ai_pdm_core.principal_identity_cutovers
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_principal_identity_state_v1();
CREATE TRIGGER guard_principal_account_link_v1
  BEFORE UPDATE OR DELETE ON ai_pdm_core.principal_accounts
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_principal_identity_state_v1();

CREATE TABLE ai_pdm_core.principal_role_assignments (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 255),
  principal_id text NOT NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  role_id text NOT NULL REFERENCES ai_pdm_core.roles(id) ON DELETE RESTRICT,
  source_assignment_id text UNIQUE NULL,
  origin text NOT NULL
    CHECK (origin IN ('legacy_base', 'legacy_assignment', 'principal_assignment')),
  reason text NOT NULL DEFAULT '',
  scope_template text NOT NULL,
  named_scope text NOT NULL DEFAULT '',
  sponsor_principal_id text NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  starts_at timestamptz NULL,
  review_due_at timestamptz NULL,
  hard_ends_at timestamptz NULL,
  assigned_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  assigned_by_principal_id text NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  revoked_by_principal_id text NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  legacy_assigned_by_user_id text NULL,
  legacy_revoked_by_user_id text NULL,
  CONSTRAINT principal_assignment_time_order CHECK (
    (hard_ends_at IS NULL OR starts_at IS NULL OR hard_ends_at > starts_at)
    AND (revoked_at IS NULL OR revoked_at >= assigned_at)
  )
);
ALTER TABLE ai_pdm_core.principal_role_assignments OWNER TO jenfu_ai_pdm_migrator;
CREATE INDEX principal_role_assignments_active_idx
  ON ai_pdm_core.principal_role_assignments(principal_id, revoked_at, role_id);

CREATE TABLE ai_pdm_core.principal_approval_delegations (
  id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 255),
  source_delegation_id text UNIQUE NULL,
  from_principal_id text NOT NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  to_principal_id text NOT NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  project_code text NULL,
  action_code text NULL,
  starts_at timestamptz NULL,
  ends_at timestamptz NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  created_by_principal_id text NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  revoked_by_principal_id text NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  legacy_created_by_user_id text NULL,
  legacy_revoked_by_user_id text NULL,
  CONSTRAINT principal_delegation_time_order CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);
ALTER TABLE ai_pdm_core.principal_approval_delegations OWNER TO jenfu_ai_pdm_migrator;
CREATE INDEX principal_approval_delegations_active_idx
  ON ai_pdm_core.principal_approval_delegations(to_principal_id, revoked_at);

CREATE TABLE ai_pdm_core.principal_session_records (
  principal_id text NOT NULL
    REFERENCES ai_pdm_core.principal_accounts(principal_id) ON DELETE RESTRICT,
  session_id_hash char(64) NOT NULL UNIQUE
    CHECK (session_id_hash ~ '^[0-9a-f]{64}$'),
  session_schema_version smallint NOT NULL DEFAULT 2 CHECK (session_schema_version = 2),
  principal_auth_epoch bigint NOT NULL CHECK (principal_auth_epoch BETWEEN 0 AND 9007199254740991),
  lifecycle_version bigint NOT NULL CHECK (lifecycle_version BETWEEN 1 AND 9007199254740991),
  profile_version bigint NOT NULL CHECK (profile_version BETWEEN 1 AND 9007199254740991),
  authenticated_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NULL,
  revoke_reason text NULL,
  last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  assurance_level text NOT NULL CHECK (assurance_level IN ('aal1', 'aal2')),
  assurance_policy_hash char(64) NOT NULL
    CHECK (assurance_policy_hash ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (principal_id, session_id_hash),
  CONSTRAINT principal_session_time_order CHECK (
    expires_at > issued_at AND expires_at <= issued_at + interval '8 hours'
  )
);
ALTER TABLE ai_pdm_core.principal_session_records OWNER TO jenfu_ai_pdm_migrator;
CREATE INDEX principal_session_records_expiry_idx
  ON ai_pdm_core.principal_session_records(expires_at);

-- The old security writers remain present during the staged rollout. Once a
-- profile is principal_active, no old row can change its authorization facts.
-- Both this trigger and the eventual owner cutover command take the same
-- subject advisory lock, so an in-flight old write cannot pass a stale marker
-- check while cutover commits. Ordinary contact/profile edits are unaffected.
CREATE FUNCTION ai_pdm_core.guard_legacy_security_write_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  prior jsonb := '{}'::jsonb;
  next_row jsonb := '{}'::jsonb;
  subject text;
  subjects text[];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    prior := to_jsonb(OLD);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_row := to_jsonb(NEW);
  END IF;
  IF TG_TABLE_NAME = 'users' AND TG_OP = 'UPDATE'
     AND ROW(next_row->>'id', next_row->>'role', next_row->>'company_id',
             next_row->>'account_status', next_row->>'account_lifecycle_version',
             next_row->>'system_role_enabled', next_row->>'session_invalid_before')
         IS NOT DISTINCT FROM
         ROW(prior->>'id', prior->>'role', prior->>'company_id',
             prior->>'account_status', prior->>'account_lifecycle_version',
             prior->>'system_role_enabled', prior->>'session_invalid_before')
  THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'users' THEN
    subjects := ARRAY[prior->>'id', next_row->>'id'];
  ELSIF TG_TABLE_NAME = 'user_role_assignments' THEN
    subjects := ARRAY[prior->>'user_id', next_row->>'user_id',
                      prior->>'sponsor_user_id', next_row->>'sponsor_user_id'];
  ELSIF TG_TABLE_NAME = 'approval_delegations' THEN
    subjects := ARRAY[prior->>'delegated_from', next_row->>'delegated_from',
                      prior->>'delegated_to', next_row->>'delegated_to'];
  ELSIF TG_TABLE_NAME IN ('auth_identities', 'account_session_records',
                         'user_company_memberships') THEN
    subjects := ARRAY[prior->>'user_id', next_row->>'user_id'];
  ELSIF TG_TABLE_NAME IN ('platform_principal_mappings', 'employee_login_aliases') THEN
    subjects := ARRAY[prior->>'pdm_user_id', next_row->>'pdm_user_id'];
  ELSE
    RAISE EXCEPTION 'AIPDM_LEGACY_SECURITY_TABLE_INVALID'
      USING ERRCODE = '23514';
  END IF;

  -- A pre-cutover RR/SERIALIZABLE snapshot could still see the old marker
  -- after waiting on the advisory lock. Old security writers use RC only;
  -- principal-aware owner commands use their separate controlled lane.
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'AIPDM_LEGACY_SECURITY_ISOLATION_UNSUPPORTED'
      USING ERRCODE = '23514';
  END IF;

  FOR subject IN SELECT DISTINCT candidate FROM unnest(subjects) AS candidate
                 WHERE candidate IS NOT NULL ORDER BY candidate
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('aipdm-dev121-subject'), pg_catalog.hashtext(subject));
    IF EXISTS (
      SELECT 1 FROM ai_pdm_core.principal_identity_cutovers cutover
      WHERE cutover.pdm_user_id = subject AND cutover.status = 'principal_active'
    ) THEN
      RAISE EXCEPTION 'AIPDM_LEGACY_SECURITY_WRITER_RETIRED'
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION ai_pdm_core.guard_legacy_security_write_v1()
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_legacy_security_write_v1()
  FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_legacy_user_security_write_v1
  BEFORE UPDATE OR DELETE ON ai_pdm_core.users
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_assignment_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.user_role_assignments
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_delegation_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.approval_delegations
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_identity_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.auth_identities
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_account_session_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.account_session_records
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_membership_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.user_company_memberships
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_platform_mapping_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.platform_principal_mappings
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();
CREATE TRIGGER guard_legacy_employee_alias_write_v1
  BEFORE INSERT OR UPDATE OR DELETE ON ai_pdm_core.employee_login_aliases
  FOR EACH ROW EXECUTE FUNCTION ai_pdm_core.guard_legacy_security_write_v1();

CREATE FUNCTION ai_pdm_core.guard_principal_session_binding_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF ROW(NEW.principal_id, NEW.session_id_hash, NEW.session_schema_version,
         NEW.principal_auth_epoch, NEW.lifecycle_version, NEW.profile_version,
         NEW.authenticated_at, NEW.issued_at, NEW.expires_at,
         NEW.assurance_level, NEW.assurance_policy_hash)
     IS DISTINCT FROM
     ROW(OLD.principal_id, OLD.session_id_hash, OLD.session_schema_version,
         OLD.principal_auth_epoch, OLD.lifecycle_version, OLD.profile_version,
         OLD.authenticated_at, OLD.issued_at, OLD.expires_at,
         OLD.assurance_level, OLD.assurance_policy_hash)
  THEN
    RAISE EXCEPTION 'AIPDM_PRINCIPAL_SESSION_BINDING_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION ai_pdm_core.guard_principal_session_binding_v1()
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.guard_principal_session_binding_v1()
  FROM PUBLIC, jenfu_ai_pdm_runtime;
CREATE TRIGGER guard_principal_session_binding_v1
  BEFORE UPDATE ON ai_pdm_core.principal_session_records
  FOR EACH ROW
  EXECUTE FUNCTION ai_pdm_core.guard_principal_session_binding_v1();

-- Runtime reads principal state but cannot directly rewrite account, ACL,
-- cutover markers or successful operation receipts. Narrow mutation functions
-- are added before any principal_active cutover is allowed.
REVOKE ALL ON
  ai_pdm_core.principal_accounts,
  ai_pdm_core.principal_identity_operations,
  ai_pdm_core.principal_identity_cutovers,
  ai_pdm_core.principal_role_assignments,
  ai_pdm_core.principal_approval_delegations,
  ai_pdm_core.principal_session_records
FROM PUBLIC, jenfu_ai_pdm_runtime;
GRANT SELECT ON
  ai_pdm_core.principal_accounts,
  ai_pdm_core.principal_identity_cutovers,
  ai_pdm_core.principal_role_assignments,
  ai_pdm_core.principal_approval_delegations,
  ai_pdm_core.principal_session_records
TO jenfu_ai_pdm_runtime;
GRANT INSERT ON ai_pdm_core.principal_session_records
  TO jenfu_ai_pdm_runtime;
GRANT UPDATE (revoked_at, revoke_reason, last_seen_at)
  ON ai_pdm_core.principal_session_records TO jenfu_ai_pdm_runtime;

-- The owner command must not rely on an arbitrary caller-supplied actor ID.
-- Recheck the active target session, exact typed producer identity, current
-- authority, effective grant and published role capability inside the same
-- transaction. This deliberately denies legacy_authority for new enrollment.
CREATE FUNCTION ai_pdm_core.assert_principal_account_manager_v1(
  p_actor_principal_id text,
  p_actor_identity_issuer text,
  p_actor_identity_subject text,
  p_actor_session_hash text,
  p_company_id text,
  p_permission_code text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_allowed_count bigint;
  v_denied_count bigint;
  v_authority_count bigint;
  v_typed_count bigint;
BEGIN
  IF p_actor_principal_id IS NULL OR char_length(p_actor_principal_id) NOT BETWEEN 1 AND 255
     OR p_actor_identity_issuer IS NULL OR char_length(p_actor_identity_issuer) NOT BETWEEN 1 AND 255
     OR p_actor_identity_subject IS NULL OR char_length(p_actor_identity_subject) NOT BETWEEN 1 AND 255
     OR p_actor_session_hash IS NULL OR p_actor_session_hash !~ '^[0-9a-f]{64}$'
     OR p_company_id <> 'company-jenfu'
     OR p_permission_code IS NULL
     OR p_permission_code NOT IN ('accounts.invitation.manage',
                                  'accounts.lifecycle.manage') THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO v_typed_count
    FROM orgmaster_contract.v_active_principal_accounts_v1 typed
   WHERE typed.principal_id = p_actor_principal_id
     AND typed.principal_issuer = p_actor_identity_issuer
     AND typed.principal_subject = p_actor_identity_subject
     AND typed.contract_version = 'organization.active-principal.v1'
     AND typed.employee_status = 'active';
  IF v_typed_count <> 1 OR NOT EXISTS (
    SELECT 1
      FROM ai_pdm_core.principal_accounts account
      JOIN ai_pdm_core.principal_identity_cutovers cutover
        ON cutover.pdm_user_id = account.pdm_user_id
       AND cutover.principal_id = account.principal_id
       AND cutover.status = 'principal_active'
      JOIN ai_pdm_core.users profile ON profile.id = account.pdm_user_id
      JOIN ai_pdm_core.principal_session_records session
        ON session.principal_id = account.principal_id
       AND session.session_id_hash = p_actor_session_hash
      JOIN orgmaster_contract.v_active_principal_accounts_v1 typed
        ON typed.principal_id = account.principal_id
       AND typed.employee_id = account.employee_id
       AND typed.account_type = account.account_type
       AND typed.principal_issuer = p_actor_identity_issuer
       AND typed.principal_subject = p_actor_identity_subject
     WHERE account.principal_id = p_actor_principal_id
       AND account.account_status = 'active' AND account.system_role_enabled
       AND account.company_id = p_company_id
       AND profile.company_id = account.company_id
       AND typed.contract_version = 'organization.active-principal.v1'
       AND typed.employee_status = 'active'
       AND session.revoked_at IS NULL
       AND session.issued_at <= pg_catalog.transaction_timestamp()
       AND session.expires_at > pg_catalog.transaction_timestamp()
       AND session.assurance_level = 'aal2'
       AND session.lifecycle_version = account.lifecycle_version
       AND session.profile_version = account.profile_version
       AND (account.session_invalid_before IS NULL
            OR session.issued_at > account.session_invalid_before)
  ) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_ACTOR_INVALID' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_authority_count
    FROM ai_pdm_core.principal_accounts account
    JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 source
      ON source.employee_id = account.employee_id
   WHERE account.principal_id = p_actor_principal_id
     AND source.application_id = 'ai-pdm'
     AND source.contract_version = 'jenfu.platform-entitlement.v1';
  IF v_authority_count <> 1 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  WITH authority AS (
    SELECT source.authority_version
      FROM ai_pdm_core.principal_accounts account
      JOIN orgmaster_contract.v_ai_pdm_entitlement_authority_v1 source
        ON source.employee_id = account.employee_id
     WHERE account.principal_id = p_actor_principal_id
       AND source.contract_version = 'jenfu.platform-entitlement.v1'
       AND source.application_id = 'ai-pdm'
       AND source.authority_source = 'orgmaster_authority'
  ), applicable AS (
    SELECT role.permissions,
           grant_row.role_code,
           grant_row.scope_kind,
           grant_row.scope_key,
           grant_row.subject_kind,
           grant_row.target_principal_id,
           grant_row.grant_kind,
           grant_row.delegation_id
      FROM authority
      JOIN orgmaster_contract.v_ai_pdm_effective_role_assignments_v1 grant_row
        ON grant_row.authority_version = authority.authority_version
      JOIN ai_pdm_contract.v_application_role_catalog_v1 role
        ON role.stable_role_id = grant_row.stable_role_id
       AND role.role_code = grant_row.role_code
     WHERE grant_row.contract_version = 'jenfu.platform-entitlement.v1'
       AND grant_row.application_id = 'ai-pdm'
       AND grant_row.principal_id = p_actor_principal_id
       AND grant_row.identity_issuer = p_actor_identity_issuer
       AND grant_row.identity_subject = p_actor_identity_subject
       AND grant_row.valid_from <= pg_catalog.transaction_timestamp()
       AND (grant_row.valid_until IS NULL
            OR grant_row.valid_until > pg_catalog.transaction_timestamp())
       AND role.contract_version = 'jenfu.platform-entitlement.v1'
       AND role.application_id = 'ai-pdm'
       AND role.assignable
       AND role.subject_kind = grant_row.subject_kind
       AND role.allowed_scope_kinds ? grant_row.scope_kind
       AND (
         (grant_row.role_code = 'pdm_admin'
          AND grant_row.scope_kind = 'workspace'
          AND grant_row.scope_key IN ('current', p_company_id)
          AND grant_row.subject_kind = 'employee')
         OR
         (grant_row.role_code = 'system_admin'
          AND grant_row.scope_kind = 'global'
          AND grant_row.scope_key IS NULL
          AND grant_row.subject_kind = 'principal'
          AND grant_row.target_principal_id = p_actor_principal_id
          AND grant_row.grant_kind = 'direct'
          AND grant_row.delegation_id IS NULL)
       )
  ), decisions AS (
    SELECT (permission.value->>'allowed')::boolean AS allowed
      FROM applicable role
      CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(role.permissions) permission(value)
     WHERE permission.value->>'kind' = 'action'
       AND permission.value->>'code' = p_permission_code
  )
  SELECT count(*) FILTER (WHERE allowed), count(*) FILTER (WHERE NOT allowed)
    INTO v_allowed_count, v_denied_count FROM decisions;
  IF v_allowed_count < 1 OR v_denied_count > 0 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;
END;
$function$;
ALTER FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.assert_principal_account_manager_v1(text,text,text,text,text,text)
  FROM PUBLIC, jenfu_ai_pdm_runtime;

CREATE FUNCTION ai_pdm_core.provision_principal_account_v1(
  p_request jsonb,
  p_actor_principal_id text,
  p_actor_identity_issuer text,
  p_actor_identity_subject text,
  p_actor_session_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_ref jsonb;
  v_operation_id text;
  v_principal_id text;
  v_company_id text;
  v_display_name text;
  v_contact_email text;
  v_enabled boolean;
  v_input_hash text;
  v_user_id text;
  v_receipt ai_pdm_core.principal_identity_operations%ROWTYPE;
  v_account ai_pdm_core.principal_accounts%ROWTYPE;
  v_source_count bigint;
  v_source_match bigint;
  v_source_employees bigint;
  v_source_types bigint;
  v_committed_at timestamptz;
  v_result jsonb;
BEGIN
  IF p_request IS NULL OR pg_catalog.jsonb_typeof(p_request) <> 'object'
     OR pg_catalog.jsonb_typeof(p_request->'principalRef') <> 'object'
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS key
                WHERE key NOT IN ('contractVersion','operationId','principalRef',
                                  'displayName','contactEmail','accountEnabled','companyId'))
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request->'principalRef') AS key
                WHERE key NOT IN ('principalId','identityIssuer','identitySubject',
                                  'employeeId','accountType','mappingVersion','publishedAt'))
     OR p_request->>'contractVersion' IS DISTINCT FROM 'ai-pdm.principal-provision.v1'
     OR (p_request ? 'accountEnabled'
         AND pg_catalog.jsonb_typeof(p_request->'accountEnabled') <> 'boolean')
  THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  v_ref := p_request->'principalRef';
  v_operation_id := p_request->>'operationId';
  v_principal_id := v_ref->>'principalId';
  v_company_id := p_request->>'companyId';
  v_display_name := p_request->>'displayName';
  v_contact_email := p_request->>'contactEmail';
  v_enabled := COALESCE((p_request->>'accountEnabled')::boolean, false);
  IF p_actor_principal_id IS NULL OR char_length(p_actor_principal_id) NOT BETWEEN 1 AND 255
     OR v_operation_id IS NULL OR v_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR v_principal_id IS NULL OR char_length(v_principal_id) NOT BETWEEN 1 AND 255
     OR v_company_id IS NULL OR char_length(v_company_id) NOT BETWEEN 1 AND 255
     OR v_display_name IS NULL OR char_length(v_display_name) NOT BETWEEN 1 AND 255
     OR btrim(v_display_name) = '' OR v_display_name <> btrim(v_display_name)
     OR (v_contact_email IS NOT NULL AND
         (char_length(v_contact_email) NOT BETWEEN 3 AND 254 OR
          v_contact_email <> btrim(v_contact_email) OR
          v_contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'))
     OR v_ref->>'identityIssuer' IS NULL OR char_length(v_ref->>'identityIssuer') NOT BETWEEN 1 AND 255
     OR v_ref->>'identitySubject' IS NULL OR char_length(v_ref->>'identitySubject') NOT BETWEEN 1 AND 255
     OR v_ref->>'employeeId' IS NULL OR char_length(v_ref->>'employeeId') NOT BETWEEN 1 AND 255
     OR v_ref->>'accountType' NOT IN ('human_personal','human_privileged')
     OR pg_catalog.jsonb_typeof(v_ref->'mappingVersion') <> 'number'
     OR (v_ref->>'mappingVersion') !~ '^[1-9][0-9]{0,15}$'
     OR pg_catalog.jsonb_typeof(v_ref->'publishedAt') <> 'string'
     OR (v_ref->>'publishedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;

  PERFORM ai_pdm_core.assert_principal_account_manager_v1(
    p_actor_principal_id,p_actor_identity_issuer,p_actor_identity_subject,
    p_actor_session_hash,v_company_id,'accounts.invitation.manage');
  IF NOT EXISTS (SELECT 1 FROM ai_pdm_core.companies WHERE id = v_company_id) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_COMPANY_MISSING' USING ERRCODE = '23503';
  END IF;
  v_input_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationKind','provision',
      'actorPrincipalId',p_actor_principal_id,'request',p_request)::text,'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-provision'),pg_catalog.hashtext(v_operation_id));
  SELECT * INTO v_receipt FROM ai_pdm_core.principal_identity_operations
   WHERE operation_id = v_operation_id;
  IF FOUND THEN
    IF v_receipt.operation_kind <> 'provision' OR v_receipt.input_hash <> v_input_hash THEN
      RAISE EXCEPTION 'AIPDM_PROVISION_OPERATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_account FROM ai_pdm_core.principal_accounts
     WHERE principal_id = v_receipt.result_json->>'principalId'
       AND pdm_user_id = v_receipt.result_json->>'pdmUserId'
       AND company_id = v_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AIPDM_PROVISION_RECEIPT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_receipt.result_json || pg_catalog.jsonb_build_object('replayed',true,
      'current',pg_catalog.jsonb_build_object(
        'accountStatus',v_account.account_status,
        'lifecycleVersion',v_account.lifecycle_version,
        'profileVersion',v_account.profile_version));
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE principal_issuer = v_ref->>'identityIssuer'
           AND principal_subject = v_ref->>'identitySubject'
           AND employee_id = v_ref->>'employeeId'
           AND account_type = v_ref->>'accountType'
           AND mapping_version = (v_ref->>'mappingVersion')::bigint
           AND published_at = (v_ref->>'publishedAt')::timestamptz
           AND employee_status = 'active'
           AND contract_version = 'organization.active-principal.v1'),
         count(DISTINCT employee_id),count(DISTINCT account_type)
    INTO v_source_count,v_source_match,v_source_employees,v_source_types
    FROM orgmaster_contract.v_active_principal_accounts_v1
   WHERE principal_id = v_principal_id;
  IF v_source_count < 1 OR v_source_count > 32 OR v_source_match <> 1
     OR v_source_employees <> 1 OR v_source_types <> 1 THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_SOURCE_DRIFT' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM ai_pdm_core.principal_accounts WHERE principal_id = v_principal_id)
     OR EXISTS (SELECT 1 FROM ai_pdm_core.principal_identity_cutovers WHERE principal_id = v_principal_id) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_PRINCIPAL_LINKED' USING ERRCODE = '23505';
  END IF;
  IF v_contact_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM ai_pdm_core.users WHERE pg_catalog.lower(email) = pg_catalog.lower(v_contact_email)
  ) THEN
    RAISE EXCEPTION 'AIPDM_PROVISION_CONTACT_CONFLICT' USING ERRCODE = '23505';
  END IF;

  v_user_id := 'user-' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
  INSERT INTO ai_pdm_core.users
    (id,display_name,email,password_hash,role,company_id,account_status,
     system_role_enabled,account_status_changed_at,account_status_reason)
  VALUES (v_user_id,v_display_name,v_contact_email,NULL,'Engineer',v_company_id,
          'suspended',0,pg_catalog.clock_timestamp(),'principal_only_provision');
  INSERT INTO ai_pdm_core.principal_accounts
    (principal_id,pdm_user_id,company_id,employee_id,account_type,account_status,
     lifecycle_version,profile_version,system_role_enabled,minimum_assurance)
  VALUES (v_principal_id,v_user_id,v_company_id,v_ref->>'employeeId',
          v_ref->>'accountType',CASE WHEN v_enabled THEN 'active' ELSE 'suspended' END,
          1,1,v_enabled,
          CASE WHEN v_ref->>'accountType' = 'human_privileged' THEN 'aal2' ELSE 'aal1' END);
  v_committed_at := pg_catalog.clock_timestamp();
  v_result := pg_catalog.jsonb_build_object('operationId',v_operation_id,
    'principalId',v_principal_id,'pdmUserId',v_user_id,'committedAt',v_committed_at);
  INSERT INTO ai_pdm_core.principal_identity_operations
    (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
  VALUES (v_operation_id,'provision',v_input_hash,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.jsonb_build_array(v_principal_id,v_user_id)::text,'UTF8')), 'hex'),
          v_result,v_committed_at);
  INSERT INTO ai_pdm_core.principal_identity_cutovers
    (pdm_user_id,principal_id,status,source_hash,operation_id,activated_at)
  VALUES (v_user_id,v_principal_id,'principal_active',v_input_hash,v_operation_id,v_committed_at);
  RETURN v_result || pg_catalog.jsonb_build_object('replayed',false,
    'current',pg_catalog.jsonb_build_object(
      'accountStatus',CASE WHEN v_enabled THEN 'active' ELSE 'suspended' END,
      'lifecycleVersion',1,'profileVersion',1));
END;
$function$;
ALTER FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)
  TO jenfu_ai_pdm_runtime;

-- Principal lifecycle is the only new account-status writer. Historical users
-- security columns remain suspended and cannot re-activate a principal.
CREATE FUNCTION ai_pdm_core.update_principal_account_lifecycle_v1(
  p_operation_id text,
  p_target_pdm_user_id text,
  p_action text,
  p_reason text,
  p_company_id text,
  p_actor_principal_id text,
  p_actor_identity_issuer text,
  p_actor_identity_subject text,
  p_actor_session_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_hash text;
  v_receipt ai_pdm_core.principal_identity_operations%ROWTYPE;
  v_account ai_pdm_core.principal_accounts%ROWTYPE;
  v_status text;
  v_now timestamptz;
  v_result jsonb;
  v_typed_count bigint;
  v_source_count bigint;
BEGIN
  IF p_operation_id IS NULL OR p_operation_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$'
     OR p_target_pdm_user_id IS NULL OR char_length(p_target_pdm_user_id) NOT BETWEEN 1 AND 255
     OR p_action IS NULL OR p_action NOT IN ('suspend','reactivate','offboard','return_to_work')
     OR p_reason IS NULL OR char_length(p_reason) NOT BETWEEN 1 AND 500
     OR btrim(p_reason) = '' OR p_reason <> btrim(p_reason)
     OR p_reason ~ '[[:cntrl:]]'
     OR p_company_id IS NULL OR char_length(p_company_id) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'AIPDM_LIFECYCLE_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  PERFORM ai_pdm_core.assert_principal_account_manager_v1(
    p_actor_principal_id,p_actor_identity_issuer,p_actor_identity_subject,
    p_actor_session_hash,p_company_id,'accounts.lifecycle.manage');
  v_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.jsonb_build_object('operationKind','lifecycle',
      'actorPrincipalId',p_actor_principal_id,'companyId',p_company_id,
      'pdmUserId',p_target_pdm_user_id,'action',p_action,'reason',p_reason)::text,
    'UTF8')), 'hex');
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('aipdm-dev121-lifecycle'),pg_catalog.hashtext(p_operation_id));
  SELECT * INTO v_receipt FROM ai_pdm_core.principal_identity_operations
   WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_receipt.operation_kind <> 'lifecycle' OR v_receipt.input_hash <> v_hash THEN
      RAISE EXCEPTION 'AIPDM_LIFECYCLE_OPERATION_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_account FROM ai_pdm_core.principal_accounts
     WHERE principal_id = v_receipt.result_json->>'principalId'
       AND pdm_user_id = p_target_pdm_user_id AND company_id = p_company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'AIPDM_LIFECYCLE_RECEIPT_DRIFT' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_receipt.result_json || pg_catalog.jsonb_build_object('replayed',true,
      'current',pg_catalog.jsonb_build_object('accountStatus',v_account.account_status,
        'lifecycleVersion',v_account.lifecycle_version));
  END IF;

  SELECT account.* INTO v_account FROM ai_pdm_core.principal_accounts account
    JOIN ai_pdm_core.principal_identity_cutovers cutover
      ON cutover.pdm_user_id = account.pdm_user_id
     AND cutover.principal_id = account.principal_id
     AND cutover.status = 'principal_active'
   WHERE account.pdm_user_id = p_target_pdm_user_id
     AND account.company_id = p_company_id
   FOR UPDATE OF account;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AIPDM_LIFECYCLE_TARGET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_account.principal_id = p_actor_principal_id THEN
    RAISE EXCEPTION 'AIPDM_LIFECYCLE_SELF_CHANGE_DENIED' USING ERRCODE = '42501';
  END IF;
  IF (p_action = 'suspend' AND v_account.account_status = 'active') THEN
    v_status := 'suspended';
  ELSIF (p_action = 'reactivate' AND v_account.account_status IN ('suspended','expired'))
      OR (p_action = 'return_to_work' AND v_account.account_status = 'offboarded') THEN
    v_status := 'active';
  ELSIF (p_action = 'offboard' AND v_account.account_status <> 'offboarded') THEN
    v_status := 'offboarded';
  ELSE
    RAISE EXCEPTION 'AIPDM_LIFECYCLE_TRANSITION_INVALID' USING ERRCODE = '23514';
  END IF;
  IF v_status = 'active' THEN
    SELECT count(*),count(*) FILTER (
      WHERE typed.employee_id = v_account.employee_id
        AND typed.account_type = v_account.account_type
        AND typed.contract_version = 'organization.active-principal.v1'
        AND typed.employee_status = 'active')
      INTO v_source_count,v_typed_count
      FROM orgmaster_contract.v_active_principal_accounts_v1 typed
     WHERE typed.principal_id = v_account.principal_id;
    IF v_source_count < 1 OR v_source_count > 32 OR
       v_typed_count <> v_source_count THEN
      RAISE EXCEPTION 'AIPDM_LIFECYCLE_SOURCE_INACTIVE' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF v_account.lifecycle_version >= 9007199254740991 THEN
    RAISE EXCEPTION 'AIPDM_LIFECYCLE_VERSION_EXHAUSTED' USING ERRCODE = '22003';
  END IF;
  v_now := pg_catalog.clock_timestamp();
  UPDATE ai_pdm_core.principal_accounts SET
    account_status = v_status, system_role_enabled = (v_status = 'active'),
    lifecycle_version = lifecycle_version + 1,
    session_invalid_before = v_now, updated_at = v_now
   WHERE principal_id = v_account.principal_id
   RETURNING * INTO v_account;
  UPDATE ai_pdm_core.principal_session_records SET
    revoked_at = v_now, revoke_reason = 'lifecycle:' || p_action
   WHERE principal_id = v_account.principal_id AND revoked_at IS NULL;
  v_result := pg_catalog.jsonb_build_object('operationId',p_operation_id,
    'principalId',v_account.principal_id,'pdmUserId',v_account.pdm_user_id,
    'accountStatus',v_status,'lifecycleVersion',v_account.lifecycle_version,
    'reason',p_reason,'committedAt',v_now);
  INSERT INTO ai_pdm_core.principal_identity_operations
    (operation_id,operation_kind,input_hash,cohort_hash,result_json,committed_at)
  VALUES (p_operation_id,'lifecycle',v_hash,
          pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
            pg_catalog.jsonb_build_array(v_account.principal_id,v_account.pdm_user_id)::text,
            'UTF8')), 'hex'),v_result,v_now);
  RETURN v_result || pg_catalog.jsonb_build_object('replayed',false,
    'current',pg_catalog.jsonb_build_object('accountStatus',v_account.account_status,
      'lifecycleVersion',v_account.lifecycle_version));
END;
$function$;
ALTER FUNCTION ai_pdm_core.update_principal_account_lifecycle_v1(
  text,text,text,text,text,text,text,text,text) OWNER TO jenfu_ai_pdm_migrator;
REVOKE ALL ON FUNCTION ai_pdm_core.update_principal_account_lifecycle_v1(
  text,text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ai_pdm_core.update_principal_account_lifecycle_v1(
  text,text,text,text,text,text,text,text,text) TO jenfu_ai_pdm_runtime;

COMMIT;
