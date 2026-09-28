import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { canonicalCatalog, canonicalRole } from './lib/jms-dev-005-role-catalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sourcePath = join(root, 'config/access-control/jenfu-role-catalog.v4.json')
const targetPath = join(root, 'config/access-control/jenfu-role-catalog.v5.json')
const version = 'ai-pdm.role-catalog.2026-09-28.v5'
const sourceHash = '32f3593d7a0d2a5cad4875181a62b8f5c49a06c9cbba8835cd1b82e9b44ca08a'
const fourRoles = ['rd', 'rd_manager', 'pdm_admin', 'system_admin']
const adminRoles = ['pdm_admin', 'system_admin']
const managerRoles = ['rd_manager', ...adminRoles]
const matrix = [
  { roles: fourRoles, kind: 'action', codes: [
    'numbering.approval.batch.create', 'numbering.approval.request',
    'numbering.attachments.manage', 'numbering.create', 'numbering.draft.obsolete',
    'numbering.draft.update', 'numbering.duplicate_check', 'numbering.link_variant',
    'numbering.recognition.formalize', 'numbering.recognition.review',
    'numbering.recognition.run', 'transfer.package.create',
    'transfer.package.review.submit', 'transfer.package.review.withdraw',
    'transfer.package.update', 'transfer.package.view'
  ] },
  { roles: adminRoles, kind: 'action', codes: [
    'numbering.audit_report.generate', 'numbering.draft.admin_confirm', 'obsolete_part_root'
  ] },
  { roles: managerRoles, kind: 'action', codes: [
    'numbering.export.create', 'post_release_change', 'transfer.package.publish'
  ] },
  { roles: ['rd_manager', ...adminRoles, 'qa', 'manufacturing', 'procurement'],
    kind: 'page', codes: ['numbering.reports'] },
  { roles: [...fourRoles, 'qa'], kind: 'action', codes: [
    'numbering.task.update', 'numbering.notification.update'
  ] }
]
const sha256 = (value) => createHash('sha256').update(value, 'utf8').digest('hex')
const unique = (values) => [...new Set(values)].sort()

function historicalRoles(schema, transfer, recognition, code) {
  if (code.startsWith('numbering.recognition.')) {
    assert.ok(recognition.includes(`('${code}')`), `${code} recognition source missing`)
    assert.match(recognition, /WHERE r\.role_code IN \('rd', 'rd_manager', 'pdm_admin', 'system_admin'\)/u)
    return unique(fourRoles)
  }
  const source = code.startsWith('transfer.package.') ? transfer : schema
  const escaped = code.replace(/[.*+?^$()|[\]{}]/gu, '\\$&')
  const expression = code.startsWith('transfer.package.')
    ? new RegExp(`\\('([^']+)', '${escaped}'\\)`, 'gu')
    : new RegExp(`\\('([^']+)', '(?:page|action)', '${escaped}', 1\\)`, 'gu')
  return unique([...source.matchAll(expression)].map((match) => match[1]))
    .filter((role) => role !== 'document_admin')
}

export function buildPrincipalRoleCatalogV5(source, historical) {
  assert.equal(source.catalogVersion, 'ai-pdm.role-catalog.2026-09-25.v4')
  assert.equal(source.catalogSha256, sourceHash)
  assert.equal(sha256(canonicalCatalog(source)), sourceHash)
  const codes = matrix.flatMap((row) => row.codes)
  assert.equal(codes.length, 25)
  assert.equal(new Set(codes).size, 25)
  const disposition = JSON.parse(readFileSync(join(root,
    'config/access-control/jenfu-route-policy-dispositions.v1.json'), 'utf8'))
  assert.deepEqual(unique(codes), unique(disposition.entries.map((row) => row.code)),
    'all 25 active route codes need an explicit disposition')
  for (const row of matrix) {
    for (const code of row.codes) {
      assert.deepEqual(unique(row.roles), historicalRoles(
        historical.schema, historical.transfer, historical.recognition, code),
        `${code} reviewed role matrix drift`)
    }
  }
  const roles = source.roles.map((role) => {
    const added = matrix.filter((row) => row.roles.includes(role.roleCode))
      .flatMap((row) => row.codes.map((code) => ({ code, kind: row.kind, allowed: true })))
    const permissions = [...role.permissions, ...added].sort((a, b) =>
      `${a.kind}:${a.code}:${a.allowed}`.localeCompare(`${b.kind}:${b.code}:${b.allowed}`))
    assert.equal(new Set(permissions.map((entry) => `${entry.kind}:${entry.code}`)).size,
      permissions.length, `${role.roleCode} duplicate permission`)
    const updated = { ...role, permissions }
    updated.roleDefinitionHash = sha256(canonicalRole(updated))
    return updated
  })
  const catalog = {
    contractVersion: source.contractVersion,
    applicationId: source.applicationId,
    catalogVersion: version,
    publishedAt: '2026-09-28T00:00:00.000Z',
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
  const historical = {
    schema: readFileSync(join(root, 'db/schema.sql'), 'utf8'),
    transfer: readFileSync(join(root, 'db/postgres/017_number_state_flow_phase1d.sql'), 'utf8'),
    recognition: readFileSync(join(root, 'db/postgres/033_drawing_recognition.sql'), 'utf8')
  }
  const catalog = buildPrincipalRoleCatalogV5(source, historical)
  if (mode === '--write') writeFileSync(targetPath, `${JSON.stringify(catalog, null, 2)}\n`)
  const stored = JSON.parse(readFileSync(targetPath, 'utf8'))
  assert.deepEqual(stored, catalog)
  process.stdout.write(`${JSON.stringify({ status: 'PASS', catalogVersion: version,
    catalogSha256: catalog.catalogSha256, roles: catalog.roles.length, codes: 25 })}\n`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
