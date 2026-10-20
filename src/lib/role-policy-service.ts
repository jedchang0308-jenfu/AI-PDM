import { decodePublishedPrincipalCatalogRows } from '@/lib/jenfu-principal-role-catalog'
import { randomUUID } from 'node:crypto'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import { applyRolePolicyDraftChanges, assertRolePolicyCandidate, buildDefaultRolePolicyCandidate,
  rebuildRolePolicyCandidate, restoreRolePolicyHistory, rolePolicyConfirmationHash, rolePolicyDiff, rolePolicyRegistry,
  rolePolicyRegistryHash, type ActiveRolePolicyTuple, type RolePolicyCandidate,
  type RolePolicyCapabilityChange, type RolePolicyProfile, type RolePolicyRole, type RolePolicyRoleChange } from '@/lib/role-policy-editor'
import { assertExactKeys, RolePolicyHttpError } from '@/lib/role-policy-http'
import { lockAndRevalidateRolePolicyApply } from '@/lib/role-policy-apply-authorization'

type StateRow = {
  mode: 'DISABLED' | 'ENABLED' | 'PAUSED'; activation_generation: number | string;
  baseline_catalog_version: string; baseline_catalog_sha256: string; baseline_role_identity_hash: string;
  protected_policy_hash: string; role_schema_id: string; role_profile_schema_id: string; registry_hash: string;
}
type CompatibilityRow = {
  application_id: string; consumer_id: string; contract_version: string; compatibility_revision: number | string;
  supported_publication_format: string; supported_canonicalization_version: string;
  supported_role_schema_id: string; supported_role_profile_schema_id: string;
  accepted_registry_hash: string | null; accepted_baseline_role_identity_hash: string | null;
  accepted_protected_policy_hash: string | null; consumer_source_revision: string | null;
  enablement_ref: string | null; readiness: 'READY' | 'NOT_READY'
}
type CatalogRow = Record<string, unknown>
type DraftRow = {
  draft_id: string; candidate_catalog_version: string; base_catalog_version: string;
  base_catalog_sha256: string; base_activation_generation: number | string; registry_hash: string;
  candidate_json: unknown; content_hash: string; revision: number | string; status: 'OPEN' | 'APPLIED';
  created_by: string; updated_by: string; created_at: string; updated_at: string;
  source_history_version: string | null; template_id: string | null; last_save_command_id: string | null;
  applied_catalog_version: string | null; applied_command_id: string | null
}

const catalogColumns = `contract_version,application_id,catalog_version,published_at,catalog_sha256,
  display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
  recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,
  metadata,role_definition_hash,publication_format,canonicalization_version,role_schema_id,
  activation_generation,baseline_role_identity_hash,role_identity_hash,protected_policy_hash,
  registry_hash,role_profile_schema_id,role_profile_hash,role_status,permission_role_id,
  presentation_name,presentation_order,assignment_disposition,lifecycle`

