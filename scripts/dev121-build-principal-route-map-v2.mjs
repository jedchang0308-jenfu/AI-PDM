import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'config/access-control/jenfu-route-permission-map.v1.json')
const targetPath = join(root, 'config/access-control/jenfu-route-permission-map.v2.json')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
// Full reviewed v2 entries, including the Principal history read and retired
// cross-owner mutations. An unreviewed route or permission change must fail.
const approvedV2EntriesSha256 = '2be18f61bcce2e537f6962d278a6af53e381db6549308f40d18b34e4c95078c6'

export function buildPrincipalRouteMapV2(source, reviewedV2) {
  assert.deepEqual(source.denominator, { uniqueFiles: 77, uniqueMethods: 94, policyEntries: 103 })
  assert.equal(source.sourceSha256, '699df04d770ee27f71adc87b2996a3e4f972da9c011d7ac1ae16ea6643ce60c7')
  assert.equal(reviewedV2.contractVersion, source.contractVersion)
  assert.equal(reviewedV2.applicationId, source.applicationId)
  assert.ok(Array.isArray(reviewedV2.entries))
  assert.equal(sha256(JSON.stringify(reviewedV2.entries)), approvedV2EntriesSha256,
    'unreviewed v2 route policy change')
  const entries = reviewedV2.entries
  const denominator = {
    uniqueFiles: new Set(entries.map((entry) => entry.path)).size,
    uniqueMethods: new Set(entries.map((entry) => `${entry.path}\0${entry.method}`)).size,
    policyEntries: entries.length
  }
  assert.deepEqual(denominator, { uniqueFiles: 107, uniqueMethods: 127, policyEntries: 137 })
  return {
    contractVersion: source.contractVersion,
    applicationId: source.applicationId,
    source: 'AIPDM/DEV-121#principal-only-route-policy; DEV-005 v1 preserved',
    sourceSha256: sha256(JSON.stringify({ base: source.sourceSha256, entries })),
    denominator, entries
  }
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const value = buildPrincipalRouteMapV2(
    JSON.parse(readFileSync(sourcePath, 'utf8')),
    JSON.parse(readFileSync(targetPath, 'utf8')))
  if (mode === '--write') writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`)
  assert.deepEqual(JSON.parse(readFileSync(targetPath, 'utf8')), value)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', source: 'DEV-005 v1 + exact reviewed DEV-121 v2',
    denominator: value.denominator, sourceSha256: value.sourceSha256 })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
