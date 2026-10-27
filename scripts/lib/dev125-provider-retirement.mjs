import { canonicalize, sha256 } from './dev012-production-migration-runner.mjs'

export const DEV125_PROVIDER_RETIREMENT_SCHEMA = 'aipdm.dev125.openswx-provider-retirement-operation.v1'
export const DEV125_PROVIDER_RETIREMENT_RECEIPT_SCHEMA = 'aipdm.dev125.openswx-provider-retirement-receipt.v1'
export const DEV125_PROVIDER_RETIREMENT_CLAIM_SCHEMA = 'aipdm.dev125.openswx-provider-retirement-claim.v1'
export const DEV125_PROVIDER_RETIREMENT_OPERATION_PREFIX = 'source/openswx-dispatch-recovery/dev125-provider-retirement'
export const DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX = 'receipts/releases/DEV125-OPENSWX-PROVIDER-RETIREMENT'
export const DEV125_PROVIDER_RETIREMENT_TARGET = Object.freeze({
  ownerApplicationId: 'ai-pdm',
  projectId: 'jenfu-platform-prod',
  region: 'asia-east1',
  terraformVersion: '1.14.5',
  mode: 'UNPROTECT',
})

const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const GENERATION = /^[1-9][0-9]{0,31}$/u
const WORKER_IMAGE = /^asia-east1-docker\.pkg\.dev\/jenfu-platform-prod\/aipdm-release\/ai-pdm-openswx-worker@sha256:[a-f0-9]{64}$/u

export const DEV125_PROVIDER_RETIREMENT_ROOTS = Object.freeze({
  worker: Object.freeze({
    id: 'worker',
    directory: 'infra/google-cloud/dev-122-openswx-worker',
    stateUri: 'gs://tfstate-jenfu-platform-prod/dev-122/openswx-worker/default.tfstate',
    addresses: Object.freeze([
      'google_cloud_run_v2_job_iam_member.app_readback',
      'google_cloud_run_v2_job_iam_member.app_run',
      'google_cloud_run_v2_job_iam_member.deployer_lifecycle',
      'google_cloud_run_v2_job.reader',
      'google_cloud_scheduler_job.dispatch',
      'google_project_iam_custom_role.app_readback',
      'google_project_iam_custom_role.worker_lifecycle',
      'google_secret_manager_secret_iam_member.reader_token_access',
      'google_secret_manager_secret.reader_token',
      'google_service_account_iam_member.deployer_reader_act_as',
      'google_service_account.dispatch',
      'google_service_account.reader',
    ]),
  }),
  readback: Object.freeze({
    id: 'readback',
    directory: 'infra/google-cloud/dev-122-openswx-release-readback',
    stateUri: 'gs://tfstate-jenfu-platform-prod/dev-122/openswx-release-readback/default.tfstate',
    addresses: Object.freeze([
      'google_cloud_run_v2_job_iam_member.verifier_readback',
      'google_project_iam_custom_role.prebuild_list_readback',
      'google_project_iam_custom_role.release_scheduler_readback',
      'google_project_iam_custom_role.release_secret_version_readback',
      'google_project_iam_custom_role.verifier_job_readback',
      'google_project_iam_member.deployer_scheduler_readback',
      'google_project_iam_member.verifier_prebuild_list_readback',
      'google_project_iam_member.verifier_scheduler_readback',
      'google_secret_manager_secret_iam_member.deployer_reader_token_version_readback',
      'google_secret_manager_secret_iam_member.deployer_workload_credentials_version_readback',
      'google_secret_manager_secret_iam_member.verifier_reader_token_version_readback',
      'google_secret_manager_secret_iam_member.verifier_workload_credentials_version_readback',
    ]),
  }),
})

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    canonicalize(Object.keys(value).sort()) === canonicalize([...keys].sort())
}

function exactRef(value, pattern) {
  return exact(value, ['uri', 'sha256', 'generation']) && pattern.test(value.uri ?? '') &&
    H64.test(value.sha256 ?? '') && GENERATION.test(String(value.generation ?? ''))
}

function operationRefPattern(kind) {
  if (kind === 'cleanup') return /^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/releases\/DEV125-OPENSWX-RETIREMENT\/[a-f0-9]{64}\/cleanup\.json$/u
  return /^gs:\/\/jenfu-platform-prod-aipdm-release\/receipts\/diagnostics\/DEV122-PREVIEW-OPENSWX-RUNTIME\/[a-f0-9]{64}\/state\.json$/u
}

