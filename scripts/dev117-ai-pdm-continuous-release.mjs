#!/usr/bin/env node
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertDev117ReleaseIntent, assertDev117V3Profile, buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { createOwnerTransport, createAiPdmBuildReadbackTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchiveWithDev125Installer, createGitSourceIdentity, executeOwnerStage, parseOwnerStageArgs, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const dataCutoverConfigPath = 'config/release/dev012-ai-pdm-production-data-cutover.json'

export const createContinuousReleaseSourceReader = (repositoryRoot) => (repositoryPath, sourceRevision) => readGitBlob(repositoryRoot, repositoryPath, sourceRevision)

export function migrationDispositionFromStageResult(result) {
  const disposition = result?.value?.facts?.disposition
  if (!/^[A-Z][A-Z0-9_]{2,127}$/u.test(disposition ?? '')) {
    const error = new Error('MIGRATION_DISPOSITION_INVALID')
    error.code = 'MIGRATION_DISPOSITION_INVALID'
    throw error
  }
  return disposition
}

export function migrationSchemaStageOnlyFromStageResult(result) {
  const facts = result?.value?.facts
  if (facts && Object.hasOwn(facts, 'schemaStageOnly') && facts.schemaStageOnly !== true) throw Object.assign(new Error('MIGRATION_ADMISSION_INVALID'), { code: 'MIGRATION_ADMISSION_INVALID' })
  return facts?.schemaStageOnly === true
}

async function main() {
  const [profileBytes, dataCutoverConfig, v1, n1c] = await Promise.all([fs.readFile(path.join(root, profilePath)), fs.readFile(path.join(root, dataCutoverConfigPath), 'utf8').then(JSON.parse), ...['config/release/dev117-ai-pdm-independent-production.json', 'config/platform/dev-010-n1c-ai-pdm.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse))])
  const profile = JSON.parse(profileBytes.toString('utf8'))
  assertDev117V3Profile(profile, v1, n1c)
  const args = parseOwnerStageArgs(process.argv.slice(2), profile.artifact.releaseBucket)
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? ''
  const dailyWorkflowRef = `${profile.application.repository}/${profile.workflow.path}@refs/heads/main`
  const principalWorkflowPath = '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml'
  const principalWorkflowRef = `${profile.application.repository}/${principalWorkflowPath}@refs/heads/main`
  const appliedContinuationOwner = process.env.PDM_APPLIED_MIGRATION_CONTINUATION_RELEASE === 'true' &&
    process.env.GITHUB_WORKFLOW_REF === principalWorkflowRef
  const fullBuild = args.stage === 'build' && (process.env.GITHUB_WORKFLOW_REF === dailyWorkflowRef || appliedContinuationOwner)
  const migrationExecutionReadbackToken = args.stage === 'prepare' ? process.env.AIPDM_MIGRATION_EXECUTION_READ_TOKEN ?? null : null
  const fullOwner = process.env.GITHUB_WORKFLOW_REF === dailyWorkflowRef || appliedContinuationOwner
  if (fullOwner && args.stage === 'prepare' && (typeof migrationExecutionReadbackToken !== 'string' || migrationExecutionReadbackToken.length < 20)) throw Error('MIGRATION_READBACK_TOKEN_INVALID')
  const transport = fullBuild
    ? createAiPdmBuildReadbackTransport({ token, verifierReadbackToken: process.env.AIPDM_BUILD_VERIFIER_READ_TOKEN ?? '' })
    : createOwnerTransport({ token, migrationExecutionReadbackToken })
  const result = await executeOwnerStage({
    ...args, profile, profileSha256: createHash('sha256').update(readGitBlob(root, profilePath)).digest('hex'), transport, validateIntent: assertDev117ReleaseIntent, dataCutoverConfig, migrationOnlyWorkflowPath: principalWorkflowPath,
    createSourceIdentity: async (sourceRevision) => createGitSourceIdentity(root, sourceRevision),
    createSourceArchive: async (sourceRevision) => createGitArchiveWithDev125Installer(root, sourceRevision, process.env.DEV125_INSTALLER_ROOT),
    windowsInstallerRequired: true,
    readSource: createContinuousReleaseSourceReader(root),
    buildMigrationBundle: async (sourceRevision, context) => buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision, context),
  })
  if (args.stage === 'migrate') {
    const migrationDisposition = migrationDispositionFromStageResult(result)
    if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `migration_disposition=${migrationDisposition}\nschema_stage_only=${migrationSchemaStageOnlyFromStageResult(result)}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(async (error) => {
  const code = /^[A-Z][A-Z0-9_]{2,127}$/u.test(String(error.code ?? '')) ? String(error.code) : 'WORKFLOW_JOB_FAILURE'
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `failure_code=${code}\n`, 'utf8')
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
