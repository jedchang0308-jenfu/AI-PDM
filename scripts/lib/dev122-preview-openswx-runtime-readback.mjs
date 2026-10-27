import { createHash } from 'node:crypto'

import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const RUNTIME_STATE_SCHEMA = 'aipdm.dev122.preview-openswx-runtime-readback-operation.v1'
export const RUNTIME_DATABASE_RECEIPT_SCHEMA = 'aipdm.dev122.preview-openswx-runtime-database-receipt.v1'
export const RUNTIME_STATE_RECEIPT_SCHEMA = 'aipdm.dev122.preview-openswx-runtime-readback-receipt.v1'
export const RUNTIME_STATE_PGOPTIONS = '-c default_transaction_read_only=on'
export const RUNTIME_STATE_PREFIX = 'source/openswx-dispatch-recovery/dev125-runtime-readback'
export const RUNTIME_STATE_RECEIPT_PREFIX = 'receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME'
export const RUNTIME_STATE_TARGET = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  database: 'jenfu_prod',
  applicationService: 'projects/jenfu-platform-prod/locations/asia-east1/services/ai-pdm-prod',
})
export const RUNTIME_STATE_SELECTORS = Object.freeze({
  companyId: 'company-jenfu',
  drawingNumber: 'A0001-M01',
  fileNames: Object.freeze(['D-0007-MA1.SLDPRT', 'D-0007-MA1.pdf']),
  workers: Object.freeze([
    Object.freeze({ workerId: 'windows-shell-thumbnail-worker', capabilityCode: 'solidworks_3d_preview_png' }),
    Object.freeze({ workerId: 'solidworks-document-manager-preview-worker', capabilityCode: 'solidworks_2d_preview_png' }),
  ]),
})

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RUNNER = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-migration-runner@sha256:[a-f0-9]{64}$/u

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

export function parseRuntimeStateArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 8) fail('RUNTIME_STATE_ARGUMENTS_INVALID')
  const allowed = new Set(['--runtime-operation-ref', '--runtime-operation-sha256', '--source-revision', '--runtime-database-output-ref'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('RUNTIME_STATE_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!H64.test(values['--runtime-operation-sha256'] ?? '') || !H40.test(values['--source-revision'] ?? '')) fail('RUNTIME_STATE_ARGUMENTS_INVALID')
  return {
    operationRef: values['--runtime-operation-ref'],
    operationSha256: values['--runtime-operation-sha256'],
    sourceRevision: values['--source-revision'],
    databaseOutputRef: values['--runtime-database-output-ref'],
  }
}

export function buildRuntimeStateOperation({ operationId, sourceRevision, migrationRunnerDigest }) {
  const value = {
    schemaVersion: RUNTIME_STATE_SCHEMA,
    operationId,
    sourceRevision,
    projectId: RUNTIME_STATE_TARGET.projectId,
    region: RUNTIME_STATE_TARGET.region,
    database: RUNTIME_STATE_TARGET.database,
    migrationRunnerDigest,
    selectors: RUNTIME_STATE_SELECTORS,
  }
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  return { value, bytes, sha256: sha256(bytes) }
}

export function assertRuntimeStateOperation(value, { bytes, operationSha256, sourceRevision }) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256) fail('RUNTIME_STATE_OPERATION_HASH_MISMATCH')
  if (!exact(value, ['schemaVersion', 'operationId', 'sourceRevision', 'projectId', 'region', 'database', 'migrationRunnerDigest', 'selectors']) ||
      value.schemaVersion !== RUNTIME_STATE_SCHEMA || !/^[A-Z0-9][A-Z0-9-]{5,63}$/u.test(value.operationId ?? '') ||
      value.sourceRevision !== sourceRevision || value.projectId !== RUNTIME_STATE_TARGET.projectId || value.region !== RUNTIME_STATE_TARGET.region ||
      value.database !== RUNTIME_STATE_TARGET.database || !RUNNER.test(value.migrationRunnerDigest ?? '') ||
      canonicalize(value.selectors) !== canonicalize(RUNTIME_STATE_SELECTORS)) fail('RUNTIME_STATE_OPERATION_INVALID')
  return value
}

