#!/usr/bin/env node
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertDev117ReleaseIntent, assertDev117V3Profile, buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { createOwnerTransport, createAiPdmBuildReadbackTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchive, createGitSourceIdentity, executeOwnerStage, parseOwnerStageArgs, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'
const dataCutoverConfigPath = 'config/release/dev012-ai-pdm-production-data-cutover.json'

async function main() {
  const [profileBytes, dataCutoverConfig, v1, n1c] = await Promise.all([fs.readFile(path.join(root, profilePath)), fs.readFile(path.join(root, dataCutoverConfigPath), 'utf8').then(JSON.parse), ...['config/release/dev117-ai-pdm-independent-production.json', 'config/platform/dev-010-n1c-ai-pdm.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse))])
  const profile = JSON.parse(profileBytes.toString('utf8'))
  assertDev117V3Profile(profile, v1, n1c)
  const args = parseOwnerStageArgs(process.argv.slice(2), profile.artifact.releaseBucket)
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? ''
  const fullBuild = args.stage === 'build' && process.env.GITHUB_WORKFLOW_REF === `${profile.application.repository}/${profile.workflow.path}@refs/heads/main`
  const migrationExecutionReadbackToken = args.stage === 'prepare' ? process.env.AIPDM_MIGRATION_EXECUTION_READ_TOKEN ?? null : null
  const fullOwner = process.env.GITHUB_WORKFLOW_REF === `${profile.application.repository}/${profile.workflow.path}@refs/heads/main`
  if (fullOwner && args.stage === 'prepare' && (typeof migrationExecutionReadbackToken !== 'string' || migrationExecutionReadbackToken.length < 20)) throw Error('MIGRATION_READBACK_TOKEN_INVALID')
  const transport = fullBuild
    ? createAiPdmBuildReadbackTransport({ token, verifierReadbackToken: process.env.AIPDM_BUILD_VERIFIER_READ_TOKEN ?? '' })
    : createOwnerTransport({ token, migrationExecutionReadbackToken })
  const result = await executeOwnerStage({
    ...args, profile, profileSha256: createHash('sha256').update(readGitBlob(root, profilePath)).digest('hex'), transport, validateIntent: assertDev117ReleaseIntent, dataCutoverConfig, migrationOnlyWorkflowPath: '.github/workflows/deploy-ai-pdm-principal-migrations-production.yml',
    createSourceIdentity: async (sourceRevision) => createGitSourceIdentity(root, sourceRevision),
    createSourceArchive: async (sourceRevision) => createGitArchive(root, sourceRevision),
    readWorkerSource: (repositoryPath, sourceRevision) => readGitBlob(root, repositoryPath, sourceRevision),
    buildMigrationBundle: async (sourceRevision, context) => buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision, context),
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
