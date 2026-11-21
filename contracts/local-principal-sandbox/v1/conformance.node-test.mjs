import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const expected = {
  "protocol.mjs": "c610d3a1c110517256d02ad1db91f97c99a65b1c3429c80aa1f6b90db59301c5",
  "protocol.d.mts": "108faf0e220b6dc99987c71de607fc8d2b51db810129d2a666943a5c41e025e0",
  "client.mjs": "d9b3eb10e4b6ac5e2a8bbbf8a872e221390bb31a6ef02e3cb7a130f57e52ee54",
  "client.d.mts": "175cc455926cd93ad5ebb446b6ca4df88f24614665e6f508dda2c1286d9431a8"
}
for (const [name, digest] of Object.entries(expected)) {
  test('shared local-principal contract content is pinned: ' + name, () => {
    const content = readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(createHash('sha256').update(content).digest('hex'), digest,
      'Contract drift: update all consumers and conformance pins together after reviewing the version join')
  })
}
