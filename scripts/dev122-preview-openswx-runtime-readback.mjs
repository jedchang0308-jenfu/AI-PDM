#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import {
  RUNTIME_STATE_PGOPTIONS,
  RUNTIME_STATE_PREFIX,
  RUNTIME_STATE_RECEIPT_PREFIX,
  RUNTIME_STATE_TARGET,
  assertRuntimeDatabaseReceipt,
  assertRuntimeStateOperation,
  assertRuntimeStateReceipt,
  buildRuntimeStateReceipt,
} from './lib/dev122-preview-openswx-runtime-readback.mjs'
import { assertDev122OperationSourceAuthority } from './lib/dev122-source-authority.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
const SERVICE_ACCOUNT = 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com'

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 10 || argv[0] !== '--stage' || argv[1] !== 'readback') fail('RUNTIME_STATE_ARGUMENTS_INVALID')
  const allowed = new Set(['--runtime-operation-ref', '--runtime-operation-sha256', '--source-revision', '--runtime-output-ref'])
  const values = {}
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!allowed.has(key) || typeof value !== 'string' || !value || Object.hasOwn(values, key)) fail('RUNTIME_STATE_ARGUMENTS_INVALID')
    values[key] = value
  }
  if (!/^[a-f0-9]{64}$/u.test(values['--runtime-operation-sha256'] ?? '') || !/^[a-f0-9]{40}$/u.test(values['--source-revision'] ?? '')) fail('RUNTIME_STATE_ARGUMENTS_INVALID')
  return {
    stage: 'readback',
    operationRef: values['--runtime-operation-ref'],
    operationSha256: values['--runtime-operation-sha256'],
    sourceRevision: values['--source-revision'],
    outputRef: values['--runtime-output-ref'],
  }
}

function databaseOutputUri(operationSha256) {
  return `gs://${BUCKET}/${RUNTIME_STATE_RECEIPT_PREFIX}/${operationSha256}/database.json`
}

function outputUri(operationSha256) {
  return `gs://${BUCKET}/${RUNTIME_STATE_RECEIPT_PREFIX}/${operationSha256}/state.json`
}

function submissionUri(operationSha256) {
  return `gs://${BUCKET}/${RUNTIME_STATE_RECEIPT_PREFIX}/${operationSha256}/submission.json`
}

export function objectGeneration(value) {
  const generation = value?.metadata?.generation
  if (!/^[1-9][0-9]*$/u.test(String(generation ?? ''))) fail('RUNTIME_STATE_OBJECT_GENERATION_INVALID')
  return String(generation)
}

export function sourceAuthority(environment, workflowSourceRevision, operationSourceRevision, { gitRunner = null, workflowAncestorRunner = null, operationAncestorRunner = null } = {}) {
  return assertDev122OperationSourceAuthority({ environment, workflowSourceRevision, operationSourceRevision,
    workflowRef: 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main',
    root, code: 'RUNTIME_STATE_SOURCE_AUTHORITY_MISMATCH', gitRunner, workflowAncestorRunner, operationAncestorRunner })
}

function operationArgs(operationRef, operationSha256, sourceRevision, databaseOutputRef) {
  return ['--runtime-operation-ref', operationRef, '--runtime-operation-sha256', operationSha256, '--source-revision', sourceRevision, '--runtime-database-output-ref', databaseOutputRef]
}

export function jobMatches(job, operation) {
  const task = job?.template?.template
  const container = task?.containers?.[0]
  const env = Object.fromEntries((container?.env ?? []).map(row => [row.name, row.value]))
  return job?.name === JOB_NAME && typeof job.etag === 'string' && job.etag && job.template?.taskCount === 1 && job.template?.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.maxRetries === 0 && task?.timeout === '1800s' && task?.containers?.length === 1 &&
    container?.name === 'migration' && container.image === operation.migrationRunnerDigest && env.PDM_SOURCE_REVISION === operation.sourceRevision && !Object.hasOwn(container, 'command')
}

export function executionMatches(execution, expectedArgs, operation) {
  const task = execution?.template
  const container = task?.containers?.[0]
  const env = Object.fromEntries((container?.env ?? []).map(row => [row.name, row.value]))
  return typeof execution?.name === 'string' && execution.name.startsWith(`${JOB_NAME}/executions/`) && execution.taskCount === 1 && execution.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.containers?.length === 1 && container?.name === 'migration' && container.image === operation.migrationRunnerDigest &&
    canonicalize(container.args) === canonicalize(expectedArgs) && env.PDM_SOURCE_REVISION === operation.sourceRevision && env.PGOPTIONS === RUNTIME_STATE_PGOPTIONS
}

function terminal(execution) {
  const completed = (execution?.conditions ?? []).filter(condition => condition?.type === 'Completed')
  return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
}

