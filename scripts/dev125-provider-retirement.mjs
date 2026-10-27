#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  canonicalize,
  publishGcsJson,
  readGcsObject,
  sha256,
} from './lib/dev012-production-migration-runner.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import {
  DEV125_PROVIDER_RETIREMENT_OPERATION_PREFIX,
  DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX,
  DEV125_PROVIDER_RETIREMENT_ROOTS,
  assertProviderRetirementClaim,
  assertProviderRetirementOperation,
  assertProviderRetirementPrerequisite,
  assertProviderRetirementReplayEvidence,
  assertProviderRetirementReceipt,
  assertStateSnapshot,
  assertUnprotectPlans,
  buildProviderRetirementClaim,
  buildProviderRetirementReceipt,
  schedulerPaused,
  workerDeletionProtection,
} from './lib/dev125-provider-retirement.mjs'

const RELEASE_BUCKET = 'jenfu-platform-prod-aipdm-release'
const STATE_BUCKET = 'tfstate-jenfu-platform-prod'
const H40 = /^[a-f0-9]{40}$/u
const H64 = /^[a-f0-9]{64}$/u
const RETIRED_JOB = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/ai-pdm-prod-openswx-metadata'
const RETIRED_SCHEDULER = 'projects/jenfu-platform-prod/locations/asia-east1/jobs/aipdm-prod-openswx-dispatch'

function fail(code) {
  const error = new Error(code)
  error.code = code
  throw error
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.length !== 10) fail('DEV125_PROVIDER_RETIREMENT_ARGUMENTS_INVALID')
  const allowed = new Set(['--stage', '--operation-ref', '--operation-sha256', '--source-revision', '--output-ref'])
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!allowed.has(key) || !argv[index + 1] || Object.hasOwn(values, key)) fail('DEV125_PROVIDER_RETIREMENT_ARGUMENTS_INVALID')
    values[key] = argv[index + 1]
  }
  if (values['--stage'] !== 'unprotect' || !H64.test(values['--operation-sha256'] ?? '') || !H40.test(values['--source-revision'] ?? '') ||
      !/^gs:\/\/jenfu-platform-prod-aipdm-release\/source\/openswx-dispatch-recovery\/dev125-provider-retirement\/[A-Za-z0-9._/-]+\.json$/u.test(values['--operation-ref'] ?? '') ||
      values['--operation-ref'].includes('..') ||
      values['--output-ref'] !== `gs://${RELEASE_BUCKET}/${DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX}/${values['--operation-sha256']}/UNPROTECT.json`) fail('DEV125_PROVIDER_RETIREMENT_ARGUMENTS_INVALID')
  return {
    operationRef: values['--operation-ref'],
    operationSha256: values['--operation-sha256'],
    sourceRevision: values['--source-revision'],
    outputRef: values['--output-ref'],
  }
}

export function bindOperationRef(value) {
  const match = /^gs:\/\/jenfu-platform-prod-aipdm-release\/(source\/openswx-dispatch-recovery\/dev125-provider-retirement\/[A-Za-z0-9][A-Za-z0-9._/-]*\.json)#sha256=([a-f0-9]{64})$/u.exec(value ?? '')
  if (!match || match[1].split('/').some((segment) => ['', '.', '..'].includes(segment))) fail('DEV125_PROVIDER_RETIREMENT_REF_INVALID')
  return { operationUri: `gs://${RELEASE_BUCKET}/${match[1]}`, operationSha256: match[2] }
}

function json(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')) } catch { fail(code) }
}

async function optionalObject(options) {
  try { return await readGcsObject(options) } catch (error) {
    if (error?.message === 'MIGRATION_GCS_METADATA_FAILED:404') return null
    throw error
  }
}