export function assertRuntimeStateTarget(environment) {
  if (environment?.OWNER_APPLICATION_ID !== 'ai-pdm' || environment?.RELEASE_BUCKET !== 'jenfu-platform-prod-aipdm-release' ||
      environment?.GOOGLE_CLOUD_PROJECT !== RUNTIME_STATE_TARGET.projectId || environment?.GOOGLE_CLOUD_REGION !== RUNTIME_STATE_TARGET.region ||
      environment?.POSTGRES_DATABASE !== RUNTIME_STATE_TARGET.database || environment?.CLOUD_SQL_INSTANCE_CONNECTION_NAME !== 'jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' ||
      environment?.POSTGRES_SOCKET !== '/cloudsql/jenfu-platform-prod:asia-east1:jenfu-platform-prod-pg' || environment?.PGOPTIONS !== RUNTIME_STATE_PGOPTIONS) fail('RUNTIME_STATE_TARGET_INVALID')
  return true
}

function bind(sql, values) {
  const parameters = []
  const names = new Map()
  const text = sql.replace(/(?<!:)\$([A-Za-z][A-Za-z0-9_]*)\b/gu, (_, name) => {
    if (!Object.hasOwn(values, name)) fail('RUNTIME_STATE_SQL_PARAMETER_MISSING')
    if (!names.has(name)) { parameters.push(values[name]); names.set(name, parameters.length) }
    return `$${names.get(name)}`
  })
  if (Object.keys(values).some(name => !names.has(name))) fail('RUNTIME_STATE_SQL_PARAMETER_UNUSED')
  return { text, values: parameters }
}

async function query(database, sql, values = {}) {
  return (await database.query(bind(sql, values))).rows
}

