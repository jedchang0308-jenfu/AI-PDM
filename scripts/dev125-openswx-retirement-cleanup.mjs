#!/usr/bin/env node

import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import { RUNTIME_STATE_RECEIPT_SCHEMA } from './lib/dev122-preview-openswx-runtime-readback.mjs'
import { assertDev122OperationSourceAuthority } from './lib/dev122-source-authority.mjs'
import {
  DEV125_CLEANUP_PGOPTIONS,
  DEV125_CLEANUP_PREFIX,
  DEV125_CLEANUP_RECEIPT_PREFIX,
  assertCleanupProviderState,
  assertCleanupOperation,
  assertCleanupReceipt,
} from './lib/dev125-openswx-retirement-cleanup.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
const RETIRED_JOB = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata'
const SCHEDULER = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch'
const SERVICE_ACCOUNT = 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com'
const WORKFLOW_REF = 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main'

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

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 10 || argv[0] !== '--stage' || argv[1] !== 'cleanup') fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
  const allowed = new Set(['--operation-ref', '--operation-sha256', '--source-revision', '--output-ref'])
  const values = {}
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!/^[a-f0-9]{64}$/u.test(values['--operation-sha256'] ?? '') || !/^[a-f0-9]{40}$/u.test(values['--source-revision'] ?? '')) fail('DEV125_CLEANUP_ARGUMENTS_INVALID')
  return { stage: 'cleanup', operationRef: values['--operation-ref'], operationSha256: values['--operation-sha256'],
    sourceRevision: values['--source-revision'], outputRef: values['--output-ref'] }
}

function outputUri(operationSha256) {
  return `gs://${BUCKET}/${DEV125_CLEANUP_RECEIPT_PREFIX}/${operationSha256}/cleanup.json`
}

function submissionUri(operationSha256) {
  return `gs://${BUCKET}/${DEV125_CLEANUP_RECEIPT_PREFIX}/${operationSha256}/submission.json`
}

export function objectGeneration(value) {
  const generation = value?.metadata?.generation
  if (!/^[1-9][0-9]*$/u.test(String(generation ?? ''))) fail('DEV125_CLEANUP_OBJECT_GENERATION_INVALID')
  return String(generation)
}

function terminal(execution) {
  const completed = (execution?.conditions ?? []).filter(row => row?.type === 'Completed')
  return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
}

export function summarizeProviderState(scheduler, retiredJob, executionPage, now = () => new Date().toISOString()) {
  if (scheduler?.name !== SCHEDULER || scheduler.state !== 'PAUSED') fail('DEV125_CLEANUP_SCHEDULER_NOT_PAUSED')
  if (retiredJob?.name !== RETIRED_JOB || executionPage?.nextPageToken || !Array.isArray(executionPage?.executions)) fail('DEV125_CLEANUP_PROVIDER_INVENTORY_INVALID')
  const active = executionPage.executions.filter(row => !terminal(row))
  if (active.length) fail('DEV125_CLEANUP_EXECUTIONS_ACTIVE')
  return assertCleanupProviderState({
    observedAt: now(),
    schedulerName: scheduler.name,
    schedulerState: scheduler.state,
    retiredJobName: retiredJob.name,
    executionCount: executionPage.executions.length,
    activeExecutionCount: 0,
    terminalSucceededCount: executionPage.executions.filter(row => Number(row.succeededCount ?? 0) > 0).length,
    terminalFailedCount: executionPage.executions.filter(row => Number(row.failedCount ?? 0) > 0).length,
  })
}

export function assertRuntimeReadback(value, operation) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.schemaVersion !== RUNTIME_STATE_RECEIPT_SCHEMA ||
      value.sourceRevision !== operation.sourceRevision || value.outputRef !== operation.basis.runtimeReadbackRef ||
      value.businessDataMutation !== false || value.serviceConfigurationMutation !== false ||
      value.provider?.openswxDispatch?.enabled !== false || value.databaseReceipt?.state?.openswx?.activeRowsTruncated !== false ||
      value.databaseReceipt.state.openswx.pendingCount !== operation.basis.pendingCount ||
      value.databaseReceipt.state.openswx.activeRowsSha256 !== operation.basis.activeRowsSha256 ||
      !Array.isArray(value.databaseReceipt.state.openswx.activeRows) ||
      value.databaseReceipt.state.openswx.activeRows.length !== operation.basis.pendingCount ||
      hashValue(value.databaseReceipt.state.openswx.activeRows) !== operation.basis.activeRowsSha256) fail('DEV125_CLEANUP_RUNTIME_READBACK_INVALID')
  const core = { ...value }; delete core.receiptSha256
  if (value.receiptSha256 !== sha256(Buffer.from(canonicalize(core)))) fail('DEV125_CLEANUP_RUNTIME_READBACK_INVALID')
  return value
}

