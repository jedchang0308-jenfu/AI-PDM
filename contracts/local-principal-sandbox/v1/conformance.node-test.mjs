import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const expected = {
  "protocol.mjs": "541bd7bd7d75f0fa3a62004abfbe0d25b4c3a10e2920ce3644f6a5673432187e",
  "protocol.d.mts": "947939f8279af5d8e96b2846bf2c3be04e6e5f991464a57b40d5ae0ccb1cb8f9",
  "client.mjs": "f89ff8fc333521fb8dea386f17829ae8d3c15046e8edd8bc12c60d69f1d76115",
  "client.d.mts": "175cc455926cd93ad5ebb446b6ca4df88f24614665e6f508dda2c1286d9431a8"
}
for (const [name, digest] of Object.entries(expected)) {
  test('shared local-principal contract content is pinned: ' + name, () => {
    const content = readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(createHash('sha256').update(content).digest('hex'), digest,
      'Contract drift: update all consumers and conformance pins together after reviewing the version join')
  })
}
