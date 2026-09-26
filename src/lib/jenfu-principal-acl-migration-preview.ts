import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  JenfuPrincipalInventoryRepository, type PrincipalInventoryCandidate,
  type PrincipalInventoryInput
} from "@/lib/jenfu-principal-inventory-repository";
import { hashPrincipalInventory } from "@/lib/jenfu-principal-inventory-registration";
import { hashPrincipalCutoverLocalSource } from "@/lib/jenfu-principal-cutover-local-source";
import { assertPrincipalOwnerContractManifestHashes } from "@/lib/jenfu-principal-owner-contract-manifest";
import { capturePrincipalCutoverProducerSource } from "@/lib/jenfu-principal-cutover-producer-source";
import { assertPrincipalAclGraphPreserved } from "@/lib/jenfu-principal-cutover-graph-check";
import { assessPrincipalCutoverWorkspaceShadow } from "@/lib/jenfu-principal-cutover-workspace-shadow";
import {
  sealPrincipalCutoverSource, type PrincipalCutoverSourceSealInput
} from "@/lib/jenfu-principal-cutover-source-seal";
import {
  planPrincipalAclMigration, PrincipalAclMigrationPlanError,
  type PrincipalAclMigrationInput
} from "@/lib/jenfu-principal-acl-migration-plan";

type ProfileRow = {
  id: string; company_id: string; role: string; account_status: string;
  system_role_enabled: number; account_lifecycle_version: string;
  session_invalid_before: string | null; marker_row_version: string | null;
  marker_principal_id: string | null;
  marker_status: string | null; marker_source_hash: string | null;
  existing_account_principal_id: string | null;
};
type RoleRow = { id: string; role_code: string; enabled: number };
type PriorityRow = { id: string; version_code: string; priority_json: string };
type AssignmentRow = {
  id: string; user_id: string; role_id: string; reason: string;
  scope_template: string; named_scope: string; sponsor_user_id: string | null;
  starts_at: string | null; review_due_at: string | null;
  hard_ends_at: string | null; assigned_by: string; assigned_at: string;
  revoked_at: string | null; revoked_by: string | null;
};
type DelegationRow = {
  id: string; delegated_from: string; delegated_to: string;
  project_code: string | null; action_code: string | null;
  starts_at: string | null; ends_at: string | null; reason: string;
  created_by: string; created_at: string; revoked_at: string | null;
  revoked_by: string | null;
};
type ActiveExternalRow = { pdm_user_id: string; principal_id: string };

function invalid(): never {
  throw new PrincipalAclMigrationPlanError("principal_acl_plan_invalid");
}

export type PrincipalAclMigrationSourceInput = {
  firebaseProjectId: string;
  sourceSets: PrincipalInventoryInput[][];
  cutoverAt: string;
};

