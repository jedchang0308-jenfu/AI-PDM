import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const source = readFileSync(new URL('../db/postgres/096_dev127_platform_super_admin_consumer.sql', import.meta.url), 'utf8')
const local = readFileSync(new URL('../db/postgres/099_dev126_local_test_admin_policy.sql', import.meta.url), 'utf8')
const lock = readFileSync(new URL('../db/postgres/100_dev126_local_test_admin_target_lock.sql', import.meta.url), 'utf8')
const installer = readFileSync(new URL('./install-local-test-admin.mjs', import.meta.url), 'utf8')

test('local policy mutation preserves the exact catalog validation, CAS, audit and idempotency core', () => {
  const mutationBody = text => text.slice(text.indexOf('  IF p_reason IS NULL'), text.indexOf('$function$;'))
  assert.ok(mutationBody(source).length > 10000)
  assert.equal(mutationBody(local), mutationBody(source))
})

test('local policy authority is closed to the pinned PDM target and native administrator session', () => {
  assert.doesNotMatch(local, /(?:platform|orgmaster)_(?:core|contract)\./u)
  assert.match(local, /current_database\(\) !~ '\^jenfu_local_/u)
  assert.match(local, /host\(inet_server_addr\(\)\)/u)
  assert.match(local, /assert_local_test_admin_target_v1\(/u)
  for (const value of ['pdm-local-test-admin', 'pdm-local-test-employee', 'pdm-local-test-admin-user',
    'company-jenfu', 'urn:ai-pdm:local-test-admin']) assert.ok(local.includes(value))
  for (const fence of ['session.principal_auth_epoch=0', 'session.revoked_at IS NULL',
    'session.lifecycle_version=account.lifecycle_version', 'session.profile_version=account.profile_version',
    'session.expires_at > clock_timestamp()', 'account.session_invalid_before']) assert.ok(local.includes(fence))
  assert.match(local, /status='ready' AND database_name=current_database\(\) FOR SHARE/u)
  assert.match(local, /role_policy_commands WHERE request_id=p_request_id FOR UPDATE/u)
  assert.match(local, /pg_advisory_xact_lock\(hashtextextended\(p_request_id::text,0\)\)/u)
  assert.match(local, /role_policy_drafts WHERE draft_id=p_draft_id FOR UPDATE/u)
  assert.match(local, /transaction_isolation'\) <> 'read committed'/u)
})

test('runtime write admission receives only the existing pinned-target lock capability', () => {
  assert.match(lock, /WHERE application_id='ai-pdm' AND database_name=current_database\(\) AND status='ready'/u)
  assert.match(lock, /assert_local_test_admin_target_v1\(/u)
  assert.match(lock, /GRANT EXECUTE ON FUNCTION ai_pdm_core\.assert_local_test_admin_target_v1\(text,uuid,text,text\)\s+TO jenfu_ai_pdm_runtime/u)
  assert.doesNotMatch(lock, /GRANT (?:INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|ALL)/u)
  assert.match(installer, /100_dev126_local_test_admin_target_lock\.sql/u)
})
