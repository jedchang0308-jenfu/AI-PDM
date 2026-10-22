#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import {
  RD_PERMISSION_STATE_PGOPTIONS,
  RD_PERMISSION_STATE_RECEIPT_PREFIX,
  RD_PERMISSION_STATE_TARGET,
  assertPermissionStateOperation,
  assertPermissionStateReceipt,
  parsePermissionStateArgs,
} from './lib/dev122-rd-permission-state-readback.mjs'
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
  if (!Array.isArray(argv) || argv.length !== 10 || argv[0] !== '--stage' || argv[1] !== 'readback') fail('RD_PERMISSION_STATE_ARGUMENTS_INVALID')
  const parsed = parsePermissionStateArgs(argv.slice(2))
  return { stage: 'readback', ...parsed }
}

function outputUri(operationSha256) {
  return `gs://${BUCKET}/${RD_PERMISSION_STATE_RECEIPT_PREFIX}/${operationSha256}/state.json`
}

function submissionUri(operationSha256) {
  return `gs://${BUCKET}/${RD_PERMISSION_STATE_RECEIPT_PREFIX}/${operationSha256}/submission.json`
}

export function readbackObjectGeneration(value) {
  const generation = value?.metadata?.generation
  if (!/^[1-9][0-9]*$/u.test(String(generation ?? ''))) fail('RD_PERMISSION_STATE_OBJECT_GENERATION_INVALID')
  return String(generation)
}

export function sourceAuthority(environment, workflowSourceRevision, operationSourceRevision, { gitRunner = null, workflowAncestorRunner = null, operationAncestorRunner = null } = {}) {
  return assertDev122OperationSourceAuthority({ environment, workflowSourceRevision, operationSourceRevision,
    workflowRef: 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main',
    root, code: 'RD_PERMISSION_STATE_SOURCE_AUTHORITY_MISMATCH', gitRunner, workflowAncestorRunner, operationAncestorRunner })
}

export function bindPermissionReadbackSources({ environment, workflowSourceRevision, operation, operationBytes, operationSha256 }, options = {}) {
  assertPermissionStateOperation(operation, { bytes: operationBytes, operationSha256, sourceRevision: operation?.sourceRevision })
  return sourceAuthority(environment, workflowSourceRevision, operation.sourceRevision, options)
}

function operationArgs(operationRef, operationSha256, sourceRevision, outputRef) {
  return ['--permission-operation-ref', operationRef, '--permission-operation-sha256', operationSha256, '--source-revision', sourceRevision, '--permission-output-ref', outputRef]
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
    canonicalize(container.args) === canonicalize(expectedArgs) && env.PDM_SOURCE_REVISION === operation.sourceRevision && env.PGOPTIONS === RD_PERMISSION_STATE_PGOPTIONS
}

function terminal(execution) {
  const completed = (execution?.conditions ?? []).filter(condition => condition?.type === 'Completed')
  return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
}

