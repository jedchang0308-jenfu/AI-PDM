import assert from 'node:assert/strict'
import test from 'node:test'

import { parseArgs as parseReadbackArgs, readbackObjectGeneration } from '../dev122-rd-permission-state-readback.mjs'
import {
  RD_PERMISSION_STATE_PGOPTIONS,
  RD_PERMISSION_STATE_CATALOGS,
  RD_PERMISSION_STATE_SCHEMA,
  RD_PERMISSION_STATE_TARGET,
  assertPermissionStateOperation,
  assertPermissionStateTarget,
  buildPermissionStateOperation,
  buildPermissionStateReceipt,
  permissionStatePermissions,
  readPermissionState,
} from './dev122-rd-permission-state-readback.mjs'
import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

const sourceRevision = 'a'.repeat(40)
const actorIdentity = {
  principalId: 'principal-rd-001', employeeId: 'employee-rd-001',
  identityIssuer: 'https://securetoken.google.com/jenfu-platform-prod',
  identitySubject: 'subject-rd-001',
}
const actor = {
  principalIdSha256: sha256(Buffer.from(actorIdentity.principalId)),
  employeeIdSha256: sha256(Buffer.from(actorIdentity.employeeId)),
  identityIssuer: actorIdentity.identityIssuer,
  identitySubjectSha256: sha256(Buffer.from(actorIdentity.identitySubject)),
}
const operation = {
  schemaVersion: RD_PERMISSION_STATE_SCHEMA,
  operationId: 'DEV122-RD-READBACK-TEST', sourceRevision,
  projectId: RD_PERMISSION_STATE_TARGET.projectId, region: RD_PERMISSION_STATE_TARGET.region,
  database: RD_PERMISSION_STATE_TARGET.database, applicationId: RD_PERMISSION_STATE_TARGET.applicationId,
  catalogVersion: RD_PERMISSION_STATE_TARGET.catalogVersion, catalogSha256: RD_PERMISSION_STATE_TARGET.catalogSha256,
  migrationRunnerDigest: `asia-east1-docker.pkg.dev/jenfu-platform-prod/aipdm-release/ai-pdm-migration-runner@sha256:${'d'.repeat(64)}`,
  actor, permissions: permissionStatePermissions(),
}

test('RD permission readback binds GCS generations from the owner transport metadata shape', () => {
  assert.equal(readbackObjectGeneration({ metadata: { generation: '17' } }), '17')
  assert.throws(() => readbackObjectGeneration({ generation: '17' }), /OBJECT_GENERATION_INVALID/u)
  assert.throws(() => readbackObjectGeneration({ metadata: { generation: undefined } }), /OBJECT_GENERATION_INVALID/u)
})

function operationBytes() { return Buffer.from(`${canonicalize(operation)}\n`) }