function stateBasis(value, root) {
  return exact(value, ['id', 'uri', 'generation', 'sha256', 'lineage', 'serial', 'addresses']) &&
    value.id === root.id && value.uri === root.stateUri && GENERATION.test(String(value.generation ?? '')) &&
    H64.test(value.sha256 ?? '') && /^[0-9a-f-]{36}$/u.test(value.lineage ?? '') &&
    Number.isInteger(value.serial) && value.serial >= 0 && canonicalize(value.addresses) === canonicalize(root.addresses)
}

export function buildProviderRetirementOperation({ operationId, sourceRevision, createdAt, expiresAt, workerImage, cleanupReceiptRef, runtimeReceiptRef, stateBasis: basis }) {
  const value = {
    schemaVersion: DEV125_PROVIDER_RETIREMENT_SCHEMA,
    operationId,
    sourceRevision,
    createdAt,
    expiresAt,
    ...DEV125_PROVIDER_RETIREMENT_TARGET,
    workerImage,
    cleanupReceiptRef,
    runtimeReceiptRef,
    stateBasis: basis,
  }
  const bytes = Buffer.from(`${canonicalize(value)}\n`)
  return { value, bytes, sha256: sha256(bytes) }
}

export function assertProviderRetirementOperation(value, { bytes, operationSha256, sourceRevision, now = new Date().toISOString() }) {
  const createdAt = Date.parse(value?.createdAt ?? '')
  const expiresAt = Date.parse(value?.expiresAt ?? '')
  const observedAt = Date.parse(now)
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== operationSha256 || !exact(value, [
    'schemaVersion', 'operationId', 'sourceRevision', 'createdAt', 'expiresAt', 'ownerApplicationId', 'projectId', 'region', 'terraformVersion', 'mode',
    'workerImage', 'cleanupReceiptRef', 'runtimeReceiptRef', 'stateBasis',
  ]) || value.schemaVersion !== DEV125_PROVIDER_RETIREMENT_SCHEMA || !/^[A-Z0-9][A-Z0-9-]{5,79}$/u.test(value.operationId ?? '') ||
      value.sourceRevision !== sourceRevision || !H40.test(value.sourceRevision ?? '') ||
      !Number.isFinite(createdAt) || !Number.isFinite(expiresAt) || !Number.isFinite(observedAt) || createdAt > observedAt + 300_000 ||
      expiresAt <= observedAt || expiresAt - createdAt > 7_200_000 || expiresAt <= createdAt ||
      value.ownerApplicationId !== DEV125_PROVIDER_RETIREMENT_TARGET.ownerApplicationId || value.projectId !== DEV125_PROVIDER_RETIREMENT_TARGET.projectId ||
      value.region !== DEV125_PROVIDER_RETIREMENT_TARGET.region || value.terraformVersion !== DEV125_PROVIDER_RETIREMENT_TARGET.terraformVersion ||
      value.mode !== DEV125_PROVIDER_RETIREMENT_TARGET.mode || !WORKER_IMAGE.test(value.workerImage ?? '') ||
      !exactRef(value.cleanupReceiptRef, operationRefPattern('cleanup')) || !exactRef(value.runtimeReceiptRef, operationRefPattern('runtime')) ||
      !exact(value.stateBasis, ['worker', 'readback']) || !stateBasis(value.stateBasis.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker) ||
      !stateBasis(value.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback)) fail('DEV125_PROVIDER_RETIREMENT_OPERATION_INVALID')
  return value
}

export function stateAddresses(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.resources)) fail('DEV125_PROVIDER_RETIREMENT_STATE_INVALID')
  const addresses = []
  for (const resource of value.resources) {
    if (resource?.mode !== 'managed') continue
    if (!Array.isArray(resource.instances) || resource.instances.length === 0) addresses.push(`${resource.type}.${resource.name}`)
    else for (const instance of resource.instances) {
      const key = instance.index_key
      const suffix = key === undefined || key === null ? '' : typeof key === 'string' ? `[${JSON.stringify(key)}]` : `[${key}]`
      addresses.push(`${resource.type}.${resource.name}${suffix}`)
    }
  }
  return addresses.sort()
}

