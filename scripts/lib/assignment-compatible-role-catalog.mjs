import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { canonicalCatalog, canonicalRole } from './jms-dev-005-role-catalog.mjs'

const baseline = JSON.parse(readFileSync(new URL('../../config/access-control/jenfu-role-catalog.v7.json', import.meta.url), 'utf8'))
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex')
const assignmentFields = role => {
  const { permissions: _permissions, roleDefinitionHash: _hash, ...fields } = role
  return fields
}

/** Owner-side artifact builder, not a runtime write API or dynamic-editor enablement. */
export function buildAssignmentCompatibleRoleCatalog({ catalogVersion, publishedAt, roles }) {
  assert.equal(baseline.catalogSha256, '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9')
  assert.equal(hash(canonicalCatalog(baseline)), baseline.catalogSha256)
  assert.match(catalogVersion, /^ai-pdm\.role-catalog\.\d{4}-\d{2}-\d{2}\.v[1-9]\d*$/)
  assert.notEqual(catalogVersion, baseline.catalogVersion)
  assert.ok(Number.isFinite(Date.parse(publishedAt)))
  assert.equal(roles.length, baseline.roles.length)
  const result = roles.map((role, index) => {
    const original = baseline.roles[index]
    assert.deepEqual(assignmentFields(role), assignmentFields(original), 'assignment contract changed')
    const keys = new Set()
    const permissions = role.permissions.map(permission => {
      assert.deepEqual(Object.keys(permission).sort(), ['allowed', 'code', 'kind'])
      assert.ok(permission.kind === 'page' || permission.kind === 'action')
      assert.match(permission.code, /^[a-z0-9][a-z0-9._-]{0,159}$/)
      assert.equal(typeof permission.allowed, 'boolean')
      const key = `${permission.kind}:${permission.code}`
      assert.ok(!keys.has(key), 'duplicate capability')
      keys.add(key)
      return { code: permission.code, kind: permission.kind, allowed: permission.allowed }
    })
    for (const denied of original.permissions.filter(permission => !permission.allowed)) {
      assert.ok(permissions.some(permission => permission.kind === denied.kind && permission.code === denied.code && !permission.allowed), 'protected deny changed')
    }
    if (original.roleCode === 'system_admin') assert.deepEqual(permissions, original.permissions, 'protected system_admin changed')
    const next = { ...structuredClone(original), permissions }
    next.roleDefinitionHash = hash(canonicalRole(next))
    return next
  })
  const catalog = { contractVersion: baseline.contractVersion, applicationId: baseline.applicationId,
    catalogVersion, publishedAt, roles: result, catalogSha256: '' }
  catalog.catalogSha256 = hash(canonicalCatalog(catalog))
  return catalog
}
