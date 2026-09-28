import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'config/access-control/jenfu-route-permission-map.v1.json')
const targetPath = join(root, 'config/access-control/jenfu-route-permission-map.v2.json')
const principalCommandEntry = {
  path: 'src/app/api/numbering/records/route.ts',
  method: 'POST', discriminator: null, authorizationMode: 'permission',
  permissionCode: 'numbering.create', authorizationTarget: 'numbering.create',
  scopeResolver: 'workspace',
  preservedGuards: 'verified principal＋company＋link_variant when drawing requested＋numbering validation／idempotency'
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

export function buildPrincipalRouteMapV2(source) {
  assert.deepEqual(source.denominator, { uniqueFiles: 77, uniqueMethods: 94, policyEntries: 103 })
  assert.equal(source.sourceSha256, '699df04d770ee27f71adc87b2996a3e4f972da9c011d7ac1ae16ea6643ce60c7')
  assert.ok(!source.entries.some((entry) => entry.path === principalCommandEntry.path &&
    entry.method === principalCommandEntry.method))
  const entries = [...source.entries, principalCommandEntry]
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  const denominator = {
    uniqueFiles: new Set(entries.map((entry) => entry.path)).size,
    uniqueMethods: new Set(entries.map((entry) => `${entry.path}\0${entry.method}`)).size,
    policyEntries: entries.length
  }
  assert.deepEqual(denominator, { uniqueFiles: 78, uniqueMethods: 95, policyEntries: 104 })
  return {
    contractVersion: source.contractVersion,
    applicationId: source.applicationId,
    source: 'AIPDM/DEV-121#principal-only-route-policy; DEV-005 v1 preserved',
    sourceSha256: sha256(JSON.stringify({ base: source.sourceSha256, additions: [principalCommandEntry] })),
    denominator, entries
  }
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const value = buildPrincipalRouteMapV2(JSON.parse(readFileSync(sourcePath, 'utf8')))
  if (mode === '--write') writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`)
  assert.deepEqual(JSON.parse(readFileSync(targetPath, 'utf8')), value)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', source: 'DEV-005 v1 + DEV-121 v2',
    denominator: value.denominator, sourceSha256: value.sourceSha256 })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