export function assertStateSnapshot(value, bytes, basis, root, { allowAdvanced = false } = {}) {
  const actualSha256 = Buffer.isBuffer(bytes) ? sha256(bytes) : null
  if (!Buffer.isBuffer(bytes) || (!allowAdvanced && actualSha256 !== basis.sha256) || value?.lineage !== basis.lineage ||
      !Number.isInteger(value?.serial) || (allowAdvanced ? value.serial <= basis.serial : value.serial !== basis.serial) ||
      canonicalize(stateAddresses(value)) !== canonicalize([...root.addresses].sort())) fail('DEV125_PROVIDER_RETIREMENT_STATE_BASIS_INVALID')
  return { lineage: value.lineage, serial: value.serial, sha256: actualSha256, addresses: stateAddresses(value) }
}

export function workerDeletionProtection(value) {
  const resource = value?.resources?.find((entry) => entry.mode === 'managed' && entry.type === 'google_cloud_run_v2_job' && entry.name === 'reader')
  const result = resource?.instances?.[0]?.attributes?.deletion_protection
  if (typeof result !== 'boolean') fail('DEV125_PROVIDER_RETIREMENT_JOB_STATE_INVALID')
  return result
}

export function schedulerPaused(value) {
  const resource = value?.resources?.find((entry) => entry.mode === 'managed' && entry.type === 'google_cloud_scheduler_job' && entry.name === 'dispatch')
  const result = resource?.instances?.[0]?.attributes?.paused
  if (typeof result !== 'boolean') fail('DEV125_PROVIDER_RETIREMENT_SCHEDULER_STATE_INVALID')
  return result
}

function planRows(plan) {
  if (plan?.format_version !== '1.2' || plan?.terraform_version !== DEV125_PROVIDER_RETIREMENT_TARGET.terraformVersion ||
      plan.complete !== true || plan.errored !== false || !Array.isArray(plan.resource_changes)) fail('DEV125_PROVIDER_RETIREMENT_PLAN_INVALID')
  return new Map(plan.resource_changes.map((row) => [row.address, row]))
}

function changedTopLevelKeys(change) {
  const before = change?.before ?? {}
  const after = change?.after ?? {}
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((key) => canonicalize(before[key]) !== canonicalize(after[key])).sort()
}

export function assertUnprotectPlans({ workerPlan, readbackPlan, recovery = false }) {
  const workerRows = planRows(workerPlan)
  const readbackRows = planRows(readbackPlan)
  if (canonicalize([...workerRows.keys()].sort()) !== canonicalize([...DEV125_PROVIDER_RETIREMENT_ROOTS.worker.addresses].sort()) ||
      canonicalize([...readbackRows.keys()].sort()) !== canonicalize([...DEV125_PROVIDER_RETIREMENT_ROOTS.readback.addresses].sort())) fail('DEV125_PROVIDER_RETIREMENT_PLAN_ADDRESS_INVALID')
  for (const address of DEV125_PROVIDER_RETIREMENT_ROOTS.worker.addresses) {
    const row = workerRows.get(address)
    const expected = address === 'google_cloud_run_v2_job.reader' && !recovery ? ['update'] : ['no-op']
    if (canonicalize(row?.change?.actions) !== canonicalize(expected)) fail('DEV125_PROVIDER_RETIREMENT_PLAN_ACTION_INVALID')
    if (address === 'google_cloud_run_v2_job.reader' && !recovery &&
        (row.change.before?.deletion_protection !== true || row.change.after?.deletion_protection !== false ||
         canonicalize(changedTopLevelKeys(row.change)) !== canonicalize(['deletion_protection']))) fail('DEV125_PROVIDER_RETIREMENT_PLAN_JOB_UPDATE_INVALID')
    if (address === 'google_cloud_run_v2_job.reader' && recovery &&
        (row.change.before?.deletion_protection !== false || row.change.after?.deletion_protection !== false ||
         changedTopLevelKeys(row.change).length !== 0)) fail('DEV125_PROVIDER_RETIREMENT_PLAN_JOB_UPDATE_INVALID')
  }
  for (const address of DEV125_PROVIDER_RETIREMENT_ROOTS.readback.addresses) {
    if (canonicalize(readbackRows.get(address)?.change?.actions) !== canonicalize(['no-op'])) fail('DEV125_PROVIDER_RETIREMENT_PLAN_ACTION_INVALID')
  }
  return {
    workerAddressCount: workerRows.size,
    readbackAddressCount: readbackRows.size,
    mutationCount: recovery ? 0 : 1,
    mutationAddress: recovery ? null : 'google_cloud_run_v2_job.reader',
  }
}