export function jobMatches(job, operation) {
  const task = job?.template?.template
  const container = task?.containers?.[0]
  const env = Object.fromEntries((container?.env ?? []).map(row => [row.name, row.value]))
  return job?.name === JOB_NAME && typeof job.etag === 'string' && job.etag && job.template?.taskCount === 1 && job.template?.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.maxRetries === 0 && task?.timeout === '1800s' && task?.containers?.length === 1 &&
    container?.name === 'migration' && container.image === operation.migrationRunnerDigest && env.PDM_SOURCE_REVISION === operation.sourceRevision && !Object.hasOwn(container, 'command')
}

export function executionMatches(execution, expectedArgs, providerStateBase64, operation) {
  const task = execution?.template
  const container = task?.containers?.[0]
  const env = Object.fromEntries((container?.env ?? []).map(row => [row.name, row.value]))
  return typeof execution?.name === 'string' && execution.name.startsWith(`${JOB_NAME}/executions/`) && execution.taskCount === 1 && execution.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.containers?.length === 1 && container?.name === 'migration' && container.image === operation.migrationRunnerDigest &&
    canonicalize(container.args) === canonicalize(expectedArgs) && env.PDM_SOURCE_REVISION === operation.sourceRevision && env.PGOPTIONS === DEV125_CLEANUP_PGOPTIONS &&
    env.DEV125_OPENSWX_PROVIDER_STATE_BASE64 === providerStateBase64
}

export async function listMigrationExecutions(transport) {
  const base = `https://run.googleapis.com/v2/${JOB_NAME}/executions?pageSize=100`
  const executions = []
  const names = new Set()
  const tokens = new Set()
  let pageToken = null
  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    const url = pageToken === null ? base : `${base}&pageToken=${encodeURIComponent(pageToken)}`
    const page = await transport.request(url)
    if (!Array.isArray(page?.executions)) fail('DEV125_CLEANUP_EXECUTIONS_INVALID')
    for (const execution of page.executions) {
      if (typeof execution?.name !== 'string' || !execution.name || names.has(execution.name)) fail('DEV125_CLEANUP_EXECUTIONS_INVALID')
      names.add(execution.name)
      executions.push(execution)
    }
    if (page.nextPageToken == null || page.nextPageToken === '') return executions
    if (typeof page.nextPageToken !== 'string' || page.nextPageToken.length > 4096 || tokens.has(page.nextPageToken)) fail('DEV125_CLEANUP_EXECUTIONS_INVALID')
    tokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
  fail('DEV125_CLEANUP_EXECUTIONS_TRUNCATED')
}

async function optionalJson(transport, uri) {
  try {
    const row = await transport.readBytes(uri, { prefixes: ['receipts'] })
    return { ...row, value: JSON.parse(row.bytes.toString('utf8')) }
  } catch (error) {
    if (error?.code === 'MISSING') return null
    throw error
  }
}

