#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { buildDev117MigrationBundle, buildDev117MigrationPackage, assertDev117V3Profile } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { canonicalize } from './lib/dev012-production-migration-runner.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import {
  RD_LEDGER_READBACK_CONSTANTS,
  RD_LEDGER_READBACK_PGOPTIONS,
  RD_LEDGER_READBACK_RESULT_SCHEMA,
  assertRdReadbackGitHubContext,
  assertRdLedgerReadbackIntent,
  assertRdReadbackExecutionReceipt,
  assertRdReadbackJob,
  assertRdReadbackJobReceipt,
  assertRdReadbackNativeReceipt,
  assertRdReadbackSourceCompatibility,
  buildRdLedgerProbeBundles,
  buildRdLedgerReadbackIntent,
  buildRdReadbackResult,
  classifyRdReadbackCapsule,
  rdReadbackIntentUri,
  rdReadbackJobEnvironment,
  rdReadbackJobSourceRevision,
  rdReadbackJobProjection,
  rdReadbackProbeArguments,
  rdReadbackProfileSha256,
  rdReadbackSha256,
} from './lib/dev122-rd-permission-ledger-readback.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const H64 = /^[a-f0-9]{64}$/u

function fail(code, detail = '') {
  const error = new Error(detail ? `${code}:${detail}` : code)
  error.code = code
  throw error
}

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index], value = argv[index + 1]
    if (!['--stage', '--release-id', '--deadline-at', '--capsule-ref', '--capsule-sha256'].includes(key) || !value || Object.hasOwn(values, key)) fail('RD_READBACK_ARGUMENTS_INVALID')
    values[key] = value
  }
  const stage = values['--stage']
  if (!['publish', 'classify', 'readback'].includes(stage)) fail('RD_READBACK_ARGUMENTS_INVALID')
  if (stage === 'publish') {
    if (!values['--release-id'] || !values['--deadline-at'] || values['--capsule-ref'] || values['--capsule-sha256']) fail('RD_READBACK_ARGUMENTS_INVALID')
    return { stage, releaseId: values['--release-id'], deadlineAt: values['--deadline-at'] }
  }
  if (!values['--capsule-ref'] || !H64.test(values['--capsule-sha256'] ?? '') || values['--release-id'] || values['--deadline-at']) fail('RD_READBACK_ARGUMENTS_INVALID')
  return { stage, capsuleRef: values['--capsule-ref'], capsuleSha256: values['--capsule-sha256'] }
}

async function loadConfiguration() {
  const paths = ['config/release/dev117-ai-pdm-independent-production-v3.json', 'config/release/dev117-ai-pdm-independent-production.json', 'config/platform/dev-010-n1c-ai-pdm.json']
  const bytes = await Promise.all(paths.map((file) => fs.readFile(path.join(root, file))))
  const [profile, v1, n1c] = bytes.map((value) => JSON.parse(value.toString('utf8')))
  assertDev117V3Profile(profile, v1, n1c)
  return { profile, n1c, profileSha256: rdReadbackProfileSha256(profile) }
}

function loadSource(configuration, sourceRevision) {
  const { profile, n1c, profileSha256 } = configuration
  const full = buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision)
  return { profile, profileSha256, probes: buildRdLedgerProbeBundles(full) }
}

async function git(args, encoding = 'utf8') {
  const { spawn } = await import('node:child_process')
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: root, windowsHide: true })
    const stdout = [], stderr = []
    child.stdout.on('data', (chunk) => stdout.push(chunk))
    child.stderr.on('data', (chunk) => stderr.push(chunk))
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve(encoding === null ? Buffer.concat(stdout) : Buffer.concat(stdout).toString(encoding)) : reject(Object.assign(new Error(Buffer.concat(stderr).toString('utf8')), { code: 'RD_READBACK_GIT_INSPECTION_FAILED' })))
  })
}

function capsuleUriAllowed(uri) {
  if (!new RegExp(`^gs://${RD_LEDGER_READBACK_CONSTANTS.bucket}/receipts/[A-Za-z0-9._/-]+\\.json$`, 'u').test(uri ?? '') || uri.includes('..')) fail('RD_READBACK_CAPSULE_REF_INVALID')
  return uri
}

