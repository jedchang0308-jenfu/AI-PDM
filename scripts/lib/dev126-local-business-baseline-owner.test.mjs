import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { test } from 'node:test'
import { contractDigest } from '../../contracts/local-principal-sandbox/v1/protocol.mjs'
import { initializeDev126LocalBusinessBaseline } from './dev126-local-business-baseline-owner.mjs'

const MIGRATOR = 'jenfu_ai_pdm_migrator'
const DEFAULT_PRIORITY = [
  'system_admin', 'pdm_admin', 'rd_manager', 'production_planning', 'qa', 'rd',
  'manufacturing', 'procurement', 'external_specialist',
]
const CATALOG_VERSION = 'ai-pdm.role-catalog.2026-10-10.v7'
const CATALOG_SHA256 = 'b'.repeat(64)

function makeLocalPriorityPolicy(sandboxId, roleCodes = DEFAULT_PRIORITY) {
  const unsigned = { format: 'ai-pdm.local-role-priority.v1', sandboxId, roleCodes }
  return { ...unsigned, sha256: contractDigest(unsigned) }
}

function makeCatalogRows(roleCodes = DEFAULT_PRIORITY) {
  return roleCodes.map((roleCode, displayOrder) => ({
    active_catalog_version: CATALOG_VERSION,
    application_id: 'ai-pdm',
    publication_status: 'active',
    catalog_sha256: CATALOG_SHA256,
    display_order: displayOrder,
    stable_role_id: `role-${roleCode.replaceAll('_', '-')}`,
    role_code: roleCode,
    display_name: `顯示 ${roleCode}`,
    assignable: true,
    permissions: [
      { code: `${roleCode}.read`, kind: 'action', allowed: true },
      ...(roleCode === 'external_specialist'
        ? [{ code: 'internal.admin', kind: 'action', allowed: false }]
        : []),
    ],
    role_definition_hash: 'a'.repeat(64),
  }))
}

