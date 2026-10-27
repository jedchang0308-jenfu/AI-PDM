import assert from 'node:assert/strict'
import test from 'node:test'
import { assertDev125WindowsInstallerEvidence } from './lib/dev121-owner-release-proof.mjs'

const revision = 'a'.repeat(40)
const installer = {
  sourceRevision: revision,
  version: '0.1.0-test',
  protocolVersion: 1,
  sha256: 'b'.repeat(64),
}

function evidence(rows = [installer, installer, installer], owner = 'ai-pdm') {
  return {
    owner,
    revision,
    deployment: rows[0] ? { windowsInstaller: rows[0] } : {},
    build: rows[1] ? { facts: { windowsInstaller: rows[1] } } : { facts: {} },
    provenance: rows[2] ? { windowsInstaller: rows[2] } : {},
  }
}

test('DEV-125 release proof accepts an absent legacy binding or three identical current receipts', () => {
  assert.equal(assertDev125WindowsInstallerEvidence(evidence([null, null, null])), true)
  assert.equal(assertDev125WindowsInstallerEvidence(evidence()), true)
})

test('DEV-125 release proof rejects every partial installer receipt tri-join', () => {
  for (let missing = 0; missing < 3; missing += 1) {
    const rows = [installer, installer, installer]
    rows[missing] = null
    assert.throws(() => assertDev125WindowsInstallerEvidence(evidence(rows)), /PROVENANCE_INVALID/u)
  }
})

test('DEV-125 release proof rejects mismatched, malformed and other-owner installer evidence', () => {
  const changed = { ...installer, sha256: 'c'.repeat(64) }
  assert.throws(() => assertDev125WindowsInstallerEvidence(evidence([installer, changed, installer])), /PROVENANCE_INVALID/u)
  assert.throws(() => assertDev125WindowsInstallerEvidence(evidence([installer, { ...installer, protocolVersion: 2 }, installer])),
    /PROVENANCE_INVALID/u)
  assert.throws(() => assertDev125WindowsInstallerEvidence(evidence(undefined, 'orgmaster')), /PROVENANCE_INVALID/u)
})