async function readCapsule(transport, args) {
  capsuleUriAllowed(args.capsuleRef)
  const row = await transport.readBytes(args.capsuleRef, { prefixes: ['receipts'], expectedSha256: args.capsuleSha256 })
  let value
  try { value = JSON.parse(row.bytes.toString('utf8')) } catch { fail('RD_READBACK_CAPSULE_INVALID') }
  return { value, ref: { uri: args.capsuleRef, sha256: args.capsuleSha256 } }
}

async function publish({ args, transport, authorityReader = readGitAuthority, identityReader = createGitSourceIdentity, compatibilityVerifier = assertRdReadbackSourceCompatibility }) {
  const configuration = await loadConfiguration()
  const { profile } = configuration
  const authority = authorityReader(root, profile)
  if (Date.parse(args.deadlineAt) <= Date.now() || Date.parse(args.deadlineAt) > Date.now() + 4 * 60 * 60 * 1000) fail('RD_READBACK_DEADLINE_INVALID')
  const sourceIdentity = await identityReader(root, authority.sourceRevision)
  const job = assertRdReadbackJob(await transport.request(`https://run.googleapis.com/v2/${RD_LEDGER_READBACK_CONSTANTS.jobName}`), profile)
  const runnerSourceRevision = rdReadbackJobSourceRevision(job)
  compatibilityVerifier({ profile, root, workflowSourceRevision: authority.sourceRevision, runnerSourceRevision })
  const { profileSha256, probes } = loadSource(configuration, runnerSourceRevision)
  for (const probe of probes) {
    const saved = await transport.putBytes(probe.migrationBundleRef.uri, probe.bytes, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'source/migration-bundles', contentType: 'application/json' })
    if (canonicalize(saved.ref) !== canonicalize(probe.migrationBundleRef)) fail('RD_READBACK_BUNDLE_PUBLICATION_INVALID')
  }
  const intent = buildRdLedgerReadbackIntent({
    releaseId: args.releaseId,
    workflowSourceRevision: authority.sourceRevision,
    workflowSourceTree: authority.sourceTree,
    workflowSourceIdentitySha256: rdReadbackSha256(sourceIdentity),
    runnerSourceRevision,
    profileSha256,
    probes,
    job,
    observedAt: new Date().toISOString(),
    deadlineAt: args.deadlineAt,
  })
  const saved = await transport.putJson(rdReadbackIntentUri(args.releaseId), intent, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'receipts', ifGenerationMatch: '0' })
  return { stage: 'publish', releaseId: args.releaseId, workflowSourceRevision: intent.workflowSourceRevision, runnerSourceRevision: intent.runnerSourceRevision, ref: saved.ref, status: 'PASS' }
}

async function classify({ args, transport, environment }) {
  const capsule = await readCapsule(transport, args)
  const kind = classifyRdReadbackCapsule(capsule.value)
  if (kind === 'rd_readback') {
    const { profile } = await loadConfiguration()
    assertRdReadbackGitHubContext(capsule.value, environment, root, profile)
  }
  return { stage: 'classify', kind, workflowSourceRevision: capsule.value.workflowSourceRevision ?? capsule.value.sourceRevision ?? null, runnerSourceRevision: capsule.value.runnerSourceRevision ?? null, status: 'PASS' }
}

function executionEnvironment(profile, sourceRevision) {
  return { ...rdReadbackJobEnvironment(profile, sourceRevision), PGOPTIONS: RD_LEDGER_READBACK_PGOPTIONS }
}

function executionMatches(execution, { profile, intent, probe, outputUri, job }) {
  try {
    const prefix = `${RD_LEDGER_READBACK_CONSTANTS.jobName}/executions/`
    const task = execution?.template
    const container = task?.containers?.[0]
    if (!execution?.name?.startsWith(prefix) || execution.taskCount !== 1 || execution.parallelism !== 1 || task?.serviceAccount !== profile.migrations.serviceAccount || task?.maxRetries !== 0 || task?.timeout !== '1800s' || task?.containers?.length !== 1 || container?.name !== 'migration' || container.image !== intent.migrationRunnerDigest || Object.hasOwn(container, 'command')) return false
    if (canonicalize(container.args) !== canonicalize(rdReadbackProbeArguments(intent, probe, outputUri))) return false
    const expectedEnvironment = executionEnvironment(profile, intent.runnerSourceRevision)
    if (!Array.isArray(container.env) || container.env.length !== Object.keys(expectedEnvironment).length || new Set(container.env.map((row) => row.name)).size !== Object.keys(expectedEnvironment).length || canonicalize(Object.fromEntries(container.env.map((row) => [row.name, row.value]))) !== canonicalize(expectedEnvironment)) return false
    if (!Object.hasOwn(task, 'volumes') && !Object.hasOwn(container, 'volumeMounts')) assertRdReadbackJob(job, profile, intent)
    return true
  } catch { return false }
}

