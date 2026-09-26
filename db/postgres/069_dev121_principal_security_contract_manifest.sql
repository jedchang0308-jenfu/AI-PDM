-- DB-CHANGE
-- owner: ai-pdm
-- schemas: ai_pdm_core, ai_pdm_contract
-- contract-impact: ai-pdm.principal-security-owner-command.v1
-- compatibility: additive
-- governance-review: DEV-121

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SELECT pg_advisory_xact_lock(hashtext('dev121-ai-pdm-principal-manifest'),
  hashtext(current_database()));
SET LOCAL ROLE jenfu_ai_pdm_migrator;

-- This manifest describes the owner-private security state and the runtime
-- command interface. It does not grant another application access to core.
DO $required_interface$
BEGIN
  IF to_regclass('ai_pdm_contract.v_contract_manifest_v1') IS NULL
     OR to_regclass('ai_pdm_core.principal_accounts') IS NULL
     OR to_regclass('ai_pdm_core.principal_identity_cutovers') IS NULL
     OR to_regclass('ai_pdm_core.principal_role_assignments') IS NULL
     OR to_regclass('ai_pdm_core.principal_approval_delegations') IS NULL
     OR to_regclass('ai_pdm_core.principal_session_records') IS NULL
     OR NOT has_table_privilege('jenfu_ai_pdm_migrator',
       'ai_pdm_contract.v_contract_manifest_v1', 'SELECT')
     OR to_regprocedure('ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)') IS NULL
     OR to_regprocedure('ai_pdm_core.update_principal_account_lifecycle_v1(text,text,text,text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('ai_pdm_core.revoke_principal_account_sessions_v1(text,text,text,text,text,text,text,text)') IS NULL
     OR NOT has_function_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.provision_principal_account_v1(jsonb,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.update_principal_account_lifecycle_v1(text,text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.revoke_principal_account_sessions_v1(text,text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_table_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.principal_accounts', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.principal_identity_cutovers', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.principal_role_assignments', 'INSERT,UPDATE,DELETE')
     OR has_table_privilege('jenfu_ai_pdm_runtime',
       'ai_pdm_core.principal_approval_delegations', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'DEV121_PRINCIPAL_SECURITY_INTERFACE_MISSING'
      USING ERRCODE = '55000';
  END IF;
END;
$required_interface$;

-- SHA-256 of the canonical interface declaration:
-- ai-pdm.principal-security-owner-command.v1|principal_accounts|
-- principal_identity_cutovers|principal_role_assignments|
-- principal_approval_delegations|principal_session_records|
-- provision_principal_account_v1(jsonb,text,text,text,text)|
-- update_principal_account_lifecycle_v1(text,text,text,text,text,text,text,text,text)|
-- revoke_principal_account_sessions_v1(text,text,text,text,text,text,text,text)
INSERT INTO ai_pdm_core.contract_manifest
  (contract_id, contract_version, signature_sha256, payload_sha256)
VALUES
  ('ai-pdm.principal-security-owner-command',
   'jenfu.ai-pdm.principal-security-owner-command.v1',
   'a5bf9b3744cd2a0805dbf23045946ce99c986317bba7d85738687828aed74b62',
   NULL)
ON CONFLICT (contract_id) DO NOTHING;

DO $readback$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM ai_pdm_core.contract_manifest
    WHERE contract_id = 'ai-pdm.principal-security-owner-command'
      AND contract_version = 'jenfu.ai-pdm.principal-security-owner-command.v1'
      AND signature_sha256 =
        'a5bf9b3744cd2a0805dbf23045946ce99c986317bba7d85738687828aed74b62'
      AND payload_sha256 IS NULL
  ) THEN
    RAISE EXCEPTION 'DEV121_PRINCIPAL_SECURITY_MANIFEST_DRIFT'
      USING ERRCODE = '55000';
  END IF;
END;
$readback$;

COMMIT;