function json<T>(value: unknown): T {
  if (typeof value === 'string') return JSON.parse(value) as T
  return value as T
}
function integerString(value: string | number) {
  const text = String(value)
  if (!/^(0|[1-9][0-9]*)$/u.test(text)) throw new RolePolicyHttpError('ROLE_POLICY_CONTRACT_INVALID', 503)
  return text
}
function activeTuple(rows: CatalogRow[], state: StateRow): ActiveRolePolicyTuple {
  if (!rows[0]) throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_UNAVAILABLE', 503)
  return { catalogVersion: String(rows[0].catalog_version), catalogSha256: String(rows[0].catalog_sha256),
    activationGeneration: integerString(state.activation_generation) }
}
function assertTuple(value: unknown): ActiveRolePolicyTuple {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RolePolicyHttpError('EXPECTED_ACTIVE_INVALID', 422)
  const tuple = value as Record<string, unknown>
  if (Object.keys(tuple).sort().join(',') !== 'activationGeneration,catalogSha256,catalogVersion' ||
      typeof tuple.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(String(tuple.catalogSha256)) ||
      !/^(0|[1-9][0-9]*)$/u.test(String(tuple.activationGeneration))) throw new RolePolicyHttpError('EXPECTED_ACTIVE_INVALID', 422)
  return tuple as ActiveRolePolicyTuple
}
function objectRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  }
  return value as Record<string, unknown>
}
function parseRoleChanges(value: unknown): RolePolicyRoleChange[] {
  if (!Array.isArray(value)) throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  return value.map(item => {
    const change = objectRecord(item)
    if (change.type === 'create') {
      assertExactKeys(change, ['type', 'clientRoleId', 'displayName'])
      if (typeof change.clientRoleId !== 'string' || typeof change.displayName !== 'string') {
        throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
      }
      return { type: 'create', clientRoleId: change.clientRoleId, displayName: change.displayName }
    }
    if (change.type === 'deactivate' || change.type === 'reactivate') {
      assertExactKeys(change, ['type', 'stableRoleId'])
      if (typeof change.stableRoleId !== 'string') throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
      return { type: change.type, stableRoleId: change.stableRoleId }
    }
    throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  })
}
function parseCapabilityChanges(value: unknown): RolePolicyCapabilityChange[] {
  if (!Array.isArray(value)) throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  return value.map(item => {
    const change = objectRecord(item)
    assertExactKeys(change, ['roleRef', 'groupId', 'actionId', 'enabled'])
    const roleRef = objectRecord(change.roleRef)
    const keys = Object.keys(roleRef)
    if (keys.length !== 1 || (keys[0] !== 'stableRoleId' && keys[0] !== 'clientRoleId') ||
        typeof roleRef[keys[0]] !== 'string' || typeof change.groupId !== 'string' ||
        typeof change.actionId !== 'string' || typeof change.enabled !== 'boolean') {
      throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
    }
    return { roleRef: keys[0] === 'stableRoleId' ? { stableRoleId: roleRef.stableRoleId as string }
      : { clientRoleId: roleRef.clientRoleId as string }, groupId: change.groupId,
    actionId: change.actionId, enabled: change.enabled }
  })
}
function assertCurrent(expected: ActiveRolePolicyTuple, current: ActiveRolePolicyTuple) {
  if (expected.catalogVersion !== current.catalogVersion || expected.catalogSha256 !== current.catalogSha256 ||
      expected.activationGeneration !== current.activationGeneration) throw new RolePolicyHttpError('ACTIVE_CONFLICT', 409)
}
function candidateFromRows(rows: CatalogRow[], candidateCatalogVersion: string): RolePolicyCandidate {
  if (!rows.length || rows.length > rolePolicyRegistry.limits.maxRoles) throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_INVALID', 503)
  const roles = rows.map((row, index): RolePolicyRole => {
    if (Number(row.display_order) !== index) throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_INVALID', 503)
    return {
      stableRoleId: String(row.stable_role_id), roleCode: String(row.role_code), displayName: String(row.display_name),
      assignable: row.assignable === true, risk: row.risk as RolePolicyRole['risk'], subjectKind: row.subject_kind as RolePolicyRole['subjectKind'],
      recommendationAllowed: row.recommendation_allowed === true, delegationAllowed: row.delegation_allowed === true,
      allowedScopeKinds: json<string[]>(row.allowed_scope_kinds), assignmentTier: row.assignment_tier as RolePolicyRole['assignmentTier'],
      permissions: json<RolePolicyRole['permissions']>(row.permissions), metadata: row.metadata == null ? null : json<Record<string, unknown>>(row.metadata),
      roleStatus: row.role_status === 'inactive' ? 'inactive' : 'active', roleDefinitionHash: String(row.role_definition_hash)
    }
  })
  const dynamic = rows[0].publication_format === 'dynamic-policy-v1'
  const profiles: RolePolicyProfile[] = dynamic ? rows.map(row => ({
    stableRoleId: String(row.stable_role_id), permissionRoleId: String(row.permission_role_id),
    presentationName: String(row.presentation_name), presentationOrder: Number(row.presentation_order),
    assignmentDisposition: row.assignment_disposition as RolePolicyProfile['assignmentDisposition']
  })) : rolePolicyRegistry.roleProfiles
  const rebuilt = rebuildRolePolicyCandidate({ roles, roleProfiles: profiles, candidateCatalogVersion })
  if (dynamic && (String(rows[0].registry_hash) !== rolePolicyRegistryHash ||
      String(rows[0].catalog_sha256) !== rebuildRolePolicyCandidate({ roles, roleProfiles: profiles,
        candidateCatalogVersion: String(rows[0].catalog_version) }).contentHash)) {
    throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_INVALID', 503)
  }
  return rebuilt
}

