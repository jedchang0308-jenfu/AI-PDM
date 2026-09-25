import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildPrincipalRoleCatalog } from './dev121-build-principal-role-catalog.mjs'

const source = JSON.parse(readFileSync(new URL('../config/access-control/jenfu-role-catalog.v1.json', import.meta.url), 'utf8'))
const migrations = [
  readFileSync(new URL('../db/postgres/012_number_state_flow_phase1a.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../db/postgres/016_number_state_flow_phase1c.sql', import.meta.url), 'utf8')
]

test('v4 grants only the four applied DEV-087 capabilities to their exact four roles', () => {
  const v4 = buildPrincipalRoleCatalog(source, migrations)
  assert.equal(v4.roles.length, 9)
  for (const role of v4.roles) {
    const previous = source.roles.find((candidate) => candidate.roleCode === role.roleCode)
    const added = role.permissions.filter((permission) => !previous.permissions.some((old) =>
      old.kind === permission.kind && old.code === permission.code))
    assert.deepEqual(added.map((permission) => permission.code).sort(),
      ['rd', 'rd_manager', 'pdm_admin', 'system_admin'].includes(role.roleCode)
        ? ['numbering.workspace.create', 'numbering.workspace.update',
          'numbering.workspace.cancel', 'numbering.candidate.review.submit'].sort()
        : [])
  }
  assert.notEqual(v4.catalogSha256, source.catalogSha256)
});

test('catalog generation stops on an applied role-matrix mismatch', () => {
  const altered = [...migrations]
  altered[0] = altered[0].replace(
    "('rd', 'numbering.workspace.create')", "('qa', 'numbering.workspace.create')")
  assert.throws(() => buildPrincipalRoleCatalog(source, altered),
    /applied role matrix drift/u)
});