async function listExecutions(transport) {
  const rows = []
  let pageToken = ''
  for (let page = 0; page < 10; page += 1) {
    const query = new URLSearchParams({ pageSize: '100' })
    if (pageToken) query.set('pageToken', pageToken)
    const value = await transport.request(`https://run.googleapis.com/v2/${RD_LEDGER_READBACK_CONSTANTS.jobName}/executions?${query}`)
    if (!value || typeof value !== 'object' || (Object.hasOwn(value, 'executions') && !Array.isArray(value.executions)) || (Object.hasOwn(value, 'nextPageToken') && typeof value.nextPageToken !== 'string')) fail('RD_READBACK_EXECUTION_LIST_INVALID')
    rows.push(...(value.executions ?? []))
    pageToken = value.nextPageToken ?? ''
    if (!pageToken) break
    if (page === 9) fail('RD_READBACK_EXECUTION_LIST_INCOMPLETE')
  }
  const names = rows.map((row) => row?.name)
  if (names.some((name) => typeof name !== 'string' || !name.startsWith(`${RD_LEDGER_READBACK_CONSTANTS.jobName}/executions/`)) || new Set(names).size !== names.length) fail('RD_READBACK_EXECUTION_LIST_INVALID')
  return rows
}

function executionTerminal(execution) {
  const completed = (execution.conditions ?? []).filter((condition) => condition?.type === 'Completed')
  if (completed.length > 1) fail('RD_READBACK_EXECUTION_INVALID')
  return completed.length === 1 && ['CONDITION_SUCCEEDED', 'CONDITION_FAILED'].includes(completed[0].state)
}