function activeProjection(rows: CatalogRow[], catalogVersion: string) {
  if (rows[0]?.publication_format === 'dynamic-policy-v1') return candidateFromRows(rows, catalogVersion)
  const catalog = decodePublishedPrincipalCatalogRows(rows)
  return { format: 'legacy-static-v1' as const,
    roles: catalog.roles.map(role => ({ ...role, metadata: role.metadata ?? null,
      roleStatus: 'active' as const })) as RolePolicyRole[],
    roleProfiles: catalog.roles.map((role, index): RolePolicyProfile => ({
      stableRoleId: role.stableRoleId, permissionRoleId: role.stableRoleId,
      presentationName: role.displayName, presentationOrder: index,
      assignmentDisposition: role.stableRoleId === 'role-system-admin' ? 'hidden-protected' : 'selectable'
    })) }
}

async function stateAndCatalog(client: AsyncDatabaseClient) {
  const state = await client.queryOne<StateRow>(`SELECT mode,activation_generation,baseline_catalog_version,
    baseline_catalog_sha256,baseline_role_identity_hash,protected_policy_hash,role_schema_id,
    role_profile_schema_id,registry_hash FROM ai_pdm_core.role_policy_state WHERE application_id='ai-pdm'`)
  if (!state || state.registry_hash !== rolePolicyRegistryHash) throw new RolePolicyHttpError('ROLE_POLICY_STATE_UNAVAILABLE', 503)
  const rows = await client.query<CatalogRow>(`SELECT ${catalogColumns}
    FROM ai_pdm_contract.v_application_role_catalog_v2 ORDER BY display_order`)
  return { state, rows, active: activeTuple(rows, state) }
}

export async function readRolePolicyCompatibility(client: AsyncDatabaseClient): Promise<CompatibilityRow | null> {
  try {
    const rows = await client.query<CompatibilityRow>(`SELECT application_id,consumer_id,contract_version,
      compatibility_revision,supported_publication_format,supported_canonicalization_version,
      supported_role_schema_id,supported_role_profile_schema_id,accepted_registry_hash,
      accepted_baseline_role_identity_hash,accepted_protected_policy_hash,consumer_source_revision,
      enablement_ref,readiness
      FROM orgmaster_contract.v_ai_pdm_role_policy_compatibility_v2
      WHERE application_id='ai-pdm' AND consumer_id='orgmaster' LIMIT 2`)
    if (rows.length !== 1) return null
    return { ...rows[0], compatibility_revision: integerString(rows[0].compatibility_revision) }
  } catch { return null }
}

async function requireRolePolicyManager(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  const account = await client.queryOne<{ account_type: string; account_status: string }>(`
    SELECT account_type,account_status FROM ai_pdm_core.principal_accounts
    WHERE principal_id=:principalId AND employee_id=:employeeId`, {
      principalId: verified.session.principalId, employeeId: verified.session.employeeId
    })
  if (!account || account.account_type !== 'human_privileged' || account.account_status !== 'active' ||
      verified.session.assuranceLevel !== 'aal2') throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
  const grants = await client.query<{ assignment_id: string }>(`
    SELECT assignment_id FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    WHERE application_id='ai-pdm' AND principal_id=:principalId AND employee_id=:employeeId
      AND stable_role_id='role-system-admin' AND role_code='system_admin'
      AND subject_kind='principal' AND target_principal_id=:principalId
      AND grant_kind='direct' AND delegation_id IS NULL
      AND scope_kind='global' AND scope_key IS NULL
      AND valid_from <= transaction_timestamp()
      AND (valid_until IS NULL OR valid_until > transaction_timestamp())
    LIMIT 2`, { principalId: verified.session.principalId, employeeId: verified.session.employeeId })
  if (grants.length !== 1) throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
}

export async function canManageRolePolicy(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  try { await requireRolePolicyManager(client, verified); return true } catch (error) {
    if (error instanceof RolePolicyHttpError && error.status === 403) return false
    throw error
  }
}

