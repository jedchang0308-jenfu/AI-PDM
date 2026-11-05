// Run with the repository qc-ts-path-loader and --experimental-transform-types.
// Read-only planning/status convenience. A loopback/name filter is not proof
// of a disposable cluster. Writers exist only in the sealed Job/owned harness.
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import pg from 'pg'
import { decodePublishedRolePolicyCandidateRows } from '../src/lib/jenfu-principal-role-catalog.ts'
import { upgradeRolePolicyCandidate, applicationAdministratorRole } from '../src/lib/role-policy-editor.ts'

const mode = process.argv[2], path = process.argv[3]
// Reject before URL parsing, Client construction or connect, for every target.
if (mode === 'commit') throw new Error('DEV127_DIRECT_CLI_WRITE_REMOVED')
if (!['plan', 'status'].includes(mode) || !path || process.argv.length!==4) throw new Error('usage: dev127-upgrade-role-policy.mjs plan|status <plan.json>')
if (!process.env.PDM_DATABASE_URL) throw new Error('PDM_DATABASE_URL_REQUIRED')
const target=new URL(process.env.PDM_DATABASE_URL)
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname) ||
    !/^\/dev127_[a-z0-9_]+$/u.test(target.pathname)) throw new Error('DEV127_USE_SEALED_OWNER_RELEASE_BRIDGE')
const client = new pg.Client({ connectionString: process.env.PDM_DATABASE_URL })
const sha = value => createHash('sha256').update(value).digest('hex')
const sourceSha256 = sha(readFileSync('db/postgres/096_dev127_platform_super_admin_consumer.sql'))
await client.connect()
try {
  await client.query('BEGIN READ ONLY')
  if (mode === 'plan') {
    const { rows } = await client.query('SELECT * FROM ai_pdm_contract.v_application_role_catalog_v3 ORDER BY display_order')
    const requestId = randomUUID(), first = rows[0]
    if (!first || !['dynamic-policy-v1', 'dynamic-policy-v2'].includes(first.publication_format)) throw new Error('DYNAMIC_ACTIVE_CATALOG_REQUIRED')
    const current = decodePublishedRolePolicyCandidateRows(rows)
    const candidate = upgradeRolePolicyCandidate({ ...current, candidateCatalogVersion: 'ai-pdm.role-policy.' + requestId })
    const { rows: [database] } = await client.query('SELECT current_database() AS name')
    if(!/^dev127_[a-z0-9_]+$/u.test(database.name))throw new Error('DEV127_USE_SEALED_OWNER_RELEASE_BRIDGE')
    const payload = { contractVersion: 'ai-pdm.dev127-owner-upgrade-plan.v1', database: database.name, requestId,
      sourceSha256, expectedActive: { catalogVersion: first.catalog_version, catalogSha256: first.catalog_sha256 },
      roleDefinitionHash: applicationAdministratorRole.roleDefinitionHash, candidate }
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ status: 'PLANNED', requestId, preservedRoles: current.roles.length, database: database.name }))
  } else {
    const plan = JSON.parse(readFileSync(path, 'utf8'))
    if (plan.contractVersion !== 'ai-pdm.dev127-owner-upgrade-plan.v1' || plan.sourceSha256 !== sourceSha256 ||
      plan.roleDefinitionHash !== applicationAdministratorRole.roleDefinitionHash) throw new Error('UPGRADE_SOURCE_DRIFT')
    const { rows: [database] } = await client.query('SELECT current_database() AS name')
    if (database.name !== plan.database || !/^dev127_[a-z0-9_]+$/u.test(database.name)) throw new Error('UPGRADE_TARGET_MISMATCH')
    const { rows } = await client.query('SELECT result_json FROM ai_pdm_core.role_policy_commands WHERE request_id=$1', [plan.requestId])
    console.log(JSON.stringify(rows[0]?.result_json ?? { status: 'NOT_COMMITTED' }))
  }
  await client.query('COMMIT')
} catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
finally { await client.end() }
