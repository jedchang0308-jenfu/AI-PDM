import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'

const json = path => JSON.parse(readFileSync(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

test('DEV-127 hash-bound package, registry, manifest and SQL bytes stay LF on every checkout', () => {
  const paths = [
    ...readdirSync('contracts/orgmaster-administration/v1').map(name => 'contracts/orgmaster-administration/v1/' + name),
    'config/access-control/orgmaster-administration-v1.manifest.json',
    'config/access-control/orgmaster-role-policy-manager-v2.manifest.json',
    'config/access-control/ai-pdm-role-policy-contract-v3.manifest.json',
    'config/access-control/role-policy-editor-registry.v3.json',
    'config/access-control/dev127-protected-policy-source.v1.json',
    'config/access-control/dev127-consumer-postgres-fixture.v1.json',
    'config/access-control/dev127-role-policy-v2-conformance.json',
    'config/release/dev117-ai-pdm-independent-production-v3.json',
    'db/postgres/096_dev127_platform_super_admin_consumer.sql',
    'db/postgres/local/098_dev127_static_admin_catalog_v8.sql',
  ]
  for (const path of paths) assert.equal(readFileSync(path).includes(13), false, path)
  const attributes = execFileSync('git', ['check-attr', '-z', 'text', 'eol', '--', ...paths], { encoding: 'utf8', windowsHide: true }).split('\0')
  for (let index = 0; index + 2 < attributes.length; index += 3) {
    assert.equal(attributes[index + 2], attributes[index + 1] === 'eol' ? 'lf' : 'set', attributes[index])
  }
})

test('DEV-127 vendors the complete exact producer package and unique 19-plus-4 PDM projection', () => {
  const consumer = json('config/access-control/orgmaster-administration-v1.manifest.json')
  const bytes = readFileSync(consumer.producerManifestPath)
  assert.equal(hash(bytes), consumer.producerManifestSha256)
  const producer = JSON.parse(bytes.toString())
  for (const [path, sha] of Object.entries(producer.files)) assert.equal(hash(readFileSync('contracts/orgmaster-administration/v1/' + path)), sha, path)
  assert.deepEqual(consumer.projection, producer.projections.pdm)
  const columns = consumer.projection.columns.map(column => column.name)
  assert.equal(columns.length, 23)
  assert.equal(new Set(columns).size, 23)
  assert.deepEqual(columns.slice(-4), ['source_assignment_id', 'source_grant_id', 'admin_catalog_sha256', 'role_definition_hash'])
})

test('DEV-127 appends only 096 to the immutable forty-entry production prefix', () => {
  const profile = json('config/release/dev117-ai-pdm-independent-production-v3.json')
  const entries = profile.migrations.entries
  assert.equal(entries.length, 41)
  assert.equal(hash(JSON.stringify(entries.slice(0, 40))), '13bd22113410cdc371d8524848edd2419720a0ddc7cf67a49a1a3979f6b8544a')
  assert.deepEqual(entries.at(-1), { order: 41, path: 'db/postgres/096_dev127_platform_super_admin_consumer.sql',
    sha256: hash(readFileSync('db/postgres/096_dev127_platform_super_admin_consumer.sql')) })
  assert.equal(entries.some(entry => /\/09[1-5]_/u.test(entry.path)), false)
})

test('DEV-127 local proof CLI cannot open a production or persistent remote connection', () => {
  for(const target of ['postgres://synthetic@127.0.0.1:1/jenfu_prod','postgres://synthetic@example.invalid:1/dev127_synthetic','postgres://synthetic@127.0.0.1:1/postgres']) {
    const result=spawnSync(process.execPath,['--experimental-transform-types','--experimental-loader','./scripts/qc-ts-path-loader.mjs',
      'scripts/dev127-upgrade-role-policy.mjs','plan','unused-synthetic-plan.json'],{encoding:'utf8',windowsHide:true,
      env:{...process.env,PDM_DATABASE_URL:target},timeout:10000})
    assert.equal(result.status,1)
    assert.match(result.stderr,/DEV127_USE_SEALED_OWNER_RELEASE_BRIDGE/u)
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|ENOTFOUND/u,'reject before opening any connection')
  }
})

test('DEV-127 direct CLI commit is removed before connecting even to same-name persistent or tunnel targets', () => {
  for(const target of [
    'postgres://synthetic@127.0.0.1:1/dev127_persistent',
    'postgres://synthetic@localhost:1/dev127_same_name',
    'postgres://synthetic@[::1]:1/dev127_tunnel',
    'postgres://synthetic@example.invalid:1/dev127_same_name',
    'not-a-database-url',
    undefined,
  ]) {
    const environment={...process.env}
    if(target===undefined)delete environment.PDM_DATABASE_URL
    else environment.PDM_DATABASE_URL=target
    const result=spawnSync(process.execPath,['--experimental-transform-types','--experimental-loader','./scripts/qc-ts-path-loader.mjs',
      'scripts/dev127-upgrade-role-policy.mjs','commit','unused-synthetic-plan.json'],{encoding:'utf8',windowsHide:true,
      env:environment,timeout:10000})
    assert.equal(result.status,1)
    assert.match(result.stderr,/DEV127_DIRECT_CLI_WRITE_REMOVED/u)
    assert.doesNotMatch(result.stderr,/ECONNREFUSED|ENOTFOUND|PDM_DATABASE_URL_REQUIRED|Invalid URL/u,
      'commit is rejected before URL parsing or connection, not inferred disposable from host/name')
  }
})