function terraform(cwd, args, environment) {
  const result = spawnSync('terraform', args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  if (result.status !== 0) fail(`DEV125_PROVIDER_RETIREMENT_TERRAFORM_${String(args[0]).toUpperCase()}_FAILED`)
  return result.stdout
}

function sanitizedTerraformEnvironment(environment) {
  const result = {}
  for (const [name, value] of Object.entries(environment)) {
    const upper = name.toUpperCase()
    if (upper.startsWith('TF_') || upper.startsWith('TERRAFORM_') || upper.startsWith('GOOGLE_')) continue
    result[name] = value
  }
  result.GOOGLE_OAUTH_ACCESS_TOKEN = environment.GOOGLE_OAUTH_ACCESS_TOKEN
  result.TF_IN_AUTOMATION = '1'
  result.TF_INPUT = '0'
  result.TF_WORKSPACE = 'default'
  return result
}

function assertTerraformBackend(cwd, root, environment) {
  const metadataPath = path.join(cwd, '.terraform', 'terraform.tfstate')
  let metadata
  try { metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) } catch { fail('DEV125_PROVIDER_RETIREMENT_BACKEND_INVALID') }
  const expectedPrefix = root.id === 'worker' ? 'dev-122/openswx-worker' : 'dev-122/openswx-release-readback'
  if (metadata?.backend?.type !== 'gcs' || metadata.backend.config?.bucket !== STATE_BUCKET ||
      metadata.backend.config?.prefix !== expectedPrefix || terraform(cwd, ['workspace', 'show'], environment).trim() !== 'default') {
    fail('DEV125_PROVIDER_RETIREMENT_BACKEND_INVALID')
  }
}

function stateRecord(object, value) {
  return {
    uri: object.uri,
    generation: object.generation,
    sha256: sha256(object.bytes),
    lineage: value.lineage,
    serial: value.serial,
    addresses: value.addresses,
  }
}

function basisRecord(value) {
  return { uri: value.uri, generation: value.generation, sha256: value.sha256, lineage: value.lineage, serial: value.serial, addresses: value.addresses }
}

async function readState(root, token, expectedGeneration = null) {
  const object = await readGcsObject({
    uri: root.stateUri,
    expectedBucket: STATE_BUCKET,
    expectedPrefix: root.id === 'worker' ? 'dev-122/openswx-worker' : 'dev-122/openswx-release-readback',
    expectedGeneration,
    token,
  })
  return { ...object, uri: root.stateUri, value: json(object.bytes, 'DEV125_PROVIDER_RETIREMENT_STATE_JSON_INVALID') }
}

function planRoot({ root, tempRoot, operation, environment }) {
  const cwd = path.join(tempRoot, root.id)
  fs.cpSync(path.resolve(root.directory), cwd, { recursive: true })
  terraform(cwd, ['init', '-input=false', '-no-color', '-reconfigure'], environment)
  assertTerraformBackend(cwd, root, environment)
  const planName = `${root.id}.tfplan`
  const args = ['plan', '-input=false', '-no-color', '-lock-timeout=30s', `-out=${planName}`]
  if (root.id === 'worker') args.push(`-var=worker_image=${operation.workerImage}`)
  terraform(cwd, args, environment)
  const plan = json(Buffer.from(terraform(cwd, ['show', '-json', planName], environment)), 'DEV125_PROVIDER_RETIREMENT_PLAN_JSON_INVALID')
  const bytes = fs.readFileSync(path.join(cwd, planName))
  return { cwd, planName, plan, binarySha256: sha256(bytes) }
}

function actionDigest(summary) {
  return sha256(Buffer.from(canonicalize(summary)))
}

function assertPrerequisiteRef(object, ref) {
  if (object.generation !== ref.generation || sha256(object.bytes) !== ref.sha256) fail('DEV125_PROVIDER_RETIREMENT_PREREQUISITE_REF_INVALID')
}

function terminalExecution(value) {
  const completed = (value?.conditions ?? []).filter((row) => row?.type === 'Completed')
  return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
}

