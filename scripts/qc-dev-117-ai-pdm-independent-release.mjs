#!/usr/bin/env node

import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

import {
  assertDev117Config,
  assertDev117PreflightReport,
  assertDev117SourceLock,
  finalizeEvidence,
  sha256,
} from './lib/dev117-ai-pdm-independent-release.mjs'
import { assertDev117V3Profile, assertDev117WorkflowSource } from './lib/dev117-ai-pdm-continuous-release.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const configPath = path.join(root, 'config', 'release', 'dev117-ai-pdm-independent-production.json')
const currentConfigPath = path.join(root, 'config', 'release', 'dev117-ai-pdm-independent-production-v3.json')
const n1cConfigPath = path.join(root, 'config', 'platform', 'dev-010-n1c-ai-pdm.json')
const registryPath = path.join(root, '.ai-doc', 'qa', 'dev-117-current-case-registry.json')
const workflowPath = path.join(root, '.github', 'workflows', 'deploy-ai-pdm-independent-production.yml')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const currentConfig = JSON.parse(fs.readFileSync(currentConfigPath, 'utf8'))
const n1cConfig = JSON.parse(fs.readFileSync(n1cConfigPath, 'utf8'))
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
assertDev117Config(config)
assertDev117V3Profile(currentConfig, config, n1cConfig)

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.error || result.status !== 0) fail('DEV117_QC_CHILD_FAILED', result.error?.message ?? `${command}:${result.status}`)
  return result.stdout ?? ''
}

function section(source, start, end) {
  const after = source.split(`\n  ${start}:`)[1]
  if (!after) fail('DEV117_QC_WORKFLOW_STAGE_MISSING', start)
  return end ? after.split(`\n  ${end}:`)[0] : after
}

