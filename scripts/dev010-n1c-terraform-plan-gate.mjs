#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { assertExpectedPlanInputs, assertPlanProfile, loadPlanAllowlist } from './lib/dev010-n1c-terraform-plan-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
for (const forbidden of ['--apply', '--destroy', '--replace']) {
  if (args.includes(forbidden)) throw new Error(`DEV010_N1C_${forbidden.slice(2).toUpperCase()}_FORBIDDEN`)
}
const value = (name) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`))
  if (inline) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const planPath = value('--plan')
if (!planPath) throw new Error('DEV010_N1C_PLAN_REQUIRED')
const profile = value('--profile')
if (!profile) throw new Error('DEV010_N1C_PLAN_PROFILE_REQUIRED')
const allowlistPath = value('--allowlist') ?? 'config/platform/dev-010-n1c-ai-pdm-plan-allowlist.json'
const planSource = planPath === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(root, planPath), 'utf8')
const plan = JSON.parse(planSource)
const allowlist = loadPlanAllowlist(path.resolve(root, allowlistPath))
const requiredInputs = ['source_revision', 'foundation_manifest_sha256', 'application_image', 'migration_image']
const inputGate = assertExpectedPlanInputs(plan, {
  source_revision: value('--source-revision'),
  foundation_manifest_sha256: value('--foundation-manifest-sha256'),
  application_image: value('--application-image'),
  migration_image: value('--migration-image'),
}, requiredInputs)
const gate = assertPlanProfile(plan, allowlist, profile)
process.stdout.write(`${JSON.stringify({ app: 'AI-PDM', providerMutation: 'NOT_RUN', ...gate, boundInputs: inputGate.boundInputs })}\n`)