export async function readProviderInventory(transport) {
  const job = await transport.request(`https://run.googleapis.com/v2/${RETIRED_JOB}`)
  const scheduler = await transport.request(`https://cloudscheduler.googleapis.com/v1/${RETIRED_SCHEDULER}`)
  if (job?.name !== RETIRED_JOB || typeof job.deletionProtection !== 'boolean' || scheduler?.name !== RETIRED_SCHEDULER || scheduler.state !== 'PAUSED') fail('DEV125_PROVIDER_RETIREMENT_PROVIDER_INVENTORY_INVALID')
  const executions = []
  const names = new Set()
  const tokens = new Set()
  let pageToken = null
  let pageCount = 0
  for (; pageCount < 10; pageCount += 1) {
    const base = `https://run.googleapis.com/v2/${RETIRED_JOB}/executions?pageSize=100`
    const page = await transport.request(pageToken === null ? base : `${base}&pageToken=${encodeURIComponent(pageToken)}`)
    if (!Array.isArray(page?.executions)) fail('DEV125_PROVIDER_RETIREMENT_PROVIDER_INVENTORY_INVALID')
    for (const execution of page.executions) {
      if (typeof execution?.name !== 'string' || !execution.name.startsWith(`${RETIRED_JOB}/executions/`) || names.has(execution.name)) fail('DEV125_PROVIDER_RETIREMENT_PROVIDER_INVENTORY_INVALID')
      names.add(execution.name)
      executions.push(execution)
    }
    if (page.nextPageToken == null || page.nextPageToken === '') break
    if (typeof page.nextPageToken !== 'string' || page.nextPageToken.length > 4096 || tokens.has(page.nextPageToken)) fail('DEV125_PROVIDER_RETIREMENT_PROVIDER_INVENTORY_INVALID')
    tokens.add(page.nextPageToken)
    pageToken = page.nextPageToken
  }
  if (pageToken !== null && pageCount === 10) fail('DEV125_PROVIDER_RETIREMENT_PROVIDER_INVENTORY_TRUNCATED')
  const active = executions.filter((execution) => !terminalExecution(execution))
  if (active.length !== 0) fail('DEV125_PROVIDER_RETIREMENT_EXECUTION_ACTIVE')
  return { jobDeletionProtection: job.deletionProtection, schedulerState: scheduler.state,
    executionCount: executions.length, activeExecutionCount: 0, executionPageCount: pageCount + 1 }
}

