import { decodePublishedPrincipalCatalogRows, decodePublishedRolePolicyCandidateRows } from '@/lib/jenfu-principal-role-catalog'
import type { AsyncDatabaseClient } from '@/lib/db-async-provider'
import type { VerifiedPrincipalRequest } from '@/lib/jenfu-principal-request-guard'
import { sha256CanonicalJson } from '@/lib/role-capability-canonical-hash.server'
import { applyRolePolicyDraftChanges, assertRolePolicyCandidate, buildDefaultRolePolicyCandidate,
  rebuildRolePolicyCandidate, restoreRolePolicyHistory, rolePolicyDiff, rolePolicyRegistry,
  rolePolicyRegistryHash, type ActiveRolePolicyTuple, type RolePolicyCandidate,
  type RolePolicyCapabilityChange, type RolePolicyProfile, type RolePolicyRole, type RolePolicyRoleChange } from '@/lib/role-policy-editor'
import { assertExactKeys, RolePolicyHttpError } from '@/lib/role-policy-http'
import { lockAndRevalidateRolePolicyApply, revalidateRolePolicyManager } from '@/lib/role-policy-apply-authorization'
import { hashJenfuPrincipalSessionId } from '@/lib/jenfu-principal-session-registry'

type CatalogRow = Record<string, unknown>
type DraftRow = {
  draft_id: string; candidate_catalog_version: string; base_catalog_version: string;
  base_catalog_sha256: string; registry_hash: string;
  candidate_json: unknown; role_bindings: unknown; revision: number | string; status: 'OPEN' | 'APPLIED';
  created_by: string; updated_by: string; created_at: string; updated_at: string;
  source_history_version: string | null; template_id: string | null;
  applied_catalog_version: string | null; applied_command_id: string | null
}

