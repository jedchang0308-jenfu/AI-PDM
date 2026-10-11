#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readGitAuthority } from './lib/dev012-owner-prerequisite-producer.mjs'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'
import { createOwnerTransport } from './lib/dev012-owner-release-runtime.mjs'
import { executeFenceOperation } from './lib/dev121-principal-fence-operator.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export async function main(environment = process.env, args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--check', '--acquire'].includes(args[0]) ||
    !environment.GOOGLE_OAUTH_ACCESS_TOKEN || !environment.GITHUB_TOKEN ||
    !environment.AIPDM_PRINCIPAL_RECOVERY_REF) throw new Error('DEV121_FENCE_OPERATOR_INPUT_INVALID')
  const profile = JSON.parse(await fs.readFile(path.join(root,
    'config/release/dev117-ai-pdm-independent-production-v3.json'), 'utf8'))
  const git = readGitAuthority(root, profile)
  const sourceProof = await verifyOfficialMergedSource({
    repository: profile.application.repository, branch: git.branch,
    revision: git.sourceRevision, sourceTree: git.sourceTree,
    token: environment.GITHUB_TOKEN, rulesetId: 24077878 })
  const recoveryRef = JSON.parse(environment.AIPDM_PRINCIPAL_RECOVERY_REF)
  const transport = createOwnerTransport({ token: environment.GOOGLE_OAUTH_ACCESS_TOKEN })
  const result = await executeFenceOperation({ profile, git, sourceProof, recoveryRef,
    transport, acquire: args[0] === '--acquire' })
  process.stdout.write(JSON.stringify(result) + '\n')
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({ error: error.code ?? error.message,
      recoveryDisposition: error.recoveryDisposition ?? null }) + '\n')
    process.exitCode = 1
  })
}
