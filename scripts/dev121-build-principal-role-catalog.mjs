import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalCatalog, canonicalRole } from './lib/jms-dev-005-role-catalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'config/access-control/jenfu-role-catalog.v1.json')
const targetPath = join(root, 'config/access-control/jenfu-role-catalog.v4.json')
const version = 'ai-pdm.role-catalog.2026-09-25.v4'
const sourceHash = '46376639b7aec06798786b9d1a113ba604cf90ca31541a9464ecce7a49d116c8'
const grantedRoles = ['rd', 'rd_manager', 'pdm_admin', 'system_admin']
const addedCapabilities = [
  'numbering.workspace.create',
  'numbering.workspace.update',
  'numbering.workspace.cancel',
  'numbering.candidate.review.submit'
]
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex')

function appliedGrantRoles(migrations, code) {
  const matches = [...migrations.matchAll(/\('([^']+)',\s*'([^']+)'\)/gu)]
  return [...new Set(matches.filter((match) => match[2] === code)
    .map((match) => match[1]))].sort()
}

export function buildPrincipalRoleCatalog(source, migrationTexts) {
  assert.equal(source.catalogVersion, 'ai-pdm.role-catalog.2026-09-03.v3')
  assert.equal(source.catalogSha256, sourceHash)
  assert.equal(sha256(canonicalCatalog(source)), sourceHash)
  const migrations = migrationTexts.join('\n')
  for (const code of addedCapabilities) {
    assert.deepEqual(appliedGrantRoles(migrations, code), [...grantedRoles].sort(),
      `${code} applied role matrix drift`)
  }
  const roles = source.roles.map((role) => {
    const permissions = grantedRoles.includes(role.roleCode)
      ? [...role.permissions, ...addedCapabilities.map((code) =>
        ({ code, kind: 'action', allowed: true }))]
      : [...role.permissions]
    const updated = { ...role, permissions: permissions.sort((a, b) =>
      `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)) }
    updated.roleDefinitionHash = sha256(canonicalRole(updated))
    return updated
  })
  const catalog = {
    contractVersion: source.contractVersion,
    applicationId: source.applicationId,
    catalogVersion: version,
    publishedAt: '2026-09-25T00:00:00.000Z',
    roles,
    catalogSha256: ''
  }
  catalog.catalogSha256 = sha256(canonicalCatalog(catalog))
  return catalog
}

function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check', 'choose --write or --check')
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const migrationTexts = [
    readFileSync(join(root, 'db/postgres/012_number_state_flow_phase1a.sql'), 'utf8'),
    readFileSync(join(root, 'db/postgres/016_number_state_flow_phase1c.sql'), 'utf8')
  ]
  const catalog = buildPrincipalRoleCatalog(source, migrationTexts)
  if (mode === '--write') writeFileSync(targetPath, `${JSON.stringify(catalog, null, 2)}\n`)
  const stored = JSON.parse(readFileSync(targetPath, 'utf8'))
  assert.deepEqual(stored, catalog)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', catalogVersion: version,
    catalogSha256: catalog.catalogSha256, roles: catalog.roles.length,
    addedCapabilities })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
