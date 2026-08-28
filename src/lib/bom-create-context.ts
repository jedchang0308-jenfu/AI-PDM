import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import { canReadSubmissionAsync, isBomReleasedOnlyRole } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { DbUser } from "@/lib/repositories/user-repository";
import type { BomReleaseSnapshotDetail, BomWorkbenchDraftSummary } from "@/lib/types";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { isAssemblySharedBomV1Enabled } from "@/lib/assembly-bom-feature";
import type { CanonicalPartBomContext } from "@/lib/pdm-canonical-workbench-contract";
import { parseStoredPartStructureType } from "@/lib/numbering-structure-type";
import { canonicalSha256, SharedBomError, SHARED_BOM_LIMITS } from "@/lib/bom-shared-structure";

export type BomOwnerAccessContext = {
  companyId: string;
  ownerPartNumberId: string;
  partNumber: string;
  partName: string;
  legacyItemId: string | null;
};

export type BomApplicabilityCandidateContract = {
  mode: "initial" | "next_revision";
  definitionId: string | null;
  baseReleaseSnapshotId: string | null;
  contextPart: { partNumberId: string; partNumber: string; name: string };
  candidates: Array<{
    partNumberId: string;
    partNumber: string;
    name: string;
    specification: string;
    selected: boolean;
    selectable: boolean;
    blockedReason: string | null;
    rowVersion: string;
  }>;
  suggestedBomRevision: string;
  selectionEtag: string;
};

export type SharedBomCapability =
  | "create"
  | "edit"
  | "submit"
  | "archive_restore"
  | "reconfirm"
  | "obsolete_request"
  | "draft_evidence_read"
  | "decision"
  | "released_projection_read";

export type SharedBomCapabilityResolution = {
  authorized: boolean;
  denial: "not_found" | "forbidden" | null;
  companyId: string | null;
  definitionId: string | null;
  draftId: string | null;
  snapshotId: string | null;
  reviewId: string | null;
  submittedBy: string | null;
  parentPartNumberIds: string[];
};

/**
 * DEV-096 shared authority resolver. Every shared route resolves the company,
 * Definition and complete Parent scope here; compatibility owner columns never
 * participate in authorization.
 */
