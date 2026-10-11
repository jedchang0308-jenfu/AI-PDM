import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalCatalog, canonicalRole } from './lib/jms-dev-005-role-catalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex')
export const RD_CATALOG_V7_PATH = 'db/postgres/085_dev121_principal_role_catalog_v7.sql'
export function buildPrincipalRoleCatalogV7(source) {
  assert.equal(source.catalogVersion, 'ai-pdm.role-catalog.2026-10-05.v6')
  assert.equal(source.catalogSha256, 'bdc8d2b8f717e4af9d48cf882d1a564a5caaabaaaacdcf20bc5db36a5b6960af')
  assert.equal(sha256(canonicalCatalog(source)), source.catalogSha256)
  assert.equal(source.roles.length, 9)
  assert.equal(source.roles.filter(role => role.roleCode === 'rd').length, 1)
  const roles = source.roles.map(role => {
    assert.equal(sha256(canonicalRole(role)), role.roleDefinitionHash)
    if (role.roleCode !== 'rd') return structuredClone(role)
    assert.equal(role.stableRoleId, 'role-rd')
    assert.equal(role.subjectKind, 'employee')
    assert.deepEqual(role.allowedScopeKinds, ['workspace'])
    assert.ok(!role.permissions.some(p => p.code === 'numbering.drawings.view'))
    const updated = { ...role, permissions: [...role.permissions,
      { code: 'numbering.drawings.view', kind: 'page', allowed: true }].sort((a, b) =>
      `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`)) }
    updated.roleDefinitionHash = sha256(canonicalRole(updated))
    return updated
  })
  const catalog = { contractVersion: source.contractVersion, applicationId: source.applicationId,
    catalogVersion: 'ai-pdm.role-catalog.2026-10-10.v7', publishedAt: '2026-10-10T00:00:00.000Z', roles,
    catalogSha256: '' }
  catalog.catalogSha256 = sha256(canonicalCatalog(catalog))
  return catalog
}
export function buildV7Migration(template, baseline, catalog) {
  assert.deepEqual(catalog, buildPrincipalRoleCatalogV7(baseline))
  const normalized = template.replaceAll('\r\n', '\n')
  assert.equal(sha256(normalized), 'c3f4d0465e39cd54a8c8b9a676811b4c3e158aa5a1b2c7945981c05bdeef7284')
  return normalized
    .replace(/catalog jsonb := \$dev121_catalog\$[^\n]+\$dev121_catalog\$::jsonb;/u,
      'catalog jsonb := $dev121_catalog$'+JSON.stringify(catalog)+'$dev121_catalog$::jsonb;')
    .replace(/baseline_catalog jsonb := \$dev121_baseline\$[^\n]+\$dev121_baseline\$::jsonb;/u,
      'baseline_catalog jsonb := $dev121_baseline$'+JSON.stringify(baseline)+'$dev121_baseline$::jsonb;')
    .replaceAll('dev121-principal-role-catalog-v6', 'dev121-principal-role-catalog-v7')
    .replace('publish v6 after the verified current owner ledger in the controlled maintenance window.',
      'publish v7 only after OrgMaster exact-version compatibility and the controlled maintenance fence.')
    .replace('AIPDM/DEV-121#principal-owner-command-amendment', 'AIPDM/DEV-121#rd-capabilities')
    .replace("previous_version text := 'ai-pdm.role-catalog.2026-09-28.v5';",
      "previous_version text := '"+baseline.catalogVersion+"';")
    .replace("previous_hash text := '4f05dd4228b51e5086f30886330f48f1f137e37d383a26114bb34f5874d39197';",
      "previous_hash text := '"+baseline.catalogSha256+"';")
    .replaceAll('DEV121_CATALOG_V5_BASELINE_MISMATCH', 'DEV121_CATALOG_V6_BASELINE_MISMATCH')
    .replaceAll('DEV121_CATALOG_V6_READBACK_FAILED', 'DEV121_CATALOG_V7_READBACK_FAILED')
    .replace('principal-only catalog v6', 'principal-only catalog v7')
    .replace('explicit highest-role registered capabilities', 'explicit RD drawing view; edit and submit retained; approval denied')
}
function main() {
  const mode = process.argv[2]
  assert.ok(mode === '--write' || mode === '--check')
  const baseline = JSON.parse(readFileSync(join(root, 'config/access-control/jenfu-role-catalog.v6.json'), 'utf8'))
  const catalog = buildPrincipalRoleCatalogV7(baseline)
  const catalogPath = join(root, 'config/access-control/jenfu-role-catalog.v7.json')
  const sql = buildV7Migration(readFileSync(join(root, 'db/postgres/081_dev121_principal_role_catalog_v6.sql'), 'utf8'), baseline, catalog)
  if (mode === '--write') {
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2)+'\n')
    writeFileSync(join(root, RD_CATALOG_V7_PATH), sql)
  }
  assert.deepEqual(JSON.parse(readFileSync(catalogPath, 'utf8')), catalog)
  assert.equal(readFileSync(join(root, RD_CATALOG_V7_PATH), 'utf8').replaceAll('\r\n', '\n'), sql)
  console.log(JSON.stringify({ status: 'PASS', catalogVersion: catalog.catalogVersion,
    catalogSha256: catalog.catalogSha256, migrationSha256: sha256(sql), changedRole: 'rd',
    permissionAdded: 'page:numbering.drawings.view' }))
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