async function executions(transport) {
  const result = await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}/executions?pageSize=100`)
  if (!Array.isArray(result?.executions)) fail('RD_PERMISSION_STATE_EXECUTIONS_INVALID')
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

// The immutable intent records its original timestamp. A later process must
// compare the operation identity, not replace that timestamp with its own now.
export async function submitPermissionReadbackOnce({ transport, submissionRef, submission, job }) {
  const prior = await optionalJson(transport, submissionRef)
  if (prior) {
    const core = { ...prior.value }; delete core.receiptSha256
    if (typeof core.observedAt !== 'string' || !Number.isFinite(Date.parse(core.observedAt)) ||
        prior.value.receiptSha256 !== sha256(Buffer.from(canonicalize(core))) ||
        canonicalize(core) !== canonicalize({ ...submission, observedAt: core.observedAt })) fail('RD_PERMISSION_STATE_SUBMISSION_INVALID')
    return { resumed: true }
  }
  const sealed = { ...submission, receiptSha256: sha256(Buffer.from(canonicalize(submission))) }
  await transport.putJson(submissionRef, sealed, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  try {
    await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etag: job.etag, overrides: { containerOverrides: [{ name: 'migration', args: submission.args, env: [{ name: 'PGOPTIONS', value: RD_PERMISSION_STATE_PGOPTIONS }] }] } }) })
  } catch (error) {
    if (error?.code !== 'OUTCOME_UNKNOWN') throw error
  }
  // Even an unknown submission outcome flows to provider execution readback;
  // never resubmit a Job merely because the first HTTP response was lost.
  return { resumed: false }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, transport = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const args = parseArgs(argv)
  const ownerTransport = transport ?? createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const operationObject = await ownerTransport.readBytes(args.operationRef, { bucket: BUCKET, prefixes: ['source/rd-permission-readback'], expectedSha256: args.operationSha256 })
  let operation
  try { operation = JSON.parse(operationObject.bytes.toString('utf8')) } catch { fail('RD_PERMISSION_STATE_OPERATION_JSON_INVALID') }
  const sourceBinding = bindPermissionReadbackSources({ environment, workflowSourceRevision: args.sourceRevision, operation,
    operationBytes: operationObject.bytes, operationSha256: args.operationSha256 })
  const generation = readbackObjectGeneration(operationObject)
  const outputRef = outputUri(args.operationSha256)
  if (args.outputRef !== outputRef) fail('RD_PERMISSION_STATE_OUTPUT_REF_INVALID')
  const expectedArgs = operationArgs(args.operationRef, args.operationSha256, operation.sourceRevision, outputRef)
  const existing = await optionalJson(ownerTransport, outputRef)
  if (existing) {
    assertPermissionStateReceipt(existing.value, { operation, operationRef: { uri: args.operationRef, sha256: args.operationSha256, generation }, outputRef })
    return { stage: 'readback', outputRef, outputGeneration: readbackObjectGeneration(existing), outputSha256: sha256(existing.bytes), status: 'PASS', reused: true }
  }
  const job = await ownerTransport.request(`https://run.googleapis.com/v2/${JOB_NAME}`)
  if (!jobMatches(job, operation)) fail('RD_PERMISSION_STATE_JOB_MISMATCH')
  const submission = { schemaVersion: 'aipdm.dev122.rd-permission-state-readback-submission.v1', ownerApplicationId: 'ai-pdm', workflowSourceRevision: sourceBinding.workflowSourceRevision, sourceRevision: operation.sourceRevision, operationRef: { uri: args.operationRef, sha256: args.operationSha256, generation }, outputRef, operationId: operation.operationId, migrationRunnerDigest: operation.migrationRunnerDigest, args: expectedArgs, executionEnvironment: { PGOPTIONS: RD_PERMISSION_STATE_PGOPTIONS }, observedAt: new Date().toISOString(), status: 'SUBMISSION_INTENT' }
  const submissionRef = submissionUri(args.operationSha256)
  await submitPermissionReadbackOnce({ transport: ownerTransport, submissionRef, submission, job })
  let match = null
  const deadline = Date.now() + 20 * 60 * 1000
  while (!match && Date.now() < deadline) {
    const rows = await executions(ownerTransport)
    const found = rows.filter(row => executionMatches(row, expectedArgs, operation))
    if (found.length > 1) fail('RD_PERMISSION_STATE_EXECUTION_CARDINALITY_INVALID')
    if (found.length === 1) match = found[0]
    else await sleep(1000)
  }
  if (!match) fail('RD_PERMISSION_STATE_EXECUTION_NOT_FOUND')
  while (!terminal(match) && Date.now() < deadline) {
    await sleep(1000)
    match = await ownerTransport.request(`https://run.googleapis.com/v2/${match.name}`)
    if (!executionMatches(match, expectedArgs, operation)) fail('RD_PERMISSION_STATE_EXECUTION_MISMATCH')
  }
  if (!terminal(match) || Number(match.failedCount ?? 0) !== 0 || Number(match.succeededCount ?? 0) !== 1) fail('RD_PERMISSION_STATE_EXECUTION_FAILED')
  const native = await optionalJson(ownerTransport, outputRef)
  if (!native) fail('RD_PERMISSION_STATE_RECEIPT_MISSING')
  assertPermissionStateReceipt(native.value, { operation, operationRef: { uri: args.operationRef, sha256: args.operationSha256, generation }, outputRef })
  return { stage: 'readback', outputRef, outputGeneration: readbackObjectGeneration(native), outputSha256: sha256(native.bytes), executionName: match.name, status: 'PASS', reused: false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}

