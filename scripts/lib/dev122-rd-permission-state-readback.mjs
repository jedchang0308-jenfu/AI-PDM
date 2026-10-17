import { createHash } from 'node:crypto'

import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const RD_PERMISSION_STATE_SCHEMA = 'aipdm.dev122.rd-permission-state-readback-operation.v1'
export const RD_PERMISSION_STATE_RECEIPT_SCHEMA = 'aipdm.dev122.rd-permission-state-readback-receipt.v1'
export const RD_PERMISSION_STATE_PGOPTIONS = '-c default_transaction_read_only=on'
export const RD_PERMISSION_STATE_PREFIX = 'source/rd-permission-readback'
export const RD_PERMISSION_STATE_RECEIPT_PREFIX = 'receipts/releases/DEV122-RD-PERMISSION-READBACK'
export const RD_PERMISSION_STATE_TARGET = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  database: 'jenfu_prod',
  applicationId: 'ai-pdm',
  catalogVersion: 'ai-pdm.role-catalog.2026-10-10.v7',
  catalogSha256: '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9',
})

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u
const PERMISSIONS = Object.freeze([
  ['page', 'numbering.drawings.view'],
  ['page', 'numbering.search'],
  ['action', 'numbering.workspace.view'],
  ['action', 'numbering.workspace.create'],
  ['action', 'numbering.workspace.update'],
  ['action', 'numbering.workspace.cancel'],
  ['action', 'numbering.candidate.review.submit'],
  ['action', 'numbering.candidate.review.decide'],
  ['action', 'numbering.approval.batch.decide'],
])

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}

function hashValue(value) {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function hashText(value) {
  return sha256(Buffer.from(String(value), 'utf8'))
}

export function permissionStatePermissions() {
  return PERMISSIONS.map(([permissionKind, permissionCode]) => ({ permissionKind, permissionCode }))
}

export function parsePermissionStateArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 8) fail('RD_PERMISSION_STATE_ARGUMENTS_INVALID')
  const allowed = new Set(['--permission-operation-ref', '--permission-operation-sha256', '--source-revision', '--permission-output-ref'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('RD_PERMISSION_STATE_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!H64.test(values['--permission-operation-sha256'] ?? '') || !H40.test(values['--source-revision'] ?? '')) fail('RD_PERMISSION_STATE_ARGUMENTS_INVALID')
  return {
    operationRef: values['--permission-operation-ref'],
    operationSha256: values['--permission-operation-sha256'],
    sourceRevision: values['--source-revision'],
    outputRef: values['--permission-output-ref'],
  }
}

export function assertPermissionStateOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('RD_PERMISSION_STATE_OPERATION_HASH_MISMATCH')
  if (!exact(value, ['schemaVersion', 'operationId', 'sourceRevision', 'projectId', 'region', 'database', 'applicationId', 'catalogVersion', 'catalogSha256', 'migrationRunnerDigest', 'actor', 'permissions'])) fail('RD_PERMISSION_STATE_OPERATION_INVALID')
  if (value.schemaVersion !== RD_PERMISSION_STATE_SCHEMA || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(value.operationId ?? '') || value.sourceRevision !== sourceRevision ||
      value.projectId !== RD_PERMISSION_STATE_TARGET.projectId || value.region !== RD_PERMISSION_STATE_TARGET.region || value.database !== RD_PERMISSION_STATE_TARGET.database ||
      value.applicationId !== RD_PERMISSION_STATE_TARGET.applicationId || value.catalogVersion !== RD_PERMISSION_STATE_TARGET.catalogVersion || value.catalogSha256 !== RD_PERMISSION_STATE_TARGET.catalogSha256 ||
      !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest ?? '')) fail('RD_PERMISSION_STATE_OPERATION_INVALID')
  if (!exact(value.actor, ['principalIdSha256', 'employeeIdSha256', 'identityIssuer', 'identitySubjectSha256']) ||
      !H64.test(value.actor.principalIdSha256 ?? '') || !H64.test(value.actor.employeeIdSha256 ?? '') ||
      !/^https:\/\/securetoken\.google\.com\/[A-Za-z0-9._-]{1,128}$/u.test(value.actor.identityIssuer ?? '') || !H64.test(value.actor.identitySubjectSha256 ?? '')) fail('RD_PERMISSION_STATE_ACTOR_INVALID')
  if (!Array.isArray(value.permissions) || canonicalize(value.permissions) !== canonicalize(permissionStatePermissions())) fail('RD_PERMISSION_STATE_PERMISSION_SET_INVALID')
  return value
}

export function buildPermissionStateOperation({ operationId, sourceRevision, migrationRunnerDigest, actor }) {
  const value = {
    schemaVersion: RD_PERMISSION_STATE_SCHEMA,
    operationId, sourceRevision, projectId: RD_PERMISSION_STATE_TARGET.projectId,
    region: RD_PERMISSION_STATE_TARGET.region, database: RD_PERMISSION_STATE_TARGET.database,
    applicationId: RD_PERMISSION_STATE_TARGET.applicationId,
    catalogVersion: RD_PERMISSION_STATE_TARGET.catalogVersion,
    catalogSha256: RD_PERMISSION_STATE_TARGET.catalogSha256,
    migrationRunnerDigest, actor, permissions: permissionStatePermissions(),
  }
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  return { value, bytes, sha256: sha256(bytes) }
}

