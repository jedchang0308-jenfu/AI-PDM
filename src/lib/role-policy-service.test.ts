import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  applyRolePolicy,
  createRolePolicyDraft,
  previewRolePolicyDraft,
  readRolePolicyCommand,
  readRolePolicyDraft,
  readRolePolicyWorkspace,
  rolePolicyInput,
  saveRolePolicyDraft
} from '@/lib/role-policy-service'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import { rolePolicySource, type RolePolicyCandidate } from '@/lib/role-policy-editor'
import { lockAndRevalidateRolePolicyApply } from '@/lib/role-policy-apply-authorization'
import staticV8 from '../../config/access-control/jenfu-role-catalog.v8.json' with {type:'json'}

const localAdmins = vi.hoisted(() => new WeakSet<object>())
vi.mock('@/lib/local-test-admin', () => ({ isVerifiedLocalTestAdmin: (value: object) => localAdmins.has(value) }))

vi.mock('@/lib/role-policy-apply-authorization', () => ({
  lockAndRevalidateRolePolicyApply: vi.fn(async () => undefined),
  revalidateRolePolicyManager: vi.fn(async () => undefined)
}))

const actor = 'principal-admin'
const otherActor = 'principal-other'
const draftId = '20000000-0000-4000-8000-000000000010'
const requestId = '10000000-0000-4000-8000-000000000010'

type Params = Record<string, unknown> | readonly unknown[] | undefined
type DraftRow = Record<string, unknown> & {
  draft_id: string
  candidate_catalog_version: string
  base_catalog_version: string
  base_catalog_sha256: string
  registry_hash: string
  candidate_json: unknown
  role_bindings: unknown
  revision: number
  status: 'OPEN' | 'APPLIED'
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
  source_history_version: string | null
  template_id: string | null
  applied_catalog_version: string | null
  applied_command_id: string | null
}

function param(params: Params, key: string) {
  return params && !Array.isArray(params) ? (params as Record<string, unknown>)[key] : undefined
}

function legacyV7Rows(dynamic = true) {
  const { defaultCandidate: candidate } = rolePolicySource()
  const baseCatalog = dynamic ? { roles: candidate.roles, catalogVersion: candidate.candidateCatalogVersion, catalogSha256: candidate.contentHash } : rolePolicySource().baseCatalog
  return baseCatalog.roles.map((role, displayOrder) => ({
    contract_version: 'jenfu.platform-entitlement.v1',
    application_id: 'ai-pdm',
    catalog_version: baseCatalog.catalogVersion,
    published_at: '2026-10-10T00:00:00.000Z',
    catalog_sha256: baseCatalog.catalogSha256,
    display_order: displayOrder,
    stable_role_id: role.stableRoleId,
    role_code: role.roleCode,
    display_name: role.displayName,
    assignable: role.assignable,
    risk: role.risk,
    subject_kind: role.subjectKind,
    recommendation_allowed: role.recommendationAllowed,
    delegation_allowed: role.delegationAllowed,
    allowed_scope_kinds: role.allowedScopeKinds,
    assignment_tier: role.assignmentTier,
    permissions: role.permissions,
    metadata: role.metadata,
    role_definition_hash: role.roleDefinitionHash,
    publication_format: dynamic ? candidate.format : 'legacy-static-v1',
    canonicalization_version: 'jenfu.canonical-json.v1',
    role_schema_id: candidate.roleSchemaId,
    baseline_role_identity_hash: candidate.baselineRoleIdentityHash,
    role_identity_hash: candidate.roleIdentityHash,
    protected_policy_hash: candidate.protectedPolicyHash,
    registry_hash: candidate.registryHash,
    role_profile_schema_id: candidate.roleProfileSchemaId,
    role_profile_hash: candidate.roleProfileHash,
    role_status: 'active',
    permission_role_id: dynamic ? candidate.roleProfiles[displayOrder].permissionRoleId : role.stableRoleId,
    presentation_name: dynamic ? candidate.roleProfiles[displayOrder].presentationName : role.displayName,
    presentation_order: dynamic ? candidate.roleProfiles[displayOrder].presentationOrder : displayOrder,
    assignment_disposition: dynamic ? candidate.roleProfiles[displayOrder].assignmentDisposition : role.stableRoleId==='role-system-admin'?'hidden-protected':'selectable',
    lifecycle: 'active'
  }))
}