export function readonlyRuntimeStateAdapter(database) {
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

export function assessPreviewBindings(assets, selectors = RUNTIME_STATE_SELECTORS) {
  if (!Array.isArray(assets) || !Array.isArray(selectors?.fileNames)) fail('RUNTIME_STATE_PREVIEW_ASSET_INVARIANT')
  return selectors.fileNames.map(fileName => {
    const candidates = assets.filter(row => row?.file_name === fileName)
    const active = candidates.filter(row => row.asset_deleted_at === null && row.binding_removed_at === null)
    return { fileName, status: active.length === 1 ? 'BOUND' : active.length === 0 ? 'MISSING' : 'AMBIGUOUS',
      activeCount: active.length, observedRowCount: candidates.length }
  })
}

export async function readRuntimeDatabaseState(database, operation) {
  const normalized = Buffer.from(canonicalize(operation))
  assertRuntimeStateOperation(operation, { bytes: normalized, operationSha256: sha256(normalized), sourceRevision: operation.sourceRevision })
  const selectors = operation.selectors
  return readonlyRuntimeStateAdapter(database).transaction(async ({ query: run }) => {
    const identity = (await run("SELECT current_database() AS database, current_user AS login, current_setting('server_version_num')::integer / 10000 AS major, pg_has_role($targetRole, 'MEMBER') AS migrator_member, has_schema_privilege($runtimeRole, $coreSchema, 'CREATE') AS runtime_can_create_core", {
      targetRole: 'jenfu_ai_pdm_migrator', runtimeRole: 'jenfu_ai_pdm_runtime', coreSchema: 'ai_pdm_core',
    }))[0]
    if (!identity || identity.database !== RUNTIME_STATE_TARGET.database || identity.login !== 'aipdm-prod-migrator@jenfu-platform-prod.iam' || Number(identity.major) !== 17 || identity.migrator_member !== true || identity.runtime_can_create_core !== false) fail('RUNTIME_STATE_DATABASE_TARGET_INVALID')

    const assets = await run(`SELECT drawing.drawing_number,state.data_layer,state.revision_id,revision.revision AS revision_label,
      revision.lifecycle_state,binding.id AS binding_id,binding.role,asset.id AS asset_id,asset.file_name,
      lower(trim(leading '.' from asset.file_ext)) AS file_extension,asset.mime_type,asset.file_size::text,
      asset.content_hash,asset.storage_provider,asset.storage_generation,asset.document_category,
      asset.deleted_at::text AS asset_deleted_at,binding.removed_at::text AS binding_removed_at
      FROM ai_pdm_core.drawings drawing
      JOIN ai_pdm_core.canonical_workbench_states state ON state.company_id=drawing.company_id
        AND state.entity_type='drawing' AND state.canonical_entity_id=drawing.id AND state.data_layer='drawing_production'
      JOIN ai_pdm_core.drawing_revisions revision ON revision.id=state.revision_id AND revision.company_id=state.company_id
      JOIN ai_pdm_core.drawing_revision_files binding ON binding.company_id=revision.company_id AND binding.drawing_revision_id=revision.id
      JOIN ai_pdm_core.file_assets asset ON asset.id=binding.source_file_asset_id
      WHERE drawing.company_id=$companyId AND drawing.drawing_number=$drawingNumber
        AND asset.file_name=ANY($fileNames::text[])
      ORDER BY asset.file_name,binding.sort_order,binding.id LIMIT 17`, {
      companyId: selectors.companyId, drawingNumber: selectors.drawingNumber, fileNames: selectors.fileNames,
    })
    const assetRowsTruncated = assets.length > 16
    const bindingChecks = assessPreviewBindings(assets, selectors)
    const currentAssets = selectors.fileNames.flatMap(fileName => {
      const active = assets.filter(row => row.file_name === fileName && row.asset_deleted_at === null && row.binding_removed_at === null)
      return active.length === 1 ? active : []
    })
    const previewTargets = currentAssets.map(asset => ({ assetId: asset.asset_id, sourceHash: asset.content_hash,
      requestedKind: asset.file_extension === 'pdf' ? 'drawing_pdf' : 'native_thumbnail_png' }))
    const assetIds = previewTargets.map(target => target.assetId)
    const sourceHashes = previewTargets.map(target => target.sourceHash)
    const requestedKinds = previewTargets.map(target => target.requestedKind)
    const jobs = await run(`WITH targets AS (
        SELECT * FROM unnest($assetIds::text[],$sourceHashes::text[],$requestedKinds::text[])
          AS target(asset_id,source_hash,requested_kind)
      )
      SELECT job.id,job.source_file_asset_id,job.source_content_hash,job.requested_kind,job.source_extension,job.status,
        job.attempt_count,job.locked_by,job.locked_at::text,job.error_code,job.generator_profile,
        job.created_at::text,job.updated_at::text,job.completed_at::text
      FROM targets target JOIN LATERAL (
        SELECT candidate.* FROM ai_pdm_core.preview_jobs candidate
        WHERE candidate.company_id=$companyId AND candidate.source_file_asset_id=target.asset_id
          AND candidate.source_content_hash=target.source_hash AND candidate.requested_kind=target.requested_kind
          AND candidate.generator_profile <> 'fake_preview_worker'
        ORDER BY candidate.updated_at DESC,candidate.created_at DESC,candidate.id DESC LIMIT 1
      ) job ON true ORDER BY job.source_file_asset_id`, { companyId: selectors.companyId, assetIds, sourceHashes, requestedKinds })
    if (jobs.length > previewTargets.length) fail('RUNTIME_STATE_PREVIEW_JOB_INVARIANT')
    const derivatives = await run(`SELECT id,source_file_asset_id,source_content_hash,derivative_kind,storage_provider,
      storage_generation,file_name,mime_type,file_size::text,content_hash,width,height,page_count,generator_profile,
      generator_version,preview_job_id,status,created_by_worker,created_at::text
      FROM ai_pdm_core.file_derivatives derivative
      JOIN unnest($assetIds::text[],$sourceHashes::text[]) AS target(asset_id,source_hash)
        ON derivative.source_file_asset_id=target.asset_id AND derivative.source_content_hash=target.source_hash
      WHERE derivative.company_id=$companyId AND derivative.generator_profile <> 'fake_preview_worker'
      ORDER BY derivative.source_file_asset_id,derivative.created_at DESC,derivative.id DESC LIMIT 33`, { companyId: selectors.companyId, assetIds, sourceHashes })
    const derivativeRowsTruncated = derivatives.length > 32
    const boundedDerivatives = derivatives.slice(0, 32)
    const workerIds = selectors.workers.map(row => row.workerId)
    const capabilities = selectors.workers.map(row => row.capabilityCode)
    const heartbeats = await run(`WITH targets AS (
        SELECT * FROM unnest($workerIds::text[],$capabilities::text[]) AS target(worker_id,capability_code)
      )
      SELECT target.worker_id AS expected_worker_id,target.capability_code AS expected_capability_code,
        heartbeat.worker_id,heartbeat.worker_kind,heartbeat.capability_code,heartbeat.status,heartbeat.reader_version,
        heartbeat.issue_code,heartbeat.last_applied_at::text,heartbeat.last_seen_at::text,heartbeat.updated_at::text,
        CASE WHEN heartbeat.last_seen_at IS NULL THEN NULL
          ELSE greatest(0,extract(epoch FROM statement_timestamp()-heartbeat.last_seen_at)::integer) END AS age_seconds,
        CASE WHEN heartbeat.last_seen_at IS NULL THEN false
          ELSE heartbeat.last_seen_at >= statement_timestamp()-interval '30 seconds' END AS fresh
      FROM targets target LEFT JOIN ai_pdm_core.worker_capability_heartbeats heartbeat
        ON heartbeat.worker_id=target.worker_id AND heartbeat.capability_code=target.capability_code
      ORDER BY target.worker_id,target.capability_code`, { workerIds, capabilities })
    if (heartbeats.length !== selectors.workers.length) fail('RUNTIME_STATE_HEARTBEAT_INVARIANT')
    const openswxCounts = await run(`SELECT status,dispatch_state,count(*)::integer AS row_count
      FROM ai_pdm_core.openswx_metadata_jobs GROUP BY status,dispatch_state ORDER BY status,dispatch_state`)
    const openswxActive = await run(`SELECT status,attempt_count,dispatch_state,dispatch_generation,
      dispatch_requested_at::text,dispatch_request_window_end::text,dispatch_lease_expires_at::text,
      provider_operation,execution_name,lease_expires_at::text,heartbeat_at::text,created_at::text,updated_at::text
      FROM ai_pdm_core.openswx_metadata_jobs
      WHERE status IN ('queued','running') OR dispatch_state IN ('due','requested','dispatched','dispatch_unknown')
      ORDER BY created_at,id LIMIT 20`)
    const openswxPendingCount = openswxCounts.reduce((total, row) => total + ((['queued', 'running'].includes(row.status) || ['due', 'requested', 'dispatched', 'dispatch_unknown'].includes(row.dispatch_state)) ? Number(row.row_count) : 0), 0)
    return {
      database: identity.database,
      selectors,
      preview: {
        bindingStatus: bindingChecks.every(row => row.status === 'BOUND') ? 'COMPLETE' : 'INCOMPLETE',
        bindingChecks,
        assetRowCount: assets.length, assetRowsTruncated, assetRowsSha256: hashValue(assets), assets,
        jobRowCount: jobs.length, jobRowsSha256: hashValue(jobs), jobs,
        derivativeRowCount: boundedDerivatives.length, derivativeRowsTruncated, derivativeRowsSha256: hashValue(boundedDerivatives), derivatives: boundedDerivatives,
        heartbeatEvidenceKind: 'stable-worker-identity-heartbeat', processStatus: 'unknown',
        heartbeatRowCount: heartbeats.length, heartbeatRowsSha256: hashValue(heartbeats), heartbeats,
      },
      openswx: {
        countRowCount: openswxCounts.length, countRowsSha256: hashValue(openswxCounts), counts: openswxCounts,
        activeRowCount: openswxActive.length, activeRowsSha256: hashValue(openswxActive), activeRows: openswxActive,
        activeRowsTruncated: openswxPendingCount > openswxActive.length, pendingCount: openswxPendingCount,
      },
      databaseMutationExpected: false,
      transactionMode: 'REPEATABLE READ READ ONLY',
    }
  })
}

export function buildRuntimeDatabaseReceipt({ operation, operationRef, outputRef, observedAt, state }) {
  if (!Number.isFinite(Date.parse(observedAt)) || state?.database !== RUNTIME_STATE_TARGET.database || state?.databaseMutationExpected !== false) fail('RUNTIME_STATE_DATABASE_RECEIPT_INVALID')
  const core = { schemaVersion: RUNTIME_DATABASE_RECEIPT_SCHEMA, ownerApplicationId: RUNTIME_STATE_TARGET.ownerApplicationId,
    operationId: operation.operationId, sourceRevision: operation.sourceRevision, operationRef, outputRef, observedAt, state }
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

export function assertRuntimeDatabaseReceipt(value, { operation, operationRef, outputRef }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'operationRef', 'outputRef', 'observedAt', 'state', 'receiptSha256']) ||
      value.schemaVersion !== RUNTIME_DATABASE_RECEIPT_SCHEMA || value.ownerApplicationId !== RUNTIME_STATE_TARGET.ownerApplicationId ||
      value.operationId !== operation.operationId || value.sourceRevision !== operation.sourceRevision || canonicalize(value.operationRef) !== canonicalize(operationRef) ||
      value.outputRef !== outputRef || !Number.isFinite(Date.parse(value.observedAt)) || value.state?.database !== RUNTIME_STATE_TARGET.database ||
      value.state?.databaseMutationExpected !== false) fail('RUNTIME_STATE_DATABASE_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('RUNTIME_STATE_DATABASE_RECEIPT_INVALID')
  return value
}