export async function resolveSharedBomCapabilityAsync(input: {
  user: DbUser;
  capability: SharedBomCapability;
  companyId?: string | null;
  definitionId?: string | null;
  draftId?: string | null;
  snapshotId?: string | null;
  reviewId?: string | null;
  exactParentPartNumberId?: string | null;
  client?: AsyncDatabaseClient;
}): Promise<SharedBomCapabilityResolution> {
  const client = input.client ?? getAsyncDatabaseClient();
  let resource: {
    company_id: string;
    definition_id: string;
    draft_id: string | null;
    snapshot_id: string | null;
    review_id: string | null;
    submitted_by: string | null;
  } | null = null;

  if (input.reviewId) {
    resource = await client.queryOne(`
      SELECT draft.company_id, draft.definition_id, draft.id AS draft_id,
        NULL AS snapshot_id, review.id AS review_id, review.submitted_by
      FROM bom_review_requests review
      JOIN bom_drafts draft ON draft.id = review.bom_draft_id
      WHERE review.id = :resourceId AND draft.definition_id IS NOT NULL
      LIMIT 1
    `, { resourceId: input.reviewId });
  } else if (input.snapshotId) {
    resource = await client.queryOne(`
      SELECT snapshot.company_id, snapshot.definition_id, snapshot.bom_draft_id AS draft_id,
        snapshot.id AS snapshot_id, NULL AS review_id, NULL AS submitted_by
      FROM bom_release_snapshots snapshot
      WHERE snapshot.id = :resourceId AND snapshot.definition_id IS NOT NULL
      LIMIT 1
    `, { resourceId: input.snapshotId });
  } else if (input.draftId) {
    resource = await client.queryOne(`
      SELECT draft.company_id, draft.definition_id, draft.id AS draft_id,
        NULL AS snapshot_id, NULL AS review_id, NULL AS submitted_by
      FROM bom_drafts draft
      WHERE draft.id = :resourceId AND draft.definition_id IS NOT NULL
      LIMIT 1
    `, { resourceId: input.draftId });
  } else if (input.definitionId) {
    resource = await client.queryOne(`
      SELECT definition.company_id, definition.id AS definition_id, NULL AS draft_id,
        NULL AS snapshot_id, NULL AS review_id, NULL AS submitted_by
      FROM bom_definitions definition
      WHERE definition.id = :resourceId
      LIMIT 1
    `, { resourceId: input.definitionId });
  } else if (input.companyId) {
    resource = {
      company_id: input.companyId,
      definition_id: "",
      draft_id: null,
      snapshot_id: null,
      review_id: null,
      submitted_by: null
    };
  }

  const empty: SharedBomCapabilityResolution = {
    authorized: false,
    denial: "not_found",
    companyId: null,
    definitionId: null,
    draftId: null,
    snapshotId: null,
    reviewId: null,
    submittedBy: null,
    parentPartNumberIds: []
  };
  if (!resource || (input.companyId && resource.company_id !== input.companyId)) return empty;
  if (!(await canAccessCompany(input.user, resource.company_id))) return empty;

  const parentRows = resource.definition_id
    ? await client.query<{ part_number_id: string }>(`
        SELECT part_number_id
        FROM bom_definition_parent_bindings
        WHERE definition_id = :definitionId AND company_id = :companyId
        ORDER BY part_number_id
      `, { definitionId: resource.definition_id, companyId: resource.company_id })
    : [];
  const parentPartNumberIds = parentRows.map((row) => row.part_number_id);
  if (input.exactParentPartNumberId && !parentPartNumberIds.includes(input.exactParentPartNumberId)) return empty;

  const decisionRole = input.user.role === "R&D Manager" || input.user.role === "Admin";
  const releasedRead = input.capability === "released_projection_read";
  const permitted = releasedRead
    || (input.capability === "decision"
      ? decisionRole && resource.submitted_by !== input.user.id
      : !isBomReleasedOnlyRole(input.user));
  return {
    authorized: permitted,
    denial: permitted ? null : "forbidden",
    companyId: resource.company_id,
    definitionId: resource.definition_id || null,
    draftId: resource.draft_id,
    snapshotId: resource.snapshot_id,
    reviewId: resource.review_id,
    submittedBy: resource.submitted_by,
    parentPartNumberIds
  };
}

export async function getBomApplicabilityCandidateContractAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  contextPartNumberId: string;
}): Promise<BomApplicabilityCandidateContract> {
  if (!isAssemblySharedBomV1Enabled()) throw new SharedBomError("BOM_SHARED_STRUCTURE_DISABLED", 404);
  const client = input.client ?? getAsyncDatabaseClient();
  await assertSharedBomMigrationReadyAsync(client, input.companyId);
  const context = await client.queryOne<{
    id: string; company_id: string; part_root_id: string; part_number: string; part_name: string;
    item_kind: string; structure_type: string; record_status: string; updated_at: string;
  }>("SELECT id, company_id, part_root_id, part_number, part_name, item_kind, structure_type, record_status, updated_at FROM part_numbers WHERE id = :partNumberId AND company_id = :companyId", {
    partNumberId: input.contextPartNumberId, companyId: input.companyId
  });
  if (!context) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
  if (context.item_kind !== "manufactured" || context.structure_type !== "assembly") throw new SharedBomError("BOM_PART_NOT_ASSEMBLY", 422);
  const binding = await client.queryOne<{ definition_id: string; row_version: number | string }>(`
    SELECT binding.definition_id, definition.row_version
    FROM bom_definition_parent_bindings binding JOIN bom_definitions definition ON definition.id = binding.definition_id
    WHERE binding.part_number_id = :partNumberId AND binding.company_id = :companyId AND definition.company_id = :companyId
  `, { partNumberId: context.id, companyId: input.companyId });
  if (binding) {
    const open = await client.queryOne<{ id: string }>("SELECT id FROM bom_drafts WHERE definition_id = :definitionId AND status IN ('Draft','Rejected','PendingReview','Archived') LIMIT 1", { definitionId: binding.definition_id });
    if (open) throw new SharedBomError("BOM_OPEN_REVISION_EXISTS", 409, { draftId: open.id });
  }
  const base = binding ? await client.queryOne<{ id: string; bom_revision: string }>(`
    SELECT id, bom_revision FROM bom_release_snapshots
    WHERE definition_id = :definitionId AND snapshot_schema_version = 2 AND obsolete_at IS NULL
    ORDER BY released_at DESC, id DESC LIMIT 1
  `, { definitionId: binding.definition_id }) : null;
  if (binding && !base) throw new SharedBomError("BOM_APPLICABILITY_CONFLICT", 409);
  const baseParents = base ? await client.query<{ parent_part_number_id: string }>(
    "SELECT parent_part_number_id FROM bom_release_parent_snapshots WHERE release_snapshot_id = :releaseId ORDER BY selection_order, parent_part_number_id",
    { releaseId: base.id }
  ) : [];
  const baseIds = new Set(baseParents.map((row) => row.parent_part_number_id));
  const rows = await client.query<{
    id: string; part_number: string; part_name: string; custom_specification: string | null; item_kind: string;
    structure_type: string; record_status: string; updated_at: string; current_definition_id: string | null;
    primary_m_identity: string | null;
  }>(`
    SELECT part.id, part.part_number, part.part_name, part.custom_specification, part.item_kind,
      part.structure_type, part.record_status, part.updated_at,
      (SELECT current_binding.definition_id FROM bom_definition_parent_bindings current_binding WHERE current_binding.part_number_id = part.id) AS current_definition_id,
      (SELECT drawing.id FROM drawing_part_links link JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
        WHERE link.part_number_id = part.id AND link.link_type = 'primary_manufacturing'
          AND drawing.company_id = part.company_id AND drawing.part_root_id = part.part_root_id
          AND drawing.purpose_code = 'M' AND drawing.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid')
        ORDER BY drawing.id LIMIT 1) AS primary_m_identity
    FROM part_numbers part
    WHERE part.company_id = :companyId AND part.part_root_id = :rootId
    ORDER BY part.part_number, part.id
    LIMIT :limit
  `, { companyId: input.companyId, rootId: context.part_root_id, limit: SHARED_BOM_LIMITS.parents + 1 });
  if (rows.length > SHARED_BOM_LIMITS.parents) throw new SharedBomError("BOM_SHARED_STRUCTURE_LIMIT_EXCEEDED", 413);
  const mode = base ? "next_revision" as const : "initial" as const;
  const candidates = rows.map((row) => {
    const blockedReason = row.item_kind !== "manufactured" || row.structure_type !== "assembly"
      ? "BOM_PART_NOT_ASSEMBLY"
      : ["Obsolete", "Merged", "MainDrawingInvalid"].includes(row.record_status)
        ? "BOM_PARENT_INACTIVE"
        : !row.primary_m_identity
          ? "BOM_ASSEMBLY_REQUIRES_M_DRAWING"
          : row.current_definition_id && row.current_definition_id !== binding?.definition_id
            ? "BOM_APPLICABILITY_CONFLICT"
            : null;
    return {
      partNumberId: row.id,
      partNumber: row.part_number,
      name: row.part_name,
      specification: row.custom_specification ?? "",
      selected: mode === "initial" ? row.id === context.id : baseIds.has(row.id) || row.id === context.id,
      selectable: blockedReason === null,
      blockedReason,
      rowVersion: row.updated_at
    };
  });
  const suggestedBomRevision = base ? String(Number(base.bom_revision) + 1) : "1";
  const etagInput = {
    companyId: input.companyId,
    rootId: context.part_root_id,
    contextPartNumberId: context.id,
    mode,
    definitionId: binding?.definition_id ?? null,
    definitionRowVersion: Number(binding?.row_version ?? 0),
    baseReleaseSnapshotId: base?.id ?? null,
    candidates: rows.map((row) => ({ id: row.id, status: row.record_status, structureType: row.structure_type, updatedAt: row.updated_at, primaryMIdentity: row.primary_m_identity, currentDefinitionId: row.current_definition_id }))
  };
  const selectionEtag = `"${canonicalSha256(etagInput).hash}"`;
  return {
    mode,
    definitionId: binding?.definition_id ?? null,
    baseReleaseSnapshotId: base?.id ?? null,
    contextPart: { partNumberId: context.id, partNumber: context.part_number, name: context.part_name },
    candidates,
    suggestedBomRevision,
    selectionEtag
  };
}