function commandHash(operation: string, actor: string, payload: unknown) {
  return sha256CanonicalJson({ contractVersion: 'ai-pdm.role-policy-command.v3', operation,
    resource: 'ai-pdm:role-policy', actorPrincipalId: actor, payload })
}
async function replayCommand(client: AsyncDatabaseClient, requestId: string, actor: string, operation: string, requestHash: string) {
  const row = await client.queryOne<{ actor_principal_id: string; operation: string; request_hash: string;
    original_http_status: number; result_json: unknown; error_code: string | null }>(`
    SELECT actor_principal_id,operation,request_hash,original_http_status,result_json,error_code
    FROM ai_pdm_core.role_policy_commands WHERE request_id=:requestId`, { requestId })
  if (!row) return null
  if (row.actor_principal_id !== actor || row.operation !== operation || row.request_hash !== requestHash) {
    throw new RolePolicyHttpError('REQUEST_ID_REUSE', 409)
  }
  if (row.error_code) throw new RolePolicyHttpError(row.error_code, row.original_http_status)
  return json<Record<string, unknown>>(row.result_json)
}
function uuid(value: unknown, code = 'REQUEST_ID_INVALID') {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)) {
    throw new RolePolicyHttpError(code, 422)
  }
  return value
}
function draftResult(row: DraftRow) {
  return { draftId: row.draft_id, candidateCatalogVersion: row.candidate_catalog_version,
    base: { catalogVersion: row.base_catalog_version, catalogSha256: row.base_catalog_sha256,
      activationGeneration: integerString(row.base_activation_generation) },
    revision: Number(row.revision), contentHash: row.content_hash, status: row.status,
    candidate: assertRolePolicyCandidate(json<RolePolicyCandidate>(row.candidate_json)),
    lastSaveCommandId: row.last_save_command_id, appliedCatalogVersion: row.applied_catalog_version,
    appliedCommandId: row.applied_command_id, updatedAt: new Date(row.updated_at).toISOString(),
    sourceHistoryVersion: row.source_history_version, templateId: row.template_id }
}
async function draftById(client: AsyncDatabaseClient, draftId: string, lock = false) {
  const row = await client.queryOne<DraftRow>(`SELECT draft_id,candidate_catalog_version,base_catalog_version,
    base_catalog_sha256,base_activation_generation,registry_hash,candidate_json,content_hash,revision,status,
    created_by,updated_by,created_at::text,updated_at::text,source_history_version,template_id,last_save_command_id,
    applied_catalog_version,applied_command_id FROM ai_pdm_core.role_policy_drafts
    WHERE draft_id=:draftId${lock && client.kind === 'postgres' ? ' FOR UPDATE' : ''}`, { draftId })
  if (!row) throw new RolePolicyHttpError('DRAFT_NOT_FOUND', 404)
  return row
}

export async function readRolePolicyWorkspace(client: AsyncDatabaseClient, selectedDraftId?: string | null,
  verified?: VerifiedPrincipalRequest) {
  const { state, rows, active } = await stateAndCatalog(client)
  const compatibility = await readRolePolicyCompatibility(client)
  const currentCandidate = activeProjection(rows, active.catalogVersion)
  const draft = selectedDraftId ? draftResult(await draftById(client, uuid(selectedDraftId, 'DRAFT_ID_INVALID'))) : null
  return { contractVersion: 'ai-pdm.role-policy-workspace.v3', applicationId: 'ai-pdm', mode: state.mode,
    active, compatibility, registry: { hash: rolePolicyRegistryHash, roleSchemaId: rolePolicyRegistry.roleSchemaId,
      roleProfileSchemaId: rolePolicyRegistry.roleProfileSchemaId }, groups: rolePolicyRegistry.businessActions,
    roles: (draft?.candidate ?? currentCandidate).roles, roleProfiles: (draft?.candidate ?? currentCandidate).roleProfiles,
    selectedDraft: draft, admission: { read: true,
      edit: state.mode !== 'DISABLED' && verified ? await canManageRolePolicy(client, verified) : false,
      apply: state.mode === 'ENABLED' && compatibility?.readiness === 'READY' && verified
        ? await canManageRolePolicy(client, verified) : false } }
}