async function executions(transport) {
  const result = await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}/executions?pageSize=100`)
  if (!Array.isArray(result?.executions)) fail('RUNTIME_STATE_EXECUTIONS_INVALID')
  return result.executions
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

export async function submitRuntimeReadbackOnce({ transport, submissionRef, submission, job }) {
  const prior = await optionalJson(transport, submissionRef)
  if (prior) {
    const core = { ...prior.value }; delete core.receiptSha256
    if (typeof core.observedAt !== 'string' || !Number.isFinite(Date.parse(core.observedAt)) ||
        prior.value.receiptSha256 !== sha256(Buffer.from(canonicalize(core))) ||
        canonicalize(core) !== canonicalize({ ...submission, observedAt: core.observedAt })) fail('RUNTIME_STATE_SUBMISSION_INVALID')
    return { resumed: true }
  }
  const sealed = { ...submission, receiptSha256: sha256(Buffer.from(canonicalize(submission))) }
  await transport.putJson(submissionRef, sealed, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  try {
    await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etag: job.etag, overrides: { containerOverrides: [{ name: 'migration', args: submission.args, env: [{ name: 'PGOPTIONS', value: RUNTIME_STATE_PGOPTIONS }] }] } }) })
  } catch (error) {
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
  }
  return { resumed: false }
}

export async function readProviderRuntimeState(transport, now = () => new Date().toISOString()) {
  const service = await transport.request(`https://run.googleapis.com/v2/${RUNTIME_STATE_TARGET.applicationService}`, { method: 'GET', redirect: 'error' })
  const prefix = `${RUNTIME_STATE_TARGET.applicationService}/revisions/`
  if (service?.name !== RUNTIME_STATE_TARGET.applicationService || typeof service.latestReadyRevision !== 'string' || !service.latestReadyRevision.startsWith(prefix) ||
      !/^[1-9][0-9]*$/u.test(String(service.generation ?? '')) || !Array.isArray(service.trafficStatuses)) fail('RUNTIME_STATE_SERVICE_INVALID')
  const shortRevision = /^ai-pdm-prod-[a-z0-9-]+$/u
  const traffic = service.trafficStatuses.map(row => {
    const revision = typeof row?.revision === 'string' && row.revision.startsWith(prefix)
      ? row.revision
      : shortRevision.test(row?.revision ?? '') ? `${prefix}${row.revision}` : null
    return { revision, percent: row?.percent ?? 0 }
  })
  if (traffic.some(row => !row.revision || !row.revision.startsWith(prefix) || !Number.isInteger(row.percent) || row.percent < 0 || row.percent > 100)) fail('RUNTIME_STATE_SERVICE_INVALID')
  const serving = traffic.filter(row => row.percent > 0)
  if (serving.length !== 1 || serving[0].percent !== 100 || traffic.reduce((total, row) => total + row.percent, 0) !== 100) fail('RUNTIME_STATE_SERVICE_INVALID')
  const revision = await transport.request(`https://run.googleapis.com/v2/${serving[0].revision}`, { method: 'GET', redirect: 'error' })
  const containers = revision?.containers
  const applicationContainers = Array.isArray(containers)
    ? containers.filter(row => row?.name === RUNTIME_STATE_TARGET.applicationContainer)
    : []
  const application = applicationContainers[0]
  if (revision?.name !== serving[0].revision || applicationContainers.length !== 1 ||
      typeof application?.image !== 'string' || !/@sha256:[a-f0-9]{64}$/u.test(application.image)) fail('RUNTIME_STATE_REVISION_INVALID')
  const matches = (application.env ?? []).filter(row => row?.name === 'PDM_OPENSWX_DISPATCH_ENABLED')
  if (matches.length > 1 || (matches[0] && ((matches[0].value !== '0' && matches[0].value !== '1') || Object.hasOwn(matches[0], 'valueSource')))) fail('RUNTIME_STATE_DISPATCH_FLAG_INVALID')
  const value = matches[0]?.value ?? '0'
  return {
    observedAt: now(),
    service: { name: service.name, generation: String(service.generation), latestReadyRevision: service.latestReadyRevision, traffic },
    revision: { name: revision.name, image: application.image, trafficPercent: serving[0].percent,
      sourceRevision: null, sourceRevisionStatus: 'NOT_READ_BY_THIS_DIAGNOSTIC' },
    openswxDispatch: { configured: matches.length === 1, value, enabled: value === '1' },
  }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, transport = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => new Date().toISOString(), sourceAuthorityOptions = {} } = {}) {
  const args = parseArgs(argv)
  const ownerTransport = transport ?? createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const operationObject = await ownerTransport.readBytes(args.operationRef, { bucket: BUCKET, prefixes: [RUNTIME_STATE_PREFIX], expectedSha256: args.operationSha256 })
  let operation
  try { operation = JSON.parse(operationObject.bytes.toString('utf8')) } catch { fail('RUNTIME_STATE_OPERATION_JSON_INVALID') }
  assertRuntimeStateOperation(operation, { bytes: operationObject.bytes, operationSha256: args.operationSha256, sourceRevision: operation?.sourceRevision })
  const sourceBinding = sourceAuthority(environment, args.sourceRevision, operation.sourceRevision, sourceAuthorityOptions)
  const generation = objectGeneration(operationObject)
  const operationRef = { uri: args.operationRef, sha256: args.operationSha256, generation }
  const finalOutputRef = outputUri(args.operationSha256)
  if (args.outputRef !== finalOutputRef) fail('RUNTIME_STATE_OUTPUT_REF_INVALID')
  const priorFinal = await optionalJson(ownerTransport, finalOutputRef)
  if (priorFinal) {
    assertRuntimeStateReceipt(priorFinal.value, { operation, operationRef, outputRef: finalOutputRef })
    return { stage: 'readback', outputRef: finalOutputRef, outputGeneration: objectGeneration(priorFinal), outputSha256: sha256(priorFinal.bytes), status: priorFinal.value.diagnosticStatus, reused: true }
  }
  const databaseOutputRef = databaseOutputUri(args.operationSha256)
  const expectedArgs = operationArgs(args.operationRef, args.operationSha256, operation.sourceRevision, databaseOutputRef)
  const job = await ownerTransport.request(`https://run.googleapis.com/v2/${JOB_NAME}`)
  if (!jobMatches(job, operation)) fail('RUNTIME_STATE_JOB_MISMATCH')
  const submission = { schemaVersion: 'aipdm.dev122.preview-openswx-runtime-readback-submission.v1', ownerApplicationId: 'ai-pdm',
    workflowSourceRevision: sourceBinding.workflowSourceRevision, sourceRevision: operation.sourceRevision, operationRef, outputRef: finalOutputRef,
    databaseOutputRef, operationId: operation.operationId, migrationRunnerDigest: operation.migrationRunnerDigest, args: expectedArgs,
    executionEnvironment: { PGOPTIONS: RUNTIME_STATE_PGOPTIONS }, observedAt: now(), status: 'SUBMISSION_INTENT' }
  await submitRuntimeReadbackOnce({ transport: ownerTransport, submissionRef: submissionUri(args.operationSha256), submission, job })
  let match = null
  const deadline = Date.now() + 20 * 60 * 1000
  while (!match && Date.now() < deadline) {
    const found = (await executions(ownerTransport)).filter(row => executionMatches(row, expectedArgs, operation))
    if (found.length > 1) fail('RUNTIME_STATE_EXECUTION_CARDINALITY_INVALID')
    if (found.length === 1) match = found[0]
    else await sleep(1000)
  }
  if (!match) fail('RUNTIME_STATE_EXECUTION_NOT_FOUND')
  while (!terminal(match) && Date.now() < deadline) {
    await sleep(1000)
    match = await ownerTransport.request(`https://run.googleapis.com/v2/${match.name}`)
    if (!executionMatches(match, expectedArgs, operation)) fail('RUNTIME_STATE_EXECUTION_MISMATCH')
  }
  if (!terminal(match) || Number(match.failedCount ?? 0) !== 0 || Number(match.succeededCount ?? 0) !== 1) fail('RUNTIME_STATE_EXECUTION_FAILED')
  const databaseObject = await optionalJson(ownerTransport, databaseOutputRef)
  if (!databaseObject) fail('RUNTIME_STATE_DATABASE_RECEIPT_MISSING')
  const databaseReceipt = assertRuntimeDatabaseReceipt(databaseObject.value, { operation, operationRef, outputRef: databaseOutputRef })
  const provider = await readProviderRuntimeState(ownerTransport, now)
  const receipt = buildRuntimeStateReceipt({ operation, operationRef, outputRef: finalOutputRef, databaseReceipt, provider, observedAt: now() })
  try {
    await ownerTransport.putJson(finalOutputRef, receipt, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  } catch (error) {
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
  }
  const finalObject = await optionalJson(ownerTransport, finalOutputRef)
  if (!finalObject) fail('RUNTIME_STATE_RECEIPT_MISSING')
  assertRuntimeStateReceipt(finalObject.value, { operation, operationRef, outputRef: finalOutputRef })
  return { stage: 'readback', outputRef: finalOutputRef, outputGeneration: objectGeneration(finalObject), outputSha256: sha256(finalObject.bytes), executionName: match.name, openswxReadbackStatus: finalObject.value.openswxReadbackStatus, status: finalObject.value.diagnosticStatus, reused: false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
