import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { buildAssignmentCompatibleRoleCatalog } from './assignment-compatible-role-catalog.mjs'
import { canonicalCatalog, canonicalRole } from './jms-dev-005-role-catalog.mjs'

const baseline = JSON.parse(readFileSync(new URL('../../config/access-control/jenfu-role-catalog.v7.json', import.meta.url), 'utf8'))
const input = () => ({ catalogVersion: 'ai-pdm.role-catalog.2026-10-19.v8', publishedAt: '2026-10-19T00:00:00.000Z', roles: structuredClone(baseline.roles) })
const hash = value => createHash('sha256').update(value).digest('hex')
test('owner builds a capability-only publication without changing assignment identity or the old artifact', () => {
  const candidate = input()
  candidate.roles[0].permissions = candidate.roles[0].permissions.filter(value => value.code !== 'numbering.drawings.view')
  const result = buildAssignmentCompatibleRoleCatalog(candidate)
  assert.notEqual(result.catalogSha256, baseline.catalogSha256)
  assert.equal(result.catalogSha256, hash(canonicalCatalog(result)))
  for (const role of result.roles) assert.equal(role.roleDefinitionHash, hash(canonicalRole(role)))
  assert.equal(baseline.catalogSha256, '4d624b16a58299a78bc3bac4b7f39f261ec2ba34ae604f06ed7cdb7a078e01f9')
})
for (const field of ['identity', 'scope', 'subject', 'protected', 'order']) test(`rejects ${field} contract changes`, () => {
  const candidate = input()
  if (field === 'identity') candidate.roles[0].stableRoleId = 'role-forged'
  if (field === 'scope') candidate.roles[0].allowedScopeKinds = ['global']
  if (field === 'subject') candidate.roles[0].subjectKind = 'principal'
  if (field === 'protected') candidate.roles.find(value => value.roleCode === 'system_admin').permissions.pop()
  if (field === 'order') candidate.roles.reverse()
  assert.throws(() => buildAssignmentCompatibleRoleCatalog(candidate))
})
test('normalizes permission object order, rejects duplicate capabilities and unknown fields', () => {
  const candidate = input()
  const original = buildAssignmentCompatibleRoleCatalog(candidate)
  candidate.roles[0].permissions = candidate.roles[0].permissions.map(value => ({ allowed: value.allowed, kind: value.kind, code: value.code }))
  assert.equal(buildAssignmentCompatibleRoleCatalog(candidate).catalogSha256, original.catalogSha256)
  candidate.roles[0].permissions.push(candidate.roles[0].permissions[0])
  assert.throws(() => buildAssignmentCompatibleRoleCatalog(candidate))
  const unknown = input(); unknown.roles[0].permissions[0].owner = 'forged'
  assert.throws(() => buildAssignmentCompatibleRoleCatalog(unknown))
})