export function assertPermissionStateTarget(environment) {
  if (environment?.OWNER_APPLICATION_ID !== 'ai-pdm' || environment?.RELEASE_BUCKET !== 'jenfu-platform-prod-aipdm-release' ||
      environment?.GOOGLE_CLOUD_PROJECT !== RD_PERMISSION_STATE_TARGET.projectId || environment?.GOOGLE_CLOUD_REGION !== RD_PERMISSION_STATE_TARGET.region ||
      environment?.POSTGRES_DATABASE !== RD_PERMISSION_STATE_TARGET.database || environment?.CLOUD_SQL_INSTANCE_CONNECTION_NAME !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' ||
      environment?.POSTGRES_SOCKET !== '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' || environment?.PGOPTIONS !== RD_PERMISSION_STATE_PGOPTIONS) fail('RD_PERMISSION_STATE_TARGET_INVALID')
  return true
}

function bind(sql, values) {
  const parameters = []
  const names = new Map()
  const text = sql.replace(/(?<!:)\$([A-Za-z][A-Za-z0-9_]*)\b/gu, (_, name) => {
    if (!Object.hasOwn(values, name)) fail('RD_PERMISSION_STATE_SQL_PARAMETER_MISSING')
    if (!names.has(name)) { parameters.push(values[name]); names.set(name, parameters.length) }
    return `$${names.get(name)}`
  })
  if (Object.keys(values).some((name) => !names.has(name))) fail('RD_PERMISSION_STATE_SQL_PARAMETER_UNUSED')
  return { text, values: parameters }
}

async function query(database, sql, values = {}) {
  return (await database.query(bind(sql, values))).rows
}

export function readonlyPermissionStateAdapter(database) {
  return {
    async transaction(fn) {
      await database.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      try {
        const result = await fn({ query: (sql, values) => query(database, sql, values) })
        await database.query('COMMIT')
        return result
      } catch (error) {
        await database.query('ROLLBACK').catch(() => undefined)
        throw error
      }
    },
  }
}

