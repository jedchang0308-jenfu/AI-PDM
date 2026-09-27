#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { verifyOfficialMergedSource } from './lib/dev012-official-source-review.mjs'

const repository = 'jedchang0308-jenfu/AI-PDM'
const branch = 'main'
const workflowRefs = new Set([
  `${repository}/.github/workflows/deploy-ai-pdm-independent-production.yml@refs/heads/${branch}`,
  `${repository}/.github/workflows/deploy-ai-pdm-principal-migrations-production.yml@refs/heads/${branch}`,
])

async function main(environment = process.env) {
  if (environment.GITHUB_ACTIONS !== 'true' ||
      environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      environment.GITHUB_REPOSITORY !== repository ||
      environment.GITHUB_REF !== `refs/heads/${branch}` ||
      !workflowRefs.has(environment.GITHUB_WORKFLOW_REF)) {
    throw new Error('DEV012_OFFICIAL_SOURCE_REVIEW_WORKFLOW_INVALID')
  }
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const sourceTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'],
    { encoding: 'utf8' }).trim()
  if (revision !== environment.GITHUB_SHA) {
    throw new Error('DEV012_OFFICIAL_SOURCE_REVIEW_CHECKOUT_MISMATCH')
  }
  const result = await verifyOfficialMergedSource({ repository, branch,
    revision, sourceTree, token: environment.GITHUB_TOKEN })
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
