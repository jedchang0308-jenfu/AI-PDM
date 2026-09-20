import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { readRoleCatalog } from './lib/jms-dev-005-role-catalog.mjs'
import {
  assertCatalogOperation,
  buildCatalogOperation,
  canonicalize,
  DEV013_CATALOG_TARGET,
  encodeCatalogOperation,
  publishProductionRoleCatalog,
  sha256,
} from './lib/dev013-production-role-catalog-publisher.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRevision = 'a'.repeat(40)
const deadlineAt = '2026-09-21T03:00:00.000Z'
const now = new Date('2026-09-21T01:00:00.000Z')
const catalog = await readRoleCatalog(path.join(root, 'config/access-control/jenfu-role-catalog.v1.json'))

function fakeDatabase() {
  const state = { publications: [], entries: [], active: [], commits: 0, rollbacks: 0 }
  return {
    state,
    async query(sql, params = []) {
      if (sql.startsWith('SELECT current_database()')) return { rows: [{ database: 'jenfu_prod', user: DEV013_CATALOG_TARGET.login, postgresMajor: 17, migratorMember: true }] }
      if (sql.includes('FROM ai_pdm_core.role_catalog_publications')) return { rows: structuredClone(state.publications) }
      if (sql.includes('FROM ai_pdm_core.role_catalog_entries')) return { rows: structuredClone(state.entries) }
      if (sql.includes('FROM ai_pdm_core.active_role_catalog')) return { rows: structuredClone(state.active) }
      if (sql.includes('FROM ai_pdm_contract.v_application_role_catalog_v1')) {
        const active = state.active[0]
        const publication = state.publications.find((value) => value.catalog_version === active?.catalog_version && value.status === 'active')
        return { rows: publication ? state.entries.map((entry) => ({ catalog_version: publication.catalog_version, catalog_sha256: publication.catalog_sha256, display_order: entry.display_order, stable_role_id: entry.stable_role_id, role_code: entry.role_code })) : [] }
      }
      if (sql.includes('INSERT INTO ai_pdm_core.role_catalog_publications')) {
        state.publications.push({ catalog_version: params[0], catalog_sha256: params[4], status: 'active', published_by: params[5] }); return { rows: [], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO ai_pdm_core.role_catalog_entries')) {
        state.entries.push({ display_order: params[1], stable_role_id: params[2], role_code: params[3], display_name: params[4], assignable: params[5], risk: params[6], subject_kind: params[7], recommendation_allowed: params[8], delegation_allowed: params[9], allowed_scope_kinds: JSON.parse(params[10]), assignment_tier: params[11], permissions: JSON.parse(params[12]), metadata: JSON.parse(params[13]), role_definition_hash: params[14] }); return { rows: [], rowCount: 1 }
      }
      if (sql.includes('INSERT INTO ai_pdm_core.active_role_catalog')) {
        state.active.push({ application_id: params[0], catalog_version: params[1], activated_at: '2026-09-21T01:00:00.000Z', activated_by: params[2], activation_reason: params[3] }); return { rows: [], rowCount: 1 }
      }
      if (sql === 'COMMIT') { state.commits += 1; return { rows: [] } }
      if (sql === 'ROLLBACK') { state.rollbacks += 1; return { rows: [] } }
      if (sql.startsWith('BEGIN') || sql.startsWith('SET LOCAL ROLE') || sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      throw new Error(`unexpected query: ${sql}`)
    },
  }
}

test('operation is exact-source, target, catalog and deadline bound', () => {
  const operation = buildCatalogOperation({ sourceRevision, deadlineAt, catalog })
  const encoded = encodeCatalogOperation(operation)
  const validated = assertCatalogOperation(operation, { bytes: encoded.bytes, operationSha256: encoded.sha256, sourceRevision, catalog, now })
  assert.equal(validated.catalogVersion, catalog.catalogVersion)
  const wrong = { ...operation, applicationId: 'other-app' }
  const wrongBytes = Buffer.from(`${canonicalize(wrong)}\n`)
  assert.throws(() => assertCatalogOperation(wrong, { bytes: wrongBytes, operationSha256: sha256(wrongBytes), sourceRevision, catalog, now }), /DEV013_CATALOG_OPERATION_INVALID/u)
})

test('publisher inserts only the exact missing catalog and replays with zero mutation', async () => {
  const database = fakeDatabase()
  const operation = buildCatalogOperation({ sourceRevision, deadlineAt, catalog })
  const first = await publishProductionRoleCatalog({ database, operation, catalog, now: () => now.toISOString() })
  assert.equal(first.status, 'PASS')
  assert.equal(first.databaseEffect, 'APPLIED_ONCE')
  assert.equal(first.mutationCount, catalog.roles.length + 2)
  assert.deepEqual(first.after, { publicationCount: 1, entryCount: catalog.roles.length, activeCount: 1, contractCount: catalog.roles.length })
  const replay = await publishProductionRoleCatalog({ database, operation, catalog, now: () => now.toISOString() })
  assert.equal(replay.databaseEffect, 'APPLIED_ONCE')
  assert.equal(replay.mutationCount, catalog.roles.length + 2)
  assert.equal(canonicalize(replay), canonicalize(first))
  assert.equal(database.state.publications.length, 1)
  assert.equal(database.state.entries.length, catalog.roles.length)
  assert.equal(database.state.active.length, 1)
})

test('conflicting pre-existing catalog fails closed before mutation', async () => {
  const database = fakeDatabase()
  database.state.publications.push({ catalog_version: catalog.catalogVersion, catalog_sha256: '0'.repeat(64), status: 'active', published_by: 'other' })
  const operation = buildCatalogOperation({ sourceRevision, deadlineAt, catalog })
  await assert.rejects(publishProductionRoleCatalog({ database, operation, catalog }), /DEV013_CATALOG_STATE_INVALID/u)
  assert.equal(database.state.entries.length, 0)
  assert.equal(database.state.commits, 0)
  assert.equal(database.state.rollbacks, 1)
})

test('profile and immutable image build stay inside the exact one-time job boundary', () => {
  const profile = JSON.parse(fs.readFileSync(path.join(root, 'config/release/dev013-production-role-catalog-publication.json'), 'utf8'))
  assert.equal(profile.projectId, DEV013_CATALOG_TARGET.projectId)
  assert.equal(profile.jobName, DEV013_CATALOG_TARGET.jobName)
  assert.equal(profile.serviceAccount, DEV013_CATALOG_TARGET.serviceAccount)
  assert.equal(profile.catalogVersion, catalog.catalogVersion)
  assert.equal(profile.catalogSha256, catalog.catalogSha256)
  assert.equal(profile.operationPrefix, `${DEV013_CATALOG_TARGET.operationPrefix}/`)
  assert.equal(profile.receiptPrefix, `${DEV013_CATALOG_TARGET.receiptPrefix}/`)
  assert.match(profile.operationPrefix, /^source\/migration-bundles\//u)
  const dockerfile = fs.readFileSync(path.join(root, profile.dockerfile), 'utf8')
  const cloudBuild = fs.readFileSync(path.join(root, profile.cloudBuildConfig), 'utf8')
  assert.match(dockerfile, /ENTRYPOINT \["node", "scripts\/dev013-production-role-catalog-publisher\.mjs"\]/u)
  assert.match(dockerfile, /org\.opencontainers\.image\.revision=\$SOURCE_REVISION/u)
  assert.doesNotMatch(`${dockerfile}\n${cloudBuild}`, /terraform|gcloud run services|set-traffic|secret versions|migration-bundle/u)
})
