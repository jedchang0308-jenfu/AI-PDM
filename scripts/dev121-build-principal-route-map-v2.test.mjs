import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildPrincipalRouteMapV2 } from './dev121-build-principal-route-map-v2.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const source = JSON.parse(readFileSync(join(root,
  'config/access-control/jenfu-route-permission-map.v1.json'), 'utf8'))
const reviewed = JSON.parse(readFileSync(join(root,
  'config/access-control/jenfu-route-permission-map.v2.json'), 'utf8'))

test('v2 source hash binds every reviewed route and retired cross-owner mutation', () => {
  assert.deepEqual(buildPrincipalRouteMapV2(source, reviewed), reviewed)
})

test('new grants, restored old mutations, and deleted policies all fail the source lock', () => {
  const changedGrant = structuredClone(reviewed)
  changedGrant.entries.find((entry) => entry.path ===
    'src/app/api/transfer-packages/route.ts').permissionCode = 'settings.admin_matrix'
  assert.throws(() => buildPrincipalRouteMapV2(source, changedGrant),
    /unreviewed v2 route policy change/)

  const restoredMutation = structuredClone(reviewed)
  restoredMutation.entries.find((entry) => entry.path ===
    'src/app/api/settings/access/role-capabilities/publish/route.ts').authorizationMode = 'permission'
  assert.throws(() => buildPrincipalRouteMapV2(source, restoredMutation),
    /unreviewed v2 route policy change/)

  const deletedPolicy = structuredClone(reviewed)
  deletedPolicy.entries.pop()
  assert.throws(() => buildPrincipalRouteMapV2(source, deletedPolicy),
    /unreviewed v2 route policy change/)
})
