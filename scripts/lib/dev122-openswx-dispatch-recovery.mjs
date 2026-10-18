import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const OPENSWX_DISPATCH_RECOVERY_SCHEMA = 'aipdm.dev122.openswx-dispatch-recovery-operation.v1'
export const OPENSWX_DISPATCH_RECOVERY_RECEIPT_SCHEMA = 'aipdm.dev122.openswx-dispatch-recovery-receipt.v1'
export const OPENSWX_DISPATCH_RECOVERY_PREFIX = 'source/openswx-dispatch-recovery'
export const OPENSWX_DISPATCH_RECOVERY_RECEIPT_PREFIX = 'receipts/releases/DEV122-OPENSWX-DISPATCH-RECOVERY'
export const OPENSWX_DISPATCH_RECOVERY_TARGET = Object.freeze({ ownerApplicationId: 'ai-pdm', projectId: 'jenfu-platform-prod', region: 'asia-east1', database: 'jenfu_prod' })

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const OPERATION = /^projects\/(?:jenfu-platform-prod|9536592944)\/locations\/asia-east1\/operations\/[A-Za-z0-9_-]{1,120}$/u
const EXECUTION = /^projects\/(?:jenfu-platform-prod|9536592944)\/locations\/asia-east1\/jobs\/ai-pdm-prod-openswx-metadata\/executions\/[a-z][a-z0-9-]{0,62}$/u

function fail(code) { const error = new Error(code); error.code = code; throw error }
function exact(value, keys) { return value && typeof value === 'object' && !Array.isArray(value) && canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort()) }
function validTime(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) }
function canonicalOperation(value) { return String(value).replace('projects/jenfu-platform-prod/', 'projects/9536592944/') }
function canonicalExecution(value) { return String(value).replace('projects/jenfu-platform-prod/', 'projects/9536592944/') }

export function parseOpenSwxDispatchRecoveryArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 8) fail('OPENSWX_DISPATCH_RECOVERY_ARGUMENTS_INVALID')
  const allowed = new Set(['--openswx-dispatch-recovery-operation-ref', '--openswx-dispatch-recovery-operation-sha256', '--source-revision', '--openswx-dispatch-recovery-output-ref'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('OPENSWX_DISPATCH_RECOVERY_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!H64.test(values['--openswx-dispatch-recovery-operation-sha256'] ?? '') || !H40.test(values['--source-revision'] ?? '')) fail('OPENSWX_DISPATCH_RECOVERY_ARGUMENTS_INVALID')
  return { operationRef: values['--openswx-dispatch-recovery-operation-ref'], operationSha256: values['--openswx-dispatch-recovery-operation-sha256'], sourceRevision: values['--source-revision'], outputRef: values['--openswx-dispatch-recovery-output-ref'] }
}

export function assertOpenSwxDispatchRecoveryOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('OPENSWX_DISPATCH_RECOVERY_OPERATION_HASH_MISMATCH')
  if (!exact(value, ['schemaVersion', 'operationId', 'sourceRevision', 'projectId', 'region', 'database', 'migrationRunnerDigest', 'dispatch', 'provider']) ||
      value.schemaVersion !== OPENSWX_DISPATCH_RECOVERY_SCHEMA || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(value.operationId ?? '') || value.sourceRevision !== sourceRevision ||
      value.projectId !== OPENSWX_DISPATCH_RECOVERY_TARGET.projectId || value.region !== OPENSWX_DISPATCH_RECOVERY_TARGET.region || value.database !== OPENSWX_DISPATCH_RECOVERY_TARGET.database ||
      !/^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u.test(value.migrationRunnerDigest ?? '')) fail('OPENSWX_DISPATCH_RECOVERY_OPERATION_INVALID')
  const dispatch = value.dispatch, provider = value.provider
  if (!exact(dispatch, ['status', 'attemptCount', 'dispatchState', 'dispatchGeneration', 'dispatchRequestedAt', 'dispatchRequestWindowEnd', 'dispatchLeaseExpiresAt', 'providerOperation', 'executionName']) ||
      dispatch.status !== 'queued' || dispatch.dispatchState !== 'dispatch_unknown' || !Number.isSafeInteger(dispatch.attemptCount) || dispatch.attemptCount < 0 || dispatch.attemptCount >= 2 ||
      !Number.isSafeInteger(dispatch.dispatchGeneration) || dispatch.dispatchGeneration < 1 || !validTime(dispatch.dispatchRequestedAt) || !validTime(dispatch.dispatchRequestWindowEnd) ||
      !validTime(dispatch.dispatchLeaseExpiresAt) || Date.parse(dispatch.dispatchRequestedAt) > Date.parse(dispatch.dispatchRequestWindowEnd) || dispatch.dispatchRequestWindowEnd !== dispatch.dispatchLeaseExpiresAt ||
      !OPERATION.test(dispatch.providerOperation ?? '') || dispatch.executionName !== null) fail('OPENSWX_DISPATCH_RECOVERY_DISPATCH_INVALID')
  if (!exact(provider, ['operationName', 'done', 'errorCode', 'executionName', 'createTime', 'completionTime', 'completedState']) || provider.done !== true ||
      !Number.isSafeInteger(provider.errorCode) || provider.errorCode <= 0 || !OPERATION.test(provider.operationName ?? '') || canonicalOperation(provider.operationName) !== canonicalOperation(dispatch.providerOperation) ||
      !EXECUTION.test(provider.executionName ?? '') || !validTime(provider.createTime) || !validTime(provider.completionTime) || provider.completedState !== 'CONDITION_FAILED' ||
      Date.parse(provider.createTime) < Date.parse(dispatch.dispatchRequestedAt) || Date.parse(provider.createTime) > Date.parse(dispatch.dispatchRequestWindowEnd) || Date.parse(provider.completionTime) < Date.parse(provider.createTime)) fail('OPENSWX_DISPATCH_RECOVERY_PROVIDER_INVALID')
  return value
}

export function assertOpenSwxDispatchProviderReadback(operation, operationResponse, execution) {
  const completed = (execution?.conditions ?? []).filter(row => row?.type === 'Completed')
  if (canonicalOperation(operationResponse?.name) !== canonicalOperation(operation.provider.operationName) || operationResponse?.done !== true || Number(operationResponse?.error?.code) !== operation.provider.errorCode ||
      operationResponse?.metadata?.['@type'] !== 'type.googleapis.com/google.cloud.run.v2.Execution' || canonicalExecution(operationResponse?.metadata?.name) !== canonicalExecution(operation.provider.executionName) ||
      canonicalExecution(execution?.name) !== canonicalExecution(operation.provider.executionName) || execution?.createTime !== operation.provider.createTime || execution?.completionTime !== operation.provider.completionTime ||
      (Object.hasOwn(execution ?? {}, 'reconciling') && execution.reconciling !== false) || completed.length !== 1 || completed[0].state !== operation.provider.completedState) fail('OPENSWX_DISPATCH_RECOVERY_PROVIDER_READBACK_INVALID')
  return { operationName: canonicalOperation(operation.provider.operationName), executionName: canonicalExecution(operation.provider.executionName), errorCode: operation.provider.errorCode, completedState: operation.provider.completedState, createTime: operation.provider.createTime, completionTime: operation.provider.completionTime }
}

function rowState(row) {
  return {
    status: row.status,
    attemptCount: Number(row.attempt_count),
    dispatchState: row.dispatch_state,
    dispatchGeneration: Number(row.dispatch_generation),
    dispatchRequestedAt: row.dispatch_requested_at,
    dispatchRequestWindowEnd: row.dispatch_request_window_end,
    dispatchLeaseExpiresAt: row.dispatch_lease_expires_at,
    providerOperation: row.provider_operation,
    executionName: row.execution_name,
  }
}

function expectedAfter(operation) {
  const attempts = operation.dispatch.attemptCount + 1
  return { ...operation.dispatch, attemptCount: attempts, dispatchState: attempts >= 2 ? 'terminal' : 'due', status: attempts >= 2 ? 'failed' : 'queued', executionName: null }
}

export async function executeOpenSwxDispatchRecovery(database, operation, observedAt) {
  if (!validTime(observedAt)) fail('OPENSWX_DISPATCH_RECOVERY_TIME_INVALID')
  await database.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    const identity = (await database.query("SELECT current_database() AS database, current_user AS login, current_setting('server_version_num')::integer / 10000 AS major, pg_has_role($1, 'MEMBER') AS migrator_member, has_schema_privilege($2, $3, 'CREATE') AS runtime_can_create_core", ['jenfu_ai_pdm_migrator', 'jenfu_ai_pdm_runtime', 'ai_pdm_core'])).rows[0]
    if (!identity || identity.database !== OPENSWX_DISPATCH_RECOVERY_TARGET.database || identity.login !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' || Number(identity.major) !== 17 || identity.migrator_member !== true || identity.runtime_can_create_core !== false) fail('OPENSWX_DISPATCH_RECOVERY_DATABASE_TARGET_INVALID')
    const rows = (await database.query(`SELECT id,company_id,status,attempt_count,dispatch_state,dispatch_generation,
      dispatch_requested_at::text,dispatch_request_window_end::text,dispatch_lease_expires_at::text,
      provider_operation,execution_name FROM ai_pdm_core.openswx_metadata_jobs
      WHERE provider_operation=$1 AND dispatch_generation=$2 ORDER BY created_at,id LIMIT 2 FOR UPDATE`, [operation.dispatch.providerOperation, operation.dispatch.dispatchGeneration])).rows
    if (rows.length !== 1) fail('OPENSWX_DISPATCH_RECOVERY_ROW_MISMATCH')
    const before = operation.dispatch, after = expectedAfter(operation), current = rowState(rows[0])
    let reused = false, final = current
    if (canonicalize(current) === canonicalize(before)) {
      const updated = (await database.query(`UPDATE ai_pdm_core.openswx_metadata_jobs
        SET dispatch_state=$1,status=$2,attempt_count=$3,locked_by=NULL,lease_expires_at=NULL,execution_name=NULL,updated_at=$4
        WHERE id=$5 AND company_id=$6 AND dispatch_generation=$7 AND dispatch_state='dispatch_unknown'
          AND provider_operation=$8 AND attempt_count=$9 AND execution_name IS NULL
        RETURNING status,attempt_count,dispatch_state,dispatch_generation,dispatch_requested_at::text,
          dispatch_request_window_end::text,dispatch_lease_expires_at::text,provider_operation,execution_name`,
      [after.dispatchState, after.status, after.attemptCount, observedAt, rows[0].id, rows[0].company_id,
        before.dispatchGeneration, before.providerOperation, before.attemptCount])).rows
      if (updated.length !== 1) fail('OPENSWX_DISPATCH_RECOVERY_CAS_FAILED')
      final = rowState(updated[0])
    } else if (canonicalize(current) === canonicalize(after)) reused = true
    else fail('OPENSWX_DISPATCH_RECOVERY_ROW_MISMATCH')
    if (canonicalize(final) !== canonicalize(after)) fail('OPENSWX_DISPATCH_RECOVERY_AFTER_MISMATCH')
    await database.query('COMMIT')
    return { before, after: final, reused, databaseMutationApplied: !reused, providerExecutionName: canonicalExecution(operation.provider.executionName) }
  } catch (error) {
    await database.query('ROLLBACK').catch(() => undefined)
    throw error
  }
}

export function buildOpenSwxDispatchRecoveryReceipt({ operation, operationRef, outputRef, observedAt, result }) {
  const core = { schemaVersion: OPENSWX_DISPATCH_RECOVERY_RECEIPT_SCHEMA, ownerApplicationId: OPENSWX_DISPATCH_RECOVERY_TARGET.ownerApplicationId, operationId: operation.operationId, sourceRevision: operation.sourceRevision, operationRef, outputRef, observedAt, target: OPENSWX_DISPATCH_RECOVERY_TARGET, result }
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

export function assertOpenSwxDispatchRecoveryReceipt(value, { operation, operationRef, outputRef }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'operationRef', 'outputRef', 'observedAt', 'target', 'result', 'receiptSha256']) ||
      value.schemaVersion !== OPENSWX_DISPATCH_RECOVERY_RECEIPT_SCHEMA || value.ownerApplicationId !== OPENSWX_DISPATCH_RECOVERY_TARGET.ownerApplicationId || value.operationId !== operation.operationId ||
      value.sourceRevision !== operation.sourceRevision || canonicalize(value.operationRef) !== canonicalize(operationRef) || value.outputRef !== outputRef || !validTime(value.observedAt) ||
      canonicalize(value.target) !== canonicalize(OPENSWX_DISPATCH_RECOVERY_TARGET) ||
      !exact(value.result, ['before', 'after', 'reused', 'databaseMutationApplied', 'providerExecutionName']) ||
      canonicalize(value.result.before) !== canonicalize(operation.dispatch) || canonicalize(value.result.after) !== canonicalize(expectedAfter(operation)) ||
      typeof value.result.reused !== 'boolean' || value.result.databaseMutationApplied !== !value.result.reused ||
      canonicalExecution(value.result.providerExecutionName) !== canonicalExecution(operation.provider.executionName)) fail('OPENSWX_DISPATCH_RECOVERY_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('OPENSWX_DISPATCH_RECOVERY_RECEIPT_INVALID')
  return value
}