export async function assertSharedBomMigrationReadyAsync(client: AsyncDatabaseClient, companyId: string) {
  const state = await client.queryOne<{ open_issues: number | string; uncovered_authority: number | string }>(`
    SELECT
      (SELECT COUNT(*) FROM bom_shared_structure_migration_issues issue
        WHERE issue.issue_status = 'open' AND (issue.company_id = :companyId OR issue.company_id IS NULL)) AS open_issues,
      (SELECT COUNT(*) FROM bom_drafts draft
        LEFT JOIN part_numbers owner_part ON owner_part.id = draft.owner_part_number_id
        LEFT JOIN items owner_item ON owner_item.id = draft.parent_item_id
        WHERE draft.source = 'manual'
          AND draft.owner_part_number_id IS NOT NULL
          AND draft.definition_id IS NULL
          AND COALESCE(draft.company_id, owner_part.company_id, owner_item.company_id) = :companyId) AS uncovered_authority
  `, { companyId });
  if (Number(state?.open_issues ?? 0) > 0 || Number(state?.uncovered_authority ?? 0) > 0) {
    throw new SharedBomError("BOM_SHARED_MIGRATION_BLOCKED", 409, {
      openIssueCount: Number(state?.open_issues ?? 0),
      uncoveredAuthorityCount: Number(state?.uncovered_authority ?? 0)
    });
  }
}

export async function resolveCanonicalPartBomContextAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  partNumberId: string;
  canMutate: boolean;
}): Promise<CanonicalPartBomContext> {
  const client = input.client ?? getAsyncDatabaseClient();
  const part = await client.queryOne<{
    id: string;
    item_kind: "manufactured" | "purchased";
    structure_type: "single_part" | "assembly" | "unclassified";
    record_status: string;
    has_primary_m: number | boolean;
  }>(`
    SELECT p.id, p.item_kind, p.structure_type, p.record_status,
      CASE WHEN EXISTS (
        SELECT 1 FROM drawing_part_links link
        JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
        WHERE link.part_number_id = p.id
          AND link.link_type = 'primary_manufacturing'
          AND drawing.company_id = p.company_id
          AND drawing.part_root_id = p.part_root_id
          AND drawing.purpose_code = 'M'
          AND drawing.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid')
      ) THEN 1 ELSE 0 END AS has_primary_m
    FROM part_numbers p
    WHERE p.id = :partNumberId AND p.company_id = :companyId
  `, { companyId: input.companyId, partNumberId: input.partNumberId });
  const structureType = parseStoredPartStructureType(part?.structure_type);
  const empty = (overrides: Partial<CanonicalPartBomContext> = {}): CanonicalPartBomContext => ({
    structureType,
    eligibility: "ineligible",
    action: "none",
    definitionId: null,
    draftId: null,
    releaseSnapshotId: null,
    bomRevision: null,
    status: null,
    applicableParentCount: 0,
    blocker: null,
    ...overrides
  });
  if (!part || structureType !== "assembly" || ["Obsolete", "Merged", "MainDrawingInvalid"].includes(part.record_status)) return empty();
  if (part.item_kind === "purchased") return empty({
    eligibility: "ineligible",
    blocker: { code: "BOM_PURCHASED_ASSEMBLY_NOT_APPLICABLE", message: "外購組立件目前不適用製造 BOM" }
  });
  if (!Boolean(part.has_primary_m)) return empty({
    eligibility: "blocked",
    blocker: { code: "BOM_ASSEMBLY_REQUIRES_M_DRAWING", message: "組立件必須具有主要製造圖 M" }
  });
  if (!isAssemblySharedBomV1Enabled()) return empty();
  const openIssues = await client.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM bom_shared_structure_migration_issues WHERE issue_status = 'open' AND (company_id = :companyId OR company_id IS NULL)",
    { companyId: input.companyId }
  );
  if (Number(openIssues?.count ?? 0) > 0) return empty({
    eligibility: "blocked",
    blocker: { code: "BOM_SHARED_MIGRATION_BLOCKED", message: "共用 BOM 資料尚待處理" }
  });
  const binding = await client.queryOne<{ definition_id: string }>(`
    SELECT binding.definition_id
    FROM bom_definition_parent_bindings binding
    JOIN bom_definitions definition ON definition.id = binding.definition_id
    WHERE binding.part_number_id = :partNumberId AND binding.company_id = :companyId AND definition.company_id = :companyId
  `, { companyId: input.companyId, partNumberId: input.partNumberId });
  if (!binding) return empty({ eligibility: "eligible", action: input.canMutate ? "create_bom" : "none" });
  const parentCount = await client.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM bom_definition_parent_bindings WHERE definition_id = :definitionId",
    { definitionId: binding.definition_id }
  );
  const openRows = await client.query<{ id: string; bom_revision: string; status: CanonicalPartBomContext["status"] }>(`
    SELECT id, bom_revision, status FROM bom_drafts
    WHERE definition_id = :definitionId AND status IN ('Draft','Rejected','PendingReview','Archived')
    ORDER BY updated_at DESC, id DESC LIMIT 2
  `, { definitionId: binding.definition_id });
  if (openRows.length > 1) return empty({
    eligibility: "blocked",
    definitionId: binding.definition_id,
    applicableParentCount: Number(parentCount?.count ?? 0),
    blocker: { code: "BOM_OPEN_REVISION_CONFLICT", message: "BOM 版次資料存在衝突，請先處理後再繼續" }
  });
  const open = openRows[0] ?? null;
  if (open) return empty({
    eligibility: "eligible",
    action: "open_bom",
    definitionId: binding.definition_id,
    draftId: open.id,
    bomRevision: open.bom_revision,
    status: open.status,
    applicableParentCount: Number(parentCount?.count ?? 0)
  });
  const release = await client.queryOne<{ id: string; bom_draft_id: string; bom_revision: string; obsolete_at: string | null }>(`
    SELECT id, bom_draft_id, bom_revision, obsolete_at FROM bom_release_snapshots
    WHERE definition_id = :definitionId AND snapshot_schema_version = 2
    ORDER BY CASE WHEN obsolete_at IS NULL THEN 0 ELSE 1 END, released_at DESC, id DESC LIMIT 1
  `, { definitionId: binding.definition_id });
  if (release) return empty({
    eligibility: "eligible",
    action: "open_bom",
    definitionId: binding.definition_id,
    draftId: release.bom_draft_id,
    releaseSnapshotId: release.id,
    bomRevision: release.bom_revision,
    status: release.obsolete_at ? "Obsolete" : "Released",
    applicableParentCount: Number(parentCount?.count ?? 0)
  });
  return empty({
    eligibility: "blocked",
    definitionId: binding.definition_id,
    applicableParentCount: Number(parentCount?.count ?? 0),
    blocker: { code: "BOM_APPLICABILITY_CONFLICT", message: "BOM 關聯資料不完整" }
  });
}