function nativeProjectionFor(catalogRows) {
  const roles = catalogRows.map(row => ({ id: row.stable_role_id, role_code: row.role_code,
    title: row.display_name, system_defined: 1, enabled: 1 }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const rolePermissions = catalogRows.flatMap(row => row.permissions.map(permission => {
    const digest = createHash('sha256').update([
      CATALOG_VERSION, row.stable_role_id, permission.kind, permission.code,
    ].join('\n')).digest('hex')
    return { id: `local-catalog-permission-${digest.slice(0, 32)}`, role_id: row.stable_role_id,
      permission_kind: permission.kind, permission_code: permission.code, allowed: permission.allowed ? 1 : 0 }
  })).sort((left, right) => left.id.localeCompare(right.id))
  return { roles, rolePermissions }
}

function makeInput(overrides = {}) {
  const sandboxId = 'dev126-test'
  const sandboxRoot = path.resolve(process.cwd(), '.task-owned', sandboxId)
  return {
    client: null,
    scopedMigratorSessionUser: 'dev126_scoped_owner',
    target: {
      sandboxId,
      databaseName: 'jenfu_local_dev126_test',
      databaseHost: '127.0.0.1',
      databasePort: 55432,
      generation: '11111111-1111-4111-8111-111111111111',
      fixtureVersion: 'dev126-fixture-v1',
      fixtureHash: 'a'.repeat(64),
      nativeSessionContractVersion: 'jenfu.ai-pdm-session.v2',
      sandboxRoot,
      dataDirectory: path.join(sandboxRoot, 'data'),
      repositoryDirectory: path.join(sandboxRoot, 'repository'),
    },
    localPriorityPolicy: makeLocalPriorityPolicy(sandboxId),
    workbenchAuthorityExpectedCommit: 'local-dev',
    ...overrides,
  }
}

function metadataFor(target) {
  const normalized = {
    sandboxRoot: path.resolve(target.sandboxRoot),
    dataDirectory: path.resolve(target.dataDirectory),
    repositoryDirectory: path.resolve(target.repositoryDirectory),
  }
  return {
    application_id: 'ai-pdm',
    sandbox_id: target.sandboxId,
    database_name: target.databaseName,
    status: 'ready',
    generation: target.generation,
    fixture_version: target.fixtureVersion,
    fixture_hash: target.fixtureHash,
    native_session_contract_version: target.nativeSessionContractVersion,
    sandbox_root: normalized.sandboxRoot,
    data_directory: normalized.dataDirectory,
    repository_directory: normalized.repositoryDirectory,
    target_fingerprint: contractDigest({
      applicationId: 'ai-pdm',
      sandboxId: target.sandboxId,
      databaseName: target.databaseName,
      ...normalized,
      generation: target.generation,
      fixtureVersion: target.fixtureVersion,
      fixtureHash: target.fixtureHash,
      nativeSessionContractVersion: target.nativeSessionContractVersion,
    }),
  }
}

class FakeOwnerClient {
  constructor(options = {}) {
    this.state = {
      databaseName: options.databaseName ?? 'jenfu_local_dev126_test',
      serverAddress: options.serverAddress ?? '127.0.0.1',
      serverPort: options.serverPort ?? 55432,
      sessionUser: options.sessionUser ?? 'dev126_scoped_owner',
      currentUser: options.sessionUser ?? 'dev126_scoped_owner',
      schemaOwner: options.schemaOwner ?? MIGRATOR,
      metadataOwner: options.metadataOwner ?? MIGRATOR,
      metadataAcl: options.metadataAcl ?? {
        relkind: 'r', relation_owner: MIGRATOR, runtime_select: true,
        runtime_insert: false, runtime_update: false, runtime_delete: false,
        runtime_truncate: false, runtime_references: false, runtime_trigger: false,
        forbidden_acl: false,
      },
      workbenchAuthorityAcl: options.workbenchAuthorityAcl ?? {
        relkind: 'r', relation_owner: MIGRATOR, runtime_select: true,
        runtime_insert: false, runtime_update: false, runtime_delete: false,
        runtime_truncate: false, runtime_references: false, runtime_trigger: false,
        forbidden_acl: false,
      },
      workbenchAuthority: structuredClone(options.workbenchAuthority === undefined ? {
        id: 1, mode: 'canonical_only', expected_commit: '', schema_hash: 'dev090-v1',
        row_version: 4, switched_at: '2026-10-30T00:00:00.000Z',
      } : options.workbenchAuthority),
      companies: structuredClone(options.companies ?? []),
      roles: structuredClone(options.roles ?? []),
      rolePermissions: structuredClone(options.rolePermissions ?? []),
      catalogRows: structuredClone(options.catalogRows ?? makeCatalogRows(options.catalogCodes ?? DEFAULT_PRIORITY)),
      priorities: structuredClone(options.priorities ?? []),
      metadata: structuredClone(options.metadata ?? []),
    }
    this.transactionSnapshot = null
    this.events = []
    this.options = options
  }

  async query(sql, values = []) {
    const normalized = String(sql).replace(/\s+/gu, ' ').trim()
    this.events.push({ sql: normalized, values: structuredClone(values) })

    if (normalized.startsWith('SELECT current_database()')) {
      return { rows: [{ database_name: this.state.databaseName, current_user: this.state.currentUser,
        session_user: this.state.sessionUser, server_address: this.state.serverAddress,
        server_port: this.state.serverPort }] }
    }
    if (normalized === 'BEGIN') {
      this.transactionSnapshot = structuredClone(this.state)
      return { rows: [], rowCount: null }
    }
    if (normalized.startsWith('SET LOCAL ROLE ')) {
      this.state.currentUser = MIGRATOR
      return { rows: [], rowCount: null }
    }
    if (normalized.startsWith('LOCK TABLE ')) return { rows: [], rowCount: null }
    if (normalized === 'COMMIT') {
      this.transactionSnapshot = null
      this.state.currentUser = this.state.sessionUser
      if (this.options.commitUnknown) throw new Error('simulated commit response loss')
      return { rows: [], rowCount: null }
    }
    if (normalized === 'ROLLBACK') {
      if (this.transactionSnapshot) this.state = this.transactionSnapshot
      this.transactionSnapshot = null
      return { rows: [], rowCount: null }
    }
    if (normalized.includes('FROM pg_catalog.pg_namespace WHERE nspname=$1')) {
      return { rows: [{ schema_owner: this.state.schemaOwner }] }
    }
    if (normalized.includes("c.relname=$3") && normalized.includes('has_table_privilege')) {
      const acl = values[2] === 'pdm_workbench_state_authority_control'
        ? this.state.workbenchAuthorityAcl : this.state.metadataAcl
      return { rows: [structuredClone(acl)] }
    }
    if (normalized.startsWith('SELECT id,mode,expected_commit,schema_hash,row_version,switched_at FROM ai_pdm_core.pdm_workbench_state_authority_control')) {
      return { rows: this.state.workbenchAuthority?.id === 1
        ? [structuredClone(this.state.workbenchAuthority)] : [] }
    }
    if (normalized.startsWith('UPDATE ai_pdm_core.pdm_workbench_state_authority_control')) {
      const row = this.state.workbenchAuthority
      if (this.options.workbenchAuthorityCasConflict && row) row.row_version += 1
      if (!row || row.id !== 1 || row.mode !== 'canonical_only' || row.schema_hash !== values[1] ||
        row.expected_commit !== '' || Number(row.row_version) !== Number(values[2])) return { rows: [], rowCount: 0 }
      row.expected_commit = values[0]
      row.row_version += 1
      row.switched_at = '2026-10-30T00:01:00.000Z'
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('FROM ai_pdm_core.companies') && normalized.includes('WHERE id=$1 OR company_code=$2')) {
      return { rows: this.state.companies.filter(row => row.id === values[0] || row.company_code === values[1])
        .sort((a, b) => a.id.localeCompare(b.id)).map(row => ({ ...row })) }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.companies')) {
      this.state.companies.push({ id: values[0], company_code: values[1], company_kind: values[2], display_name: values[3] })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('FROM ai_pdm_core.role_priority_versions WHERE status=\'active\'')) {
      return { rows: this.state.priorities.filter(row => row.status === 'active')
        .sort((a, b) => a.id.localeCompare(b.id)).map(row => ({ ...row })) }
    }
    if (normalized.includes('FROM ai_pdm_core.active_role_catalog active')) {
      return { rows: this.state.catalogRows.map(row => structuredClone(row)) }
    }
    if (normalized === 'SELECT id,role_code,title,system_defined,enabled FROM ai_pdm_core.roles ORDER BY id FOR UPDATE') {
      return { rows: this.state.roles.map(row => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id)) }
    }
    if (normalized === 'SELECT id,role_id,permission_kind,permission_code,allowed FROM ai_pdm_core.role_permissions ORDER BY id FOR UPDATE') {
      return { rows: this.state.rolePermissions.map(row => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id)) }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.roles')) {
      this.state.roles.push({ id: values[0], role_code: values[1], title: values[2],
        system_defined: values[3], enabled: values[4] })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.role_permissions')) {
      this.state.rolePermissions.push({ id: values[0], role_id: values[1], permission_kind: values[2],
        permission_code: values[3], allowed: values[4] })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('FROM ai_pdm_core.role_priority_versions') && normalized.includes('WHERE id=$1 OR version_code=$2')) {
      return { rows: this.state.priorities.filter(row => row.id === values[0] || row.version_code === values[1])
        .map(row => ({ ...row })) }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.role_priority_versions')) {
      this.state.priorities.push({ id: values[0], version_code: values[1], priority_json: values[2],
        status: 'active', created_by: null })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.includes('FROM ai_pdm_core.role_priority_versions WHERE id=$1')) {
      return { rows: this.state.priorities.filter(row => row.id === values[0]).map(row => ({ ...row })) }
    }
    if (normalized.includes('FROM ai_pdm_core.local_sandbox_target_metadata')) {
      return { rows: this.state.metadata.filter(row => row.application_id === values[0] && row.sandbox_id === values[1])
        .map(row => ({ ...row })) }
    }
    if (normalized.startsWith('INSERT INTO ai_pdm_core.local_sandbox_target_metadata')) {
      this.state.metadata.push({
        application_id: values[0], sandbox_id: values[1], database_name: values[2], status: 'ready',
        generation: values[3], fixture_version: values[4], fixture_hash: values[5],
        native_session_contract_version: values[6], sandbox_root: values[7], data_directory: values[8],
        repository_directory: values[9], target_fingerprint: values[10],
      })
      return { rows: [], rowCount: 1 }
    }
    if (normalized.startsWith('UPDATE ai_pdm_core.local_sandbox_target_metadata')) {
      const row = this.state.metadata.find(item => item.application_id === values[0] && item.sandbox_id === values[1] &&
        item.status === 'maintenance' && item.database_name === values[2] && item.generation === values[3] &&
        item.fixture_version === values[4] && item.fixture_hash === values[5] &&
        item.native_session_contract_version === values[6] && item.sandbox_root === values[7] &&
        item.data_directory === values[8] && item.repository_directory === values[9] &&
        item.target_fingerprint === values[10])
      if (!row) return { rows: [], rowCount: 0 }
      row.status = 'ready'
      row.generation = values[11]
      row.fixture_version = values[12]
      row.fixture_hash = values[13]
      row.native_session_contract_version = values[14]
      row.sandbox_root = values[15]
      row.data_directory = values[16]
      row.repository_directory = values[17]
      row.target_fingerprint = values[18]
      return { rows: [], rowCount: 1 }
    }
    throw new Error(`UNEXPECTED_SQL:${normalized}`)
  }
}