function digest(value) {
  return sha256(Buffer.from(canonicalize(value)))
}

function expectedStateRecord(basis) {
  return { uri: basis.uri, generation: basis.generation, sha256: basis.sha256, lineage: basis.lineage,
    serial: basis.serial, addresses: basis.addresses }
}

function stateRecordMatches(value, basis, root, { advanced = false } = {}) {
  if (!exact(value, ['uri', 'generation', 'sha256', 'lineage', 'serial', 'addresses']) || value.uri !== root.stateUri ||
      !GENERATION.test(String(value.generation ?? '')) || !H64.test(value.sha256 ?? '') || value.lineage !== basis.lineage ||
      !Number.isInteger(value.serial) || canonicalize(value.addresses) !== canonicalize(root.addresses)) return false
  return advanced ? value.serial > basis.serial : canonicalize(value) === canonicalize(expectedStateRecord(basis))
}

function expectedAuthorizedPlan(operation) {
  const summary = { mode: operation.mode, workerAddressCount: 12, readbackAddressCount: 12,
    mutationCount: 1, mutationAddress: 'google_cloud_run_v2_job.reader' }
  return {
    workerSha256: digest({ root: 'worker', summary }),
    readbackSha256: digest({ root: 'readback', addressCount: 12, mutationCount: 0 }),
  }
}

function expectedExecutedPlan(operation, recovered) {
  const summary = { mode: operation.mode, workerAddressCount: 12, readbackAddressCount: 12,
    mutationCount: recovered ? 0 : 1, mutationAddress: recovered ? null : 'google_cloud_run_v2_job.reader' }
  return {
    workerActionsSha256: digest({ root: 'worker', summary }),
    readbackActionsSha256: digest({ root: 'readback', addressCount: 12, mutationCount: 0 }),
  }
}

function assertEvidenceReceipt(value, kind, operation, now) {
  if (!value || typeof value !== 'object' || !H64.test(value.receiptSha256 ?? '')) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_INVALID')
  const core = { ...value }; delete core.receiptSha256
  const observedAt = Date.parse(value.observedAt ?? '')
  const operationCreatedAt = Date.parse(operation?.createdAt ?? '')
  const checkedAt = Date.parse(now)
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core))) || !H40.test(value.sourceRevision ?? '') ||
      !Number.isFinite(observedAt) || !Number.isFinite(operationCreatedAt) || !Number.isFinite(checkedAt) ||
      observedAt < checkedAt - 7_200_000 || observedAt > operationCreatedAt + 300_000 ||
      observedAt > checkedAt + 300_000) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_INVALID')
  if (kind === 'cleanup') {
    if (value.schemaVersion !== 'aipdm.dev125.openswx-retirement-cleanup-receipt.v1' || value.status !== 'RETIREMENT_COMPLETE' ||
        value.providerState?.schedulerState !== 'PAUSED' || value.providerState?.activeExecutionCount !== 0 ||
        value.databaseState?.remainingActiveRowCount !== 0) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_INVALID')
  } else if (value.schemaVersion !== 'aipdm.dev122.preview-openswx-runtime-readback-receipt.v1' ||
      value.openswxReadbackStatus !== 'DB_AND_APP_ENTRY_CLEAR_PROVIDER_INVENTORY_REQUIRED' ||
      value.databaseReceipt?.state?.openswx?.pendingCount !== 0 || value.databaseReceipt?.state?.openswx?.activeRowCount !== 0 ||
      value.provider?.openswxDispatch?.enabled !== false || value.provider?.revision?.trafficPercent !== 100 ||
      value.businessDataMutation !== false || value.serviceConfigurationMutation !== false) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_INVALID')
  return value
}

export function assertProviderRetirementPrerequisite(value, bytes, ref, kind, { operation, now = new Date().toISOString() } = {}) {
  if (!Buffer.isBuffer(bytes) || sha256(bytes) !== ref.sha256) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_INVALID')
  return assertEvidenceReceipt(value, kind, operation, now)
}