function managerVerified(principalId = actor, assuranceLevel: 'aal1' | 'aal2' = 'aal2') {
  return {
    session: {
      principalId,
      sessionId: 'test-role-policy-session-0001',
      identityIssuer: 'test-issuer', identitySubject: 'test-subject',
      employeeId: principalId === actor ? 'employee-admin' : 'employee-other',
      assuranceLevel
    }
  } as never
}

function unitClientFixture(options: { rejectCatalogOrDraft?: boolean; accountType?: string; directGrant?: boolean; staticV8?: boolean } = {}) {
  const drafts = new Map<string, DraftRow>()
  const commands = new Map<string, Record<string, unknown>>()
  const currentRows = legacyV7Rows()
  if(options.staticV8) {
    const first=currentRows[0]
    currentRows.splice(0,currentRows.length,...staticV8.roles.map((role,index)=>{
      const profile=index<9?{permissionRoleId:role.stableRoleId,presentationName:role.displayName,presentationOrder:index,
        assignmentDisposition:role.stableRoleId==='role-system-admin'?'hidden-protected':'selectable'}:rolePolicySource().registry.roleProfiles[9]
      const profiles=staticV8.roles.map((r,i)=>i<9?{stableRoleId:r.stableRoleId,permissionRoleId:r.stableRoleId,presentationName:r.displayName,
        presentationOrder:i,assignmentDisposition:r.stableRoleId==='role-system-admin'?'hidden-protected':'selectable'}:rolePolicySource().registry.roleProfiles[9])
      return {...first,catalog_version:staticV8.catalogVersion,catalog_sha256:staticV8.catalogSha256,display_order:index,stable_role_id:role.stableRoleId,
        role_code:role.roleCode,display_name:role.displayName,assignable:role.assignable,risk:role.risk,subject_kind:role.subjectKind,
        recommendation_allowed:role.recommendationAllowed,delegation_allowed:role.delegationAllowed,allowed_scope_kinds:role.allowedScopeKinds,
        assignment_tier:role.assignmentTier,permissions:role.permissions,metadata:role.metadata??null,role_definition_hash:role.roleDefinitionHash,
        publication_format:'legacy-static-v1',canonicalization_version:null,role_schema_id:null,baseline_role_identity_hash:null,role_identity_hash:null,
        protected_policy_hash:null,registry_hash:null,role_profile_schema_id:'ai-pdm.static-role-profiles.v1',role_profile_hash:sha256CanonicalJson(profiles),
        permission_role_id:profile.permissionRoleId,presentation_name:profile.presentationName,presentation_order:profile.presentationOrder,
        assignment_disposition:profile.assignmentDisposition,role_status:'active',lifecycle:'active'}
    }) as never[])
  }
  const authorizedManagers = new Set([actor, otherActor])
  const querySql: string[] = []
  const executeSql: string[] = []
  const applyCalls: Array<{ sql: string; params: Params }> = []
  const applyResult = { commandId: requestId, catalogVersion: 'published-once', status: 'APPLIED' }

  const queryOne = vi.fn(async (sql: string, params?: Params) => {
    querySql.push(sql)
    if (sql.includes('manager_eligible_v2')) return { eligible: options.directGrant ?? authorizedManagers.has(String(param(params, 'principalId'))) }
    if (sql.includes('principal_accounts')) {
      return { account_type: options.accountType ?? 'human_privileged', account_status: 'active' }
    }
    if (sql.includes('role_policy_commands')) {
      return commands.get(String(param(params, 'requestId'))) ?? null
    }
    if (sql.includes('role_policy_drafts')) {
      if (options.rejectCatalogOrDraft) throw new Error('replay must not consult draft')
      return drafts.get(String(param(params, 'draftId'))) ?? null
    }
    if (sql.includes('role_policy_apply_v2') || sql.includes('role_policy_apply_local_test_admin_v1')) {
      applyCalls.push({ sql, params })
      return { result: applyResult }
    }
    throw new Error(`UNEXPECTED_QUERY_ONE: ${sql}`)
  })

  const query = vi.fn(async (sql: string, params?: Params) => {
    querySql.push(sql)
    if (sql.includes('pg_advisory_xact_lock')) return []
    if (sql.includes('v_application_role_catalog_v3')) {
      if (options.rejectCatalogOrDraft) throw new Error('replay must not consult current catalog')
      return currentRows
    }
    if (sql.includes('manager_eligible_v2')) {
      return (options.directGrant ?? authorizedManagers.has(String(param(params, 'principalId'))))
        ? [{ assignment_id: 'direct-global-system-admin' }]
        : []
    }
    if (sql.includes('v_role_policy_publications_v1')) return []
    throw new Error(`UNEXPECTED_QUERY: ${sql}`)
  })

  const execute = vi.fn(async (sql: string, params?: Params) => {
    executeSql.push(sql)
    if (sql.includes('INSERT INTO ai_pdm_core.role_policy_drafts')) {
      const id = String(param(params, 'draftId'))
      const candidate = JSON.parse(String(param(params, 'candidate'))) as RolePolicyCandidate
      drafts.set(id, {
        draft_id: id,
        candidate_catalog_version: String(param(params, 'candidateVersion')),
        base_catalog_version: String(param(params, 'baseVersion')),
        base_catalog_sha256: String(param(params, 'baseHash')),
        registry_hash: String(param(params, 'registryHash')),
        candidate_json: candidate,
        role_bindings: [],
        revision: 1,
        status: 'OPEN',
        created_by: String(param(params, 'actor')),
        updated_by: String(param(params, 'actor')),
        created_at: '2026-10-23T00:00:00.000Z',
        updated_at: '2026-10-23T00:00:00.000Z',
        source_history_version: (param(params, 'sourceHistoryVersion') as string | null) ?? null,
        template_id: (param(params, 'templateId') as string | null) ?? null,
        applied_catalog_version: null,
        applied_command_id: null
      })
      return
    }
    if (sql.includes('UPDATE ai_pdm_core.role_policy_drafts')) {
      const id = String(param(params, 'draftId'))
      const row = drafts.get(id)
      if (!row || row.revision !== Number(param(params, 'expectedRevision')) || row.status !== 'OPEN') return
      row.candidate_json = JSON.parse(String(param(params, 'candidate')))
      row.revision += 1
      row.updated_by = String(param(params, 'actor'))
      row.updated_at = '2026-10-23T00:01:00.000Z'
      const previous = Array.isArray(row.role_bindings) ? row.role_bindings : []
      const added = JSON.parse(String(param(params, 'bindings'))) as unknown[]
      row.role_bindings = [...previous, ...added]
      return
    }
    throw new Error(`UNEXPECTED_EXECUTE: ${sql}`)
  })

  const client = {
    kind: 'postgres',
    query,
    queryOne,
    execute,
    transaction: vi.fn(async (fn: (value: unknown) => unknown) => fn(client)),
    close: vi.fn(async () => undefined)
  }
  return { client, drafts, commands, currentRows, querySql, executeSql, applyCalls, applyResult }
}