export async function submitCleanupOnce({ transport, submissionRef, submission, job, providerStateBase64 }) {
  const prior = await optionalJson(transport, submissionRef)
  if (prior) {
    const core = { ...prior.value }; delete core.receiptSha256
    if (typeof core.observedAt !== 'string' || !Number.isFinite(Date.parse(core.observedAt)) ||
        !/^[a-f0-9]{40}$/u.test(core.workflowSourceRevision ?? '') ||
        prior.value.receiptSha256 !== sha256(Buffer.from(canonicalize(core))) ||
        canonicalize(core) !== canonicalize({ ...submission, workflowSourceRevision: core.workflowSourceRevision,
          observedAt: core.observedAt })) fail('DEV125_CLEANUP_SUBMISSION_INVALID')
    return { resumed: true }
  }
  const sealed = { ...submission, receiptSha256: sha256(Buffer.from(canonicalize(submission))) }
  await transport.putJson(submissionRef, sealed, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  try {
    await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      etag: job.etag,
      overrides: { containerOverrides: [{ name: 'migration', args: submission.args, env: [
        { name: 'PGOPTIONS', value: DEV125_CLEANUP_PGOPTIONS },
        { name: 'DEV125_OPENSWX_PROVIDER_STATE_BASE64', value: providerStateBase64 },
      ] }] },
    }) })
  } catch (error) {
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
  }
  return { resumed: false }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, transport = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => new Date().toISOString(), sourceAuthorityOptions = {} } = {}) {
  const args = parseArgs(argv)
  const ownerTransport = transport ?? createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const operationObject = await ownerTransport.readBytes(args.operationRef, { bucket: BUCKET, prefixes: [DEV125_CLEANUP_PREFIX], expectedSha256: args.operationSha256 })
  let operation
  try { operation = JSON.parse(operationObject.bytes.toString('utf8')) } catch { fail('DEV125_CLEANUP_OPERATION_JSON_INVALID') }
  assertCleanupOperation(operation, { bytes: operationObject.bytes, operationSha256: args.operationSha256, sourceRevision: operation?.sourceRevision })
  const sourceBinding = assertDev122OperationSourceAuthority({ environment, workflowSourceRevision: args.sourceRevision, operationSourceRevision: operation.sourceRevision,
    workflowRef: WORKFLOW_REF, root, code: 'DEV125_CLEANUP_SOURCE_AUTHORITY_MISMATCH', ...sourceAuthorityOptions })
  const operationRef = { uri: args.operationRef, sha256: args.operationSha256, generation: objectGeneration(operationObject) }
  const finalOutputRef = outputUri(args.operationSha256)
  if (args.outputRef !== finalOutputRef) fail('DEV125_CLEANUP_OUTPUT_REF_INVALID')
  const priorFinal = await optionalJson(ownerTransport, finalOutputRef)
  if (priorFinal) {
    assertCleanupReceipt(priorFinal.value, { operation, operationRef, outputRef: finalOutputRef })
    return { status: 'PASS', reused: true, outputRef: finalOutputRef, outputGeneration: objectGeneration(priorFinal), outputSha256: sha256(priorFinal.bytes) }
  }
  const readback = await ownerTransport.readBytes(operation.basis.runtimeReadbackRef, { prefixes: ['receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME'], expectedSha256: operation.basis.runtimeReadbackSha256 })
  if (sha256(readback.bytes) !== operation.basis.runtimeReadbackSha256) fail('DEV125_CLEANUP_RUNTIME_READBACK_HASH_MISMATCH')
  let readbackValue
  try { readbackValue = JSON.parse(readback.bytes.toString('utf8')) } catch { fail('DEV125_CLEANUP_RUNTIME_READBACK_INVALID') }
  assertRuntimeReadback(readbackValue, operation)

  const scheduler = await ownerTransport.request(`https://cloudscheduler.googleapis.com/v1/${SCHEDULER}`)
  const retiredJob = await ownerTransport.request(`https://run.googleapis.com/v2/${RETIRED_JOB}`)
  const executionPage = await ownerTransport.request(`https://run.googleapis.com/v2/${RETIRED_JOB}/executions?pageSize=100`)
  const providerState = summarizeProviderState(scheduler, retiredJob, executionPage, now)
  const providerStateBase64 = Buffer.from(canonicalize(providerState)).toString('base64')
  const job = await ownerTransport.request(`https://run.googleapis.com/v2/${JOB_NAME}`)
  if (!jobMatches(job, operation)) fail('DEV125_CLEANUP_JOB_MISMATCH')
  const expectedArgs = ['--dev125-openswx-retirement-operation-ref', args.operationRef, '--operation-sha256', args.operationSha256,
    '--source-revision', operation.sourceRevision, '--output-ref', finalOutputRef]
  const submission = { schemaVersion: 'aipdm.dev125.openswx-retirement-cleanup-submission.v1', ownerApplicationId: 'ai-pdm',
    workflowSourceRevision: sourceBinding.workflowSourceRevision, sourceRevision: operation.sourceRevision, operationRef, outputRef: finalOutputRef,
    operationId: operation.operationId, migrationRunnerDigest: operation.migrationRunnerDigest, args: expectedArgs, providerState,
    executionEnvironment: { PGOPTIONS: DEV125_CLEANUP_PGOPTIONS }, observedAt: now(), status: 'SUBMISSION_INTENT' }
  await submitCleanupOnce({ transport: ownerTransport, submissionRef: submissionUri(args.operationSha256), submission, job, providerStateBase64 })
  let match = null
  const deadline = Date.now() + 20 * 60 * 1000
  while (!match && Date.now() < deadline) {
    const found = (await listMigrationExecutions(ownerTransport)).filter(row => executionMatches(row, expectedArgs, providerStateBase64, operation))
    if (found.length > 1) fail('DEV125_CLEANUP_EXECUTION_CARDINALITY_INVALID')
    if (found.length === 1) match = found[0]
    else await sleep(1000)
  }
  if (!match) fail('DEV125_CLEANUP_EXECUTION_NOT_FOUND')
  while (!terminal(match) && Date.now() < deadline) {
    await sleep(1000)
    match = await ownerTransport.request(`https://run.googleapis.com/v2/${match.name}`)
    if (!executionMatches(match, expectedArgs, providerStateBase64, operation)) fail('DEV125_CLEANUP_EXECUTION_MISMATCH')
  }
  if (!terminal(match) || Number(match.failedCount ?? 0) !== 0 || Number(match.succeededCount ?? 0) !== 1) fail('DEV125_CLEANUP_EXECUTION_FAILED')
  const output = await optionalJson(ownerTransport, finalOutputRef)
  if (!output) fail('DEV125_CLEANUP_RECEIPT_MISSING')
  assertCleanupReceipt(output.value, { operation, operationRef, outputRef: finalOutputRef })
  return { status: 'PASS', reused: false, outputRef: finalOutputRef, outputGeneration: objectGeneration(output), outputSha256: sha256(output.bytes), executionName: match.name }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
