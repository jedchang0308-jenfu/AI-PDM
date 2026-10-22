#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { assertDev117ReleaseIntent, assertDev117V3Profile, buildDev117MigrationBundle, buildDev117MigrationPackage } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitSourceIdentity } from './lib/dev012-owner-stage-executor.mjs'
import { createFrozenWorkerSourceReader } from './lib/dev122-openswx-native-source-reader.mjs'
import { bindAppliedContinuationTemplateRef, createAppliedContinuationRefreshTransport, refreshAppliedContinuationCapsule } from './lib/dev122-applied-continuation-capsule-refresh.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export function createWifAppliedContinuationRefreshTransport({
  verifierToken,
  builderToken,
  deployerToken,
  githubToken,
  createTransport = createOwnerTransport,
}) {
  return createAppliedContinuationRefreshTransport({
    verifier: createTransport({
      token: verifierToken,
      githubToken,
      builderReadbackToken: builderToken,
      migrationExecutionReadbackToken: deployerToken,
    }),
    builder: createTransport({ token: builderToken, builderReadbackToken: null }),
  })
}

async function main() {
  const value = process.argv.length === 4 && process.argv[2] === '--capsule-ref' ? process.argv[3] : null
  const templateRef = bindAppliedContinuationTemplateRef(value)
  const [profile, v1, n1c] = await Promise.all([
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'config/release/dev117-ai-pdm-independent-production.json',
    'config/platform/dev-010-n1c-ai-pdm.json',
  ].map(file => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse)))
  assertDev117V3Profile(profile, v1, n1c)
  const token = name => {
    const value = process.env[name]?.trim()
    if (!value) throw Object.assign(new Error('APPLIED_CONTINUATION_REFRESH_TOKEN_MISSING'), { code: 'APPLIED_CONTINUATION_REFRESH_TOKEN_MISSING' })
    return value
  }
  const transport = createWifAppliedContinuationRefreshTransport({
    verifierToken: token('GOOGLE_OAUTH_ACCESS_TOKEN'),
    builderToken: token('AIPDM_REFRESH_BUILDER_TOKEN'),
    deployerToken: token('AIPDM_REFRESH_DEPLOYER_TOKEN'),
    githubToken: token('GITHUB_TOKEN'),
  })
  const readWorkerSource = createFrozenWorkerSourceReader(root)
  const result = await refreshAppliedContinuationCapsule({
    templateRef, profile, root, transport, environment: process.env,
    validateIntent: assertDev117ReleaseIntent,
    createSourceIdentity: async sourceRevision => createGitSourceIdentity(root, sourceRevision),
    readWorkerSource,
    buildMigrationBundle: async (sourceRevision, context) => buildDev117MigrationBundle(profile, buildDev117MigrationPackage(profile, n1c), sourceRevision, context),
  })
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `capsule_uri=${result.ref.uri}\ncapsule_sha256=${result.ref.sha256}\nrefreshed=${result.refreshed}\n`, 'utf8')
  }
  process.stdout.write(`${JSON.stringify({ status: 'PASS', ...result })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(`${error.message ?? error.code}\n`)
  process.exitCode = 1
})