const catalogColumns = `contract_version,application_id,catalog_version,published_at,catalog_sha256,
  display_order,stable_role_id,role_code,display_name,assignable,risk,subject_kind,
  recommendation_allowed,delegation_allowed,allowed_scope_kinds,assignment_tier,permissions,
  metadata,role_definition_hash,publication_format,canonicalization_version,role_schema_id,
  baseline_role_identity_hash,role_identity_hash,protected_policy_hash,
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
function activeTuple(rows: CatalogRow[]): ActiveRolePolicyTuple {
  if (!rows[0]) throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_UNAVAILABLE', 503)
  return { catalogVersion: String(rows[0].catalog_version), catalogSha256: String(rows[0].catalog_sha256) }
}
function assertTuple(value: unknown): ActiveRolePolicyTuple {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RolePolicyHttpError('EXPECTED_ACTIVE_INVALID', 422)
  const tuple = value as Record<string, unknown>
  assertExactKeys(tuple, ['catalogVersion','catalogSha256'])
  if (typeof tuple.catalogVersion !== 'string' || !/^[a-f0-9]{64}$/u.test(String(tuple.catalogSha256))) {
    throw new RolePolicyHttpError('EXPECTED_ACTIVE_INVALID', 422)
  }
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
  if (expected.catalogVersion !== current.catalogVersion || expected.catalogSha256 !== current.catalogSha256) throw new RolePolicyHttpError('ACTIVE_CONFLICT', 409)
}
function candidateFromRows(rows: CatalogRow[], candidateCatalogVersion: string, lifecycle: 'active' | 'retired' = 'active'): RolePolicyCandidate {
  try {
    const source = decodePublishedRolePolicyCandidateRows(rows, lifecycle)
    return rebuildRolePolicyCandidate({ roles: source.roles, roleProfiles: source.roleProfiles, candidateCatalogVersion })
  } catch {
    throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_INVALID', 503)
  }
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

async function currentCatalog(client: AsyncDatabaseClient) {
  const rows = await client.query<CatalogRow>('SELECT ' + catalogColumns +
    ' FROM ai_pdm_contract.v_application_role_catalog_v2 ORDER BY display_order')
  try {
    // All current readers require active metadata, even when a draft is selected.
    // Historical lifecycle admission is explicit at the history call sites.
    decodePublishedPrincipalCatalogRows(rows)
    return { rows, active: activeTuple(rows) }
  } catch { throw new RolePolicyHttpError('ROLE_POLICY_CATALOG_INVALID', 503) }
}

async function requireRolePolicyManager(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest) {
  const account = await client.queryOne<{ account_type: string; account_status: string }>(`
    SELECT account_type,account_status FROM ai_pdm_core.principal_accounts
    WHERE principal_id=:principalId AND employee_id=:employeeId`, {
      principalId: verified.session.principalId, employeeId: verified.session.employeeId
    })
  const validAssuranceLevel = verified.session.assuranceLevel === 'aal1' || verified.session.assuranceLevel === 'aal2'
  if (!validAssuranceLevel || !account || account.account_type !== 'human_privileged' || account.account_status !== 'active') {
    throw new RolePolicyHttpError('ROLE_POLICY_MANAGER_REQUIRED', 403)
  }
  const grants = await client.query<{ assignment_id: string }>(`
    SELECT assignment_id FROM orgmaster_contract.v_ai_pdm_principal_effective_grants_v4
    WHERE application_id='ai-pdm' AND principal_id=:principalId AND employee_id=:employeeId
      AND stable_role_id='role-system-admin' AND role_code='system_admin'
      AND subject_kind='principal' AND target_principal_id=:principalId
      AND grant_kind='direct' AND delegation_id IS NULL
      AND scope_kind='global' AND scope_key IS NULL
      AND valid_from <= clock_timestamp()
      AND (valid_until IS NULL OR valid_until > clock_timestamp())
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
  const row = await client.queryOne<{ actor_principal_id: string; request_hash: string; result_json: unknown }>(
    'SELECT actor_principal_id,request_hash,result_json FROM ai_pdm_core.role_policy_commands WHERE request_id=:requestId', { requestId })
  if (!row) return null
  if (operation !== 'apply' || row.actor_principal_id !== actor || row.request_hash !== requestHash) {
    throw new RolePolicyHttpError('REQUEST_ID_REUSE', 409)
  }
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
    base: { catalogVersion: row.base_catalog_version, catalogSha256: row.base_catalog_sha256 },
    revision: Number(integerString(row.revision)), status: row.status, candidate: candidateFromDraft(row),
    roleBindings: json<Array<{ clientRoleId: string; stableRoleId: string; roleCode: string }>>(row.role_bindings ?? []),
    appliedCatalogVersion: row.applied_catalog_version, appliedCommandId: row.applied_command_id,
    updatedAt: new Date(row.updated_at).toISOString(), sourceHistoryVersion: row.source_history_version, templateId: row.template_id }
}
async function findDraftById(client: AsyncDatabaseClient, draftId: string, lock = false) {
  return client.queryOne<DraftRow>('SELECT * FROM ai_pdm_core.role_policy_drafts WHERE draft_id=:draftId' +
    (lock && client.kind === 'postgres' ? ' FOR UPDATE' : ''), { draftId })
}
async function draftById(client: AsyncDatabaseClient, draftId: string, lock = false) {
  const row = await findDraftById(client, draftId, lock)
  if (!row) throw new RolePolicyHttpError('DRAFT_NOT_FOUND', 404)
  return row
}

