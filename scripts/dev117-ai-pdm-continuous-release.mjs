#!/usr/bin/env node
import fs from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { buildAiPdmPackage } from './dev010-n1c-ai-pdm-package.mjs'
import { assertDev117ReleaseIntent, assertDev117V3Profile, buildDev117MigrationBundle } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchive, executeOwnerStage, parseOwnerStageArgs, readGitBlob } from './lib/dev012-owner-stage-executor.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const profilePath = 'config/release/dev117-ai-pdm-independent-production-v3.json'

async function main() {
  const [profileBytes, v1, n1c] = await Promise.all([fs.readFile(path.join(root, profilePath)), ...['config/release/dev117-ai-pdm-independent-production.json', 'config/platform/dev-010-n1c-ai-pdm.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse))])
  const profile = JSON.parse(profileBytes.toString('utf8'))
  assertDev117V3Profile(profile, v1, n1c)
  const args = parseOwnerStageArgs(process.argv.slice(2), profile.artifact.releaseBucket)
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const result = await executeOwnerStage({
    ...args, profile, profileSha256: createHash('sha256').update(readGitBlob(root, profilePath)).digest('hex'), transport, validateIntent: assertDev117ReleaseIntent,
    createSourceArchive: async (sourceRevision) => createGitArchive(root, sourceRevision),
    buildMigrationBundle: async (sourceRevision) => buildDev117MigrationBundle(profile, buildAiPdmPackage(n1c), sourceRevision),
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