export function buildProviderRetirementClaim({ operation, operationRef, plan, stateBefore, observedAt }) {
  if (!Number.isFinite(Date.parse(observedAt))) fail('DEV125_PROVIDER_RETIREMENT_CLAIM_INVALID')
  const core = { schemaVersion: DEV125_PROVIDER_RETIREMENT_CLAIM_SCHEMA, ownerApplicationId: 'ai-pdm', operationId: operation.operationId,
    sourceRevision: operation.sourceRevision, mode: operation.mode, operationRef, plan, stateBefore, observedAt }
  return assertProviderRetirementClaim({ ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }, { operation, operationRef })
}

export function assertProviderRetirementClaim(value, { operation, operationRef }) {
  const core = { ...value }; delete core.receiptSha256
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'mode', 'operationRef', 'plan', 'stateBefore', 'observedAt', 'receiptSha256']) ||
      value.schemaVersion !== DEV125_PROVIDER_RETIREMENT_CLAIM_SCHEMA || value.ownerApplicationId !== 'ai-pdm' || value.operationId !== operation.operationId ||
      value.sourceRevision !== operation.sourceRevision || value.mode !== operation.mode || canonicalize(value.operationRef) !== canonicalize(operationRef) ||
      !exact(value.plan, ['workerSha256', 'readbackSha256']) || canonicalize(value.plan) !== canonicalize(expectedAuthorizedPlan(operation)) ||
      !exact(value.stateBefore, ['worker', 'readback']) ||
      !stateRecordMatches(value.stateBefore.worker, operation.stateBasis.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker) ||
      !stateRecordMatches(value.stateBefore.readback, operation.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback) ||
      !Number.isFinite(Date.parse(value.observedAt ?? '')) || value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('DEV125_PROVIDER_RETIREMENT_CLAIM_INVALID')
  return value
}

export function buildProviderRetirementReceipt({ operation, operationRef, outputRef, claimRef, plan, stateBefore, stateAfter, providerReadback, observedAt, recovered }) {
  if (!Number.isFinite(Date.parse(observedAt)) || typeof recovered !== 'boolean' || providerReadback?.jobDeletionProtection !== false ||
      providerReadback?.schedulerState !== 'PAUSED' || !Number.isInteger(providerReadback?.executionCount) || providerReadback.executionCount < 0 ||
      providerReadback?.activeExecutionCount !== 0 || !Number.isInteger(providerReadback?.executionPageCount) || providerReadback.executionPageCount < 1) fail('DEV125_PROVIDER_RETIREMENT_RECEIPT_INVALID')
  const core = { schemaVersion: DEV125_PROVIDER_RETIREMENT_RECEIPT_SCHEMA, ownerApplicationId: 'ai-pdm', operationId: operation.operationId,
    sourceRevision: operation.sourceRevision, mode: operation.mode, operationRef, outputRef, claimRef, plan, stateBefore, stateAfter,
    providerReadback: { ...providerReadback, workerAddressCount: 12, readbackAddressCount: 12 },
    observedAt, recovered, status: 'UNPROTECT_COMPLETE' }
  return assertProviderRetirementReceipt({ ...core, receiptSha256: sha256(Buffer.from(canonicalize(core))) }, { operation, operationRef, outputRef })
}

