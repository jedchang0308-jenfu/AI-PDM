import assert from 'node:assert/strict'
import test from 'node:test'

import { loadN1cAiPdmConfig } from './dev010-n1c-ai-pdm-package.mjs'

const config = loadN1cAiPdmConfig()

test('N1C-AI-SOURCE-01 source freeze requires a clean candidate', () => {
  assert.equal(config.sourceFreeze.requiredCleanCandidate, true)
  assert.equal(config.sourceFreeze.outputPrefix, 'output/dev-010/n1c/')
})

test('N1C-AI-SOURCE-02 root firebase.json and old staging IaC are outside the allowlist', () => {
  const paths = [...config.sourceFreeze.allowModify, ...config.sourceFreeze.allowNew]
  assert.ok(!paths.includes('firebase.json'))
  assert.ok(!paths.some((item) => item.startsWith('infra/google-cloud/staging/')))
  assert.ok(paths.includes('src/app/api/health/ready/route.ts'))
})

test('N1C-AI-SOURCE-03 production, old staging, Billing, and external delivery stay zero', () => {
  assert.equal(config.safety.productionWrites, false)
  assert.equal(config.safety.oldStagingMutations, 0)
  assert.equal(config.safety.billingChanges, 0)
  assert.equal(config.safety.externalDeliveries, 0)
})