export async function createRolePolicyDraft(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, body: Record<string, unknown>) {
  await requireRolePolicyManager(client, verified)
  const requestId = uuid(body.requestId)
  const expectedActive = assertTuple(body.expectedActive)
  const sourceHistoryVersion = body.sourceHistoryVersion == null ? null : String(body.sourceHistoryVersion)
  if (sourceHistoryVersion !== null && !/^ai-pdm\.role-policy\.[a-f0-9-]{36}$/u.test(sourceHistoryVersion)) {
    throw new RolePolicyHttpError('UNSUPPORTED_HISTORY_FORMAT', 422)
  }
  const payload = { expectedActive, sourceHistoryVersion }
  const requestHash = commandHash('create-draft', verified.session.principalId, payload)
  const replay = await replayCommand(client, requestId, verified.session.principalId, 'create-draft', requestHash)
  if (replay) return replay
  const current = await stateAndCatalog(client); assertCurrent(expectedActive, current.active)
  if (current.state.mode === 'DISABLED') throw new RolePolicyHttpError('ROLE_POLICY_NOT_ENABLED', 409)
  const draftId = randomUUID(); const candidateCatalogVersion = `ai-pdm.role-policy.${draftId}`
  let candidate = current.rows[0]?.publication_format === 'dynamic-policy-v1'
    ? candidateFromRows(current.rows, candidateCatalogVersion)
    : buildDefaultRolePolicyCandidate(candidateCatalogVersion)
  if (sourceHistoryVersion !== null) {
    const historyRows = await client.query<CatalogRow>('SELECT ' + catalogColumns +
      ' FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id=:applicationId' +
      ' AND catalog_version=:catalogVersion ORDER BY display_order',
    { applicationId: 'ai-pdm', catalogVersion: sourceHistoryVersion })
    if (!historyRows.length) throw new RolePolicyHttpError('PUBLICATION_NOT_FOUND', 404)
    if (historyRows[0].publication_format !== 'dynamic-policy-v1') throw new RolePolicyHttpError('UNSUPPORTED_HISTORY_FORMAT', 422)
    candidate = restoreRolePolicyHistory(candidate, candidateFromRows(historyRows, sourceHistoryVersion), candidateCatalogVersion)
  }
  const result = { draftId, candidateCatalogVersion, revision: 1, contentHash: candidate.contentHash,
    base: current.active, sourceHistoryVersion,
    templateId: current.rows[0]?.publication_format === 'dynamic-policy-v1' ? null : rolePolicyRegistry.defaultTemplate.templateId }
  await client.execute(`INSERT INTO ai_pdm_core.role_policy_drafts
    (draft_id,candidate_catalog_version,base_catalog_version,base_catalog_sha256,base_activation_generation,
     registry_hash,candidate_json,content_hash,revision,status,created_by,updated_by,source_history_version,template_id)
    VALUES(:draftId,:candidateVersion,:baseVersion,:baseHash,:baseGeneration,:registryHash,
      CAST(:candidate AS jsonb),:contentHash,1,'OPEN',:actor,:actor,:sourceHistoryVersion,:templateId)`, {
        draftId, candidateVersion: candidateCatalogVersion, baseVersion: current.active.catalogVersion,
        baseHash: current.active.catalogSha256, baseGeneration: current.active.activationGeneration,
        registryHash: rolePolicyRegistryHash, candidate: JSON.stringify(candidate), contentHash: candidate.contentHash,
        actor: verified.session.principalId, sourceHistoryVersion, templateId: result.templateId
      })
  await client.execute(`INSERT INTO ai_pdm_core.role_policy_commands
    (request_id,actor_principal_id,operation,request_hash,outcome,original_http_status,result_json,draft_id,before_tuple,after_tuple)
    VALUES(:requestId,:actor,'create-draft',:requestHash,'SUCCEEDED',201,CAST(:result AS jsonb),:draftId,
      CAST(:before AS jsonb),CAST(:after AS jsonb))`, { requestId, actor: verified.session.principalId,
      requestHash, result: JSON.stringify(result), draftId, before: JSON.stringify(current.active),
      after: JSON.stringify({ ...current.active, draftId, revision: 1, contentHash: candidate.contentHash }) })
  return result
}