export function buildRuntimeStateReceipt({ operation, operationRef, outputRef, databaseReceipt, provider, observedAt }) {
  if (!Number.isFinite(Date.parse(observedAt)) || provider?.service?.name !== RUNTIME_STATE_TARGET.applicationService ||
      !['0', '1'].includes(provider?.openswxDispatch?.value) || typeof provider?.openswxDispatch?.configured !== 'boolean' ||
      provider.openswxDispatch.enabled !== (provider.openswxDispatch.value === '1') || provider?.revision?.trafficPercent !== 100) fail('RUNTIME_STATE_PROVIDER_INVALID')
  const pendingCount = Number(databaseReceipt?.state?.openswx?.pendingCount)
  if (!Number.isInteger(pendingCount) || pendingCount < 0) fail('RUNTIME_STATE_PROVIDER_INVALID')
  const readbackStatus = pendingCount > 0 || provider.openswxDispatch.enabled
    ? 'DRAIN_OR_ENTRY_SHUTDOWN_REQUIRED'
    : 'DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED'
  const preview = databaseReceipt?.state?.preview
  const diagnosticStatus = preview?.bindingStatus === 'COMPLETE' && preview.assetRowsTruncated === false && preview.derivativeRowsTruncated === false
    ? 'READBACK_COMPLETE'
    : 'READBACK_COMPLETE_WITH_FINDINGS'
  const core = { schemaVersion: RUNTIME_STATE_RECEIPT_SCHEMA, ownerApplicationId: RUNTIME_STATE_TARGET.ownerApplicationId,
    operationId: operation.operationId, sourceRevision: operation.sourceRevision, operationRef, outputRef, observedAt,
    databaseReceipt: { outputRef: databaseReceipt.outputRef, observedAt: databaseReceipt.observedAt, receiptSha256: databaseReceipt.receiptSha256, state: databaseReceipt.state },
    provider, diagnosticStatus, openswxReadbackStatus: readbackStatus, providerInventoryComplete: false, releaseAuthority: false,
    businessDataMutation: false, serviceConfigurationMutation: false,
    diagnosticExecutionCreated: true, immutableEvidenceWritten: true }
  return { ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }
}