export async function readPermissionState(database, operation) {
  assertPermissionStateOperation(operation, { bytes: Buffer.from(canonicalize(operation)), operationSha256: sha256(Buffer.from(canonicalize(operation))), sourceRevision: operation.sourceRevision })
  return readonlyPermissionStateAdapter(database).transaction(async ({ query: run }) => {
    const identity = (await run("SELECT current_database() AS database, current_user AS login, current_setting('server_version_num')::integer / 10000 AS major, pg_has_role($targetRole, 'MEMBER') AS migrator_member, has_schema_privilege($runtimeRole, $coreSchema, 'CREATE') AS runtime_can_create_core", {
      targetRole: 'jenfu_ai_pdm_migrator', runtimeRole: 'jenfu_ai_pdm_runtime', coreSchema: 'ai_pdm_core',
    }))[0]
    if (!identity || identity.database !== RD_PERMISSION_STATE_TARGET.database || identity.login !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' || Number(identity.major) !== 17 || identity.migrator_member !== true || identity.runtime_can_create_core !== false) fail('RD_PERMISSION_STATE_DATABASE_TARGET_INVALID')
    const catalogRows = await run(`SELECT contract_version,application_id,catalog_version,catalog_sha256,
      display_order,stable_role_id,role_definition_hash
      FROM ai_pdm_contract.v_application_role_catalog_v1 ORDER BY display_order`)
    if (catalogRows.length === 0 || catalogRows.some(row => row.application_id !== RD_PERMISSION_STATE_TARGET.applicationId || row.catalog_version !== RD_PERMISSION_STATE_TARGET.catalogVersion || row.catalog_sha256 !== RD_PERMISSION_STATE_TARGET.catalogSha256)) fail('RD_PERMISSION_STATE_CATALOG_MISMATCH')
    const accounts = await run(`SELECT contract_version,principal_issuer,principal_subject,principal_id,
      employee_id,employee_status,account_type,mapping_version,published_at::text
      FROM orgmaster_contract.v_active_principal_accounts_v1
      WHERE principal_issuer = $identityIssuer ORDER BY principal_issuer,principal_subject LIMIT 256`, { identityIssuer: operation.actor.identityIssuer })
    const actorAccounts = accounts.filter(row => hashText(row.principal_id) === operation.actor.principalIdSha256 && hashText(row.employee_id) === operation.actor.employeeIdSha256)
    const matchedActor = actorAccounts.filter(row => hashText(row.principal_subject) === operation.actor.identitySubjectSha256)
    if (matchedActor.length !== 1) fail('RD_PERMISSION_STATE_ACTIVE_ACCOUNT_MISMATCH')
    const principalId = matchedActor[0].principal_id
    const employeeId = matchedActor[0].employee_id
    const grants = await run(`SELECT contract_version,assignment_version_id,assignment_version,assignment_id,
      grant_kind,delegation_id,application_id,principal_id,employee_id,subject_kind,target_principal_id,
      stable_role_id,role_code,catalog_version,scope_kind,scope_key,valid_from::text,valid_until::text,published_at::text
      FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
      WHERE application_id = $applicationId AND principal_id = $principalId AND employee_id = $employeeId
      ORDER BY stable_role_id,assignment_id LIMIT 33`, { applicationId: operation.applicationId, principalId, employeeId })
    if (actorAccounts.length < 1 || actorAccounts.length > 2) fail('RD_PERMISSION_STATE_ACTIVE_ACCOUNT_MISMATCH')
    const aliases = new Set()
    for (const row of actorAccounts) {
      if (row.contract_version !== 'organization.active-principal.v1' || row.employee_id !== employeeId || row.employee_status !== 'active' || !row.principal_issuer || !row.principal_subject) fail('RD_PERMISSION_STATE_ACTIVE_ACCOUNT_MISMATCH')
      const alias = `${row.principal_issuer}\0${row.principal_subject}`
      if (aliases.has(alias)) fail('RD_PERMISSION_STATE_ACTIVE_ACCOUNT_MISMATCH')
      aliases.add(alias)
    }
    if (matchedActor[0].principal_issuer !== operation.actor.identityIssuer) fail('RD_PERMISSION_STATE_ACTIVE_ACCOUNT_MISMATCH')
    if (grants.length > 32) fail('RD_PERMISSION_STATE_GRANT_MISMATCH')
    const grantKeys = new Set()
    for (const row of grants) {
      if (row.contract_version !== 'jenfu.orgmaster.ai-pdm-principal-grants.v4' || row.application_id !== operation.applicationId || row.principal_id !== principalId || row.employee_id !== employeeId || !row.assignment_id || !row.assignment_version_id || !row.role_code || !row.stable_role_id || !row.scope_kind) fail('RD_PERMISSION_STATE_GRANT_MISMATCH')
      const key = `${row.stable_role_id}\0${row.role_code}\0${row.scope_kind}\0${row.scope_key ?? ''}`
      if (grantKeys.has(key)) fail('RD_PERMISSION_STATE_GRANT_MISMATCH')
      grantKeys.add(key)
    }
    return {
      database: identity.database,
      catalog: { contractVersion: catalogRows[0].contract_version, applicationId: RD_PERMISSION_STATE_TARGET.applicationId, catalogVersion: catalogRows[0].catalog_version, catalogSha256: catalogRows[0].catalog_sha256, rowCount: catalogRows.length, rowsSha256: hashValue(catalogRows) },
      actor: { principalIdSha256: operation.actor.principalIdSha256, employeeIdSha256: operation.actor.employeeIdSha256, identityIssuer: operation.actor.identityIssuer, identitySubjectSha256: operation.actor.identitySubjectSha256, activeAccountCount: actorAccounts.length, matchedActiveAccountCount: 1 },
      activeGrant: { rowCount: grants.length, rowsSha256: hashValue(grants), assignmentVersionIds: [...new Set(grants.map(row => row.assignment_version_id))], assignmentVersions: [...new Set(grants.map(row => Number(row.assignment_version)))], roleCodes: [...new Set(grants.map(row => row.role_code))].sort() },
      permissionSet: operation.permissions,
      databaseMutationExpected: false,
      transactionMode: 'REPEATABLE READ READ ONLY',
    }
  })
}

export function buildPermissionStateReceipt({ operation, operationRef, outputRef, observedAt, state }) {
  if (!Number.isFinite(Date.parse(observedAt)) || !state || state.database !== RD_PERMISSION_STATE_TARGET.database) fail('RD_PERMISSION_STATE_RECEIPT_INVALID')
  const core = { schemaVersion: RD_PERMISSION_STATE_RECEIPT_SCHEMA, ownerApplicationId: RD_PERMISSION_STATE_TARGET.ownerApplicationId, operationId: operation.operationId, sourceRevision: operation.sourceRevision, operationRef, outputRef, observedAt, target: RD_PERMISSION_STATE_TARGET, state }
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

export function assertPermissionStateReceipt(value, { operation, operationRef, outputRef }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'operationRef', 'outputRef', 'observedAt', 'target', 'state', 'receiptSha256']) ||
      value.schemaVersion !== RD_PERMISSION_STATE_RECEIPT_SCHEMA || value.ownerApplicationId !== RD_PERMISSION_STATE_TARGET.ownerApplicationId ||
      value.operationId !== operation.operationId || value.sourceRevision !== operation.sourceRevision || canonicalize(value.operationRef) !== canonicalize(operationRef) ||
      value.outputRef !== outputRef || !Number.isFinite(Date.parse(value.observedAt)) || value.target?.catalogVersion !== RD_PERMISSION_STATE_TARGET.catalogVersion ||
      value.state?.database !== RD_PERMISSION_STATE_TARGET.database || value.state?.databaseMutationExpected !== false) fail('RD_PERMISSION_STATE_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('RD_PERMISSION_STATE_RECEIPT_INVALID')
  return value
}

