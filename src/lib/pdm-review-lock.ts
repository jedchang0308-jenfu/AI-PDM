import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type PdmReviewLockScope = {
  companyId: string;
  targetIds: string[];
  targetRefs?: PdmEntityTargetRef[];
};

export type PdmEntityTargetRef = {
  type: string;
  id: string;
  companyId?: string;
};

export class PdmReviewLockError extends Error {
  readonly code = "PDM_REVIEW_LOCKED";
  readonly status = 409;

  constructor() {
    super("CANDIDATE_REVIEW_LOCKED");
    this.name = "PdmReviewLockError";
  }
}

/**
 * Must run on the same transaction client as the write it protects.
 * Approval targets are the single cross-domain lock index; the reservation
 * fallback protects older candidate rows that predate target materialization.
 */
const LOCK_ORDER: Record<string, number> = {
  workspace: 10,
  numbering_draft_workspace: 10,
  root: 20,
  part_root: 20,
  numbering_draft_root: 20,
  drawing: 30,
  drawing_number: 30,
  numbering_draft_drawing: 30,
  part: 40,
  part_number: 40,
  numbering_draft_part: 40,
  revision: 50,
  drawing_revision: 50,
  drawing_revision_package: 50,
  numbering_candidate_revision: 50,
  reservation: 50,
  attachment: 60,
  numbering_candidate_revision_file: 60,
  drawing_revision_package_file: 60,
  relation: 70,
  drawing_part_link: 70,
  numbering_draft_relation: 70
};

function normalizedTargetRefs(scope: PdmReviewLockScope): PdmEntityTargetRef[] {
  const refs = scope.targetRefs?.length
    ? scope.targetRefs
    : scope.targetIds.map((id) => ({ type: "unknown", id }));
  return [...new Map(refs
    .map((ref) => ({ type: ref.type.trim(), id: ref.id.trim() }))
    .filter((ref) => ref.type && ref.id)
    .map((ref) => [`${ref.type}:${ref.id}`, ref])).values()]
    .sort((left, right) => (LOCK_ORDER[left.type] ?? 999) - (LOCK_ORDER[right.type] ?? 999) || left.id.localeCompare(right.id));
}

/**
 * Locks canonical rows in the one global order used by review submission and
 * covered mutations. SQLite relies on its existing write transaction; Postgres
 * takes row locks before any reviewed content is read or changed.
 */
function dedupeAndSortTargetRefs(targetRefs: PdmEntityTargetRef[]) {
  const refs = [...new Map(targetRefs
    .map((ref) => ({ type: ref.type.trim(), id: ref.id.trim(), companyId: ref.companyId }))
    .filter((ref) => ref.type && ref.id)
    .map((ref) => [`${ref.type}:${ref.id}`, ref])).values()]
    .sort((left, right) => (LOCK_ORDER[left.type] ?? 999) - (LOCK_ORDER[right.type] ?? 999) || left.id.localeCompare(right.id));
  return refs;
}

function lockQueryFor(type: string, lockSuffix: string) {
  const queries: Record<string, string> = {
    workspace: `SELECT id FROM numbering_draft_workspaces WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_draft_workspace: `SELECT id FROM numbering_draft_workspaces WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    root: `SELECT id FROM part_roots WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    part_root: `SELECT id FROM part_roots WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_draft_root: `SELECT id FROM numbering_draft_roots WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing: `SELECT id FROM drawing_numbers WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing_number: `SELECT id FROM drawing_numbers WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_draft_drawing: `SELECT id FROM numbering_draft_drawings WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    part: `SELECT id FROM part_numbers WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    part_number: `SELECT id FROM part_numbers WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_draft_part: `SELECT id FROM numbering_draft_parts WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    revision: `SELECT id FROM drawing_revisions WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing_revision: `SELECT id FROM drawing_revisions WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing_revision_package: `SELECT id FROM drawing_revision_packages WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_candidate_revision: `SELECT id FROM numbering_candidate_revision_drafts WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    reservation: `SELECT id FROM number_candidate_reservations WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    attachment: `SELECT id FROM file_assets WHERE id = :id${lockSuffix}`,
    numbering_candidate_revision_file: `SELECT id FROM numbering_candidate_revision_files WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing_revision_package_file: `SELECT package_file.id
      FROM drawing_revision_package_files package_file
      JOIN drawing_revision_packages revision_package ON revision_package.id = package_file.package_id
     WHERE package_file.id = :id AND revision_package.company_id = :companyId${lockSuffix}`,
    relation: `SELECT id FROM numbering_draft_relations WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    numbering_draft_relation: `SELECT id FROM numbering_draft_relations WHERE id = :id AND company_id = :companyId${lockSuffix}`,
    drawing_part_link: `SELECT link.id
      FROM drawing_part_links link
      JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
     WHERE link.id = :id AND drawing.company_id = :companyId${lockSuffix}`
  };
  return queries[type] ?? null;
}