export function assertRuntimeStateReceipt(value, { operation, operationRef, outputRef }) {
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'operationRef', 'outputRef', 'observedAt', 'databaseReceipt', 'provider', 'diagnosticStatus', 'openswxReadbackStatus', 'providerInventoryComplete', 'releaseAuthority', 'businessDataMutation', 'serviceConfigurationMutation', 'diagnosticExecutionCreated', 'immutableEvidenceWritten', 'receiptSha256']) ||
      value.schemaVersion !== RUNTIME_STATE_RECEIPT_SCHEMA || value.ownerApplicationId !== RUNTIME_STATE_TARGET.ownerApplicationId ||
      value.operationId !== operation.operationId || value.sourceRevision !== operation.sourceRevision || canonicalize(value.operationRef) !== canonicalize(operationRef) ||
      value.outputRef !== outputRef || !Number.isFinite(Date.parse(value.observedAt)) || value.releaseAuthority !== false ||
      value.businessDataMutation !== false || value.serviceConfigurationMutation !== false || value.diagnosticExecutionCreated !== true || value.immutableEvidenceWritten !== true ||
      value.providerInventoryComplete !== false ||
      !['READBACK_COMPLETE', 'READBACK_COMPLETE_WITH_FINDINGS'].includes(value.diagnosticStatus) ||
      !['DRAIN_OR_ENTRY_SHUTDOWN_REQUIRED', 'DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED'].includes(value.openswxReadbackStatus)) fail('RUNTIME_STATE_RECEIPT_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('RUNTIME_STATE_RECEIPT_INVALID')
  return value
}
