import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

export function buildDev127Registry(legacy) {
  assert.equal(legacy.contractVersion, 'ai-pdm.role-policy-editor-registry.v2')
  assert.equal(legacy.roleProfiles.length, 9)
  return { ...legacy, limits: { ...legacy.limits, maxRoles: legacy.limits.maxRoles + 1 }, contractVersion: 'ai-pdm.role-policy-editor-registry.v3', roleProfiles: [
    ...legacy.roleProfiles, { stableRoleId: 'role-application-system-admin', permissionRoleId: 'role-application-system-admin',
      presentationName: '系統管理員', presentationOrder: 9, assignmentDisposition: 'hidden-protected' }
  ] }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expected = buildDev127Registry(JSON.parse(readFileSync('config/access-control/role-policy-editor-registry.v2.json', 'utf8')))
  const path = 'config/access-control/role-policy-editor-registry.v3.json'
  if (process.argv.includes('--check')) assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), expected)
  else writeFileSync(path, JSON.stringify(expected, null, 2) + '\n')
  console.log('DEV-127 registry PASS: nine legacy profiles preserved; protected profile appended')
}