function fixtureInput({ clientOptions, ...inputOverrides } = {}) {
  const input = makeInput(inputOverrides)
  input.client = new FakeOwnerClient(clientOptions)
  return input
}

test('creates only JENFU business company, canonical priority and 091 ready metadata in one owner transaction', async () => {
  const input = fixtureInput()
  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.equal(result.company.created, true)
  assert.equal(result.company.companyId, 'company-jenfu')
  assert.equal(result.catalogProjection.created, true)
  assert.equal(result.catalogProjection.catalogVersion, CATALOG_VERSION)
  assert.equal(result.rolePriority.created, true)
  assert.deepEqual(result.rolePriority.priority, DEFAULT_PRIORITY)
  assert.equal(result.metadata.created, true)
  assert.equal(result.metadata.status, 'ready')
  assert.match(result.metadata.targetFingerprint, /^[a-f0-9]{64}$/u)
  assert.deepEqual(result.workbenchAuthority, {
    bound: true, id: 1, mode: 'canonical_only', expectedCommit: 'local-dev', schemaHash: 'dev090-v1',
    rowVersion: 5, switchedAt: '2026-10-30T00:01:00.000Z',
  })
  assert.equal(input.client.state.workbenchAuthority.expected_commit, 'local-dev')
  assert.deepEqual(input.client.state.companies, [{ id: 'company-jenfu', company_code: 'JENFU',
    company_kind: 'business', display_name: '鉦富' }])
  assert.equal(input.client.state.priorities.length, 1)
  assert.equal(input.client.state.priorities[0].priority_json, JSON.stringify(DEFAULT_PRIORITY))
  const expectedProjection = nativeProjectionFor(input.client.state.catalogRows)
  assert.deepEqual(input.client.state.roles, expectedProjection.roles)
  assert.deepEqual(input.client.state.rolePermissions, expectedProjection.rolePermissions)
  assert.ok(input.client.state.rolePermissions.some(permission => permission.allowed === 0))
  assert.deepEqual(input.client.state.metadata, [metadataFor(input.target)])
  assert.deepEqual(input.client.events.filter(event => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(event.sql))
    .map(event => event.sql), ['BEGIN', 'COMMIT'])
  const writes = input.client.events.filter(({ sql }) => /^(INSERT|UPDATE|DELETE) /iu.test(sql))
  assert.ok(writes.every(({ sql }) => /^(INSERT INTO ai_pdm_core\.(companies|roles|role_permissions|role_priority_versions|local_sandbox_target_metadata)|UPDATE ai_pdm_core\.(local_sandbox_target_metadata|pdm_workbench_state_authority_control))\b/iu.test(sql)))
})

