-- DEV-046 staging principal access rollback
-- This preserves business/audit history and only revokes the bootstrapped principal's access.
-- It intentionally does not delete the company, roles, permissions, user or prior evidence.

BEGIN;
SET LOCAL search_path = public;

UPDATE platform_principal_mappings
SET mapping_status = 'retired', updated_at = now()
WHERE platform_principal_id = 'iam:principal:stg-pdm-admin-001'
  AND pdm_user_id = 'stg-pdm-admin-001'
  AND mapping_source = 'shared_iam'
  AND external_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2';

UPDATE auth_identities
SET status = 'disabled', identity_lifecycle_version = identity_lifecycle_version + 1, updated_at = now()
WHERE id = 'auth-google-stg-pdm-admin-001'
  AND user_id = 'stg-pdm-admin-001'
  AND provider = 'google_oauth'
  AND provider_subject = 'qxEv2napjvMEmiqIUqwhTCf6gjg2';

UPDATE users
SET account_status = 'suspended',
    system_role_enabled = 0,
    session_invalid_before = now(),
    account_lifecycle_version = account_lifecycle_version + 1,
    account_status_changed_at = now(),
    account_status_changed_by = NULL,
    account_status_reason = 'DEV-046 staging principal bootstrap rollback',
    updated_at = now()
WHERE id = 'stg-pdm-admin-001'
  AND lower(email) = 'jedchang0308@jenfu.com.tw';

COMMIT;