export async function lockPdmEntityScopeAsync(client: AsyncDatabaseClient, targetRefs: PdmEntityTargetRef[]) {
  const refs = dedupeAndSortTargetRefs(targetRefs);
  const companyId = refs.find((ref) => ref.companyId)?.companyId;
  if (!companyId) throw new Error("PDM_REVIEW_LOCK_COMPANY_REQUIRED");
  const lockSuffix = client.kind === "postgres" ? " FOR UPDATE" : "";
  for (const ref of refs) {
    const query = lockQueryFor(ref.type, lockSuffix);
    if (query) await client.queryOne<{ id: string }>(query, { id: ref.id, companyId });
  }
}

export async function lockPdmDraftWorkspaceScopeAsync(client: AsyncDatabaseClient, input: { companyId: string; workspaceId: string }) {
  const lockSuffix = client.kind === "postgres" ? " FOR UPDATE" : "";
  const params = { companyId: input.companyId, workspaceId: input.workspaceId };
  await client.queryOne<{ id: string }>(`SELECT id FROM numbering_draft_workspaces WHERE id = :workspaceId AND company_id = :companyId${lockSuffix}`, params);
  await client.query(`SELECT id FROM numbering_draft_roots WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
  await client.query(`SELECT id FROM numbering_draft_drawings WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
  await client.query(`SELECT id FROM numbering_draft_parts WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
  await client.query(`SELECT id FROM numbering_candidate_revision_drafts WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
  await client.query(`SELECT id FROM number_candidate_reservations WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
  await client.query(`SELECT id FROM numbering_draft_relations WHERE workspace_id = :workspaceId AND company_id = :companyId ORDER BY id${lockSuffix}`, params);
}

export async function assertPdmEntityWriteAllowedAsync(client: AsyncDatabaseClient, scope: PdmReviewLockScope) {
  const refs = normalizedTargetRefs(scope);
  if (refs.length === 0) return;
  await lockPdmEntityScopeAsync(client, refs.map((ref) => ({ ...ref, companyId: scope.companyId })));
  const targetPairPredicates = refs[0]?.type === "unknown"
    ? `target.target_id IN (${refs.map((_, index) => `:targetId${index}`).join(", ")})`
    : refs.map((ref, index) => `(target.target_type = :targetType${index} AND target.target_id = :targetId${index})`).join(" OR ");
  const workspaceRefs = refs.filter((ref) => ["workspace", "numbering_draft_workspace"].includes(ref.type));
  const params = Object.fromEntries([
    ["companyId", scope.companyId],
    ...refs.map((ref, index) => [`targetId${index}`, ref.id]),
    ...refs.map((ref, index) => [`targetType${index}`, ref.type])
  ]);
  const activeTarget = await client.queryOne<{ id: string }>(
    `SELECT target.id
       FROM approval_platform_targets target
       JOIN approval_platform_requests request ON request.id = target.request_id
      WHERE request.company_id = :companyId
        AND request.request_status IN ('pending', 'needs_info', 'apply_failed')
        AND (${targetPairPredicates})
      LIMIT 1`,
    params
  );
  if (activeTarget) throw new PdmReviewLockError();

  if (workspaceRefs.length === 0) return;
  const workspacePlaceholders = workspaceRefs.map((_, index) => `:workspaceId${index}`).join(", ");
  const activeReservation = await client.queryOne<{ id: string }>(
    `SELECT id
       FROM number_candidate_reservations
      WHERE company_id = :companyId
        AND workspace_id IN (${workspacePlaceholders})
        AND reservation_state IN ('review_locked', 'approved_locked', 'promoted')
      LIMIT 1`,
    { ...params, ...Object.fromEntries(workspaceRefs.map((ref, index) => [`workspaceId${index}`, ref.id])) }
  );
  if (activeReservation) throw new PdmReviewLockError();
}

export async function assertPdmReviewScopeWritableAsync(client: AsyncDatabaseClient, scope: PdmReviewLockScope) {
  return assertPdmEntityWriteAllowedAsync(client, scope);
}
