#!/usr/bin/env node

import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { canonicalize, sha256 } from './lib/dev012-production-migration-runner.mjs'
import {
  OPENSWX_DISPATCH_RECOVERY_PREFIX,
  OPENSWX_DISPATCH_RECOVERY_RECEIPT_PREFIX,
  assertOpenSwxDispatchProviderReadback,
  assertOpenSwxDispatchRecoveryOperation,
  assertOpenSwxDispatchRecoveryReceipt,
  parseOpenSwxDispatchRecoveryArgs,
} from './lib/dev122-openswx-dispatch-recovery.mjs'
import { assertDev122GitSourceAuthority } from './lib/dev122-source-authority.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BUCKET = 'jenfu-platform-prod-aipdm-release'
const JOB_NAME = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-migration-runner'
const SERVICE_ACCOUNT = 'aipdm-prod-migrator@jenfu-platform-prod.iam.gserviceaccount.com'

function fail(code) { const error = new Error(code); error.code = code; throw error }

export function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 10 || argv[0] !== '--stage' || argv[1] !== 'recovery') fail('OPENSWX_DISPATCH_RECOVERY_ARGUMENTS_INVALID')
  return { stage: 'recovery', ...parseOpenSwxDispatchRecoveryArgs(argv.slice(2)) }
}

function outputUri(operationSha256) { return `gs://${BUCKET}/${OPENSWX_DISPATCH_RECOVERY_RECEIPT_PREFIX}/${operationSha256}/recovery.json` }
function submissionUri(operationSha256) { return `gs://${BUCKET}/${OPENSWX_DISPATCH_RECOVERY_RECEIPT_PREFIX}/${operationSha256}/submission.json` }
function generation(value) { const result = value?.metadata?.generation; if (!/^[1-9][0-9]*$/u.test(String(result ?? ''))) fail('OPENSWX_DISPATCH_RECOVERY_OBJECT_GENERATION_INVALID'); return String(result) }

function sourceAuthority(environment, sourceRevision) {
  assertDev122GitSourceAuthority({ environment, sourceRevision, workflowRef: 'jedchang0308-jenfu/AI-PDM/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/main', root, code: 'OPENSWX_DISPATCH_RECOVERY_SOURCE_AUTHORITY_MISMATCH' })
}

function operationArgs(operationRef, operationSha256, sourceRevision, outputRef) {
  return ['--openswx-dispatch-recovery-operation-ref', operationRef, '--openswx-dispatch-recovery-operation-sha256', operationSha256, '--source-revision', sourceRevision, '--openswx-dispatch-recovery-output-ref', outputRef]
}

function jobMatches(job, operation) {
  const task = job?.template?.template, container = task?.containers?.[0]
  return job?.name === JOB_NAME && typeof job.etag === 'string' && job.etag && job.template?.taskCount === 1 && job.template?.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.maxRetries === 0 && task?.timeout === '1800s' && task?.containers?.length === 1 &&
    container?.name === 'migration' && container.image === operation.migrationRunnerDigest && !Object.hasOwn(container, 'command')
}

function executionMatches(execution, expectedArgs, operation) {
  const task = execution?.template, container = task?.containers?.[0]
  return typeof execution?.name === 'string' && execution.name.startsWith(`${JOB_NAME}/executions/`) && execution.taskCount === 1 && execution.parallelism === 1 &&
    task?.serviceAccount === SERVICE_ACCOUNT && task?.containers?.length === 1 && container?.name === 'migration' && container.image === operation.migrationRunnerDigest &&
    canonicalize(container.args) === canonicalize(expectedArgs)
}

function terminal(execution) { const completed = (execution?.conditions ?? []).filter(row => row?.type === 'Completed'); return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state) }
async function optionalJson(transport, uri) { try { const row = await transport.readBytes(uri, { prefixes: ['receipts'] }); return { ...row, value: JSON.parse(row.bytes.toString('utf8')) } } catch (error) { if (error?.code === 'MISSING') return null; throw error } }