/** Shared source reader: RR for preview, or RC after the owner holds every local source lock. */
export async function readPrincipalAclMigrationSource(
  snapshot: AsyncDatabaseClient,
  input: PrincipalAclMigrationSourceInput,
  mode: "snapshot" | "locked_owner_apply" = "snapshot"
) {
  if (snapshot.kind !== "postgres" || !Array.isArray(input.sourceSets) ||
    input.sourceSets.length < 1 || input.sourceSets.length > 32 ||
    input.sourceSets.some((set) => !Array.isArray(set) || set.length !== 1)) invalid();
    // Current Production entry is firebase_bff. A historical Google OAuth row
    // cannot force a second principal or alter the owner cutover source seal.
    const inventory = new JenfuPrincipalInventoryRepository(
      snapshot, input.firebaseProjectId, mode, "firebase_bff");
    const candidateSets = [];
    const seenUsers = new Set<string>();
    const seenPrincipals = new Set<string>();
    for (const sourceSet of input.sourceSets) {
      const candidates = await inventory.requireExactCandidateSet(sourceSet);
      const candidate = candidates[0];
      if (seenUsers.has(candidate.pdmUserId) || seenPrincipals.has(candidate.principalId)) invalid();
      seenUsers.add(candidate.pdmUserId);
      seenPrincipals.add(candidate.principalId);
      candidateSets.push(candidates);
    }
    const ids = [...seenUsers].sort();
    const profiles = await snapshot.query<ProfileRow>(`
      SELECT profile.id,profile.company_id,profile.role,profile.account_status,
             profile.system_role_enabled,profile.account_lifecycle_version::text,
             profile.session_invalid_before::text,
             marker.row_version::text AS marker_row_version,
             marker.principal_id AS marker_principal_id,
             marker.status AS marker_status,
             marker.source_hash AS marker_source_hash,
             account.principal_id AS existing_account_principal_id
      FROM ai_pdm_core.users profile
      LEFT JOIN ai_pdm_core.principal_identity_cutovers marker
        ON marker.pdm_user_id=profile.id
      LEFT JOIN ai_pdm_core.principal_accounts account
        ON account.pdm_user_id=profile.id
      WHERE profile.id=ANY(:ids)
      ORDER BY profile.id LIMIT 33
    `, { ids });
    if (profiles.length !== ids.length) invalid();
    const profileById = new Map(profiles.map((row) => [row.id, row]));
    const plannedProfiles: PrincipalAclMigrationInput["profiles"] = [];
    const accountRows: Array<{
      principalId: string; pdmUserId: string; companyId: string; employeeId: string;
      accountType: "human_personal" | "human_privileged";
      accountStatus: PrincipalInventoryCandidate["accountStatus"];
      lifecycleVersion: number; sessionInvalidBefore: string | null;
      systemRoleEnabled: boolean; markerRowVersion: number;
    }> = [];
    for (const candidates of candidateSets) {
      const candidate = candidates[0];
      const profile = profileById.get(candidate.pdmUserId);
      const markerRowVersion = Number(profile?.marker_row_version);
      const transferred = candidate.claimKind === "profile_transfer";
      const markerReady = transferred
        ? profile?.marker_status === null && profile?.marker_principal_id === null &&
          profile?.marker_source_hash === null && profile?.marker_row_version === null
        : profile?.marker_status === "legacy_compatible" &&
          profile?.marker_principal_id === candidate.principalId &&
          profile?.marker_source_hash === hashPrincipalInventory(candidates) &&
          Number.isSafeInteger(markerRowVersion) && markerRowVersion >= 1;
      if (!profile || profile.company_id !== candidate.companyId ||
        profile.account_status !== candidate.accountStatus ||
        (profile.system_role_enabled === 1) !== candidate.systemRoleEnabled ||
        !markerReady ||
        profile.existing_account_principal_id !== null ||
        !Number.isSafeInteger(markerRowVersion) ||
        (transferred ? markerRowVersion !== 0 : markerRowVersion < 1)) invalid();
      plannedProfiles.push({ pdmUserId: candidate.pdmUserId,
        principalId: candidate.principalId,
        legacyRole: profile.role as PrincipalAclMigrationInput["profiles"][number]["legacyRole"],
        accountType: candidate.accountType,
        systemRoleEnabled: candidate.systemRoleEnabled });
      accountRows.push({ principalId: candidate.principalId, pdmUserId: candidate.pdmUserId,
        companyId: candidate.companyId, employeeId: candidate.employeeId,
        accountType: candidate.accountType, accountStatus: candidate.accountStatus,
        lifecycleVersion: candidate.lifecycleVersion,
        sessionInvalidBefore: candidate.sessionInvalidBefore,
        systemRoleEnabled: candidate.systemRoleEnabled, markerRowVersion });
    }
    const roles = await snapshot.query<RoleRow>(`
      SELECT id,role_code,enabled FROM ai_pdm_core.roles ORDER BY id LIMIT 129
    `);
    const priorities = await snapshot.query<PriorityRow>(`
      SELECT id,version_code,priority_json FROM ai_pdm_core.role_priority_versions
      WHERE status='active' LIMIT 2
    `);
    const activeCatalogRows = await snapshot.query<{ fact: Record<string, unknown> }>(`
      SELECT to_jsonb(catalog) AS fact
      FROM ai_pdm_contract.v_application_role_catalog_v1 catalog
      ORDER BY catalog.stable_role_id LIMIT 129
    `);
    if (roles.length > 128 || priorities.length !== 1 ||
      roles.some((role) => role.enabled !== 0 && role.enabled !== 1)) invalid();
    const activeCatalog = activeCatalogRows.map((row) => row.fact);
    const catalogVersion = activeCatalog[0]?.catalog_version;
    const catalogSha256 = activeCatalog[0]?.catalog_sha256;
    if (activeCatalog.length < 1 || activeCatalog.length > 128 ||
      typeof catalogVersion !== "string" || !/^[0-9a-f]{64}$/u.test(String(catalogSha256)) ||
      new Set(activeCatalog.map((row) => row.stable_role_id)).size !== activeCatalog.length ||
      new Set(activeCatalog.map((row) => row.role_code)).size !== activeCatalog.length ||
      activeCatalog.some((row) => !row || row.application_id !== "ai-pdm" ||
        row.contract_version !== "jenfu.platform-entitlement.v1" ||
        row.catalog_version !== catalogVersion || row.catalog_sha256 !== catalogSha256 ||
        typeof row.stable_role_id !== "string" || typeof row.role_code !== "string" ||
        !/^[0-9a-f]{64}$/u.test(String(row.role_definition_hash)))) invalid();
    let rolePriority: unknown;
    try { rolePriority = JSON.parse(priorities[0].priority_json); }
    catch { invalid(); }
    if (!Array.isArray(rolePriority)) invalid();
    const assignments = await snapshot.query<AssignmentRow>(`
      SELECT id,user_id,role_id,reason,scope_template,named_scope,sponsor_user_id,
             starts_at::text,review_due_at::text,hard_ends_at::text,
             assigned_by,assigned_at::text,revoked_at::text,revoked_by
      FROM ai_pdm_core.user_role_assignments
      WHERE user_id=ANY(:ids) ORDER BY id LIMIT 10001
    `, { ids });
    const delegations = await snapshot.query<DelegationRow>(`
      SELECT id,delegated_from,delegated_to,project_code,action_code,
             starts_at::text,ends_at::text,reason,created_by,created_at::text,
             revoked_at::text,revoked_by
      FROM ai_pdm_core.approval_delegations
      WHERE delegated_from=ANY(:ids) OR delegated_to=ANY(:ids)
      ORDER BY id LIMIT 10001
    `, { ids });
    if (assignments.length > 10000 || delegations.length > 10000) invalid();
    const externalIds = [...new Set([
      ...assignments.map((row) => row.sponsor_user_id),
      ...delegations.flatMap((row) => [row.delegated_from, row.delegated_to])
    ].filter((id): id is string => !!id && !seenUsers.has(id)))].sort();
    if (externalIds.length > 10000) invalid();
    const external = externalIds.length === 0 ? [] : await snapshot.query<ActiveExternalRow>(`
      SELECT marker.pdm_user_id,marker.principal_id
      FROM ai_pdm_core.principal_identity_cutovers marker
      JOIN ai_pdm_core.principal_accounts account
        ON account.pdm_user_id=marker.pdm_user_id
       AND account.principal_id=marker.principal_id
      WHERE marker.pdm_user_id=ANY(:externalIds)
        AND marker.status='principal_active'
      ORDER BY marker.pdm_user_id LIMIT 10001
    `, { externalIds });
    if (external.length > externalIds.length) invalid();
    // A transaction-bound pg.Client must not execute concurrent queries.
    const rolePermissions = await snapshot.query<{
      id: string; role_id: string; permission_kind: string;
      permission_code: string; allowed: number;
    }>(`
      SELECT id,role_id,permission_kind,permission_code,allowed
      FROM ai_pdm_core.role_permissions ORDER BY id LIMIT 10001
    `);
    const roleScopeRules = await snapshot.query<{
      id: string; role_id: string; scope_kind: string;
      scope_code: string; allowed: number;
    }>(`
      SELECT id,role_id,scope_kind,scope_code,allowed
      FROM ai_pdm_core.role_scope_rules ORDER BY id LIMIT 10001
    `);
    const memberships = await snapshot.query<Record<string, unknown>>(`
      SELECT user_id,company_id,is_default,created_at::text
      FROM ai_pdm_core.user_company_memberships
      WHERE user_id=ANY(:ids) ORDER BY user_id,company_id LIMIT 10001
    `, { ids });
    const sessions = await snapshot.query<Record<string, unknown>>(`
      SELECT id,user_id,company_id,session_id_hash,auth_provider,
             assurance_level,issued_at::text,expires_at::text,revoked_at::text
      FROM ai_pdm_core.account_session_records
      WHERE user_id=ANY(:ids) ORDER BY id LIMIT 10001
    `, { ids });
    if ([rolePermissions, roleScopeRules, memberships, sessions]
      .some((rows) => rows.length > 10000)) invalid();
    const localSourceHash = hashPrincipalCutoverLocalSource({
      inventory: candidateSets.flat().map((row) => ({ ...row })),
      profiles: profiles.map((row) => ({ ...row })),
      roles: roles.map((row) => ({ ...row })),
      rolePermissions, roleScopeRules,
      activeCatalog,
      priority: { id: priorities[0].id, versionCode: priorities[0].version_code,
        order: rolePriority as string[] },
      assignments: assignments.map((row) => ({ ...row })),
      delegations: delegations.map((row) => ({ ...row })),
      memberships, sessions,
      externalActiveAccounts: external.map((row) => ({ ...row }))
    });
    const producerSourceHash = await capturePrincipalCutoverProducerSource(snapshot, candidateSets);
    const migrationInput: PrincipalAclMigrationInput = {
      profiles: plannedProfiles,
      externalActiveAccounts: external.map((row) => ({
        pdmUserId: row.pdm_user_id, principalId: row.principal_id })),
      roles: roles.map((row) => ({ id: row.id, roleCode: row.role_code,
        enabled: row.enabled === 1 })),
      rolePriority: rolePriority as string[],
      assignments: assignments.map((row) => ({
        id: row.id, userId: row.user_id, roleId: row.role_id,
        reason: row.reason, scopeTemplate: row.scope_template,
        namedScope: row.named_scope, sponsorUserId: row.sponsor_user_id,
        startsAt: row.starts_at, reviewDueAt: row.review_due_at,
        hardEndsAt: row.hard_ends_at, assignedBy: row.assigned_by,
        assignedAt: row.assigned_at, revokedAt: row.revoked_at,
        revokedBy: row.revoked_by
      })),
      delegations: delegations.map((row) => ({
        id: row.id, delegatedFrom: row.delegated_from,
        delegatedTo: row.delegated_to, projectCode: row.project_code,
        actionCode: row.action_code, startsAt: row.starts_at,
        endsAt: row.ends_at, reason: row.reason, createdBy: row.created_by,
        createdAt: row.created_at, revokedAt: row.revoked_at,
        revokedBy: row.revoked_by
      })),
      cutoverAt: input.cutoverAt
    };
    const plan = planPrincipalAclMigration(migrationInput);
    const graphCheck = assertPrincipalAclGraphPreserved(migrationInput, plan);
    const workspaceShadow = assessPrincipalCutoverWorkspaceShadow({
      source: migrationInput, plan, accounts: accountRows,
      rolePermissions, roleScopeRules
    });
    return { cohort: candidateSets.map((candidates) => ({
      pdmUserId: candidates[0].pdmUserId, principalId: candidates[0].principalId,
      sourceCount: candidates.length
    })), accounts: accountRows, localSourceHash, producerSourceHash,
      graphCheck, workspaceShadow, plan };
}

