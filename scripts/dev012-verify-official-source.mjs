#!/usr/bin/env node
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'

const repository = 'jedchang0308-jenfu/AI-PDM'
const branch = 'main'
export const OFFICIAL_SOURCE_WORKFLOW_REFS = new Set([
  `${repository}/.github/workflows/deploy-ai-pdm-independent-production.yml@refs/heads/${branch}`,
  `${repository}/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/${branch}`,
  `${repository}/.github/workflows/read-ai-pdm-rd-permission-state-production.yml@refs/heads/${branch}`,
])

export function assertOfficialSourceWorkflow(environment) {
  if (environment.GITHUB_ACTIONS !== 'true' ||
      environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      environment.GITHUB_REPOSITORY !== repository ||
      environment.GITHUB_REF !== `refs/heads/${branch}` ||
      !OFFICIAL_SOURCE_WORKFLOW_REFS.has(environment.GITHUB_WORKFLOW_REF)) {
    throw new Error('DEV012_OFFICIAL_SOURCE_REVIEW_WORKFLOW_INVALID')
  }
}

export async function verifyOfficialWorkflowSource({ environment, revision, sourceTree, ...transport }) {
  assertOfficialSourceWorkflow(environment)
  if (revision !== environment.GITHUB_SHA) {
    throw new Error('DEV012_OFFICIAL_SOURCE_REVIEW_CHECKOUT_MISMATCH')
  }
  return verifyOfficialMergedSource({ ...transport, repository, branch,
    revision, sourceTree, token: environment.GITHUB_TOKEN, rulesetId: 24077878 })
}

async function main(environment = process.env) {
  assertOfficialSourceWorkflow(environment)
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'],
    { encoding: 'utf8' }).trim()
  const result = await verifyOfficialWorkflowSource({ environment, revision, sourceTree })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
}
