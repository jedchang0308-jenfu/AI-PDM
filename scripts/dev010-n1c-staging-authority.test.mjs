import assert from 'node:assert/strict'
import test from 'node:test'

import { loadStagingAuthority, validateStagingAuthority } from './dev010-n1c-staging-authority.mjs'

test('declares shared staging as the active AI-PDM authority and retains legacy rollback', () => {
  const config = loadStagingAuthority()
  assert.equal(config.activeAuthority.canonicalOrigin, 'https://jenfu-platform-nonprod-pdm.web.app')
  assert.equal(config.activeAuthority.cloudSqlDatabase, 'jenfu_stg')
  assert.equal(config.legacyRollbackAuthority.cloudSqlDatabase, 'ai_pdm')
  assert.equal(config.legacyEntryTransition.statusCode, 302)
  assert.equal(config.safety.billingUnlinkAllowed, false)
})

test('fails closed on target, redirect, rollback, or destructive-policy drift', () => {
  const base = loadStagingAuthority()
  for (const mutate of [
    (value) => { value.activeAuthority.projectId = 'jenfu-ai-pdm-prod' },
    (value) => { value.legacyEntryTransition.statusCode = 301 },
    (value) => { value.legacyRollbackAuthority.hostingVersion = 'unknown' },
    (value) => { value.safety.billingUnlinkAllowed = true },
  ]) {
    const changed = structuredClone(base)
    mutate(changed)
    assert.throws(() => validateStagingAuthority(changed), /DEV010_N1C_/u)
  }
})