export async function resolveBomOwnerAccessContextAsync(input: {
  user: DbUser;
  companyId: string;
  ownerPartNumberId: string;
}): Promise<BomOwnerAccessContext | null> {
  if (isBomReleasedOnlyRole(input.user)) return null;
  if (!(await canAccessCompany(input.user, input.companyId))) return null;

  const row = await getAsyncDatabaseClient().queryOne<{
    id: string;
    company_id: string;
    part_number: string;
    part_name: string;
    legacy_item_id: string | null;
  }>(
    `
      SELECT
        pn.id,
        pn.company_id,
        pn.part_number,
        pn.part_name,
        (SELECT i.id FROM items i WHERE i.company_id = pn.company_id AND upper(i.part_number) = upper(pn.part_number) ORDER BY i.id LIMIT 1) AS legacy_item_id
      FROM part_numbers pn
      WHERE pn.id = :ownerPartNumberId
        AND pn.company_id = :companyId
        AND pn.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
      LIMIT 1
    `,
    { companyId: input.companyId, ownerPartNumberId: input.ownerPartNumberId, actorId: input.user.id }
  );
  if (!row) return null;
  return {
    companyId: row.company_id,
    ownerPartNumberId: row.id,
    partNumber: row.part_number,
    partName: row.part_name,
    legacyItemId: row.legacy_item_id
  };
}

export async function canReadBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (draft.definition_id) {
    const capability = draft.status === "Released" || draft.status === "Obsolete"
      ? "released_projection_read"
      : "draft_evidence_read";
    return (await resolveSharedBomCapabilityAsync({ user, draftId: draft.id, capability })).authorized;
  }
  if (isBomReleasedOnlyRole(user)) {
    return draft.status === "Released" && Boolean(draft.company_id) && await canAccessCompany(user, draft.company_id!);
  }
  if (draft.owner_part_number_id && draft.company_id) {
    return Boolean(
      await resolveBomOwnerAccessContextAsync({
        user,
        companyId: draft.company_id,
        ownerPartNumberId: draft.owner_part_number_id
      })
    );
  }
  if (draft.company_id && await canAccessCompany(user, draft.company_id)) return true;
  if (!draft.parent_submission_id) return false;
  const submission = await getSubmissionAsync(draft.parent_submission_id);
  return submission ? canReadSubmissionAsync(user, submission) : false;
}

export async function canManageBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (isBomReleasedOnlyRole(user)) return false;
  if (draft.definition_id) {
    return (await resolveSharedBomCapabilityAsync({ user, draftId: draft.id, capability: "edit" })).authorized;
  }
  return canReadBomDraftRecordAsync(user, draft);
}

export async function canEditBomDraftRecordAsync(user: DbUser, draft: BomWorkbenchDraftSummary) {
  if (draft.status !== "Draft" && draft.status !== "Rejected") return false;
  return canReadBomDraftRecordAsync(user, draft);
}

export async function canReadBomReleaseSnapshotRecordAsync(user: DbUser, snapshot: BomReleaseSnapshotDetail) {
  if (snapshot.definition_id) {
    return (await resolveSharedBomCapabilityAsync({
      user,
      snapshotId: snapshot.id,
      capability: "released_projection_read"
    })).authorized;
  }
  if (snapshot.owner_part_number_id && snapshot.company_id) {
    if (!(await canAccessCompany(user, snapshot.company_id))) return false;
    if (isBomReleasedOnlyRole(user)) return true;
    return Boolean(
      await resolveBomOwnerAccessContextAsync({
        user,
        companyId: snapshot.company_id,
        ownerPartNumberId: snapshot.owner_part_number_id
      })
    );
  }
  if (!snapshot.parent_submission_id) return false;
  const submission = await getSubmissionAsync(snapshot.parent_submission_id);
  return submission ? canReadSubmissionAsync(user, submission) : false;
}

async function canAccessCompany(user: DbUser, companyId: string) {
  if (user.company_id === companyId) return true;
  const companies = await getUserCompanyAccessAsync(user.id);
  return companies.some((company) => company.companyId === companyId);
}