/** Read-only owner preview. This is neither the full cutover source hash nor an apply command. */
export async function previewPrincipalAclMigration(input: PrincipalAclMigrationSourceInput & {
  database: AsyncDatabaseClient;
}) {
  if (input.database.kind !== "postgres") invalid();
  return input.database.transaction(async (snapshot) => {
    await snapshot.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    await snapshot.execute("SET LOCAL statement_timeout = '5s'");
    await snapshot.execute("SET LOCAL TIME ZONE 'UTC'");
    return readPrincipalAclMigrationSource(snapshot, input);
  }, { isolationLevel: "repeatable_read", readOnly: true });
}

/** Owner preview of a source envelope with live contract readback in one snapshot. */
export async function previewPrincipalCutoverSourceEnvelope(
  input: PrincipalAclMigrationSourceInput & { database: AsyncDatabaseClient } &
    Pick<PrincipalCutoverSourceSealInput,
      "operationId" | "sourceRevisions" | "contractManifestHashes">
) {
  if (input.database.kind !== "postgres") invalid();
  return input.database.transaction(async (snapshot) => {
    await snapshot.execute("SET LOCAL ROLE jenfu_ai_pdm_migrator");
    await snapshot.execute("SET LOCAL statement_timeout = '5s'");
    await snapshot.execute("SET LOCAL TIME ZONE 'UTC'");
    return previewPrincipalCutoverSourceEnvelopeInSnapshot(snapshot, input);
  }, { isolationLevel: "repeatable_read", readOnly: true });
}

