import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { buildPrincipalRoleCatalogV7, buildV7Migration } from './dev121-build-principal-role-catalog-v7.mjs'
const read = relative => readFileSync(new URL('../'+relative, import.meta.url), 'utf8')
const baseline = JSON.parse(read('config/access-control/jenfu-role-catalog.v6.json'))
const catalog = JSON.parse(read('config/access-control/jenfu-role-catalog.v7.json'))
const template = read('db/postgres/081_dev121_principal_role_catalog_v6.sql')
test('v7 is exactly the reviewed one-capability RD delta', () => {
  assert.deepEqual(buildPrincipalRoleCatalogV7(baseline), catalog)
  assert.deepEqual(catalog.roles.filter(role => role.roleCode !== 'rd'), baseline.roles.filter(role => role.roleCode !== 'rd'))
  const rd = catalog.roles.find(role => role.roleCode === 'rd')
  assert.deepEqual(rd.permissions.filter(p => p.code !== 'numbering.drawings.view'), baseline.roles[0].permissions)
  assert.ok(!rd.permissions.some(p => p.code === 'approval.request.decide'))
})
test('tampered baseline, additional permissions and changed SQL template fail closed', () => {
  const changed = structuredClone(baseline)
  changed.roles[0].permissions.push({ kind: 'action', code: 'approval.request.decide', allowed: true })
  assert.throws(() => buildPrincipalRoleCatalogV7(changed))
  assert.throws(() => buildV7Migration(template+'\n', baseline, catalog))
  assert.throws(() => buildV7Migration(template, baseline, { ...catalog, catalogSha256: '0'.repeat(64) }))
})
test('085 is the exact forward-only v6-to-v7 publication with original atomic guards', () => {
  const sql = buildV7Migration(template, baseline, catalog)
  assert.equal(sql, read('db/postgres/085_dev121_principal_role_catalog_v7.sql').replaceAll('\r\n','\n'))
  assert.ok(sql.includes('DEV121_CATALOG_V6_BASELINE_MISMATCH'))
  assert.ok(sql.includes('DEV121_CATALOG_V7_READBACK_FAILED'))
  assert.ok(sql.includes('OrgMaster exact-version compatibility'))
  assert.ok(sql.includes('SET LOCAL ROLE jenfu_ai_pdm_migrator'))
  assert.ok(!sql.includes('orgmaster_core') && !sql.includes('platform_core'))
})