export function assertProviderRetirementReceipt(value, { operation, operationRef, outputRef }) {
  const core = { ...value }; delete core.receiptSha256
  const expectedPlan = expectedExecutedPlan(operation, value?.recovered)
  const expectedClaimUri = outputRef.replace(/\/UNPROTECT\.json$/u, '/claim.json')
  if (!exact(value, ['schemaVersion', 'ownerApplicationId', 'operationId', 'sourceRevision', 'mode', 'operationRef', 'outputRef', 'claimRef', 'plan', 'stateBefore', 'stateAfter', 'providerReadback', 'observedAt', 'recovered', 'status', 'receiptSha256']) ||
      value.schemaVersion !== DEV125_PROVIDER_RETIREMENT_RECEIPT_SCHEMA || value.ownerApplicationId !== 'ai-pdm' || value.operationId !== operation.operationId ||
      value.sourceRevision !== operation.sourceRevision || value.mode !== 'UNPROTECT' || canonicalize(value.operationRef) !== canonicalize(operationRef) ||
      value.outputRef !== outputRef || value.status !== 'UNPROTECT_COMPLETE' || !exact(value.claimRef, ['uri', 'sha256', 'generation']) ||
      value.claimRef.uri !== expectedClaimUri || !H64.test(value.claimRef.sha256 ?? '') || !GENERATION.test(String(value.claimRef.generation ?? '')) ||
      !exact(value.plan, ['workerActionsSha256', 'readbackActionsSha256', 'workerBinarySha256', 'readbackBinarySha256']) ||
      value.plan.workerActionsSha256 !== expectedPlan.workerActionsSha256 || value.plan.readbackActionsSha256 !== expectedPlan.readbackActionsSha256 ||
      !H64.test(value.plan.workerBinarySha256 ?? '') || !H64.test(value.plan.readbackBinarySha256 ?? '') ||
      !exact(value.stateBefore, ['worker', 'readback']) || !exact(value.stateAfter, ['worker', 'readback']) ||
      !stateRecordMatches(value.stateBefore.worker, operation.stateBasis.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker) ||
      !stateRecordMatches(value.stateBefore.readback, operation.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback) ||
      !stateRecordMatches(value.stateAfter.worker, operation.stateBasis.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker, { advanced: true }) ||
      !stateRecordMatches(value.stateAfter.readback, operation.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback) ||
      !exact(value.providerReadback, ['jobDeletionProtection', 'schedulerState', 'executionCount', 'activeExecutionCount', 'executionPageCount', 'workerAddressCount', 'readbackAddressCount']) ||
      value.providerReadback?.jobDeletionProtection !== false ||
      value.providerReadback?.schedulerState !== 'PAUSED' || !Number.isInteger(value.providerReadback?.executionCount) || value.providerReadback.executionCount < 0 ||
      value.providerReadback?.activeExecutionCount !== 0 || !Number.isInteger(value.providerReadback?.executionPageCount) || value.providerReadback.executionPageCount < 1 ||
      value.providerReadback?.workerAddressCount !== 12 || value.providerReadback?.readbackAddressCount !== 12 ||
      typeof value.recovered !== 'boolean' || !Number.isFinite(Date.parse(value.observedAt ?? '')) ||
      value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('DEV125_PROVIDER_RETIREMENT_RECEIPT_INVALID')
  return value
}

export function assertProviderRetirementReplayEvidence({ receipt, claim, claimBytes, claimGeneration,
  workerSnapshot, readbackSnapshot, providerReadback }, { operation, operationRef, outputRef }) {
  const checked = assertProviderRetirementReceipt(receipt, { operation, operationRef, outputRef })
  if (!Buffer.isBuffer(claimBytes) || sha256(claimBytes) !== checked.claimRef.sha256 ||
      String(claimGeneration ?? '') !== checked.claimRef.generation) fail('DEV125_PROVIDER_RETIREMENT_REPLAY_INVALID')
  assertProviderRetirementClaim(claim, { operation, operationRef })
  const snapshots = [
    [workerSnapshot, checked.stateAfter.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker, { allowAdvanced: true }],
    [readbackSnapshot, checked.stateAfter.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback, {}],
  ]
  for (const [snapshot, expected, root, options] of snapshots) {
    if (snapshot?.uri !== root.stateUri || String(snapshot?.generation ?? '') !== expected.generation ||
        !Buffer.isBuffer(snapshot?.bytes) || sha256(snapshot.bytes) !== expected.sha256) fail('DEV125_PROVIDER_RETIREMENT_REPLAY_INVALID')
    const value = assertStateSnapshot(snapshot.value, snapshot.bytes, operation.stateBasis[root.id], root, options)
    if (value.lineage !== expected.lineage || value.serial !== expected.serial ||
        canonicalize([...value.addresses].sort()) !== canonicalize([...expected.addresses].sort())) fail('DEV125_PROVIDER_RETIREMENT_REPLAY_INVALID')
  }
  if (providerReadback?.jobDeletionProtection !== false || providerReadback?.schedulerState !== 'PAUSED' ||
      providerReadback?.activeExecutionCount !== 0) fail('DEV125_PROVIDER_RETIREMENT_REPLAY_INVALID')
  return checked
}