async function submitOnce({ transport, submissionRef, submission, job }) {
  const prior = await optionalJson(transport, submissionRef)
  if (prior) {
    const core = { ...prior.value }; delete core.receiptSha256
    if (prior.value.receiptSha256 !== sha256(Buffer.from(canonicalize(core))) || canonicalize(core) !== canonicalize(submission)) fail('OPENSWX_DISPATCH_RECOVERY_SUBMISSION_INVALID')
    return { resumed: true }
  }
  await transport.putJson(submissionRef, { ...submission, receiptSha256: sha256(Buffer.from(canonicalize(submission))) }, { bucket: BUCKET, prefix: 'receipts', ifGenerationMatch: '0' })
  try {
    await transport.request(`https://run.googleapis.com/v2/${JOB_NAME}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etag: job.etag, overrides: { containerOverrides: [{ name: 'migration', args: submission.args }] } }) })
  } catch (error) { if (error?.code !== 'OUTCOME_UNKNOWN') throw error }
  return { resumed: false }
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, transport = null, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const args = parseArgs(argv), ownerTransport = transport ?? createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const object = await ownerTransport.readBytes(args.operationRef, { bucket: BUCKET, prefixes: [OPENSWX_DISPATCH_RECOVERY_PREFIX], expectedSha256: args.operationSha256 })
  let operation
  try { operation = JSON.parse(object.bytes.toString('utf8')) } catch { fail('OPENSWX_DISPATCH_RECOVERY_OPERATION_JSON_INVALID') }
  assertOpenSwxDispatchRecoveryOperation(operation, { bytes: object.bytes, operationSha256: args.operationSha256, sourceRevision: args.sourceRevision })
  sourceAuthority(environment, operation.sourceRevision)
  const operationRef = { uri: args.operationRef, sha256: args.operationSha256, generation: generation(object) }, outputRef = outputUri(args.operationSha256)
  if (args.outputRef !== outputRef) fail('OPENSWX_DISPATCH_RECOVERY_OUTPUT_REF_INVALID')
  const existing = await optionalJson(ownerTransport, outputRef)
  if (existing) {
    assertOpenSwxDispatchRecoveryReceipt(existing.value, { operation, operationRef, outputRef })
    return { stage: 'recovery', outputRef, outputGeneration: generation(existing), outputSha256: sha256(existing.bytes), status: 'PASS', reused: true }
  }
  const providerOperation = await ownerTransport.request(`https://run.googleapis.com/v2/${operation.provider.operationName}`)
  const providerExecution = await ownerTransport.request(`https://run.googleapis.com/v2/${operation.provider.executionName}`)
  const provider = assertOpenSwxDispatchProviderReadback(operation, providerOperation, providerExecution)
  const job = await ownerTransport.request(`https://run.googleapis.com/v2/${JOB_NAME}`)
  if (!jobMatches(job, operation)) fail('OPENSWX_DISPATCH_RECOVERY_JOB_MISMATCH')
  const expectedArgs = operationArgs(args.operationRef, args.operationSha256, operation.sourceRevision, outputRef)
  const submission = { schemaVersion: 'aipdm.dev122.openswx-dispatch-recovery-submission.v1', ownerApplicationId: 'ai-pdm', sourceRevision: operation.sourceRevision, operationId: operation.operationId, operationRef, outputRef, migrationRunnerDigest: operation.migrationRunnerDigest, providerReadbackSha256: sha256(Buffer.from(canonicalize(provider))), args: expectedArgs, status: 'SUBMISSION_INTENT' }
  await submitOnce({ transport: ownerTransport, submissionRef: submissionUri(args.operationSha256), submission, job })
  let match = null
  const deadline = Date.now() + 20 * 60 * 1000
  while (!match && Date.now() < deadline) {
    const result = await ownerTransport.request(`https://run.googleapis.com/v2/${JOB_NAME}/executions?pageSize=100`)
    if (!Array.isArray(result?.executions)) fail('OPENSWX_DISPATCH_RECOVERY_EXECUTIONS_INVALID')
    const found = result.executions.filter(row => executionMatches(row, expectedArgs, operation))
    if (found.length > 1) fail('OPENSWX_DISPATCH_RECOVERY_EXECUTION_CARDINALITY_INVALID')
    if (found.length === 1) match = found[0]; else await sleep(1000)
  }
  if (!match) fail('OPENSWX_DISPATCH_RECOVERY_EXECUTION_NOT_FOUND')
  while (!terminal(match) && Date.now() < deadline) {
    await sleep(1000); match = await ownerTransport.request(`https://run.googleapis.com/v2/${match.name}`)
    if (!executionMatches(match, expectedArgs, operation)) fail('OPENSWX_DISPATCH_RECOVERY_EXECUTION_MISMATCH')
  }
  if (!terminal(match) || Number(match.failedCount ?? 0) !== 0 || Number(match.succeededCount ?? 0) !== 1) fail('OPENSWX_DISPATCH_RECOVERY_EXECUTION_FAILED')
  const native = await optionalJson(ownerTransport, outputRef)
  if (!native) fail('OPENSWX_DISPATCH_RECOVERY_RECEIPT_MISSING')
  assertOpenSwxDispatchRecoveryReceipt(native.value, { operation, operationRef, outputRef })
  return { stage: 'recovery', outputRef, outputGeneration: generation(native), outputSha256: sha256(native.bytes), executionName: match.name, status: 'PASS', reused: false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMain().then(value => process.stdout.write(`${JSON.stringify(value)}\n`)).catch(error => { process.stderr.write(`${error.code || error.message}\n`); process.exitCode = 1 })
}