export async function saveRolePolicyDraft(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  draftIdInput: string, body: Record<string, unknown>) {
  await requireRolePolicyManager(client, verified)
  const draftId = uuid(draftIdInput, 'DRAFT_ID_INVALID'); const requestId = uuid(body.requestId)
  const expectedRevision = Number(body.expectedDraftRevision)
  const expectedHash = String(body.expectedDraftHash ?? '')
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !/^[a-f0-9]{64}$/u.test(expectedHash)) {
    throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  }
  const roleChanges = parseRoleChanges(body.roleChanges)
  const changes = parseCapabilityChanges(body.changes)
  const payload = { draftId, expectedRevision, expectedHash, roleChanges, changes }
  const requestHash = commandHash('save-draft', verified.session.principalId, payload)
  const replay = await replayCommand(client, requestId, verified.session.principalId, 'save-draft', requestHash)
  if (replay) return replay
  const policy = await stateAndCatalog(client)
  if (policy.state.mode === 'DISABLED') throw new RolePolicyHttpError('ROLE_POLICY_NOT_ENABLED', 409)
  const row = await draftById(client, draftId, true)
  if (row.status !== 'OPEN' || Number(row.revision) !== expectedRevision || row.content_hash !== expectedHash) {
    throw new RolePolicyHttpError('DRAFT_CONFLICT', 409)
  }
  const current = assertRolePolicyCandidate(json<RolePolicyCandidate>(row.candidate_json))
  const { candidate, roleBindings } = applyRolePolicyDraftChanges({ candidate: current, roleChanges, changes })
  const changed = candidate.contentHash !== current.contentHash
  const revision = changed ? expectedRevision + 1 : expectedRevision
  if (changed) await client.execute(`UPDATE ai_pdm_core.role_policy_drafts SET candidate_json=CAST(:candidate AS jsonb),
    content_hash=:contentHash,revision=:revision,updated_by=:actor,updated_at=clock_timestamp(),last_save_command_id=:requestId
    WHERE draft_id=:draftId AND revision=:expectedRevision AND content_hash=:expectedHash AND status='OPEN'`, {
      candidate: JSON.stringify(candidate), contentHash: candidate.contentHash, revision,
      actor: verified.session.principalId, requestId, draftId, expectedRevision, expectedHash })
  const result = { draftId, revision, contentHash: candidate.contentHash, changed, roleBindings }
  await client.execute(`INSERT INTO ai_pdm_core.role_policy_commands
    (request_id,actor_principal_id,operation,request_hash,outcome,original_http_status,result_json,draft_id,diff_json)
    VALUES(:requestId,:actor,'save-draft',:requestHash,'SUCCEEDED',200,CAST(:result AS jsonb),:draftId,CAST(:diff AS jsonb))`, {
      requestId, actor: verified.session.principalId, requestHash, result: JSON.stringify(result), draftId,
      diff: JSON.stringify(rolePolicyDiff(current, candidate)) })
  return result
}

export async function previewRolePolicyDraft(client: AsyncDatabaseClient, draftIdInput: string,
  expectedRevision: number, expectedHash: string) {
  const draftId = uuid(draftIdInput, 'DRAFT_ID_INVALID'); const row = await draftById(client, draftId)
  if (row.status !== 'OPEN' || Number(row.revision) !== expectedRevision || row.content_hash !== expectedHash) {
    throw new RolePolicyHttpError('DRAFT_CONFLICT', 409)
  }
  const current = await stateAndCatalog(client)
  const before = activeProjection(current.rows, current.active.catalogVersion)
  const after = assertRolePolicyCandidate(json<RolePolicyCandidate>(row.candidate_json))
  const diff = rolePolicyDiff(before, after)
  if (current.rows[0]?.publication_format !== 'dynamic-policy-v1') diff.policyTransition = 'legacy-to-dynamic'
  if (row.base_catalog_version !== current.active.catalogVersion ||
      row.base_catalog_sha256 !== current.active.catalogSha256 ||
      integerString(row.base_activation_generation) !== current.active.activationGeneration) {
    throw new RolePolicyHttpError('ACTIVE_CONFLICT', 409)
  }
  const compatibility = await readRolePolicyCompatibility(client)
  const compatibilityRevision = compatibility ? integerString(compatibility.compatibility_revision) : '0'
  const confirmationHash = rolePolicyConfirmationHash({ draftId, revision: expectedRevision,
    contentHash: after.contentHash, expectedActive: current.active, compatibilityRevision, diff })
  return { draftId, revision: expectedRevision, contentHash: after.contentHash, expectedActive: current.active,
    compatibility, compatibilityRevision, diff, confirmationHash }
}