export async function readRolePolicyWorkspace(client: AsyncDatabaseClient, selectedDraftId?: string | null,
  verified?: VerifiedPrincipalRequest) {
  const { rows, active } = await currentCatalog(client)
  const current = activeProjection(rows, active.catalogVersion)
  const draft = selectedDraftId ? draftResult(await draftById(client, uuid(selectedDraftId, 'DRAFT_ID_INVALID'))) : null
  const manage = verified ? await canManageRolePolicy(client, verified) : false
  return { contractVersion: 'ai-pdm.role-policy-workspace.v3', applicationId: 'ai-pdm',
    actorPrincipalId: verified?.session.principalId ?? null, publicationFormat: current.format,
    active, registry: { hash: rolePolicyRegistryHash, roleSchemaId: rolePolicyRegistry.roleSchemaId,
      roleProfileSchemaId: rolePolicyRegistry.roleProfileSchemaId }, groups: rolePolicyRegistry.businessActions,
    roles: (draft?.candidate ?? current).roles, roleProfiles: draft?.candidate.roleProfiles ?? (current.format === 'legacy-static-v1' ? rolePolicyRegistry.roleProfiles : current.roleProfiles),
    selectedDraft: draft, admission: { read: true, edit: manage, apply: manage } }
}
function storedCandidate(candidate: RolePolicyCandidate) {
  const { contentHash: _derivedPublicationHash, ...stored } = candidate
  return JSON.stringify(stored)
}
function candidateFromDraft(row: DraftRow) {
  const stored = json<Omit<RolePolicyCandidate, 'contentHash'>>(row.candidate_json)
  const { identityHashes: _identityHashes, ...payload } = stored
  return assertRolePolicyCandidate({ ...stored, contentHash: sha256CanonicalJson(payload) })
}
export async function createRolePolicyDraft(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, body: Record<string, unknown>) {
  const draftId = uuid(body.draftId, 'DRAFT_ID_INVALID')
  const expectedActive = assertTuple(body.expectedActive)
  const sourceHistoryVersion = body.sourceHistoryVersion == null ? null : String(body.sourceHistoryVersion)
  if (sourceHistoryVersion !== null && !/^ai-pdm\.role-policy\.[a-f0-9-]{36}$/u.test(sourceHistoryVersion)) throw new RolePolicyHttpError('UNSUPPORTED_HISTORY_FORMAT', 422)
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended(:draftId,0))', { draftId })
  await requireRolePolicyManager(client, verified)
  await revalidateRolePolicyManager(client, verified)
  const existing = await findDraftById(client, draftId)
  if (existing) {
    if (existing.created_by !== verified.session.principalId || existing.base_catalog_version !== expectedActive.catalogVersion ||
        existing.base_catalog_sha256 !== expectedActive.catalogSha256 || existing.source_history_version !== sourceHistoryVersion) {
      throw new RolePolicyHttpError('DRAFT_ID_REUSE', 409)
    }
    return draftResult(existing)
  }
  const current = await currentCatalog(client); assertCurrent(expectedActive, current.active)
  const candidateCatalogVersion = 'ai-pdm.role-policy.' + draftId
  let candidate = current.rows[0]?.publication_format === 'dynamic-policy-v1'
    ? candidateFromRows(current.rows, candidateCatalogVersion) : buildDefaultRolePolicyCandidate(candidateCatalogVersion)
  if (sourceHistoryVersion !== null) {
    const historyRows = await client.query<CatalogRow>('SELECT ' + catalogColumns +
      " FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id='ai-pdm' AND catalog_version=:catalogVersion ORDER BY display_order", { catalogVersion: sourceHistoryVersion })
    if (!historyRows.length) throw new RolePolicyHttpError('PUBLICATION_NOT_FOUND', 404)
    if (historyRows[0].publication_format !== 'dynamic-policy-v1') throw new RolePolicyHttpError('UNSUPPORTED_HISTORY_FORMAT', 422)
    candidate = restoreRolePolicyHistory(candidate, candidateFromRows(historyRows, sourceHistoryVersion,
      historyRows[0].lifecycle === 'active' ? 'active' : 'retired'), candidateCatalogVersion)
  }
  await client.execute("INSERT INTO ai_pdm_core.role_policy_drafts (draft_id,candidate_catalog_version,base_catalog_version,base_catalog_sha256,registry_hash,candidate_json,revision,status,created_by,updated_by,source_history_version,template_id) VALUES(:draftId,:candidateVersion,:baseVersion,:baseHash,:registryHash,CAST(:candidate AS jsonb),1,'OPEN',:actor,:actor,:sourceHistoryVersion,:templateId)", {
    draftId, candidateVersion: candidateCatalogVersion, baseVersion: current.active.catalogVersion,
    baseHash: current.active.catalogSha256, registryHash: rolePolicyRegistryHash, candidate: storedCandidate(candidate),
    actor: verified.session.principalId, sourceHistoryVersion,
    templateId: current.rows[0]?.publication_format === 'dynamic-policy-v1' ? null : rolePolicyRegistry.defaultTemplate.templateId })
  return draftResult(await draftById(client, draftId))
}
export async function saveRolePolicyDraft(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest,
  draftIdInput: string, body: Record<string, unknown>) {
  const draftId = uuid(draftIdInput, 'DRAFT_ID_INVALID'), expectedRevision = Number(body.expectedRevision)
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  const roleChanges = parseRoleChanges(body.roleChanges), changes = parseCapabilityChanges(body.changes)
  const row = await draftById(client, draftId, true)
  await requireRolePolicyManager(client, verified)
  await revalidateRolePolicyManager(client, verified)
  if (row.status !== 'OPEN' || Number(row.revision) !== expectedRevision) throw new RolePolicyHttpError('DRAFT_CONFLICT', 409)
  if (row.registry_hash !== rolePolicyRegistryHash) throw new RolePolicyHttpError('DRAFT_REGISTRY_CONFLICT', 409)
  const current = candidateFromDraft(row)
  const { candidate, roleBindings } = applyRolePolicyDraftChanges({ candidate: current, roleChanges, changes })
  const changed = candidate.contentHash !== current.contentHash
  if (changed) await client.execute("UPDATE ai_pdm_core.role_policy_drafts SET candidate_json=CAST(:candidate AS jsonb),revision=revision+1,updated_by=:actor,updated_at=clock_timestamp(),role_bindings=role_bindings || CAST(:bindings AS jsonb) WHERE draft_id=:draftId AND revision=:expectedRevision AND status='OPEN'", {
    candidate: storedCandidate(candidate), bindings: JSON.stringify(roleBindings),
    actor: verified.session.principalId, draftId, expectedRevision })
  return { ...draftResult(await draftById(client, draftId)), changed, roleBindings }
}
export async function previewRolePolicyDraft(client: AsyncDatabaseClient, draftIdInput: string, expectedRevision: number) {
  const row = await draftById(client, uuid(draftIdInput, 'DRAFT_ID_INVALID'))
  if (row.status !== 'OPEN' || Number(row.revision) !== expectedRevision) throw new RolePolicyHttpError('DRAFT_CONFLICT', 409)
  if (row.registry_hash !== rolePolicyRegistryHash) throw new RolePolicyHttpError('DRAFT_REGISTRY_CONFLICT', 409)
  const current = await currentCatalog(client)
  assertCurrent({ catalogVersion: row.base_catalog_version, catalogSha256: row.base_catalog_sha256 }, current.active)
  const candidate = candidateFromDraft(row)
  return { confirmation: { draftId: row.draft_id, draftRevision: expectedRevision, expectedActive: current.active },
    diff: rolePolicyDiff(activeProjection(current.rows, current.active.catalogVersion), candidate) }
}
export async function applyRolePolicy(client: AsyncDatabaseClient, verified: VerifiedPrincipalRequest, body: Record<string, unknown>) {
  const requestId = uuid(body.requestId), confirmation = objectRecord(body.confirmation)
  assertExactKeys(confirmation, ['draftId', 'draftRevision', 'expectedActive'])
  const draftId = uuid(confirmation.draftId, 'DRAFT_ID_INVALID'), expectedRevision = Number(confirmation.draftRevision)
  const expectedActive = assertTuple(confirmation.expectedActive)
  const reason = typeof body.reason === 'string' ? body.reason.normalize('NFC').trim() : ''
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || !reason || [...reason].length > 240 ||
      reason.includes('\u0000')) throw new RolePolicyHttpError('REQUEST_SCHEMA_INVALID', 422)
  const payload = { confirmation: { draftId, draftRevision: expectedRevision, expectedActive }, reason }
  await lockAndRevalidateRolePolicyApply(client, verified, requestId, draftId)
  const requestHash = commandHash('apply', verified.session.principalId, payload)
  const replay = await replayCommand(client, requestId, verified.session.principalId, 'apply', requestHash)
  if (replay) return replay
  const preview = await previewRolePolicyDraft(client, draftId, expectedRevision)
  assertCurrent(expectedActive, preview.confirmation.expectedActive)
  if (preview.diff.policyTransition !== 'legacy-to-dynamic' && !preview.diff.roleChanges.length &&
      !preview.diff.capabilityChanges.length && !preview.diff.profileChanges.length) throw new RolePolicyHttpError('NO_CHANGE', 409)
  const row = await client.queryOne<{ result: unknown }>('SELECT ai_pdm_core.role_policy_apply_v1(CAST(:requestId AS uuid),:actor,:sessionHash,:issuer,:subject,CAST(:draftId AS uuid),:expectedRevision,:catalogVersion,:catalogHash,:reason) AS result', {
    requestId, actor: verified.session.principalId,
    sessionHash: hashJenfuPrincipalSessionId(verified.session.sessionId),
    issuer: verified.session.identityIssuer, subject: verified.session.identitySubject, draftId, expectedRevision,
    catalogVersion: expectedActive.catalogVersion, catalogHash: expectedActive.catalogSha256, reason })
  if (!row) throw new RolePolicyHttpError('APPLY_OUTCOME_UNKNOWN', 503)
  return json<Record<string, unknown>>(row.result)
}