/** The owner runner already holds one read-only RR transaction and DB decision time. */
export async function previewPrincipalCutoverSourceEnvelopeInSnapshot(
  snapshot: AsyncDatabaseClient,
  input: PrincipalAclMigrationSourceInput &
    Pick<PrincipalCutoverSourceSealInput,
      "operationId" | "sourceRevisions" | "contractManifestHashes">
) {
  await assertPrincipalOwnerContractManifestHashes(
    snapshot, input.contractManifestHashes);
  const source = await readPrincipalAclMigrationSource(snapshot, input);
  return sealPreviewEnvelope(input, source);
}

function sealPreviewEnvelope(input: PrincipalAclMigrationSourceInput &
  Pick<PrincipalCutoverSourceSealInput,
    "operationId" | "sourceRevisions" | "contractManifestHashes">,
source: Awaited<ReturnType<typeof readPrincipalAclMigrationSource>>) {
  return { firebaseProjectId: input.firebaseProjectId,
    sourceSets: input.sourceSets, cutoverAt: input.cutoverAt,
    operationId: input.operationId,
    sourceRevisions: input.sourceRevisions,
    contractManifestHashes: input.contractManifestHashes,
    ...source, ...sealPrincipalCutoverSource({
    operationId: input.operationId,
    sourceRevisions: input.sourceRevisions,
    contractManifestHashes: input.contractManifestHashes,
    cohort: source.cohort,
    localSourceHash: source.localSourceHash,
    producerSourceHash: source.producerSourceHash,
    graphHash: source.graphCheck.graphHash,
    workspaceShadowHash: source.workspaceShadow.shadowHash,
    planHash: source.plan.planHash
  }) };
}