export async function applyRolePolicy(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, body: Record<string, unknown>) {
  const requestId = uuid(body.requestId); const draftId = uuid(body.draftId, 'DRAFT_ID_INVALID')
  const expectedRevision = Number(body.expectedDraftRevision); const expectedHash = String(body.expectedDraftHash ?? '')
  const expectedActive = assertTuple(body.expectedActive); const expectedCompatibilityRevision = String(body.expectedCompatibilityRevision ?? '')
  const confirmationHash = String(body.confirmationHash ?? ''); const reason = String(body.reason ?? '').normalize('NFC').trim()
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !/^[a-f0-9]{64}$/u.test(expectedHash) ||
      !/^(0|[1-9][0-9]*)$/u.test(expectedCompatibilityRevision) || !/^[a-f0-9]{64}$/u.test(confirmationHash) ||
      !reason || [...reason].length > 240 || reason.includes('\u0000')) throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  const payload = { draftId, expectedRevision, expectedHash, expectedActive,
    expectedCompatibilityRevision, confirmationHash, reason }
  await lockAndRevalidateRolePolicyApply(client, verified, requestId, draftId)
  const requestHash = commandHash('apply', verified.session.principalId, payload)
  const replay = await replayCommand(client, requestId, verified.session.principalId, 'apply', requestHash)
  if (replay) return replay
  const preview = await previewRolePolicyDraft(client, draftId, expectedRevision, expectedHash)
  assertCurrent(expectedActive, preview.expectedActive)
  if (preview.compatibilityRevision !== expectedCompatibilityRevision || preview.confirmationHash !== confirmationHash) {
    throw new RolePolicyHttpError('CONFIRMATION_CONFLICT', 409)
  }
  if (preview.diff.policyTransition !== 'legacy-to-dynamic' && !preview.diff.roleChanges.length &&
      !preview.diff.capabilityChanges.length && !preview.diff.profileChanges.length) {
    throw new RolePolicyHttpError('NO_CHANGE', 409)
  }
  if (!preview.compatibility || preview.compatibility.readiness !== 'READY') throw new RolePolicyHttpError('CONSUMER_NOT_READY', 503)
  const row = await client.queryOne<{ result: unknown }>(`SELECT ai_pdm_core.role_policy_apply_v1(
    CAST(:requestId AS uuid),:actor,:requestHash,CAST(:draftId AS uuid),:expectedRevision,:expectedHash,
    :catalogVersion,:catalogHash,:generation,:compatibilityRevision,:confirmationHash,:reason,
    CAST(:diff AS jsonb)) AS result`, { requestId, actor: verified.session.principalId, requestHash, draftId,
      expectedRevision, expectedHash, catalogVersion: expectedActive.catalogVersion,
      catalogHash: expectedActive.catalogSha256, generation: expectedActive.activationGeneration,
      compatibilityRevision: expectedCompatibilityRevision, confirmationHash, reason,
      diff: JSON.stringify(preview.diff) })
  if (!row) throw new RolePolicyHttpError('APPLY_OUTCOME_UNKNOWN', 503)
  return json<Record<string, unknown>>(row.result)
}