export async function readRolePolicyDraft(client: AsyncDatabaseClient, draftId: string) {
  return draftResult(await draftById(client, uuid(draftId, 'DRAFT_ID_INVALID')))
}
function policyCursor(value?: string | null) {
  if (!value) return { cursorTime: null, cursorId: null }
  try {
    if (value.length > 600) throw new Error()
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' ||
        !Number.isFinite(Date.parse(parsed[0])) || typeof parsed[1] !== 'string' || parsed[1].length > 255) throw new Error()
    return { cursorTime: parsed[0], cursorId: parsed[1] }
  } catch { throw new RolePolicyHttpError('CURSOR_INVALID', 422) }
}
function nextPolicyCursor(time: string | Date, id: string) {
  // Keep PostgreSQL microseconds; truncating to JS milliseconds can skip rows.
  return Buffer.from(JSON.stringify([typeof time === 'string' ? time : time.toISOString(), id])).toString('base64url')
}
export async function listRolePolicyDrafts(client: AsyncDatabaseClient, limitInput: number, cursorInput?: string | null) {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitInput) ? Math.floor(limitInput) : 20))
  const cursor = policyCursor(cursorInput)
  const rows = await client.query<Pick<DraftRow, 'draft_id' | 'candidate_catalog_version' | 'revision' | 'status' | 'updated_at' | 'applied_catalog_version'>>(`
    SELECT draft_id,candidate_catalog_version,revision,status,updated_at::text,applied_catalog_version
    FROM ai_pdm_core.role_policy_drafts
    WHERE CAST(:cursorTime AS timestamptz) IS NULL OR (updated_at,draft_id)<(CAST(:cursorTime AS timestamptz),CAST(:cursorId AS uuid))
    ORDER BY updated_at DESC,draft_id DESC LIMIT :limit`, { ...cursor, limit: limit + 1 })
  const items = rows.slice(0, limit)
  const last = items.at(-1)
  return { items: items.map(row => ({ draftId: row.draft_id, candidateCatalogVersion: row.candidate_catalog_version,
    revision: Number(integerString(row.revision)), status: row.status,
    updatedAt: new Date(row.updated_at).toISOString(), appliedCatalogVersion: row.applied_catalog_version })),
    nextCursor: rows.length > limit && last ? nextPolicyCursor(last.updated_at, last.draft_id) : null }
}
export async function listRolePolicyPublications(client: AsyncDatabaseClient, limitInput: number, cursorInput?: string | null) {
  const limit = Math.max(1, Math.min(50, Number.isFinite(limitInput) ? Math.floor(limitInput) : 20))
  const cursor = policyCursor(cursorInput)
  const rows = await client.query<{ catalog_version: string; catalog_sha256: string; lifecycle: string; published_at: string;
    publication_format: string | null }>(`
    SELECT catalog_version,catalog_sha256,lifecycle,published_at::text,publication_format
    FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id='ai-pdm'
      AND (CAST(:cursorTime AS timestamptz) IS NULL OR (published_at,catalog_version)<(CAST(:cursorTime AS timestamptz),CAST(:cursorId AS text)))
    GROUP BY catalog_version,catalog_sha256,lifecycle,published_at,publication_format
    ORDER BY published_at DESC,catalog_version DESC LIMIT :limit`, { ...cursor, limit: limit + 1 })
  const items = rows.slice(0, limit), last = items.at(-1)
  return { items: items.map(row => ({ catalogVersion: row.catalog_version, catalogSha256: row.catalog_sha256,
    lifecycle: row.lifecycle, publishedAt: new Date(row.published_at).toISOString(),
    publicationFormat: row.publication_format ?? 'legacy-static-v1' })),
    nextCursor: rows.length > limit && last ? nextPolicyCursor(last.published_at, last.catalog_version) : null }
}
export async function readRolePolicyPublication(client: AsyncDatabaseClient, catalogVersion: string,
  verified?: VerifiedPrincipalRequest) {
  if (!/^ai-pdm\.(?:role-policy\.[a-f0-9-]{36}|role-catalog\.\d{4}-\d{2}-\d{2}\.v[1-9][0-9]*)$/u.test(catalogVersion)) {
    throw new RolePolicyHttpError('CATALOG_VERSION_INVALID', 422)
  }
  const rows = await client.query<CatalogRow>(`SELECT ${catalogColumns}
    FROM ai_pdm_contract.v_role_policy_publications_v1 WHERE application_id='ai-pdm' AND catalog_version=:catalogVersion
    ORDER BY display_order`, { catalogVersion })
  if (!rows.length) throw new RolePolicyHttpError('PUBLICATION_NOT_FOUND', 404)
  // Catalog readers may inspect capabilities. Only a current protected manager
  // can inspect the actor and free-text reason of the successful command.
  const audit = verified && await canManageRolePolicy(client, verified)
    ? await client.queryOne<{ actor_principal_id: string; reason: string; diff_json: unknown;
      before_tuple: unknown; after_tuple: unknown; request_id: string }>(`
      SELECT actor_principal_id,reason,diff_json,before_tuple,after_tuple,request_id
      FROM ai_pdm_core.role_policy_commands WHERE catalog_version=:catalogVersion`, { catalogVersion }) : null
  if (rows[0].publication_format === 'dynamic-policy-v1') candidateFromRows(rows, catalogVersion,
    rows[0].lifecycle === 'active' ? 'active' : 'retired')
  else decodePublishedPrincipalCatalogRows(rows, { historical: true })
  return { catalogVersion, catalogSha256: String(rows[0].catalog_sha256), lifecycle: String(rows[0].lifecycle),
    publishedAt: new Date(String(rows[0].published_at)).toISOString(),
    audit: audit ? { actorPrincipalId: audit.actor_principal_id, reason: audit.reason, diff: json(audit.diff_json),
      before: json(audit.before_tuple), after: json(audit.after_tuple), requestId: audit.request_id } : null,
    roles: rows.map(row => ({ stableRoleId: row.stable_role_id, roleCode: row.role_code,
      displayName: row.display_name, roleStatus: row.role_status, permissions: json(row.permissions),
      permissionRoleId: row.permission_role_id, presentationName: row.presentation_name,
      presentationOrder: row.presentation_order, assignmentDisposition: row.assignment_disposition })) }
}
export async function readRolePolicyCommand(client: AsyncDatabaseClient, requestIdInput: string, verified: VerifiedPrincipalRequest) {
  const requestId = uuid(requestIdInput)
  const row = await client.queryOne<{ actor_principal_id: string; result_json: unknown; completed_at: string }>(
    'SELECT actor_principal_id,result_json,completed_at::text FROM ai_pdm_core.role_policy_commands WHERE request_id=:requestId', { requestId })
  if (!row) throw new RolePolicyHttpError('COMMAND_NOT_OBSERVED', 404)
  if (row.actor_principal_id !== verified.session.principalId) await requireRolePolicyManager(client, verified)
  return { requestId, operation: 'apply', outcome: 'SUCCEEDED', originalHttpStatus: 200,
    result: json(row.result_json), completedAt: new Date(row.completed_at).toISOString() }
}
export const rolePolicyInput = { assertTuple, parseRoleChanges, parseCapabilityChanges }
