#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createProductionSlicePlanFromGit } from './lib/production-slice-plan.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const option = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const plan = createProductionSlicePlanFromGit({ root, base: option('--base'), head: option('--head') })
const canonical = JSON.stringify(plan)
const result = { ...plan, planSha256: createHash('sha256').update(canonical).digest('hex') }
const outputPath = option('--output')
if (outputPath) {
  const absolute = path.resolve(root, outputPath)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
}
const githubOutput = option('--github-output') ?? process.env.GITHUB_OUTPUT
if (githubOutput) {
  const rows = {
    classification: result.classification,
    plan_sha256: result.planSha256,
    ai_coo_review_requested: result.failurePolicy.action === 'TRIGGER_AI_COO_REVIEW',
    docs_only: result.classification === 'DOCUMENTATION_ONLY',
    ...Object.fromEntries(Object.entries(result.gates).map(([key, value]) => [key.replace(/[A-Z]/gu, match => `_${match.toLowerCase()}`), value])),
  }
  fs.appendFileSync(githubOutput, Object.entries(rows).map(([key, value]) => `${key}=${String(value).toLowerCase()}`).join('\n') + '\n')
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
