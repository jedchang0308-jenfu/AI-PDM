import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalCatalog, canonicalRole } from './lib/jms-dev-005-role-catalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourceHash = '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197'
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex')
export function buildPrincipalRoleCatalogV6(source, inventory) {
  assert.equal(source.catalogVersion, 'ai-pdm.role-catalog.2026-09-28.v5')
  assert.equal(source.catalogSha256, sourceHash)
  assert.equal(sha256(canonicalCatalog(source)), sourceHash)
  assert.equal(source.roles.length, 9)
  assert.equal(inventory.contractVersion, 'ai-pdm.active-capabilities.v1')
  const activeKeys = [...new Set(source.roles.flatMap(role => role.permissions.map(p => p.kind + ':' + p.code)))].sort()
  const inventoryKeys = inventory.capabilities.map(p => p.kind + ':' + p.code).sort()
  assert.deepEqual(inventoryKeys, activeKeys)

  const permissions = inventory.capabilities.map(({ kind, code }) => ({ kind, code, allowed: true }))
  assert.equal(new Set(permissions.map(p => p.kind + ':' + p.code)).size, permissions.length)
  assert.ok(permissions.every(p => (p.kind === 'page' || p.kind === 'action') && /^[a-z0-9_.]+$/u.test(p.code)))
  const roles = source.roles.map(role => {
    if (role.roleCode !== 'system_admin') return structuredClone(role)
    const updated = { ...role, permissions: permissions.sort((a,b) =>
      (a.kind + ':' + a.code + ':' + a.allowed).localeCompare(b.kind + ':' + b.code + ':' + b.allowed)) }
    updated.roleDefinitionHash = sha256(canonicalRole(updated))
    return updated
  })
  const catalog = { contractVersion: source.contractVersion, applicationId: source.applicationId,
    catalogVersion: 'ai-pdm.role-catalog.2026-10-05.v6', publishedAt: '2026-10-05T00:00:00.000Z',
    roles, catalogSha256: '' }
  catalog.catalogSha256 = sha256(canonicalCatalog(catalog))
  return catalog
}
function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check')
  const source = JSON.parse(readFileSync(join(root,'config/access-control/jenfu-role-catalog.v5.json'),'utf8'))
  const inventory = JSON.parse(readFileSync(join(root,'config/access-control/jenfu-active-capabilities.v1.json'),'utf8'))
  const result = buildPrincipalRoleCatalogV6(source,inventory)
  const target = join(root,'config/access-control/jenfu-role-catalog.v6.json')
  if (mode === '--write') writeFileSync(target, JSON.stringify(result,null,2)+'\n')
  assert.deepEqual(JSON.parse(readFileSync(target,'utf8')),result)
  console.log(JSON.stringify({status:'PASS',catalogVersion:result.catalogVersion,catalogSha256:result.catalogSha256,capabilityCount:inventory.capabilities.length}))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