test('RD permission readback CLI accepts the workflow stage plus its eight fixed arguments', () => {
  const argv = ['--stage', 'readback', '--permission-operation-ref', 'gs://jenfu-platform-prod-aipdm-release/source/rd-permission-readback/op.json', '--permission-operation-sha256', 'b'.repeat(64), '--source-revision', sourceRevision, '--permission-output-ref', 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-PERMISSION-READBACK/state.json']
  assert.equal(parseReadbackArgs(argv).stage, 'readback')
  assert.throws(() => parseReadbackArgs(argv.slice(0, 8)), /ARGUMENTS_INVALID/u)
})

test('RD permission readback rejects target drift and preserves fixed permission set', () => {
  assertPermissionStateTarget({ OWNER_APPLICATION_ID: 'ai-pdm', RELEASE_BUCKET: 'jenfu-platform-prod-aipdm-release', GOOGLE_CLOUD_PROJECT: 'jenfu-platform-prod', GOOGLE_CLOUD_REGION: 'asia-east1', POSTGRES_DATABASE: 'jenfu_prod', CLOUD_SQL_INSTANCE_CONNECTION_NAME: 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', POSTGRES_SOCKET: '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg', PGOPTIONS: RD_PERMISSION_STATE_PGOPTIONS })
  assert.throws(() => assertPermissionStateTarget({ PGOPTIONS: RD_PERMISSION_STATE_PGOPTIONS }), /TARGET_INVALID/u)
  const bytes = operationBytes()
  assert.equal(assertPermissionStateOperation(operation, { bytes, operationSha256: sha256(bytes), sourceRevision }).operationId, operation.operationId)
  assert.throws(() => assertPermissionStateOperation({ ...operation, permissions: [] }, { bytes, operationSha256: sha256(bytes), sourceRevision }), /PERMISSION_SET_INVALID/u)
})

test('RD permission readback accepts the pre-085 v6 catalog binding for an authorized preflight', () => {
  const built = buildPermissionStateOperation({ operationId: 'DEV122-RD-V6-PREFLIGHT', sourceRevision, migrationRunnerDigest: operation.migrationRunnerDigest, actor, ...RD_PERMISSION_STATE_CATALOGS.v6 })
  assert.equal(built.value.catalogVersion, RD_PERMISSION_STATE_CATALOGS.v6.catalogVersion)
  assert.equal(assertPermissionStateOperation(built.value, { bytes: built.bytes, operationSha256: built.sha256, sourceRevision }).catalogSha256, RD_PERMISSION_STATE_CATALOGS.v6.catalogSha256)
})

test('RD permission readback reads catalog, active account and grants in one readonly snapshot', async () => {
  const statements = []
  const database = {
    async query(input) {
      const text = typeof input === 'string' ? input : input.text
      const values = typeof input === 'string' ? undefined : input.values
      statements.push({ text, values })
      if (text.startsWith('BEGIN')) return { rows: [] }
      if (text === 'COMMIT') return { rows: [] }
      if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
      if (text.includes('v_application_role_catalog_v1')) return { rows: [{ contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm', catalog_version: RD_PERMISSION_STATE_TARGET.catalogVersion, catalog_sha256: RD_PERMISSION_STATE_TARGET.catalogSha256, display_order: 0, stable_role_id: 'role-rd', role_definition_hash: 'c'.repeat(64) }] }
      if (text.includes('v_active_principal_accounts_v1')) return { rows: [{ contract_version: 'organization.active-principal.v1', principal_issuer: actorIdentity.identityIssuer, principal_subject: actorIdentity.identitySubject, principal_id: actorIdentity.principalId, employee_id: actorIdentity.employeeId, employee_status: 'active', account_type: 'employee', mapping_version: 1, published_at: '2026-10-17T00:00:00.000Z' }] }
      if (text.includes('v_ai_pdm_principal_effective_grants_v4')) return { rows: [{ contract_version: 'jenfu.orgmaster.ai-pdm-principal-grants.v4', assignment_version_id: 'assignment-version-1', assignment_version: 7, assignment_id: 'grant-rd-001', grant_kind: 'direct', delegation_id: null, application_id: 'ai-pdm', principal_id: actorIdentity.principalId, employee_id: actorIdentity.employeeId, subject_kind: 'employee', target_principal_id: null, stable_role_id: 'role-rd', role_code: 'rd', catalog_version: RD_PERMISSION_STATE_TARGET.catalogVersion, scope_kind: 'workspace', scope_key: 'jenfu', valid_from: '2026-10-17T00:00:00.000Z', valid_until: null, published_at: '2026-10-17T00:00:00.000Z' }] }
      if (text.includes('ai_pdm_core.openswx_metadata_jobs')) return { rows: [{ status: 'queued', attempt_count: 1, dispatch_state: 'dispatch_unknown', dispatch_generation: 3, dispatch_requested_at: '2026-10-18T07:00:00.000Z', dispatch_request_window_end: '2026-10-18T07:00:30.000Z', dispatch_lease_expires_at: null, provider_operation: 'operations/example', execution_name: null, created_at: '2026-10-18T06:59:00.000Z', updated_at: '2026-10-18T07:00:31.000Z' }] }
      throw new Error(`unexpected query: ${text}`)
    },
  }
  const state = await readPermissionState(database, operation)
  assert.equal(state.catalog.catalogVersion, RD_PERMISSION_STATE_TARGET.catalogVersion)
  assert.equal(state.actor.matchedActiveAccountCount, 1)
  assert.equal(state.actor.principalId, undefined)
  assert.equal(state.actor.employeeId, undefined)
  assert.deepEqual(state.activeGrant.roleCodes, ['rd'])
  assert.equal(state.openswxDispatch.rowCount, 1)
  assert.equal(state.openswxDispatch.rows[0].dispatch_state, 'dispatch_unknown')
  assert.equal(state.openswxDispatch.rows[0].provider_operation, 'operations/example')
  assert.equal(state.openswxDispatch.rows[0].id, undefined)
  assert.equal(state.openswxDispatch.rows[0].company_id, undefined)
  assert.equal(state.databaseMutationExpected, false)
  assert.equal(statements[0].text, 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  assert.equal(statements.at(-1).text, 'COMMIT')
  const unsafeStatements = statements.filter(({ text }) => /^\s*(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b/iu.test(text))
  assert.deepEqual(unsafeStatements, [])
  const receipt = buildPermissionStateReceipt({ operation, operationRef: { uri: 'gs://jenfu-platform-prod-aipdm-release/source/rd-permission-readback/op.json', sha256: 'b'.repeat(64), generation: '1' }, outputRef: 'gs://jenfu-platform-prod-aipdm-release/receipts/releases/DEV122-RD-PERMISSION-READBACK/receipt.json', observedAt: '2026-10-17T15:00:00.000Z', state })
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u)
})

test('RD permission readback rejects an account alias that is not the bound actor', async () => {
  const database = { async query(input) {
    const text = typeof input === 'string' ? input : input.text
    if (text.startsWith('BEGIN') || text === 'ROLLBACK') return { rows: [] }
    if (text.includes('current_database()')) return { rows: [{ database: 'jenfu_prod', login: 'aipdm-prod-migrator@jenfu-platform-prod.iam', major: 17, migrator_member: true, runtime_can_create_core: false }] }
    if (text.includes('v_application_role_catalog_v1')) return { rows: [{ contract_version: 'jenfu.platform-entitlement.v1', application_id: 'ai-pdm', catalog_version: RD_PERMISSION_STATE_TARGET.catalogVersion, catalog_sha256: RD_PERMISSION_STATE_TARGET.catalogSha256 }] }
    if (text.includes('v_active_principal_accounts_v1')) return { rows: [{ contract_version: 'organization.active-principal.v1', principal_issuer: actorIdentity.identityIssuer, principal_subject: 'different-subject', principal_id: actorIdentity.principalId, employee_id: actorIdentity.employeeId, employee_status: 'active' }] }
    if (text.includes('v_ai_pdm_principal_effective_grants_v4')) return { rows: [] }
    throw new Error('unexpected query')
  } }
  await assert.rejects(readPermissionState(database, operation), /ACTIVE_ACCOUNT_MISMATCH/u)
})