function executionSucceeded(execution) {
  return executionTerminal(execution) && Number(execution.failedCount ?? 0) === 0 && Number(execution.succeededCount ?? 0) === 1 && execution.conditions.find((condition) => condition?.type === 'Completed')?.state === 'CONDITION_SUCCEEDED' && typeof execution.completionTime === 'string'
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

function seal(value) {
  const core = { ...value }
  core.receiptSha256 = rdReadbackSha256(core)
  return core
}

async function waitExecution({ transport, executionName, match, deadlineAt }) {
  while (Date.now() < Date.parse(deadlineAt)) {
    const execution = await transport.request(`https://run.googleapis.com/v2/${executionName}`)
    if (execution?.name !== executionName || !match(execution)) fail('RD_READBACK_EXECUTION_MISMATCH')
    if (executionTerminal(execution)) return execution
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  fail('RD_READBACK_TIMEOUT')
}

async function runProbe({ transport, profile, intent, intentRef, probe, job }) {
  const base = `gs://${RD_LEDGER_READBACK_CONSTANTS.bucket}/receipts/releases/${intent.releaseId}/${intentRef.sha256}`
  const outputUri = `${base}/ledger-probe-${probe.ledgerCount}.json`
  const submissionUri = `${base}/ledger-probe-${probe.ledgerCount}-submission-intent.json`
  const executionUri = `${base}/ledger-probe-${probe.ledgerCount}-execution-readback.json`
  const args = rdReadbackProbeArguments(intent, probe, outputUri)
  const match = (execution) => executionMatches(execution, { profile, intent, probe, outputUri, job })
  let inventory = await listExecutions(transport)
  if (inventory.some((execution) => !executionTerminal(execution))) fail('RD_READBACK_EXECUTION_ACTIVE')
  let matches = inventory.filter(match)
  if (matches.length > 1) fail('RD_READBACK_EXECUTION_CARDINALITY_INVALID')
  const priorSubmission = await optionalJson(transport, submissionUri)
  if (matches.length && !priorSubmission) fail('RD_READBACK_EXECUTION_PROVENANCE_UNKNOWN')
  if (!matches.length && priorSubmission) fail('RD_READBACK_SUBMISSION_OUTCOME_UNKNOWN')
  const submission = seal({ schemaVersion: 'aipdm.dev122.rd-permission-ledger-probe-submission.v2', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, workflowSourceRevision: intent.workflowSourceRevision, runnerSourceRevision: intent.runnerSourceRevision, readbackIntentRef: intentRef, ledgerCount: probe.ledgerCount, migrationRunnerDigest: intent.migrationRunnerDigest, migrationBundleRef: probe.migrationBundleRef, manifestSha256: probe.manifestSha256, outputUri, args, executionEnvironment: executionEnvironment(profile, intent.runnerSourceRevision), jobEtag: intent.jobEtag, deadlineAt: intent.deadlineAt, observedAt: new Date().toISOString(), status: 'SUBMISSION_INTENT' })
  if (priorSubmission) {
    const { observedAt: ignoredPrior, receiptSha256: ignoredPriorHash, ...priorCore } = priorSubmission.value
    const { observedAt: ignoredCurrent, receiptSha256: ignoredCurrentHash, ...currentCore } = submission
    if (priorSubmission.value.receiptSha256 !== rdReadbackSha256(Object.fromEntries(Object.entries(priorSubmission.value).filter(([key]) => key !== 'receiptSha256'))) || canonicalize(priorCore) !== canonicalize(currentCore)) fail('RD_READBACK_SUBMISSION_INVALID')
  } else {
    await transport.putJson(submissionUri, submission, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'receipts', ifGenerationMatch: '0' })
    try {
      await transport.request(`https://run.googleapis.com/v2/${RD_LEDGER_READBACK_CONSTANTS.jobName}:run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etag: job.etag, overrides: { containerOverrides: [{ name: 'migration', args, env: [{ name: 'PGOPTIONS', value: RD_LEDGER_READBACK_PGOPTIONS }] }] } }) })
    } catch (error) {
      if (error?.code !== 'OUTCOME_UNKNOWN') throw error
    }
    while (Date.now() < Date.parse(intent.deadlineAt)) {
      inventory = await listExecutions(transport)
      matches = inventory.filter(match)
      if (matches.length > 1) fail('RD_READBACK_EXECUTION_CARDINALITY_INVALID')
      if (matches.length === 1) break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    if (matches.length !== 1) fail('RD_READBACK_SUBMISSION_OUTCOME_UNKNOWN')
  }
  const execution = await waitExecution({ transport, executionName: matches[0].name, match, deadlineAt: intent.deadlineAt })
  const executionReceipt = seal({ schemaVersion: 'aipdm.dev122.rd-permission-ledger-probe-execution.v2', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, workflowSourceRevision: intent.workflowSourceRevision, runnerSourceRevision: intent.runnerSourceRevision, readbackIntentRef: intentRef, ledgerCount: probe.ledgerCount, executionName: execution.name, createTime: execution.createTime, startTime: execution.startTime ?? null, completionTime: execution.completionTime ?? null, succeededCount: Number(execution.succeededCount ?? 0), failedCount: Number(execution.failedCount ?? 0), completedState: execution.conditions.find((condition) => condition?.type === 'Completed')?.state ?? null, templateSha256: rdReadbackSha256(execution.template), observedAt: execution.completionTime ?? execution.updateTime ?? execution.createTime, status: executionSucceeded(execution) ? 'PASS' : 'EXPECTED_READ_ONLY_PROBE_FAILURE' })
  assertRdReadbackExecutionReceipt(executionReceipt, { intent, intentRef, probe })
  const savedExecution = await transport.putJson(executionUri, executionReceipt, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'receipts', ifGenerationMatch: '0' })
  if (!executionSucceeded(execution)) return { status: 'FAILED', ledgerCount: probe.ledgerCount, executionReadbackRef: savedExecution.ref }
  const native = await optionalJson(transport, outputUri)
  if (!native) fail('RD_READBACK_NATIVE_RECEIPT_MISSING')
  assertRdReadbackNativeReceipt(native.value, { intent, probe, executionName: execution.name.split('/').at(-1) })
  return { status: 'PASS', ledgerCount: probe.ledgerCount, executionReadbackRef: savedExecution.ref, nativeReceiptRef: native.ref, completedAt: native.value.completedAt }
}

async function readback({ args, transport, environment }) {
  const configuration = await loadConfiguration()
  const { profile } = configuration
  const capsule = await readCapsule(transport, args)
  assertRdLedgerReadbackIntent(capsule.value)
  const { profileSha256, probes } = loadSource(configuration, capsule.value.runnerSourceRevision)
  const intent = assertRdLedgerReadbackIntent(capsule.value, { profileSha256, probes })
  assertRdReadbackGitHubContext(intent, environment, root, profile)
  if (Date.now() >= Date.parse(intent.deadlineAt)) fail('RD_READBACK_TIMEOUT')
  const sourceIdentity = createGitSourceIdentity(root, intent.workflowSourceRevision)
  if (rdReadbackSha256(sourceIdentity) !== intent.workflowSourceIdentitySha256) fail('RD_READBACK_SOURCE_AUTHORITY_MISMATCH')
  for (const probe of probes) {
    const row = await transport.readBytes(probe.migrationBundleRef.uri, { prefixes: ['source/migration-bundles'], expectedSha256: probe.migrationBundleRef.sha256 })
    if (!row.bytes.equals(probe.bytes)) fail('RD_READBACK_BUNDLE_MISMATCH')
  }
  const job = assertRdReadbackJob(await transport.request(`https://run.googleapis.com/v2/${RD_LEDGER_READBACK_CONSTANTS.jobName}`), profile, intent)
  const base = `gs://${RD_LEDGER_READBACK_CONSTANTS.bucket}/receipts/releases/${intent.releaseId}/${capsule.ref.sha256}`
  const jobReceipt = seal({ schemaVersion: 'aipdm.dev122.rd-permission-ledger-job-readback.v2', ownerApplicationId: 'ai-pdm', releaseId: intent.releaseId, workflowSourceRevision: intent.workflowSourceRevision, runnerSourceRevision: intent.runnerSourceRevision, readbackIntentRef: capsule.ref, projection: rdReadbackJobProjection(job), observedAt: job.updateTime ?? intent.observedAt, status: 'PASS' })
  assertRdReadbackJobReceipt(jobReceipt, { intent, intentRef: capsule.ref, profile })
  const savedJob = await transport.putJson(`${base}/ledger-job-readback.json`, jobReceipt, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'receipts', ifGenerationMatch: '0' })
  const attempts = []
  for (const [index, probe] of probes.entries()) {
    const attempt = await runProbe({ transport, profile, intent, intentRef: capsule.ref, probe, job })
    attempts.push(attempt)
    if (attempt.status !== 'PASS') continue
    const result = buildRdReadbackResult({ intent, intentRef: capsule.ref, jobReadbackRef: savedJob.ref, attempts, successfulProbe: intent.probes[index], nativeReceiptRef: attempt.nativeReceiptRef, observedAt: attempt.completedAt })
    if (result.schemaVersion !== RD_LEDGER_READBACK_RESULT_SCHEMA) fail('RD_READBACK_RESULT_INVALID')
    const saved = await transport.putJson(`${base}/ledger-readback-result.json`, result, { bucket: RD_LEDGER_READBACK_CONSTANTS.bucket, prefix: 'receipts', ifGenerationMatch: '0' })
    return { stage: 'readback', releaseId: intent.releaseId, workflowSourceRevision: intent.workflowSourceRevision, runnerSourceRevision: intent.runnerSourceRevision, ledgerCount: result.ledgerCount, migration084State: result.migration084State, migration085State: result.migration085State, decision: result.decision, ref: saved.ref, status: 'PASS' }
  }
  fail('RD_READBACK_LEDGER_STATE_UNRESOLVED')
}

export async function runMain({ argv = process.argv.slice(2), environment = process.env, transport = null, publishOptions = {} } = {}) {
  const args = parseArgs(argv)
  const token = environment.GOOGLE_OAUTH_ACCESS_TOKEN ?? ''
  const ownerTransport = transport ?? createOwnerTransport({ token })
  if (args.stage === 'publish') return publish({ args, transport: ownerTransport, ...publishOptions })
  if (args.stage === 'classify') return classify({ args, transport: ownerTransport, environment })
  return readback({ args, transport: ownerTransport, environment })
}

export async function main(argv = process.argv.slice(2), environment = process.env) {
  return runMain({ argv, environment })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((value) => {
    if (value.stage === 'classify' && process.env.GITHUB_OUTPUT) process.stdout.write(`kind=${value.kind}\n`)
    else process.stdout.write(`${JSON.stringify(value)}\n`)
  }).catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
}