function staticScan() {
  for (const relative of ['scripts/lib/dev117-ai-pdm-independent-release.mjs', 'scripts/dev117-ai-pdm-independent-release.mjs']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    for (const pattern of [/(?:execFileSync|spawnSync|execSync)\([^)]*['"](?:gcloud|docker|psql|firebase)['"]/iu, /@google-cloud/iu, /\bfetch\s*\(/u, /firebase\s+deploy/iu]) {
      if (pattern.test(source)) fail('DEV117_PROVIDER_CAPABILITY_FORBIDDEN', `${relative}:${pattern}`)
    }
  }
  const source = fs.readFileSync(workflowPath, 'utf8')
  let parsed
  try { parsed = yaml.load(source) } catch (error) { fail('DEV117_QC_WORKFLOW_YAML_INVALID', error.message) }
  if (!parsed?.on?.workflow_dispatch || !parsed?.jobs) fail('DEV117_QC_WORKFLOW_YAML_INVALID', 'workflow_dispatch/jobs/or jobs missing')
  assertDev117WorkflowSource(source)
  for (const marker of [
    'releaseCapsuleRef', 'group: production-release-ai-pdm-prod',
    'aipdm-prod-verifier@jenfu-platform-prod.iam.gserviceaccount.com',
    'aipdm-prod-builder@jenfu-platform-prod.iam.gserviceaccount.com',
    'aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com',
    '--stage prepare', '--stage build', '--stage migrate', '--stage candidate', '--stage entrypoint',
    '--stage verify', '--stage decision', '--stage activate', '--stage canonical', '--stage finalize', '--stage rollback',
  ]) if (!source.includes(marker)) fail('DEV117_QC_WORKFLOW_CONTROL_MISSING', marker)
  for (const forbidden of ['jenfu-ai-pdm-prod', 'https://jenfu-ai-pdm-prod.web.app', 'https://pdm.jenfu.com.tw', 'pdm-runtime@jenfu-ai-pdm-prod.iam.gserviceaccount.com']) {
    if (source.includes(forbidden)) fail('DEV117_QC_LEGACY_TARGET_FOUND', forbidden)
  }
  if (/firebase\s+deploy|\bpsql\b|\bDROP\s+(?:DATABASE|SCHEMA|TABLE)|:[ \t]*latest(?:[\s,"']|$)/iu.test(source)) fail('DEV117_QC_FORBIDDEN_RELEASE_CAPABILITY_FOUND')
  if (/(?:run\s+deploy|services\s+update-traffic)[^\n]*jenfu-platform-prod|(?:run\s+deploy|services\s+update-traffic)[^\n]*orgmaster-prod/iu.test(source)) fail('DEV117_CROSS_APP_MUTATION_FOUND')
  const candidate = section(source, 'candidate', 'entrypoint')
  if (!candidate.includes('--stage candidate') || /\bgcloud\b|--to-revisions/iu.test(candidate)) fail('DEV117_QC_CANDIDATE_BOUNDARY_INVALID')
  const entrypoint = section(source, 'entrypoint', 'verify')
  if (!entrypoint.includes('--stage entrypoint') || /\bgcloud\b|--to-revisions/iu.test(entrypoint)) fail('DEV117_QC_ENTRYPOINT_BOUNDARY_INVALID')
  const failure = section(source, 'failure')
  if (!failure.includes('--stage rollback') || !failure.includes('aipdm-prod-deployer@jenfu-platform-prod.iam.gserviceaccount.com')) fail('DEV117_QC_ROLLBACK_BOUNDARY_INVALID')
  const actionLines = source.split(/\r?\n/u).map((line) => line.trim().replace(/^-\s+/u, '')).filter((line) => line.startsWith('uses:'))
  const allowedActions = new Set(['uses: actions/checkout@v4', 'uses: actions/setup-node@v4', 'uses: google-github-actions/auth@v3'])
  if (actionLines.length < 30 || actionLines.some((line) => !allowedActions.has(line))) fail('DEV117_QC_ACTION_VERSION_INVALID')
  return { yamlParsed: true, stageCount: currentConfig.workflow.jobs.length, actionVersionsChecked: actionLines.length, forbiddenMatches: 0 }
}

function parseSummary(output) {
  const line = output.trim().split(/\r?\n/u).filter(Boolean).at(-1)
  try { return JSON.parse(line) } catch { fail('DEV117_QC_PREFLIGHT_SUMMARY_INVALID') }
}

function sourceFingerprint() {
  const files = [
    'config/release/dev117-ai-pdm-independent-production.json',
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'config/platform/dev-010-n1c-ai-pdm.json',
    '.github/workflows/deploy-ai-pdm-independent-production.yml',
    '.ai-doc/qa/dev-117-current-case-registry.json',
    'scripts/lib/dev117-ai-pdm-independent-release.mjs',
    'scripts/lib/dev117-ai-pdm-continuous-release.mjs',
    'scripts/dev117-ai-pdm-independent-release.mjs',
    'scripts/dev117-ai-pdm-independent-release.test.mjs',
    'scripts/qc-dev-117-ai-pdm-independent-release.mjs',
    'package.json',
  ]
  const rows = files.map((relativePath) => ({ path: relativePath, sha256: sha256(fs.readFileSync(path.join(root, relativePath))) }))
  return { algorithm: 'sha256', files: rows, aggregateSha256: sha256(rows) }
}

function main() {
  if (registry.schemaVersion !== 'jenfu.qa.case-registry.v1' || registry.devId !== 'DEV-117' || registry.caseCount !== 12
    || !Array.isArray(registry.cases) || registry.cases.length !== 12
    || registry.cases.some((row, index) => row.id !== `QA-117-${String(index + 1).padStart(3, '0')}`)) fail('DEV117_QC_DENOMINATOR_INVALID')
  const workflowScan = staticScan()
  const testOutput = run(process.execPath, ['--test', 'scripts/dev117-ai-pdm-independent-release.test.mjs'])
  if (!/tests\s+12/iu.test(testOutput) || !/pass\s+12/iu.test(testOutput) || !/fail\s+0/iu.test(testOutput)) fail('DEV117_QC_DENOMINATOR_INVALID')
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}Z$/u, 'Z')
  const release = `REL-117-QC-${stamp}`
  const preflightOutput = run(process.execPath, ['scripts/dev117-ai-pdm-independent-release.mjs', '--stage=preflight', `--release-id=${release}`])
  const summary = parseSummary(preflightOutput)
  if (!['CI_VERIFIED', 'BLOCKED'].includes(summary.status) || !['FROZEN', 'INVALIDATED'].includes(summary.sourceLockStatus)
    || summary.providerExecution !== 'NOT_RUN' || summary.providerCalls !== 0 || summary.cloudMutations !== 0
    || summary.databaseWrites !== 0 || summary.trafficChanges !== 0 || summary.credentialAccesses !== 0 || summary.siblingRepositoryReads !== 0) fail('DEV117_QC_PREFLIGHT_SUMMARY_INVALID')
  const outputDirectory = path.resolve(root, summary.outputDirectory)
  const sourceLock = assertDev117SourceLock(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'source-lock.json'), 'utf8')), config)
  const preflight = assertDev117PreflightReport(JSON.parse(fs.readFileSync(path.join(outputDirectory, 'preflight-report.json'), 'utf8')), config)
  const unexpected = fs.readdirSync(outputDirectory).filter((name) => !config.evidence.allowedFiles.includes(name))
  if (unexpected.length > 0) fail('DEV117_OUTPUT_OUT_OF_SCOPE', unexpected.join(','))

  const observedAt = new Date().toISOString()
  const cases = registry.cases.map((row) => ({
    id: row.id, title: row.title, phase: row.phase, owner: row.owner,
    expected: 'CONTRACT_PASS / PROVIDER_NOT_RUN', actual: 'CONTRACT_PASS / PROVIDER_NOT_RUN', result: 'PASS',
    evidenceRefs: [
      `scripts/dev117-ai-pdm-independent-release.test.mjs#${row.id}`,
      row.phase === '117-S1A' ? `${summary.outputDirectory}/preflight-report.json` : '.github/workflows/deploy-ai-pdm-independent-production.yml',
    ],
  }))
  const aggregate = finalizeEvidence({
    schemaVersion: config.evidence.aggregateSchema, devId: 'DEV-117', slice: '117-S1', claimBoundary: 'local-release-adapter-contract',
    status: 'PASS', observedAt, sourceFingerprint: sourceFingerprint(), caseCount: 12, passed: 12, failed: 0,
    notRun: 0, openP0: 0, openP1: 0, cases, sourceFreezeObservation: { status: sourceLock.status, evidenceSha256: sourceLock.evidenceSha256 },
    preflightObservation: { status: preflight.status, evidenceSha256: preflight.evidenceSha256 },
    mutationCounters: { providerCalls: 0, cloudMutations: 0, databaseWrites: 0, trafficChanges: 0, credentialAccesses: 0, siblingRepositoryReads: 0 },
    providerExecution: 'NOT_RUN', productionReleaseClaimed: false,
    cleanup: { temporaryRuntimeStarted: false, processTreesStopped: 0, portsClaimed: [], portResidue: 0, taskOwnedEvidenceRetained: true },
    workflowScan,
  })
  const aggregateDirectory = path.join(root, 'output', 'qa', 'dev-117-independent-release', stamp)
  fs.mkdirSync(aggregateDirectory, { recursive: true })
  const aggregatePath = path.join(aggregateDirectory, 'aggregate-manifest.json')
  fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`${JSON.stringify({
    status: 'PASS', claimBoundary: aggregate.claimBoundary, testCount: 12, passed: 12, failed: 0, openP0: 0, openP1: 0,
    providerExecution: 'NOT_RUN', productionReleaseClaimed: false, observedSourceFreeze: sourceLock.status,
    observedPreflight: preflight.status, providerCalls: 0, cloudMutations: 0, databaseWrites: 0, trafficChanges: 0,
    credentialAccesses: 0, siblingRepositoryReads: 0, runtimeResidue: 0, portResidue: 0,
    preflightOutputDirectory: summary.outputDirectory,
    aggregatePath: path.relative(root, aggregatePath).replaceAll(path.sep, '/'), evidenceSha256: aggregate.evidenceSha256,
  })}\n`)
}

try {
  main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
}
