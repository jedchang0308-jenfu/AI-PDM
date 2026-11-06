#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildMigrationRunner, parseMigrationRunnerBuildArgs } from './lib/dev117-migration-runner-build.mjs'

async function main() {
  const sourceLockRef = parseMigrationRunnerBuildArgs(process.argv.slice(2))
  const result = await buildMigrationRunner({ sourceLockRef,
    token: process.env.GOOGLE_OAUTH_ACCESS_TOKEN ?? '', githubToken: process.env.GITHUB_TOKEN ?? '' })
  process.stdout.write(`${JSON.stringify({ status: 'PASS', ref: result.ref, generation: String(result.metadata.generation) })}\n`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  const value = String(error.code ?? error.message)
  process.stderr.write(`${/^[A-Z][A-Z0-9_]{2,127}$/u.test(value) ? value : 'RUNNER_BUILD_FAILED'}\n`)
  process.exitCode = 1
})
