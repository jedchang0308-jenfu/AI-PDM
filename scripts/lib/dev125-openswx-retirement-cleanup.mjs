import { createHash } from 'node:crypto'

import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const DEV125_CLEANUP_SCHEMA = 'aipdm.dev125.openswx-retirement-cleanup-operation.v1'
export const DEV125_CLEANUP_RECEIPT_SCHEMA = 'aipdm.dev125.openswx-retirement-cleanup-receipt.v1'
export const DEV125_CLEANUP_PREFIX = 'source/openswx-dispatch-recovery/dev125-retirement-cleanup'
export const DEV125_CLEANUP_RECEIPT_PREFIX = 'receipts/releases/DEV125-OPENSWX-RETIREMENT'
export const DEV125_CLEANUP_PGOPTIONS = '-c default_transaction_read_only=off'
export const DEV125_CLEANUP_TARGET = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  database: 'jenfu_prod',
})
export const DEV125_CLEANUP_PROVIDER_TARGET = Object.freeze({
  schedulerName: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch',
  retiredJobName: 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata',
})

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RUNNER = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u
const READBACK = /^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/diagnostics\/DEV122-PREVIEW-OPENSWX-RUNTIME\/[a-f0-9]{64}\/state\.json$/u

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

function timestamp(value) {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function projection(row) {
  return {
    status: row.status,
    attempt_count: row.attempt_count,
    dispatch_state: row.dispatch_state,
    dispatch_generation: row.dispatch_generation,
    dispatch_requested_at: row.dispatch_requested_at,
    dispatch_request_window_end: row.dispatch_request_window_end,
    dispatch_lease_expires_at: row.dispatch_lease_expires_at,
    provider_operation: row.provider_operation,
    execution_name: row.execution_name,
    lease_expires_at: row.lease_expires_at,
    heartbeat_at: row.heartbeat_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export function parseCleanupRunnerArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 8) fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
  const allowed = new Set(['--dev125-openswx-retirement-operation-ref', '--operation-sha256', '--source-revision', '--output-ref'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!H64.test(values['--operation-sha256'] ?? '') || !H40.test(values['--source-revision'] ?? '')) fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
  return {
    operationRef: values['--dev125-openswx-retirement-operation-ref'],
    operationSha256: values['--operation-sha256'],
    sourceRevision: values['--source-revision'],
    outputRef: values['--output-ref'],
  }
}

export function buildCleanupOperation({ operationId, sourceRevision, migrationRunnerDigest, basis }) {
  const value = {
    schemaVersion: DEV125_CLEANUP_SCHEMA,
    operationId,
    sourceRevision,
    projectId: DEV125_CLEANUP_TARGET.projectId,
    region: DEV125_CLEANUP_TARGET.region,
    database: DEV125_CLEANUP_TARGET.database,
    migrationRunnerDigest,
    basis,
  }
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  assertCleanupOperation(value, { bytes, operationSha256: sha256(bytes), sourceRevision })
  return { value, bytes, sha256: sha256(bytes) }
}

export function assertCleanupOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('DEV125_CLEANUP_OPERATION_HASH_MISMATCH')
  if (!exact(value, ['schemaVersion', 'operationId', 'sourceRevision', 'projectId', 'region', 'database', 'migrationRunnerDigest', 'basis']) ||
      value.schemaVersion !== DEV125_CLEANUP_SCHEMA || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(value.operationId ?? '') ||
      value.sourceRevision !== sourceRevision || !H40.test(value.sourceRevision ?? '') ||
      value.projectId !== DEV125_CLEANUP_TARGET.projectId || value.region !== DEV125_CLEANUP_TARGET.region ||
      value.database !== DEV125_CLEANUP_TARGET.database || !RUNNER.test(value.migrationRunnerDigest ?? '') ||
      !exact(value.basis, ['runtimeReadbackRef', 'runtimeReadbackSha256', 'pendingCount', 'activeRowsSha256']) ||
      !READBACK.test(value.basis.runtimeReadbackRef ?? '') || !H64.test(value.basis.runtimeReadbackSha256 ?? '') ||
      !Number.isInteger(value.basis.pendingCount) || value.basis.pendingCount < 0 || value.basis.pendingCount > 20 ||
      !H64.test(value.basis.activeRowsSha256 ?? '')) fail('DEV125_CLEANUP_OPERATION_INVALID')
  return value
}

export function assertCleanupTarget(environment) {
  if (environment?.OWNER_APPLICATION_ID !== 'ai-pdm' || environment?.RELEASE_BUCKET !== 'jenfu-platform-prod-aipdm-release' ||
      environment?.GOOGLE_CLOUD_PROJECT !== DEV125_CLEANUP_TARGET.projectId || environment?.GOOGLE_CLOUD_REGION !== DEV125_CLEANUP_TARGET.region ||
      environment?.POSTGRES_DATABASE !== DEV125_CLEANUP_TARGET.database || environment?.CLOUD_SQL_INSTANCE_CONNECTION_NAME !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' ||
      environment?.POSTGRES_SOCKET !== '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' ||
      environment?.PGOPTIONS !== DEV125_CLEANUP_PGOPTIONS) fail('DEV125_CLEANUP_TARGET_INVALID')
  return true
}

export function assertCleanupProviderState(value) {
  if (!exact(value, ['observedAt', 'schedulerName', 'schedulerState', 'retiredJobName', 'executionCount', 'activeExecutionCount', 'terminalSucceededCount', 'terminalFailedCount']) ||
      !Number.isFinite(Date.parse(value.observedAt)) || value.schedulerName !== DEV125_CLEANUP_PROVIDER_TARGET.schedulerName ||
      value.schedulerState !== 'PAUSED' || value.retiredJobName !== DEV125_CLEANUP_PROVIDER_TARGET.retiredJobName ||
      ![value.executionCount, value.activeExecutionCount, value.terminalSucceededCount, value.terminalFailedCount].every(number => Number.isInteger(number) && number >= 0) ||
      value.activeExecutionCount !== 0 || value.terminalSucceededCount + value.terminalFailedCount !== value.executionCount) fail('DEV125_CLEANUP_PROVIDER_STATE_INVALID')
  return value
}

async function identity(database) {
  const row = (await database.query("SELECT current_database() AS database,current_user AS login,current_setting('server_version_num')::integer / 10000 AS major,pg_has_role('jenfu_ai_pdm_migrator','MEMBER') AS migrator_member,has_schema_privilege('jenfu_ai_pdm_runtime','ai_pdm_core','CREATE') AS runtime_can_create_core")).rows?.[0]
  if (!row || row.database !== DEV125_CLEANUP_TARGET.database || row.login !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' ||
      Number(row.major) !== 17 || row.migrator_member !== true || row.runtime_can_create_core !== false) fail('DEV125_CLEANUP_DATABASE_TARGET_INVALID')
}

async function activeCount(database) {
  const result = await database.query(`SELECT count(*)::integer AS pending_count FROM ai_pdm_core.openswx_metadata_jobs
    WHERE status IN ('queued','running') OR dispatch_state IN ('due','requested','dispatched','dispatch_unknown')`)
  const count = Number(result.rows?.[0]?.pending_count)
  if (!Number.isInteger(count) || count < 0) fail('DEV125_CLEANUP_ACTIVE_ROWS_INVALID')
  return count
}

async function activeRows(database, { lock = false } = {}) {
  const result = await database.query(`SELECT id,company_id,status,attempt_count,dispatch_state,dispatch_generation,
    dispatch_requested_at::text,dispatch_request_window_end::text,dispatch_lease_expires_at::text,provider_operation,execution_name,
    lease_expires_at::text,heartbeat_at::text,created_at::text,updated_at::text
    FROM ai_pdm_core.openswx_metadata_jobs
    WHERE status IN ('queued','running') OR dispatch_state IN ('due','requested','dispatched','dispatch_unknown')
    ORDER BY created_at,id LIMIT 20${lock ? ' FOR UPDATE' : ''}`)
  if (!Array.isArray(result.rows) || result.rows.length > 20) fail('DEV125_CLEANUP_ACTIVE_ROWS_INVALID')
  return result.rows
}

export async function executeCleanup(database, operation) {
  await identity(database)
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await database.query('SELECT pg_advisory_xact_lock(125,82)')
    const relation = (await database.query("SELECT to_regclass('ai_pdm_core.openswx_metadata_jobs')::text AS relation")).rows?.[0]?.relation
    if (relation !== 'ai_pdm_core.openswx_metadata_jobs') fail('DEV125_CLEANUP_RELATION_MISSING')
    const beforeCount = await activeCount(database)
    const rows = await activeRows(database, { lock: true })
    const projected = rows.map(projection)
    if (beforeCount > 20 || beforeCount !== rows.length || beforeCount !== operation.basis.pendingCount ||
        hashValue(projected) !== operation.basis.activeRowsSha256) fail('DEV125_CLEANUP_BASIS_DRIFT')
    let mutatedRowCount = 0
    for (const row of rows) {
      const result = await database.query(`UPDATE ai_pdm_core.openswx_metadata_jobs
        SET status='cancelled',dispatch_state='terminal',locked_by=NULL,lease_expires_at=NULL,heartbeat_at=NULL,
            dispatch_lease_expires_at=NULL,dispatch_request_window_end=NULL,updated_at=transaction_timestamp()
        WHERE id=$1 AND company_id=$2 AND status IS NOT DISTINCT FROM $3 AND dispatch_state IS NOT DISTINCT FROM $4
          AND dispatch_generation IS NOT DISTINCT FROM $5 AND attempt_count IS NOT DISTINCT FROM $6 AND updated_at=$7::timestamptz`,
      [row.id, row.company_id, row.status, row.dispatch_state, row.dispatch_generation, row.attempt_count, timestamp(row.updated_at)])
      if (result.rowCount !== 1) fail('DEV125_CLEANUP_UPDATE_DRIFT')
      mutatedRowCount += 1
    }
    const afterCount = await activeCount(database)
    const after = await activeRows(database, { lock: true })
    if (afterCount !== 0 || after.length !== 0) fail('DEV125_CLEANUP_POSTCONDITION_FAILED')
    await database.query('COMMIT')
    return {
      relationExists: true,
      basisPendingCount: operation.basis.pendingCount,
      basisActiveRowsSha256: operation.basis.activeRowsSha256,
      observedPendingCount: beforeCount,
      observedActiveRowsSha256: hashValue(projected),
      mutatedRowCount,
      remainingActiveRowCount: 0,
      remainingActiveRowsSha256: hashValue([]),
      transactionMode: 'SERIALIZABLE',
    }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export function buildCleanupReceipt({ operation, operationRef, outputRef, observedAt, providerState, databaseState }) {
  assertCleanupProviderState(providerState)
  if (!Number.isFinite(Date.parse(observedAt)) ||
      databaseState?.remainingActiveRowCount !== 0 || databaseState?.mutatedRowCount !== operation.basis.pendingCount) fail('DEV125_CLEANUP_RECEIPT_INVALID')
  const core = {
    schemaVersion: DEV125_CLEANUP_RECEIPT_SCHEMA,
    ownerApplicationId: DEV125_CLEANUP_TARGET.ownerApplicationId,
    operationId: operation.operationId,
    sourceRevision: operation.sourceRevision,
    operationRef,
    outputRef,
    basis: operation.basis,
    observedAt,
    providerState,
    databaseState,
    status: 'RETIREMENT_COMPLETE',
  }
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

export function assertCleanupReceipt(value, { operation, operationRef, outputRef }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'operationRef', 'outputRef', 'basis', 'observedAt', 'providerState', 'databaseState', 'status', 'receiptSha256']) ||
      value.schemaVersion !== DEV125_CLEANUP_RECEIPT_SCHEMA || value.ownerApplicationId !== 'ai-pdm' || value.operationId !== operation.operationId ||
      value.sourceRevision !== operation.sourceRevision || canonicalize(value.operationRef) !== canonicalize(operationRef) || value.outputRef !== outputRef ||
      canonicalize(value.basis) !== canonicalize(operation.basis) || value.status !== 'RETIREMENT_COMPLETE' ||
      value.providerState?.schedulerState !== 'PAUSED' || value.providerState?.activeExecutionCount !== 0 ||
      value.databaseState?.remainingActiveRowCount !== 0 || value.databaseState?.mutatedRowCount !== operation.basis.pendingCount ||
      !Number.isFinite(Date.parse(value.observedAt))) fail('DEV125_CLEANUP_RECEIPT_INVALID')
  assertCleanupProviderState(value.providerState)
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('DEV125_CLEANUP_RECEIPT_INVALID')
  return value
}