async function executeUnprotect(args, environment = process.env) {
  const token = environment.GOOGLE_OAUTH_ACCESS_TOKEN
  if (typeof token !== 'string' || token.length < 20) fail('DEV125_PROVIDER_RETIREMENT_TOKEN_MISSING')
  const operationObject = await readGcsObject({ uri: args.operationRef, expectedBucket: RELEASE_BUCKET,
    expectedPrefix: DEV125_PROVIDER_RETIREMENT_OPERATION_PREFIX, token })
  const operation = assertProviderRetirementOperation(json(operationObject.bytes, 'DEV125_PROVIDER_RETIREMENT_OPERATION_JSON_INVALID'), {
    bytes: operationObject.bytes, operationSha256: args.operationSha256, sourceRevision: args.sourceRevision,
  })
  const operationRef = { uri: args.operationRef, sha256: args.operationSha256, generation: operationObject.generation }
  const providerTransport = createOwnerTransport({ token })
  const existingFinal = await optionalObject({ uri: args.outputRef, expectedBucket: RELEASE_BUCKET,
    expectedPrefix: DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX, token })
  if (existingFinal) {
    const receipt = assertProviderRetirementReceipt(json(existingFinal.bytes, 'DEV125_PROVIDER_RETIREMENT_RECEIPT_JSON_INVALID'), { operation, operationRef, outputRef: args.outputRef })
    const existingClaim = await readGcsObject({ uri: receipt.claimRef.uri, expectedBucket: RELEASE_BUCKET,
      expectedPrefix: DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX, expectedGeneration: receipt.claimRef.generation, token })
    const workerSnapshot = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.worker, token)
    const readbackSnapshot = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.readback, token)
    const providerReadback = await readProviderInventory(providerTransport)
    assertProviderRetirementReplayEvidence({ receipt,
      claim: json(existingClaim.bytes, 'DEV125_PROVIDER_RETIREMENT_CLAIM_JSON_INVALID'), claimBytes: existingClaim.bytes,
      claimGeneration: existingClaim.generation, workerSnapshot, readbackSnapshot, providerReadback },
    { operation, operationRef, outputRef: args.outputRef })
    return { status: 'PASS', reused: true, outputRef: args.outputRef, outputGeneration: existingFinal.generation, receiptSha256: receipt.receiptSha256 }
  }

  const cleanup = await readGcsObject({ uri: operation.cleanupReceiptRef.uri, expectedBucket: RELEASE_BUCKET,
    expectedPrefix: 'receipts/releases/DEV125-OPENSWX-RETIREMENT', expectedGeneration: operation.cleanupReceiptRef.generation, token })
  assertPrerequisiteRef(cleanup, operation.cleanupReceiptRef)
  assertProviderRetirementPrerequisite(json(cleanup.bytes, 'DEV125_PROVIDER_RETIREMENT_PREREQUISITE_JSON_INVALID'), cleanup.bytes, operation.cleanupReceiptRef, 'cleanup', { operation })
  const runtime = await readGcsObject({ uri: operation.runtimeReceiptRef.uri, expectedBucket: RELEASE_BUCKET,
    expectedPrefix: 'receipts/diagnostics/DEV122-PREVIEW-OPENSWX-RUNTIME', expectedGeneration: operation.runtimeReceiptRef.generation, token })
  assertPrerequisiteRef(runtime, operation.runtimeReceiptRef)
  assertProviderRetirementPrerequisite(json(runtime.bytes, 'DEV125_PROVIDER_RETIREMENT_PREREQUISITE_JSON_INVALID'), runtime.bytes, operation.runtimeReceiptRef, 'runtime', { operation })

  const claimUri = `gs://${RELEASE_BUCKET}/${DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX}/${args.operationSha256}/claim.json`
  let claimObject = await optionalObject({ uri: claimUri, expectedBucket: RELEASE_BUCKET, expectedPrefix: DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX, token })
  let claim = claimObject ? assertProviderRetirementClaim(json(claimObject.bytes, 'DEV125_PROVIDER_RETIREMENT_CLAIM_JSON_INVALID'), { operation, operationRef }) : null
  const workerBeforeObject = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.worker, token)
  const readbackBeforeObject = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.readback, token, operation.stateBasis.readback.generation)
  const readbackBefore = assertStateSnapshot(readbackBeforeObject.value, readbackBeforeObject.bytes, operation.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback)
  const exactWorkerBasis = workerBeforeObject.generation === operation.stateBasis.worker.generation && sha256(workerBeforeObject.bytes) === operation.stateBasis.worker.sha256
  const workerBefore = assertStateSnapshot(workerBeforeObject.value, workerBeforeObject.bytes, operation.stateBasis.worker,
    DEV125_PROVIDER_RETIREMENT_ROOTS.worker, exactWorkerBasis ? {} : { allowAdvanced: true })
  if (schedulerPaused(workerBeforeObject.value) !== true) fail('DEV125_PROVIDER_RETIREMENT_PRECONDITION_INVALID')
  const providerBefore = await readProviderInventory(providerTransport)
  const recovered = providerBefore.jobDeletionProtection === false
  if ((!recovered && (!exactWorkerBasis || workerDeletionProtection(workerBeforeObject.value) !== true)) ||
      (recovered && !claimObject)) fail('DEV125_PROVIDER_RETIREMENT_PRECONDITION_INVALID')

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aipdm-dev125-provider-retirement-'))
  process.stdout.write(`DEV125_PROVIDER_RETIREMENT_RUNTIME_DECLARED=${JSON.stringify({ project: 'AI-PDM', purpose: 'DEV-125 exact provider unprotect', port: null,
    parentPid: process.pid, PDM_DATA_DIR: 'UNUSED', PDM_REPOSITORY_DIR: 'UNUSED', mutationScope: 'FIXED_TERRAFORM_ROOTS_AND_REMOTE_STATES',
    cleanupCondition: 'finally removes exact task-owned temporary directory', tempRoot })}\n`)
  try {
    const terraformEnvironment = sanitizedTerraformEnvironment(environment)
    const workerPlan = planRoot({ root: DEV125_PROVIDER_RETIREMENT_ROOTS.worker, tempRoot, operation, environment: terraformEnvironment })
    const readbackPlan = planRoot({ root: DEV125_PROVIDER_RETIREMENT_ROOTS.readback, tempRoot, operation, environment: terraformEnvironment })
    const summary = assertUnprotectPlans({ workerPlan: workerPlan.plan, readbackPlan: readbackPlan.plan, recovery: recovered })
    const actionSummary = { mode: operation.mode, ...summary }
    const authorizedSummary = { mode: operation.mode, workerAddressCount: 12, readbackAddressCount: 12,
      mutationCount: 1, mutationAddress: 'google_cloud_run_v2_job.reader' }
    const authorizedPlan = { workerSha256: actionDigest({ root: 'worker', summary: authorizedSummary }),
      readbackSha256: actionDigest({ root: 'readback', addressCount: 12, mutationCount: 0 }) }
    const plan = { workerActionsSha256: actionDigest({ root: 'worker', summary: actionSummary }),
      readbackActionsSha256: actionDigest({ root: 'readback', addressCount: summary.readbackAddressCount, mutationCount: 0 }),
      workerBinarySha256: workerPlan.binarySha256, readbackBinarySha256: readbackPlan.binarySha256 }
    const stateBefore = { worker: basisRecord(operation.stateBasis.worker), readback: basisRecord(operation.stateBasis.readback) }
    if (claimObject) {
      if (canonicalize(claim.stateBefore) !== canonicalize(stateBefore) || claim.plan.workerSha256 !== authorizedPlan.workerSha256 ||
          claim.plan.readbackSha256 !== authorizedPlan.readbackSha256) fail('DEV125_PROVIDER_RETIREMENT_CLAIM_DRIFT')
    } else {
      claim = buildProviderRetirementClaim({ operation, operationRef, plan: authorizedPlan, stateBefore, observedAt: new Date().toISOString() })
      claimObject = await publishGcsJson({ uri: claimUri, expectedBucket: RELEASE_BUCKET,
        expectedPrefix: DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX, value: claim, token })
    }

    const workerPreApply = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.worker, token, workerBeforeObject.generation)
    const readbackPreApply = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.readback, token, readbackBeforeObject.generation)
    if (sha256(workerPreApply.bytes) !== sha256(workerBeforeObject.bytes) ||
        sha256(readbackPreApply.bytes) !== sha256(readbackBeforeObject.bytes)) fail('DEV125_PROVIDER_RETIREMENT_STATE_DRIFT')
    terraform(workerPlan.cwd, ['apply', '-input=false', '-no-color', '-auto-approve', workerPlan.planName], terraformEnvironment)
    const workerAfterObject = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.worker, token)
    const readbackAfterObject = await readState(DEV125_PROVIDER_RETIREMENT_ROOTS.readback, token, operation.stateBasis.readback.generation)
    const workerAfter = assertStateSnapshot(workerAfterObject.value, workerAfterObject.bytes, operation.stateBasis.worker, DEV125_PROVIDER_RETIREMENT_ROOTS.worker, { allowAdvanced: true })
    const readbackAfter = assertStateSnapshot(readbackAfterObject.value, readbackAfterObject.bytes, operation.stateBasis.readback, DEV125_PROVIDER_RETIREMENT_ROOTS.readback)
    if (workerDeletionProtection(workerAfterObject.value) !== false || schedulerPaused(workerAfterObject.value) !== true) fail('DEV125_PROVIDER_RETIREMENT_POSTCONDITION_INVALID')
    const providerAfter = await readProviderInventory(providerTransport)
    if (providerAfter.jobDeletionProtection !== false) fail('DEV125_PROVIDER_RETIREMENT_POSTCONDITION_INVALID')
    const receipt = buildProviderRetirementReceipt({ operation, operationRef, outputRef: args.outputRef,
      claimRef: { uri: claimUri, sha256: sha256(claimObject.bytes), generation: claimObject.generation }, plan, stateBefore,
      stateAfter: { worker: stateRecord(workerAfterObject, workerAfter), readback: stateRecord(readbackAfterObject, readbackAfter) },
      providerReadback: providerAfter, observedAt: new Date().toISOString(), recovered })
    const published = await publishGcsJson({ uri: args.outputRef, expectedBucket: RELEASE_BUCKET,
      expectedPrefix: DEV125_PROVIDER_RETIREMENT_RECEIPT_PREFIX, value: receipt, token })
    return { status: 'PASS', reused: published.reused, outputRef: args.outputRef, outputGeneration: published.generation,
      receiptSha256: receipt.receiptSha256, plan: actionSummary }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
    process.stdout.write(`DEV125_PROVIDER_RETIREMENT_RUNTIME_CLEANUP=${JSON.stringify({ tempRoot, removed: !fs.existsSync(tempRoot), port: null })}\n`)
  }
}

async function main() {
  if (process.argv.length === 3 && process.argv[2] === '--bind') {
    const binding = bindOperationRef(process.env.OPERATION_REF)
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `operation_uri=${binding.operationUri}\noperation_sha256=${binding.operationSha256}\n`)
    process.stdout.write(`${JSON.stringify(binding)}\n`)
    return
  }
  const result = await executeUnprotect(parseArgs(process.argv.slice(2)))
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  process.stderr.write(`${error?.code ?? error?.message ?? 'DEV125_PROVIDER_RETIREMENT_FAILED'}\n`)
  process.exitCode = 1
})

export { executeUnprotect, parseArgs, sanitizedTerraformEnvironment }