test('reuses exact company, native catalog projection, active priority and ready metadata without writes', async () => {
  const input = fixtureInput()
  input.client.state.workbenchAuthority.expected_commit = 'local-dev'
  input.client.state.companies.push({ id: 'company-jenfu', company_code: 'JENFU', company_kind: 'business', display_name: '鉦富' })
  input.client.state.priorities.push({ id: 'existing-priority', version_code: 'existing-v1',
    priority_json: JSON.stringify([...DEFAULT_PRIORITY].reverse()), status: 'active', created_by: null })
  const expectedProjection = nativeProjectionFor(input.client.state.catalogRows)
  input.client.state.roles.push(...expectedProjection.roles)
  input.client.state.rolePermissions.push(...expectedProjection.rolePermissions)
  input.client.state.metadata.push(metadataFor(input.target))

  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.equal(result.company.created, false)
  assert.equal(result.catalogProjection.created, false)
  assert.equal(result.rolePriority.created, false)
  assert.equal(result.workbenchAuthority.bound, false)
  assert.equal(result.workbenchAuthority.expectedCommit, 'local-dev')
  assert.deepEqual(result.rolePriority.priority, [...DEFAULT_PRIORITY].reverse())
  assert.equal(result.metadata.created, false)
  assert.equal(input.client.events.some(event => /^(INSERT|UPDATE|DELETE) /iu.test(event.sql)), false)
})