export async function readRolePolicyDraft(client: AsyncDatabaseClient, draftId: string) {
  return draftResult(await draftById(client, uuid(draftId, 'DRAFT_ID_INVALID')))
}
export async function listRolePolicyDrafts(client: AsyncDatabaseClient, limitInput: number) {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitInput) ? Math.floor(limitInput) : 20))
  const rows = await client.query<Pick<DraftRow, 'draft_id' | 'candidate_catalog_version' | 'revision' | 'status' | 'content_hash' | 'updated_at' | 'applied_catalog_version'>>(`
    SELECT draft_id,candidate_catalog_version,revision,status,content_hash,updated_at::text,applied_catalog_version
    FROM ai_pdm_core.role_policy_drafts ORDER BY updated_at DESC,draft_id DESC LIMIT :limit`, { limit })
  return { items: rows.map(row => ({ draftId: row.draft_id, candidateCatalogVersion: row.candidate_catalog_version,
    revision: Number(row.revision), status: row.status, contentHash: row.content_hash,
    updatedAt: new Date(row.updated_at).toISOString(), appliedCatalogVersion: row.applied_catalog_version })), nextCursor: null }
}
export async function listRolePolicyPublications(client: AsyncDatabaseClient, limitInput: number) {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitInput) ? Math.floor(limitInput) : 20))
  const rows = await client.query<{ catalog_version: string; catalog_sha256: string; lifecycle: string; published_at: string;
    publication_format: string | null; activation_generation: number | string | null }>(`
    SELECT catalog_version,catalog_sha256,lifecycle,published_at::text,publication_format,activation_generation
    FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id='ai-pdm'
    GROUP BY catalog_version,catalog_sha256,lifecycle,published_at,publication_format,activation_generation
    ORDER BY published_at DESC,catalog_version DESC LIMIT :limit`, { limit })
  return { items: rows.map(row => ({ catalogVersion: row.catalog_version, catalogSha256: row.catalog_sha256,
    lifecycle: row.lifecycle, publishedAt: new Date(row.published_at).toISOString(),
    publicationFormat: row.publication_format ?? 'legacy-static-v1',
    activationGeneration: row.activation_generation == null ? null : integerString(row.activation_generation) })), nextCursor: null }
}
export async function readRolePolicyPublication(client: AsyncDatabaseClient, catalogVersion: string) {
  if (!/^ai-pdm\.(?:role-policy\.[a-f0-9-]{36}|role-catalog\.\d{4}-\d{2}-\d{2}\.v[1-9][0-9]*)$/u.test(catalogVersion)) {
    throw new RolePolicyHttpError('CATALOG_VERSION_INVALID', 422)
  }
  const rows = await client.query<CatalogRow>(`SELECT ${catalogColumns}
    FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id='ai-pdm' AND catalog_version=:catalogVersion
    ORDER BY display_order`, { catalogVersion })
  if (!rows.length) throw new RolePolicyHttpError('PUBLICATION_NOT_FOUND', 404)
  return { catalogVersion, catalogSha256: String(rows[0].catalog_sha256), lifecycle: String(rows[0].lifecycle),
    publishedAt: new Date(String(rows[0].published_at)).toISOString(),
    roles: rows.map(row => ({ stableRoleId: row.stable_role_id, roleCode: row.role_code,
      displayName: row.display_name, roleStatus: row.role_status, permissions: json(row.permissions),
      permissionRoleId: row.permission_role_id, presentationName: row.presentation_name,
      presentationOrder: row.presentation_order, assignmentDisposition: row.assignment_disposition })) }
}
export async function readRolePolicyCommand(client: AsyncDatabaseClient, requestIdInput: string,
  verified: VerifiedPrincipalRequest) {
  // rolePolicyReadRoute has already verified the current read capability.
  // Reading one's own receipt does not require a new management appointment.
  const requestId = uuid(requestIdInput)
  const row = await client.queryOne<{ actor_principal_id: string; operation: string; outcome: string;
    original_http_status: number; result_json: unknown; error_code: string | null; completed_at: string }>(`
    SELECT actor_principal_id,operation,outcome,original_http_status,result_json,error_code,completed_at::text
    FROM ai_pdm_core.role_policy_commands WHERE request_id=:requestId`, { requestId })
  if (!row) throw new RolePolicyHttpError('COMMAND_NOT_OBSERVED', 404)
  if (row.actor_principal_id !== verified.session.principalId) await requireRolePolicyManager(client, verified)
  return { requestId, operation: row.operation, outcome: row.outcome, originalHttpStatus: row.original_http_status,
    result: row.result_json == null ? null : json(row.result_json), errorCode: row.error_code,
    completedAt: new Date(row.completed_at).toISOString() }
}

export const rolePolicyInput = { assertTuple, parseRoleChanges, parseCapabilityChanges }
