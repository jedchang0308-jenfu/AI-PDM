#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertDataCutoverConfig } from './lib/dev012-production-data-cutover.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', shell: false })
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '')
    process.stderr.write(result.stderr ?? '')
    throw new Error(`DEV012_DATA_CUTOVER_QC_COMMAND_FAILED:${command} ${args.join(' ')}`)
  }
}

const configPath = path.join(root, 'config/release/dev012-ai-pdm-production-data-cutover.json')
const runtimePath = path.join(root, 'scripts/dev012-production-data-cutover-runtime.mjs')
const providerPath = path.join(root, 'scripts/lib/dev012-production-data-cutover-provider.mjs')
const providerCliPath = path.join(root, 'scripts/dev012-production-data-cutover-provider.mjs')
const ownerExecutorPath = path.join(root, 'scripts/lib/dev012-owner-stage-executor.mjs')
const migrationRunnerDockerfilePath = path.join(root, 'infra/google-cloud/dev-117-production-release/migration-runner.Dockerfile')
const storagePath = path.join(root, 'infra/google-cloud/dev-117-production-release/storage.tf')
const infraPlanPath = path.join(root, 'config/release/dev117-production-release-infra-plan.json')
const config = assertDataCutoverConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')))
const runtime = fs.readFileSync(runtimePath, 'utf8')
const provider = fs.readFileSync(providerPath, 'utf8')
const providerCli = fs.readFileSync(providerCliPath, 'utf8')
const ownerExecutor = fs.readFileSync(ownerExecutorPath, 'utf8')
const migrationRunnerDockerfile = fs.readFileSync(migrationRunnerDockerfilePath, 'utf8')
const storage = fs.readFileSync(storagePath, 'utf8')
const infraPlan = JSON.parse(fs.readFileSync(infraPlanPath, 'utf8'))

for (const required of [
  'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY',
  'BEGIN ISOLATION LEVEL SERIALIZABLE',
  'pg_advisory_xact_lock',
  'ifGenerationMatch=0',
  'assertExistingRowsAreExpectedSubset',
  'assertEquivalentCutoverReceipt',
]) assert.ok(runtime.includes(required), `DEV012_DATA_CUTOVER_RUNTIME_GUARD_MISSING:${required}`)
for (const required of ['updateMask=invokerIamDisabled', 'getIamPolicy', 'billingInfo', 'pointInTimeRecoveryEnabled', 'ensureFreshBackup', 'executeProviderRun', 'recoverProviderRun', 'ifGenerationMatch', 'createDataCutoverHandoff', 'post-live-cleanup']) assert.ok(provider.includes(required), `DEV012_DATA_CUTOVER_PROVIDER_GUARD_MISSING:${required}`)
for (const required of ['GoogleAuth', 'resolveProviderInputPath', "args.stage === 'run'", 'post-live-cleanup']) assert.ok(providerCli.includes(required), `DEV012_DATA_CUTOVER_CLI_GUARD_MISSING:${required}`)
for (const required of ['CUTOVER_OR_LIVE_AUTHORITY', 'dataCutoverCompletionRef', "stage: 'post-live-cleanup'", 'deleteBytes']) assert.ok(ownerExecutor.includes(required), `DEV012_DATA_CUTOVER_OWNER_CLEANUP_MISSING:${required}`)
for (const required of ['scripts/lib/dev012-production-data-cutover.mjs', 'scripts/dev012-production-data-cutover-runtime.mjs', 'config/release/dev012-ai-pdm-production-data-cutover.json']) assert.ok(migrationRunnerDockerfile.includes(required), `DEV012_DATA_CUTOVER_IMAGE_INPUT_MISSING:${required}`)
assert.ok(storage.includes('data_cutover_cleanup') && storage.includes('objects/source/migration-bundles/data-cutover/'), 'DEV012_DATA_CUTOVER_CLEANUP_IAM_MISSING')
assert.ok(infraPlan.stageA.includes('google_storage_bucket_iam_member.deployer["data_cutover_cleanup"]'), 'DEV012_DATA_CUTOVER_CLEANUP_PLAN_ADDRESS_MISSING')

assert.equal(config.catalog.expectedSourceTableCount, 157)
assert.equal(config.catalog.expectedTargetTableCount, 157)
assert.equal(config.catalog.expectedCopyTableCount, 151)
assert.equal(config.catalog.typeTransforms.length, 13)
assert.notEqual(config.source.projectId, config.target.projectId)
assert.notEqual(config.source.database, config.target.database)

run(process.execPath, ['--check', 'scripts/dev012-production-data-cutover-runtime.mjs'])
run(process.execPath, ['--check', 'scripts/dev012-production-data-cutover-provider.mjs'])
run(process.execPath, ['--check', 'scripts/lib/dev012-production-data-cutover-provider.mjs'])
run(process.execPath, ['--test', 'scripts/dev012-production-data-cutover.test.mjs', 'scripts/dev012-production-data-cutover-provider.test.mjs'])
run(process.execPath, ['scripts/check-shared-database-boundary.mjs'])

process.stdout.write(`${JSON.stringify({
  schemaVersion: 'jenfu.dev012.ai-pdm-production-data-cutover-qc.v1',
  sourceProjectId: config.source.projectId,
  targetProjectId: config.target.projectId,
  copyTableCount: config.catalog.expectedCopyTableCount,
  transformCount: config.catalog.typeTransforms.length,
  checks: ['runtime-syntax', 'provider-syntax', 'single-command-recovery', 'temporary-resource-cleanup', 'automatic-post-live-raw-bundle-cleanup', 'ordinary-release-completion-authority', 'cleanup-iam-complete-set', 'unit-contract', 'database-boundary'],
  status: 'PASS',
})}\n`)