test('binds only a blank expected commit on an already canonical DEV-090 row with CAS readback', async () => {
  const input = fixtureInput({ workbenchAuthorityExpectedCommit: '1234567890abcdef1234567890abcdef12345678' })

  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.equal(result.workbenchAuthority.expectedCommit, '1234567890abcdef1234567890abcdef12345678')
  assert.equal(result.workbenchAuthority.schemaHash, 'dev090-v1')
  assert.equal(result.workbenchAuthority.rowVersion, 5)
  const update = input.client.events.find(({ sql }) => sql.startsWith('UPDATE ai_pdm_core.pdm_workbench_state_authority_control'))
  assert.match(update.sql, /WHERE id=1 AND mode='canonical_only' AND schema_hash=\$2 AND expected_commit='' AND row_version=\$3/u)
  assert.deepEqual(update.values, ['1234567890abcdef1234567890abcdef12345678', 'dev090-v1', 4])
})

test('does not create authority readiness or overwrite a different canonical state', async t => {
  const cases = [
    ['missing row', { workbenchAuthority: null }, 'WORKBENCH_AUTHORITY_ROW_INVALID'],
    ['legacy mode', { workbenchAuthority: { id: 1, mode: 'legacy_only', expected_commit: '', schema_hash: 'dev090-v1', row_version: 4, switched_at: '2026-10-30T00:00:00.000Z' } }, 'WORKBENCH_AUTHORITY_NOT_CANONICAL'],
    ['wrong schema', { workbenchAuthority: { id: 1, mode: 'canonical_only', expected_commit: '', schema_hash: 'dev087-v1', row_version: 4, switched_at: '2026-10-30T00:00:00.000Z' } }, 'WORKBENCH_AUTHORITY_NOT_CANONICAL'],
    ['different binding', { workbenchAuthority: { id: 1, mode: 'canonical_only', expected_commit: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', schema_hash: 'dev090-v1', row_version: 4, switched_at: '2026-10-30T00:00:00.000Z' } }, 'WORKBENCH_AUTHORITY_COMMIT_COLLISION'],
  ]
  for (const [name, clientOptions, code] of cases) await t.test(name, async () => {
    const input = fixtureInput({ clientOptions })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: `LOCAL_BUSINESS_BASELINE_${code}` })
    assert.equal(input.client.state.companies.length, 0)
    assert.equal(input.client.state.roles.length, 0)
    assert.equal(input.client.state.priorities.length, 0)
    assert.equal(input.client.events.some(({ sql }) => sql.startsWith('UPDATE ai_pdm_core.pdm_workbench_state_authority_control')), false)
    assert.equal(input.client.events.at(-1).sql, 'ROLLBACK')
  })
})

test('fails closed on authority binding CAS conflict and runtime write access', async t => {
  await t.test('CAS conflict', async () => {
    const input = fixtureInput({ clientOptions: { workbenchAuthorityCasConflict: true } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_WRITE_READBACK_INVALID' })
    assert.equal(input.client.state.workbenchAuthority.expected_commit, '')
    assert.equal(input.client.state.companies.length, 0)
  })
  await t.test('runtime write grant', async () => {
    const input = fixtureInput({ clientOptions: { workbenchAuthorityAcl: {
      relkind: 'r', relation_owner: MIGRATOR, runtime_select: true, runtime_insert: false,
      runtime_update: true, runtime_delete: false, runtime_truncate: false,
      runtime_references: false, runtime_trigger: false, forbidden_acl: false,
    } } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
      code: 'LOCAL_BUSINESS_BASELINE_RUNTIME_WORKBENCH_AUTHORITY_PRIVILEGE_MISMATCH',
    })
    assert.equal(input.client.state.workbenchAuthority.expected_commit, '')
  })
})

test('requires an explicit valid expected authority commit before opening a transaction', async t => {
  for (const value of ['', 'latest', 'LOCAL-DEV', '1234567890abcdef']) await t.test(String(value || '<empty>'), async () => {
    const input = fixtureInput({ workbenchAuthorityExpectedCommit: value })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_INPUT_INVALID' })
    assert.equal(input.client.events.length, 0)
  })
})

test('refuses a company id or code collision and rolls back the transaction', async () => {
  const input = fixtureInput()
  input.client.state.companies.push({ id: 'company-jenfu', company_code: 'OTHER', company_kind: 'business', display_name: 'Unknown' })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_COMPANY_IDENTITY_COLLISION' })
  assert.equal(input.client.state.companies.length, 1)
  assert.equal(input.client.state.priorities.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
  assert.equal(input.client.events.at(-1).sql, 'ROLLBACK')
})

test('refuses multiple active priorities and unknown codes rather than replacing them', async t => {
  await t.test('multiple active rows', async () => {
    const input = fixtureInput()
    input.client.state.priorities.push(
      { id: 'p1', version_code: 'v1', priority_json: '["rd"]', status: 'active', created_by: null },
      { id: 'p2', version_code: 'v2', priority_json: '["qa"]', status: 'active', created_by: null },
    )
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_ROLE_PRIORITY_ACTIVE_CARDINALITY_INVALID' })
    assert.equal(input.client.state.priorities.length, 2)
    assert.equal(input.client.state.companies.length, 0)
  })
  await t.test('unknown non-empty code', async () => {
    const input = fixtureInput()
    input.client.state.priorities.push({ id: 'p1', version_code: 'v1', priority_json: '["rd","new_role"]', status: 'active', created_by: null })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_ROLE_PRIORITY_UNKNOWN_OR_INVALID' })
    assert.equal(input.client.state.priorities.length, 1)
    assert.equal(input.client.state.companies.length, 0)
  })
})

test('does not overwrite a partial or different native role projection', async () => {
  const input = fixtureInput({ clientOptions: { roles: [{ id: 'role-rd', role_code: 'rd', title: '舊角色',
    system_defined: 1, enabled: 1 }] } })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_NATIVE_ROLE_PROJECTION_COLLISION' })
  assert.equal(input.client.state.companies.length, 0)
  assert.equal(input.client.state.priorities.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
  assert.deepEqual(input.client.state.roles, [{ id: 'role-rd', role_code: 'rd', title: '舊角色',
    system_defined: 1, enabled: 1 }])
})

test('does not fill or overwrite permissions when the native role set already exists', async () => {
  const input = fixtureInput()
  const projection = nativeProjectionFor(input.client.state.catalogRows)
  input.client.state.roles.push(...projection.roles)
  input.client.state.rolePermissions.push({ ...projection.rolePermissions[0], permission_code: 'stale.permission' })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
    code: 'LOCAL_BUSINESS_BASELINE_NATIVE_ROLE_PROJECTION_COLLISION',
  })
  assert.deepEqual(input.client.state.roles, projection.roles)
  assert.deepEqual(input.client.state.rolePermissions,
    [{ ...projection.rolePermissions[0], permission_code: 'stale.permission' }])
  assert.equal(input.client.state.priorities.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
})

test('rejects a policy whose role set differs from the published catalog', async () => {
  const input = fixtureInput({ clientOptions: { catalogCodes: [
    'rd', 'rd_manager', 'qa', 'manufacturing', 'production_planning',
    'procurement', 'external_specialist', 'pdm_admin', 'unpublished_role',
  ] } })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_LOCAL_PRIORITY_POLICY_ROLE_SET_MISMATCH' })
  assert.equal(input.client.state.roles.length, 0)
  assert.equal(input.client.state.priorities.length, 0)
  assert.equal(input.client.state.companies.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
})

test('validates and preserves an existing active full permutation of the published catalog', async () => {
  const input = fixtureInput({ clientOptions: {
    priorities: [{ id: 'priority-current-v7', version_code: 'current-v7',
      priority_json: JSON.stringify([...DEFAULT_PRIORITY].reverse()), status: 'active', created_by: null }],
  } })

  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.deepEqual(result.rolePriority.priority, [...DEFAULT_PRIORITY].reverse())
  assert.equal(result.rolePriority.created, false)
  assert.equal(input.client.state.priorities.length, 1)
})

test('requires an existing active priority to contain every current catalog role exactly once', async () => {
  const input = fixtureInput({ clientOptions: { priorities: [{ id: 'priority-partial', version_code: 'partial-v1',
    priority_json: '["rd"]', status: 'active', created_by: null }] } })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
    code: 'LOCAL_BUSINESS_BASELINE_ROLE_PRIORITY_ACTIVE_CATALOG_MISMATCH',
  })
  assert.equal(input.client.state.priorities.length, 1)
  assert.equal(input.client.state.roles.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
})

test('requires a sandbox-bound, correctly hashed local role priority policy', async t => {
  await t.test('wrong sandbox', async () => {
    const input = fixtureInput({ localPriorityPolicy: makeLocalPriorityPolicy('another-sandbox') })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
      code: 'LOCAL_BUSINESS_BASELINE_LOCAL_PRIORITY_POLICY_INVALID',
    })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
  await t.test('wrong digest', async () => {
    const policy = makeLocalPriorityPolicy('dev126-test')
    const input = fixtureInput({ localPriorityPolicy: { ...policy, sha256: '0'.repeat(64) } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
      code: 'LOCAL_BUSINESS_BASELINE_LOCAL_PRIORITY_POLICY_INVALID',
    })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
  await t.test('different order with otherwise valid digest', async () => {
    const roleCodes = [...DEFAULT_PRIORITY].reverse()
    const input = fixtureInput({ localPriorityPolicy: makeLocalPriorityPolicy('dev126-test', roleCodes) })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), {
      code: 'LOCAL_BUSINESS_BASELINE_LOCAL_PRIORITY_POLICY_INVALID',
    })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
})

test('refuses wrong loopback port, database or scoped session user before beginning writes', async t => {
  await t.test('wrong port', async () => {
    const input = fixtureInput({ clientOptions: { serverPort: 5432 } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_TARGET_IDENTITY_MISMATCH' })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
  await t.test('non-loopback address', async () => {
    const input = fixtureInput({ clientOptions: { serverAddress: '10.0.0.5' } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_TARGET_IDENTITY_MISMATCH' })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
  await t.test('wrong session user', async () => {
    const input = fixtureInput({ clientOptions: { sessionUser: 'other_owner' } })
    await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_TARGET_IDENTITY_MISMATCH' })
    assert.equal(input.client.events.some(event => event.sql === 'BEGIN'), false)
  })
})

test('requires the runtime account to have SELECT only on target metadata', async () => {
  const input = fixtureInput({ clientOptions: { metadataAcl: {
    relkind: 'r', relation_owner: MIGRATOR, runtime_select: true, runtime_insert: true,
    runtime_update: false, runtime_delete: false, runtime_truncate: false,
    runtime_references: false, runtime_trigger: false, forbidden_acl: true,
  } } })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_RUNTIME_METADATA_PRIVILEGE_MISMATCH' })
  assert.equal(input.client.state.companies.length, 0)
  assert.equal(input.client.state.priorities.length, 0)
  assert.equal(input.client.state.metadata.length, 0)
})

test('transitions only an exact maintenance metadata row to ready', async () => {
  const input = fixtureInput()
  const maintenance = metadataFor(input.target)
  maintenance.status = 'maintenance'
  input.client.state.metadata.push(maintenance)

  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.deepEqual(result.metadata, { created: false, status: 'ready', targetFingerprint: maintenance.target_fingerprint })
  assert.equal(input.client.state.metadata[0].status, 'ready')
  assert.equal(input.client.events.filter(event => event.sql.startsWith('UPDATE ai_pdm_core.local_sandbox_target_metadata')).length, 1)
})

test('advances only a fingerprint-valid maintenance row to the new reset generation', async () => {
  const input = fixtureInput()
  const previousTarget = { ...input.target,
    generation: '22222222-2222-4222-8222-222222222222',
    fixtureVersion: 'dev126-fixture-previous',
    fixtureHash: 'b'.repeat(64),
  }
  const maintenance = metadataFor(previousTarget)
  maintenance.status = 'maintenance'
  input.client.state.metadata.push(maintenance)

  const result = await initializeDev126LocalBusinessBaseline(input)

  assert.equal(result.metadata.status, 'ready')
  assert.equal(input.client.state.metadata[0].status, 'ready')
  assert.equal(input.client.state.metadata[0].generation, input.target.generation)
  assert.equal(input.client.state.metadata[0].fixture_hash, input.target.fixtureHash)
  assert.equal(input.client.state.metadata[0].target_fingerprint, result.metadata.targetFingerprint)
})

test('refuses metadata from an unknown generation without overwriting it', async () => {
  const input = fixtureInput()
  const oldTarget = { ...input.target, generation: '22222222-2222-4222-8222-222222222222' }
  input.client.state.metadata.push(metadataFor(oldTarget))

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_TARGET_METADATA_COLLISION' })
  assert.equal(input.client.state.metadata[0].generation, oldTarget.generation)
  assert.equal(input.client.state.metadata[0].status, 'ready')
  assert.equal(input.client.state.companies.length, 0)
})

test('marks commit transport failure unknown and does not retry', async () => {
  const input = fixtureInput({ clientOptions: { commitUnknown: true } })

  await assert.rejects(initializeDev126LocalBusinessBaseline(input), { code: 'LOCAL_BUSINESS_BASELINE_COMMIT_RESULT_UNKNOWN' })
  assert.equal(input.client.events.filter(event => event.sql === 'COMMIT').length, 1)
  assert.equal(input.client.events.filter(event => event.sql === 'BEGIN').length, 1)
})