function activeTuple() {
  const { defaultCandidate: candidate } = rolePolicySource()
  return { catalogVersion: candidate.candidateCatalogVersion, catalogSha256: candidate.contentHash }
}

function applyBody(reason = '調整角色') {
  return {
    requestId,
    confirmation: { draftId, draftRevision: 1, expectedActive: activeTuple() },
    reason
  }
}

function commandHashForApply(principalId: string, body: ReturnType<typeof applyBody>) {
  const payload = { confirmation: body.confirmation, reason: body.reason }
  return sha256CanonicalJson({
    contractVersion: 'ai-pdm.role-policy-command.v3',
    operation: 'apply',
    resource: 'ai-pdm:role-policy',
    actorPrincipalId: principalId,
    payload
  })
}

beforeEach(() => vi.clearAllMocks())

describe('DEV-123 role-policy service contract', () => {
  it('creates/saves/reloads a first DRAFT from exact static v8 without publishing business policy or changing active profiles',async()=>{
    const fixture=unitClientFixture({staticV8:true}),activeBefore=structuredClone(fixture.currentRows)
    const tuple={catalogVersion:staticV8.catalogVersion,catalogSha256:staticV8.catalogSha256}
    const workspace=await readRolePolicyWorkspace(fixture.client as never,undefined,managerVerified())
    expect(workspace.roles).toHaveLength(10)
    expect(workspace.roleProfiles[4].permissionRoleId).toBe('role-production-planning')
    expect(workspace.roleProfiles[9].assignmentDisposition).toBe('hidden-protected')
    const created=await createRolePolicyDraft(fixture.client as never,managerVerified(actor,'aal1'),{draftId,expectedActive:tuple})
    const saved=await saveRolePolicyDraft(fixture.client as never,managerVerified(actor,'aal1'),draftId,{expectedRevision:created.revision,
      roleChanges:[],changes:[{roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'view',enabled:true}]})
    const reload=await readRolePolicyDraft(fixture.client as never,draftId)
    const {changed:_changed,...savedFields}=saved
    expect(reload).toEqual(savedFields)
    expect(fixture.drafts.get(draftId)?.status).toBe('OPEN')
    expect(fixture.drafts.get(draftId)?.template_id).toBe('ai-pdm.legacy-preserving-first-draft.v1')
    expect(fixture.currentRows).toEqual(activeBefore)
    expect(fixture.applyCalls).toHaveLength(0)
    expect(fixture.commands.size).toBe(0)
    expect(fixture.executeSql.every(sql=>sql.includes('role_policy_drafts'))).toBe(true)
    const preview=await previewRolePolicyDraft(fixture.client as never,draftId,saved.revision)
    expect(preview.diff.policyTransition).toBe('legacy-to-dynamic')
    expect(preview.diff.profileChanges.length).toBeGreaterThan(0)
    expect(preview.diff.semanticChanges).toContainEqual(expect.objectContaining({stableRoleId:'role-rd',permissionCode:'numbering.approval.request',before:'allowed',after:'not_granted'}))
  })
  it('requires a fresh semantic-preview capability only for a new first-conversion apply, without changing the durable body hash',async()=>{
    const fixture=unitClientFixture({staticV8:true})
    const tuple={catalogVersion:staticV8.catalogVersion,catalogSha256:staticV8.catalogSha256}
    await createRolePolicyDraft(fixture.client as never,managerVerified(),{draftId,expectedActive:tuple})
    const body={requestId,confirmation:{draftId,draftRevision:1,expectedActive:tuple},reason:'明確確認逐操作差異'}
    await expect(applyRolePolicy(fixture.client as never,managerVerified(),body)).rejects.toMatchObject({code:'ROLE_POLICY_SEMANTIC_DIFF_REQUIRED',status:409})
    expect(fixture.applyCalls).toHaveLength(0)
    const preview=await previewRolePolicyDraft(fixture.client as never,draftId,1)
    await expect(applyRolePolicy(fixture.client as never,managerVerified(),{...body,semanticDiffVersion:preview.diff.semanticDiffVersion})).resolves.toEqual(fixture.applyResult)
    expect(fixture.applyCalls).toHaveLength(1)
    expect(fixture.applyCalls[0].params).not.toHaveProperty('semanticDiffVersion')
  })
  it('static v8 does not make a root-only or business-only Principal a policy manager',async()=>{
    const fixture=unitClientFixture({staticV8:true,directGrant:false})
    const workspace=await readRolePolicyWorkspace(fixture.client as never,undefined,managerVerified())
    expect(workspace.admission).toEqual({read:true,edit:false,apply:false})
    await expect(createRolePolicyDraft(fixture.client as never,managerVerified(),{draftId,
      expectedActive:{catalogVersion:staticV8.catalogVersion,catalogSha256:staticV8.catalogSha256}}))
      .rejects.toMatchObject({code:'ROLE_POLICY_MANAGER_REQUIRED'})
    expect(fixture.drafts.size).toBe(0);expect(fixture.executeSql).toHaveLength(0)
  })
  it('rejects strict nested payloads and the retired ActiveTuple fields', () => {
    expect(() => rolePolicyInput.assertTuple({
      ...activeTuple(), activationGeneration: '0'
    })).toThrow('REQUEST_SCHEMA_INVALID')
    expect(() => rolePolicyInput.parseRoleChanges([
      { type: 'create', clientRoleId: 'client-a', displayName: '新角色', elevated: true }
    ])).toThrow('REQUEST_SCHEMA_INVALID')
    expect(() => rolePolicyInput.parseCapabilityChanges([{
      roleRef: { stableRoleId: 'role-rd', clientRoleId: 'client-a' },
      groupId: 'drawing', actionId: 'view', enabled: true
    }])).toThrow('REQUEST_SCHEMA_INVALID')
  })

  it('deduplicates create by draft ID and rejects actor or binding conflicts', async () => {
    const fixture = unitClientFixture()
    const body = { draftId, expectedActive: activeTuple() }
    const first = await createRolePolicyDraft(fixture.client as never, managerVerified(), body)
    const replay = await createRolePolicyDraft(fixture.client as never, managerVerified(), body)
    expect(replay).toEqual(first)
    expect(fixture.executeSql.filter(sql => sql.includes('INSERT INTO ai_pdm_core.role_policy_drafts'))).toHaveLength(1)
    expect(fixture.querySql.some(sql => sql.includes('pg_advisory_xact_lock'))).toBe(true)
    expect(fixture.querySql.filter(sql => sql.includes('v_application_role_catalog_v3'))).toHaveLength(1)

    await expect(createRolePolicyDraft(fixture.client as never, managerVerified(otherActor), body))
      .rejects.toMatchObject({ code: 'DRAFT_ID_REUSE', status: 409 })
    await expect(createRolePolicyDraft(fixture.client as never, managerVerified(), {
      ...body, expectedActive: { ...activeTuple(), catalogSha256: 'f'.repeat(64) }
    })).rejects.toMatchObject({ code: 'DRAFT_ID_REUSE', status: 409 })
  })

  it('allows a verified AAL1 human privileged direct manager under the existing login policy', async () => {
    const fixture = unitClientFixture()
    const verified = managerVerified(actor, 'aal1')
    const created = await createRolePolicyDraft(fixture.client as never, verified, {
      draftId, expectedActive: activeTuple()
    })
    const saved = await saveRolePolicyDraft(fixture.client as never, verified, draftId, {
      expectedRevision: created.revision, roleChanges: [], changes: []
    })
    expect(saved.revision).toBe(created.revision)
    expect(fixture.querySql.some(sql => sql.includes('manager_eligible_v2'))).toBe(true)
  })

  it.each([true, false, undefined])('uses only the verified session for policy read admission (%s)', async canManage => {
    const fixture = unitClientFixture({ directGrant: canManage !== true })
    const verified = {
      ...(managerVerified(otherActor, 'aal1') as object),
      permissions: { canManageRolePolicy: canManage }
    } as Parameters<typeof readRolePolicyCommand>[2]
    fixture.commands.set(requestId, {
      actor_principal_id: actor,
      result_json: { draftId },
      completed_at: '2026-10-23T00:00:00.000Z'
    })
    const workspace = await readRolePolicyWorkspace(fixture.client as never, undefined, verified)
    expect(workspace.admission).toEqual({ read: true, edit: canManage === true, apply: canManage === true })
    const receipt = readRolePolicyCommand(fixture.client as never, requestId, verified)
    if (canManage === true) {
      await expect(receipt).resolves.toMatchObject({ requestId, outcome: 'SUCCEEDED' })
    } else {
      await expect(receipt).rejects.toMatchObject({ code: 'ROLE_POLICY_MANAGER_REQUIRED', status: 403 })
    }
    expect(fixture.querySql.join('\n')).not.toMatch(/orgmaster_contract|platform_contract/u)
  })

  it('creates, saves, previews, applies and reads a local admin draft without upstream authority', async () => {
    const fixture = unitClientFixture({ directGrant: false })
    const verified = managerVerified()
    localAdmins.add(verified)
    await createRolePolicyDraft(fixture.client as never, verified, { draftId, expectedActive: activeTuple() })
    const saved = await saveRolePolicyDraft(fixture.client as never, verified, draftId, {
      expectedRevision: 1, roleChanges: [],
      changes: [{ roleRef: { stableRoleId: 'role-rd' }, groupId: 'drawing', actionId: 'edit', enabled: false }]
    })
    expect(saved.revision).toBe(2)
    const preview = await previewRolePolicyDraft(fixture.client as never, draftId, 2)
    await expect(applyRolePolicy(fixture.client as never, verified, {
      requestId, confirmation: preview.confirmation, reason: '本機管理測試'
    })).resolves.toEqual(fixture.applyResult)
    expect((await readRolePolicyDraft(fixture.client as never, draftId)).revision).toBe(2)
    expect(fixture.applyCalls[0].sql).toContain('role_policy_apply_local_test_admin_v1')
    expect(fixture.querySql.join('\n')).not.toMatch(/orgmaster_contract|platform_contract/u)
    const workspace = await readRolePolicyWorkspace(fixture.client as never, draftId, verified)
    expect(workspace.admission).toEqual({ read: true, edit: true, apply: true })
  })

  it.each([
    ['ordinary account', { accountType: 'human_personal', directGrant: false }],
    ['delegated grant', { directGrant: false }],
    ['workload account', { accountType: 'workload' }],
  ])('rejects a %s from role-policy management', async (_label, options) => {
    const fixture = unitClientFixture(options)
    await expect(createRolePolicyDraft(fixture.client as never, managerVerified(), {
      draftId, expectedActive: activeTuple()
    })).rejects.toMatchObject({ code: 'ROLE_POLICY_MANAGER_REQUIRED', status: 403 })
  })

  it('saves a mixed new-role/client-binding change, reads the binding back, and rejects a stale revision', async () => {
    const fixture = unitClientFixture()
    await createRolePolicyDraft(fixture.client as never, managerVerified(), {
      draftId, expectedActive: activeTuple()
    })
    const saved = await saveRolePolicyDraft(fixture.client as never, managerVerified(), draftId, {
      expectedRevision: 1,
      roleChanges: [{ type: 'create', clientRoleId: 'client-supply', displayName: '供應協作' }],
      changes: [{ roleRef: { clientRoleId: 'client-supply' }, groupId: 'drawing', actionId: 'view', enabled: true }]
    })
    expect(saved.revision).toBe(2)
    expect(saved.roleBindings).toHaveLength(1)
    expect(saved.roleBindings[0]).toMatchObject({ clientRoleId: 'client-supply' })
    expect(saved.candidate.roles.some(role => role.stableRoleId === saved.roleBindings[0].stableRoleId &&
      role.permissions.some(permission => permission.code === 'pdm.drawing.view' && permission.allowed))).toBe(true)
    expect(fixture.querySql.some(sql => sql.includes('role_policy_drafts') && sql.includes('FOR UPDATE'))).toBe(true)
    expect(fixture.executeSql.some(sql => sql.includes('revision=:expectedRevision') && sql.includes("status='OPEN'"))).toBe(true)

    const readback = await readRolePolicyDraft(fixture.client as never, draftId)
    expect(readback.roleBindings).toEqual(saved.roleBindings)
    expect(readback.revision).toBe(2)
    await expect(saveRolePolicyDraft(fixture.client as never, managerVerified(), draftId, {
      expectedRevision: 1, roleChanges: [], changes: []
    })).rejects.toMatchObject({ code: 'DRAFT_CONFLICT', status: 409 })
  })

  it('previews the legacy-to-dynamic diff without writing the draft', async () => {
    const fixture = unitClientFixture()
    await createRolePolicyDraft(fixture.client as never, managerVerified(), {
      draftId, expectedActive: activeTuple()
    })
    const before = JSON.stringify(fixture.drafts.get(draftId))
    const executeCount = fixture.executeSql.length
    const preview = await previewRolePolicyDraft(fixture.client as never, draftId, 1)
    expect(preview.confirmation).toEqual({ draftId, draftRevision: 1, expectedActive: activeTuple() })
    expect(preview.diff.policyTransition).toBe('dynamic-update')
    expect(JSON.stringify(fixture.drafts.get(draftId))).toBe(before)
    expect(fixture.executeSql).toHaveLength(executeCount)
  })

  it('calls the atomic apply function even when no readiness source exists', async () => {
    const fixture = unitClientFixture()
    await createRolePolicyDraft(fixture.client as never, managerVerified(), {
      draftId, expectedActive: activeTuple()
    })
    await saveRolePolicyDraft(fixture.client as never, managerVerified(), draftId, { expectedRevision: 1, roleChanges: [], changes: [{roleRef:{stableRoleId:'role-rd'},groupId:'drawing',actionId:'edit',enabled:false}] })
    const body = applyBody()
    body.confirmation.draftRevision = 2
    await expect(applyRolePolicy(fixture.client as never, managerVerified(), body))
      .resolves.toEqual(fixture.applyResult)
    expect(lockAndRevalidateRolePolicyApply).toHaveBeenCalledWith(fixture.client, expect.anything(), requestId, draftId)
    expect(fixture.applyCalls).toHaveLength(1)
    expect(fixture.applyCalls[0].sql).toContain('ai_pdm_core.role_policy_apply_v2')
    expect(fixture.querySql.some(sql => /readiness|compatibility|generation/iu.test(sql))).toBe(false)
  })

  it('returns an apply replay before consulting an APPLIED draft or the new current catalog', async () => {
    const fixture = unitClientFixture({ rejectCatalogOrDraft: true })
    const body = applyBody()
    const original = { commandId: requestId, catalogVersion: 'published-once', status: 'APPLIED' }
    fixture.commands.set(requestId, {
      actor_principal_id: actor,
      request_hash: commandHashForApply(actor, body),
      result_json: original
    })
    await expect(applyRolePolicy(fixture.client as never, managerVerified(), body)).resolves.toEqual(original)
    expect(fixture.querySql.some(sql => sql.includes('role_policy_drafts'))).toBe(false)
    expect(fixture.querySql.some(sql => sql.includes('v_application_role_catalog_v3'))).toBe(false)
    expect(fixture.applyCalls).toHaveLength(0)
  })
  it('replays an old first-conversion receipt with the original body and no semantic version or current preview',async()=>{
    const fixture=unitClientFixture({rejectCatalogOrDraft:true})
    const body={...applyBody(),confirmation:{...applyBody().confirmation,expectedActive:{catalogVersion:staticV8.catalogVersion,catalogSha256:staticV8.catalogSha256}}}
    const original={commandId:requestId,status:'APPLIED',catalogVersion:'original-first-conversion'}
    fixture.commands.set(requestId,{actor_principal_id:actor,request_hash:commandHashForApply(actor,body),result_json:original})
    await expect(applyRolePolicy(fixture.client as never,managerVerified(),body)).resolves.toEqual(original)
    expect(fixture.applyCalls).toHaveLength(0)
    expect(fixture.querySql.some(sql=>sql.includes('v_application_role_catalog_v3')||sql.includes('role_policy_drafts'))).toBe(false)
  })

  it('rejects a reused request ID when payload or actor differs', async () => {
    const fixture = unitClientFixture({ rejectCatalogOrDraft: true })
    const body = applyBody()
    fixture.commands.set(requestId, {
      actor_principal_id: actor,
      request_hash: commandHashForApply(actor, body),
      result_json: { commandId: requestId }
    })
    await expect(applyRolePolicy(fixture.client as never, managerVerified(), applyBody('不同內容')))
      .rejects.toMatchObject({ code: 'REQUEST_ID_REUSE', status: 409 })
    await expect(applyRolePolicy(fixture.client as never, managerVerified(otherActor), body))
      .rejects.toMatchObject({ code: 'REQUEST_ID_REUSE', status: 409 })
    expect(fixture.applyCalls).toHaveLength(0)
  })

  it('lets the original command actor read their receipt but rejects another actor without current management grant', async () => {
    const fixture = unitClientFixture()
    fixture.commands.set(requestId, {
      actor_principal_id: actor,
      result_json: { draftId },
      completed_at: '2026-10-23T00:00:00.000Z'
    })
    await expect(readRolePolicyCommand(fixture.client as never, requestId, {
      session: { principalId: actor }
    } as never)).resolves.toMatchObject({
      requestId, outcome: 'SUCCEEDED', result: { draftId }
    })
    expect(fixture.querySql.filter(sql => sql.includes('principal_accounts'))).toHaveLength(0)
    await expect(readRolePolicyCommand(fixture.client as never, requestId, managerVerified('unauthorized-actor')))
      .rejects.toMatchObject({ code: 'ROLE_POLICY_MANAGER_REQUIRED', status: 403 })
    expect(fixture.querySql.some(sql => sql.includes('manager_eligible_v2'))).toBe(true)
  })

  it('shows legacy v7 permissions exactly and does not inject the new default template', async () => {
    const fixture = unitClientFixture()
    fixture.currentRows.splice(0, fixture.currentRows.length, ...legacyV7Rows(false))
    const source = rolePolicySource()
    const workspace = await readRolePolicyWorkspace(fixture.client as never)
    expect(workspace.roles[0].permissions).toEqual(source.baseCatalog.roles[0].permissions)
    expect(workspace.roles[8].permissions.some(permission => /^pdm\.(drawing|part|model|transfer)\./u.test(permission.code))).toBe(false)
    expect(workspace.admission).toEqual({ read: true, edit: false, apply: false })
    expect(workspace.roleProfiles).toEqual(source.baseCatalog.roles.map((role,index)=>({stableRoleId:role.stableRoleId,
      permissionRoleId:role.stableRoleId,presentationName:role.displayName,presentationOrder:index,
      assignmentDisposition:role.stableRoleId==='role-system-admin'?'hidden-protected':'selectable'})))
  })
})
