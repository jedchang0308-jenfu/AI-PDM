#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { buildAiPdmPackage } from './dev010-n1c-ai-pdm-package.mjs'
import { assertDev117ContinuousProfile, assertDev117ReleaseIntent, buildDev117MigrationBundle } from './lib/dev117-ai-pdm-continuous-release.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { createGitArchive } from './lib/dev012-owner-stage-executor.mjs'
import { executePrerequisiteProducer, parsePrerequisiteProducerArgs, resolveOwnerInputPath } from './lib/dev012-owner-prerequisite-producer.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readInput(inputPath) {
  const [realRoot, realInput] = await Promise.all([fs.realpath(root), fs.realpath(resolveOwnerInputPath(root, inputPath))])
  if (!realInput.startsWith(realRoot + path.sep)) {
    const error = new Error('INPUT_PATH_OUT_OF_SCOPE')
    error.code = 'INPUT_PATH_OUT_OF_SCOPE'
    throw error
  }
  return JSON.parse(await fs.readFile(realInput, 'utf8'))
}

async function main() {
  const args = parsePrerequisiteProducerArgs(process.argv.slice(2))
  const [profile, v1, n1c] = await Promise.all(['config/release/dev117-ai-pdm-independent-production-v2.json', 'config/release/dev117-ai-pdm-independent-production.json', 'config/platform/dev-010-n1c-ai-pdm.json'].map((file) => fs.readFile(path.join(root, file), 'utf8').then(JSON.parse)))
  assertDev117ContinuousProfile(profile, v1, n1c)
  const input = args.inputPath ? await readInput(args.inputPath) : null
  const transport = createOwnerTransport({ token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '' })
  const result = await executePrerequisiteProducer({
    ...args, input, profile, root, transport,
    validateIntent: assertDev117ReleaseIntent,
    createSourceArchive: async (sourceRevision) => createGitArchive(root, sourceRevision),
    buildMigrationBundle: async (sourceRevision) => buildDev117MigrationBundle(profile, buildAiPdmPackage(n1c), sourceRevision),
  })
  process.stdout.write(`${JSON.stringify({ stage: args.stage, releaseId: args.releaseId, ref: result.ref, generation: String(result.metadata.generation), status: 'PASS' })}\n`)
}

main().catch((error) => { process.stderr.write(`${error.code ?? error.message}\n`); process.exitCode = 1 })
