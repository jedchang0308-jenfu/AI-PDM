import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { getUserCompanyAccessAsync } from "@/lib/company-context";
import { canReadSubmissionAsync, isBomReleasedOnlyRole } from "@/lib/permissions";
import { getSubmissionAsync } from "@/lib/submissions-async";
import type { DbUser } from "@/lib/repositories/user-repository";
import type { BomPurpose, BomReleaseSnapshotDetail, BomWorkbenchDraftSummary } from "@/lib/types";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { isAssemblySharedBomV1Enabled } from "@/lib/assembly-bom-feature";
import { isSalesKitBomV1Enabled } from "@/lib/sales-kit-bom-feature";
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
  purpose: BomPurpose;
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

export type BomCreateCandidateContract = {
  mode: "suggested" | "search" | "exact";
  items: Array<{
    partNumberId: string;
    partNumber: string;
    partName: string;
    itemKind: "manufactured" | "purchased";
    structureType: "unclassified" | "single_part" | "assembly";
    allowedPurposes: BomPurpose[];
    action: "create" | "open" | "classify" | "none";
    definitionId: string | null;
    draftId: string | null;
    blockerCode: string | null;
    updatedAt: string;
    canonicalRowKey: string | null;
    reason: {
      code: "assembly_file" | "created_by_me_recently" | "company_recent";
      label: string;
      fileName: string | null;
    } | null;
  }>;
  nextCursor: string | null;
};

type BomCreateCandidateCursor = {
  v: 1;
  mode: "search";
  companyId: string;
  query: string;
  purpose: BomPurpose | "";
  searchRank: number;
  partNumberKey: string;
  partNumberId: string;
};

const candidateReasonLabels = {
  assembly_file: "有組合檔 .SLDASM",
  created_by_me_recently: "我近期建立",
  company_recent: "公司近期更新"
} as const;

function normalizedCandidateQuery(value: string | undefined | null) {
  return (value ?? "").trim().toLocaleLowerCase("en-US");
}

function encodeCandidateCursor(cursor: BomCreateCandidateCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCandidateCursor(value: string | null | undefined, context: {
  companyId: string;
  query: string;
  purpose: BomPurpose | "";
}) {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (!decoded || Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error("non-canonical");
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    const keys = Object.keys(parsed).sort().join(",");
    if (keys !== "companyId,mode,partNumberId,partNumberKey,purpose,query,searchRank,v") throw new Error("shape");
    if (parsed.v !== 1 || parsed.mode !== "search" || parsed.companyId !== context.companyId
      || parsed.query !== normalizedCandidateQuery(context.query) || parsed.purpose !== context.purpose
      || typeof parsed.partNumberId !== "string" || !parsed.partNumberId
      || typeof parsed.partNumberKey !== "string" || !parsed.partNumberKey
      || typeof parsed.searchRank !== "number" || !Number.isInteger(parsed.searchRank) || parsed.searchRank < 0 || parsed.searchRank > 3) {
      throw new Error("binding");
    }
    return parsed as unknown as BomCreateCandidateCursor;
  } catch {
    throw new SharedBomError("BOM_CREATE_CANDIDATE_CURSOR_INVALID", 422);
  }
}

export function parseBomPurpose(value: unknown): BomPurpose {
  if (value === "manufacturing" || value === "sales_kit") return value;
  throw new SharedBomError("BOM_PURPOSE_INVALID", 422);
}

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

export type BomPurposeColumn = "legacy_purpose" | "purpose";

/**
 * Resolve the purpose column that is actually present in the connected schema.
 *
 * DEV-109 moves the diagnostic value from `purpose` to `legacy_purpose`, but
 * local installations can legitimately still be on the DEV-106 schema while
 * the application source has already advanced.  Queries must not mention a
 * missing column because SQLite/Postgres validates the whole statement before
 * returning any rows.
 */
export async function getBomPurposeColumn(client: AsyncDatabaseClient): Promise<BomPurposeColumn | null> {
  if (client.kind === "postgres") {
    const rows = await client.query<{ column_name: string }>(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bom_definitions'
        AND column_name IN ('legacy_purpose', 'purpose')
    `);
    if (rows.some((row) => row.column_name === "legacy_purpose")) return "legacy_purpose";
    if (rows.some((row) => row.column_name === "purpose")) return "purpose";
    return null;
  }
  const rows = await client.query<{ name: string }>("PRAGMA table_info(bom_definitions)");
  if (rows.some((row) => row.name === "legacy_purpose")) return "legacy_purpose";
  if (rows.some((row) => row.name === "purpose")) return "purpose";
  return null;
}

export function adaptBomPurposeSql(sql: string, column: BomPurposeColumn | null) {
  // Replace the identifier itself instead of relying on one exact wrapper so
  // callers may safely use COALESCE, a scalar subquery, or another projection
  // shape without ever preparing a statement that names a missing column.
  return sql.replaceAll("definition.legacy_purpose", column ? `definition.${column}` : "NULL");
}

export async function hasBomPurposeColumn(client: AsyncDatabaseClient) {
  // This legacy predicate is retained for the pre-DEV-109 sales-kit writer,
  // which can only INSERT the old writable `purpose` column.  Read-only
  // compatibility must use getBomPurposeColumn() directly so migrated
  // installations can still project legacy_purpose without attempting a
  // write to a retired column.
  return (await getBomPurposeColumn(client)) === "purpose";
}

export async function assertSalesKitBomMigrationReadyAsync(client: AsyncDatabaseClient, companyId: string) {
  if (!isSalesKitBomV1Enabled()) throw new SharedBomError("BOM_SALES_KIT_DISABLED", 404);
  if (!(await hasBomPurposeColumn(client))) throw new SharedBomError("BOM_SALES_KIT_MIGRATION_BLOCKED", 409);
  await assertSharedBomMigrationReadyAsync(client, companyId);
}

export async function listBomCreateCandidatesAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  actorId: string;
  query?: string;
  purpose?: BomPurpose | "";
  exactPartNumberId?: string | null;
  cursor?: string | null;
  limit?: number;
  canMutate?: boolean;
}): Promise<BomCreateCandidateContract> {
  const client = input.client ?? getAsyncDatabaseClient();
  const purpose = input.purpose ?? "";
  const unifiedMode = purpose === "";
  const query = normalizedCandidateQuery(input.query);
  const exactPartNumberId = input.exactPartNumberId?.trim() || null;
  const mode: BomCreateCandidateContract["mode"] = exactPartNumberId ? "exact" : query ? "search" : "suggested";
  if (exactPartNumberId && (query || input.cursor)) throw new SharedBomError("BOM_CREATE_CANDIDATE_FILTER_INVALID", 422);
  if (!exactPartNumberId && !query && input.cursor) throw new SharedBomError("BOM_CREATE_CANDIDATE_CURSOR_INVALID", 422);
  if (mode === "exact" && input.limit && input.limit !== 1) throw new SharedBomError("BOM_CREATE_CANDIDATE_LIMIT_INVALID", 422);
  const cursor = decodeCandidateCursor(input.cursor, { companyId: input.companyId, query, purpose });
  if (cursor && mode !== "search") throw new SharedBomError("BOM_CREATE_CANDIDATE_CURSOR_INVALID", 422);
  const purposeColumn = await getBomPurposeColumn(client);
  const purposeSchemaReady = purposeColumn !== null;
  if (!isAssemblySharedBomV1Enabled() && !unifiedMode) throw new SharedBomError("BOM_SHARED_STRUCTURE_DISABLED", 404);
  const salesKitEnabled = isSalesKitBomV1Enabled();
  if (purpose === "sales_kit" && !salesKitEnabled) throw new SharedBomError("BOM_SALES_KIT_DISABLED", 404);
  if (salesKitEnabled && !purposeSchemaReady && !unifiedMode) throw new SharedBomError("BOM_SALES_KIT_MIGRATION_BLOCKED", 409);
  await assertSharedBomMigrationReadyAsync(client, input.companyId);
  const requestedLimit = Math.trunc(input.limit ?? (mode === "suggested" ? 5 : 25));
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) throw new SharedBomError("BOM_CREATE_CANDIDATE_LIMIT_INVALID", 422);
  const limit = mode === "suggested" ? 5 : mode === "exact" ? 1 : requestedLimit;
  const canMutate = input.canMutate !== false;
  const limitWithLookahead = mode === "search" ? limit + 1 : limit;
  const hasCursor = cursor ? 1 : 0;
  const sqlCursorRank = cursor?.searchRank ?? 0;
  const sqlCursorPartNumber = cursor?.partNumberKey ?? "";
  const definitionPurposeExpr = purposeColumn ? `definition.${purposeColumn}` : "'manufacturing'";
  const rows = await client.query<{
    id: string;
    part_number: string;
    part_name: string;
    item_kind: "manufactured" | "purchased";
    structure_type: "unclassified" | "single_part" | "assembly";
    record_status: string;
    updated_at: string;
    has_primary_m: number | string;
    controlled_file_name: string | null;
    controlled_file_updated_at: string | null;
    definition_id: string | null;
    definition_purpose: BomPurpose | null;
    open_draft_id: string | null;
    released_draft_id: string | null;
    canonical_row_key: string | null;
    allows_manufacturing: number | string;
    allows_sales_kit: number | string;
    projected_action: "create" | "open" | "classify" | "none";
    blocker_code: string | null;
    reason_code: "assembly_file" | "created_by_me_recently" | "company_recent" | null;
    reason_time: string | null;
    suggestion_eligible: number | string;
    search_rank: number | string;
    lower_part_number: string;
  }>(`
    WITH assembly_file_hits AS (
      SELECT link.part_number_id,
        asset.file_name AS controlled_file_name,
        COALESCE(file.updated_at, asset.updated_at) AS controlled_file_updated_at,
        ROW_NUMBER() OVER (
          PARTITION BY link.part_number_id
          ORDER BY COALESCE(file.updated_at, asset.updated_at) DESC, asset.file_name ASC, asset.id ASC
        ) AS hit_rank
      FROM canonical_workbench_states state
       JOIN drawing_revisions revision
         ON revision.id = state.revision_id AND revision.company_id = state.company_id
       JOIN drawings drawing
         ON drawing.id = revision.drawing_id AND drawing.company_id = state.company_id
        AND drawing.formal_drawing_number_id IS NOT NULL
        AND drawing.lifecycle_state NOT IN ('obsolete', 'merged', 'cancelled')
       JOIN drawing_numbers formal_drawing
         ON formal_drawing.id = drawing.formal_drawing_number_id
        AND formal_drawing.company_id = state.company_id
        AND formal_drawing.purpose_code IN ('M', 'MA')
        AND formal_drawing.is_primary_manufacturing = 1
        AND formal_drawing.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
       JOIN drawing_part_links link
         ON link.drawing_number_id = drawing.formal_drawing_number_id
        AND link.link_type = 'primary_manufacturing'
       JOIN part_numbers linked_part
         ON linked_part.id = link.part_number_id AND linked_part.company_id = state.company_id
      JOIN drawing_revision_files file
        ON file.drawing_revision_id = revision.id AND file.company_id = state.company_id
       AND file.removed_at IS NULL AND file.role = 'cad_3d' AND file.is_primary = 1
      JOIN file_assets asset
        ON asset.id = file.source_file_asset_id AND asset.deleted_at IS NULL
       AND LOWER(TRIM(asset.file_ext)) IN ('sldasm', '.sldasm')
       WHERE state.company_id = :companyId
         AND state.entity_type = 'drawing'
         AND state.revision_id IS NOT NULL
    ), candidate_base AS (
      SELECT part.id, part.part_number, part.part_name, part.item_kind, part.structure_type,
        part.record_status, part.created_by, part.created_at, part.updated_at,
        CASE WHEN EXISTS (
          SELECT 1 FROM drawing_part_links link
          JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id
          WHERE link.part_number_id = part.id AND link.link_type = 'primary_manufacturing'
            AND drawing.company_id = part.company_id AND drawing.part_root_id = part.part_root_id
            AND drawing.purpose_code = 'M' AND drawing.record_status NOT IN ('Obsolete','Merged','MainDrawingInvalid')
        ) THEN 1 ELSE 0 END AS has_primary_m,
        binding.definition_id,
        ${definitionPurposeExpr} AS definition_purpose,
        (
          SELECT draft.id FROM bom_drafts draft
          WHERE draft.definition_id = binding.definition_id AND draft.company_id = part.company_id
            AND draft.status IN ('Draft','Rejected','PendingReview','Archived')
          ORDER BY draft.updated_at DESC, draft.id DESC LIMIT 1
        ) AS open_draft_id,
        (
          SELECT snapshot.bom_draft_id FROM bom_release_snapshots snapshot
          WHERE snapshot.definition_id = binding.definition_id AND snapshot.company_id = part.company_id
            AND snapshot.obsolete_at IS NULL
          ORDER BY snapshot.released_at DESC, snapshot.id DESC LIMIT 1
        ) AS released_draft_id,
        (
          SELECT 'cw_' || state.id FROM canonical_workbench_states state
          WHERE state.company_id = part.company_id AND state.entity_type = 'part'
            AND state.canonical_entity_id = part.id AND state.data_layer = 'part_formal'
          ORDER BY state.updated_at DESC, state.id DESC LIMIT 1
        ) AS canonical_row_key,
         assemblyFile.controlled_file_name,
         assemblyFile.controlled_file_updated_at
      FROM part_numbers part
      LEFT JOIN bom_definition_parent_bindings binding
        ON binding.part_number_id = part.id AND binding.company_id = part.company_id
      LEFT JOIN bom_definitions definition
        ON definition.id = binding.definition_id AND definition.company_id = part.company_id
       LEFT JOIN assembly_file_hits assemblyFile
         ON assemblyFile.part_number_id = part.id AND assemblyFile.hit_rank = 1
      WHERE part.company_id = :companyId
        AND (CAST(:exactPartNumberId AS TEXT) IS NULL OR part.id = CAST(:exactPartNumberId AS TEXT))
    ), eligibility_projection AS (
      SELECT base.*,
        CASE
          WHEN base.definition_id IS NOT NULL THEN CASE WHEN :unifiedMode = 1 OR (base.definition_purpose = 'manufacturing' AND :purpose = 'manufacturing') THEN 1 ELSE 0 END
          WHEN base.structure_type = 'assembly' AND (:unifiedMode = 1 OR (base.item_kind = 'manufactured' AND base.has_primary_m = 1 AND :purpose = 'manufacturing')) THEN 1
          ELSE 0
        END AS allows_manufacturing,
        CASE
          WHEN base.definition_id IS NOT NULL THEN CASE WHEN NOT :unifiedMode AND base.definition_purpose = 'sales_kit' AND :purpose = 'sales_kit' AND :salesKitEnabled = 1 THEN 1 ELSE 0 END
          WHEN base.structure_type = 'assembly' AND NOT :unifiedMode AND :purpose = 'sales_kit' AND :salesKitEnabled = 1 THEN 1
          ELSE 0
        END AS allows_sales_kit
      FROM candidate_base base
    ), projected_candidates AS (
      SELECT eligibility.*,
        CASE
          WHEN eligibility.record_status IN ('Obsolete','Merged','MainDrawingInvalid') THEN 'none'
          WHEN eligibility.definition_id IS NOT NULL AND NOT :unifiedMode AND eligibility.definition_purpose = 'sales_kit' AND :salesKitEnabled = 0 THEN 'none'
          WHEN eligibility.definition_id IS NOT NULL AND eligibility.open_draft_id IS NULL AND eligibility.released_draft_id IS NULL THEN 'none'
          WHEN eligibility.definition_id IS NOT NULL AND NOT :unifiedMode AND :purpose <> '' AND eligibility.definition_purpose <> :purpose THEN 'none'
          WHEN eligibility.definition_id IS NOT NULL THEN CASE WHEN :canMutate = 1 THEN 'open' ELSE 'none' END
          WHEN eligibility.structure_type <> 'assembly' THEN CASE WHEN :canMutate = 1 THEN 'classify' ELSE 'none' END
          WHEN (eligibility.allows_manufacturing = 1 OR eligibility.allows_sales_kit = 1) AND :canMutate = 1 THEN 'create'
          ELSE 'none'
        END AS projected_action,
        CASE
          WHEN eligibility.record_status IN ('Obsolete','Merged','MainDrawingInvalid') THEN 'BOM_PARENT_INACTIVE'
          WHEN eligibility.definition_id IS NOT NULL AND NOT :unifiedMode AND eligibility.definition_purpose = 'sales_kit' AND :salesKitEnabled = 0 THEN 'BOM_SALES_KIT_DISABLED'
          WHEN eligibility.definition_id IS NOT NULL AND eligibility.open_draft_id IS NULL AND eligibility.released_draft_id IS NULL THEN 'BOM_DEFINITION_STATE_INVALID'
          WHEN eligibility.definition_id IS NOT NULL AND NOT :unifiedMode AND :purpose <> '' AND eligibility.definition_purpose <> :purpose THEN 'BOM_PURPOSE_CONFLICT'
          WHEN eligibility.structure_type = 'assembly' AND eligibility.allows_manufacturing = 0 AND eligibility.allows_sales_kit = 0 AND NOT :unifiedMode AND :purpose = 'manufacturing' THEN 'BOM_ASSEMBLY_REQUIRES_M_DRAWING'
          WHEN eligibility.structure_type = 'assembly' AND eligibility.allows_manufacturing = 0 AND eligibility.allows_sales_kit = 0 AND NOT :unifiedMode THEN 'BOM_PURPOSE_INVALID'
          WHEN :canMutate = 0 THEN 'BOM_CREATE_FORBIDDEN'
          ELSE NULL
        END AS blocker_code,
        CASE
          WHEN eligibility.record_status IN ('Obsolete','Merged','MainDrawingInvalid') OR :canMutate = 0 THEN NULL
          WHEN eligibility.controlled_file_name IS NOT NULL THEN 'assembly_file'
          WHEN eligibility.created_by = :actorId THEN 'created_by_me_recently'
          ELSE 'company_recent'
        END AS reason_code,
        CASE
          WHEN eligibility.record_status IN ('Obsolete','Merged','MainDrawingInvalid') OR :canMutate = 0 THEN NULL
          WHEN eligibility.controlled_file_name IS NOT NULL THEN eligibility.controlled_file_updated_at
          WHEN eligibility.created_by = :actorId THEN eligibility.created_at
          ELSE eligibility.updated_at
        END AS reason_time
      FROM eligibility_projection eligibility
    ), ranked_candidates AS (
      SELECT projected.*,
        CASE
          WHEN LOWER(projected.part_number) = :query THEN 0
          WHEN LOWER(projected.part_number) LIKE :queryPrefix THEN 1
          WHEN LOWER(projected.part_number) LIKE :queryContains THEN 2
          WHEN LOWER(projected.part_name) LIKE :queryContains THEN 3
          ELSE 4
        END AS search_rank,
        LOWER(projected.part_number) AS lower_part_number,
        CASE WHEN projected.reason_code = 'assembly_file' THEN 1 WHEN projected.reason_code = 'created_by_me_recently' THEN 2 WHEN projected.reason_code = 'company_recent' THEN 3 ELSE 9 END AS reason_priority,
        CASE WHEN projected.projected_action <> 'none' AND :canMutate = 1 AND (
          projected.reason_code IN ('assembly_file','created_by_me_recently')
          OR (projected.reason_code = 'company_recent' AND projected.projected_action IN ('create','open'))
        ) THEN 1 ELSE 0 END AS suggestion_eligible
      FROM projected_candidates projected
    )
    SELECT ranked.id, ranked.part_number, ranked.part_name, ranked.item_kind, ranked.structure_type,
      ranked.record_status, ranked.updated_at, ranked.has_primary_m,
      ranked.controlled_file_name, ranked.controlled_file_updated_at,
      ranked.definition_id, ranked.definition_purpose, ranked.open_draft_id, ranked.released_draft_id,
      ranked.canonical_row_key, ranked.allows_manufacturing, ranked.allows_sales_kit,
      ranked.projected_action, ranked.blocker_code, ranked.reason_code, ranked.reason_time,
      ranked.suggestion_eligible, ranked.search_rank, ranked.lower_part_number
    FROM ranked_candidates ranked
    WHERE (
      (:mode = 'exact' AND ranked.id = :exactPartNumberId)
      OR (:mode = 'suggested' AND ranked.suggestion_eligible = 1)
      OR (:mode = 'search' AND (
        :hasCursor = 0
        OR ranked.search_rank > :cursorSearchRank
        OR (ranked.search_rank = :cursorSearchRank AND ranked.lower_part_number > :cursorPartNumberKey)
        OR (ranked.search_rank = :cursorSearchRank AND ranked.lower_part_number = :cursorPartNumberKey AND ranked.id > :cursorPartNumberId)
      ) AND (:query = '' OR LOWER(ranked.part_number) LIKE :queryContains OR LOWER(ranked.part_name) LIKE :queryContains))
    )
    ORDER BY
      CASE WHEN :mode = 'suggested' THEN CASE WHEN ranked.reason_code = 'assembly_file' THEN 1 WHEN ranked.reason_code = 'created_by_me_recently' THEN 2 WHEN ranked.reason_code = 'company_recent' THEN 3 ELSE 9 END ELSE ranked.search_rank END ASC,
      CASE WHEN :mode = 'suggested' THEN ranked.reason_time ELSE NULL END DESC,
      ranked.updated_at DESC,
      ranked.lower_part_number ASC,
      ranked.id ASC
    LIMIT :limit
  `, {
    companyId: input.companyId,
    actorId: input.actorId,
    query,
    queryPrefix: `${query}%`,
    queryContains: `%${query}%`,
    purpose,
    exactPartNumberId,
    salesKitEnabled: salesKitEnabled ? 1 : 0,
    unifiedMode: unifiedMode ? 1 : 0,
    canMutate: canMutate ? 1 : 0,
    mode,
    hasCursor,
    cursorSearchRank: sqlCursorRank,
    cursorPartNumberKey: sqlCursorPartNumber,
    cursorPartNumberId: cursor?.partNumberId ?? "",
    limit: limitWithLookahead
  });
  const visibleRows = mode === "search" ? rows.slice(0, limit) : rows;
  const items = visibleRows.map((row) => {
    const allowedPurposes: BomPurpose[] = [];
    if (Number(row.allows_manufacturing) === 1) allowedPurposes.push("manufacturing");
    if (Number(row.allows_sales_kit) === 1) allowedPurposes.push("sales_kit");
    return {
      partNumberId: row.id,
      partNumber: row.part_number,
      partName: row.part_name,
      itemKind: row.item_kind,
      structureType: row.structure_type,
      allowedPurposes,
      action: row.projected_action,
      definitionId: row.definition_id,
      draftId: row.open_draft_id ?? row.released_draft_id,
      blockerCode: row.blocker_code,
      canonicalRowKey: row.canonical_row_key,
      updatedAt: row.updated_at,
      reason: row.reason_code ? {
        code: row.reason_code,
        label: candidateReasonLabels[row.reason_code],
        fileName: row.reason_code === "assembly_file" ? row.controlled_file_name : null
      } : null
    };
  });
  if (mode === "exact" && items.length === 0) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
  const last = mode === "search" && rows.length > limit ? rows[limit - 1] : null;
  return {
    mode,
    items,
    nextCursor: last ? encodeCandidateCursor({
      v: 1,
      mode: "search",
      companyId: input.companyId,
      query,
      purpose,
      searchRank: Number(last.search_rank),
      partNumberKey: last.lower_part_number,
      partNumberId: last.id
    }) : null
  };
}

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
  bomPurpose?: BomPurpose;
  definitionId?: string;
  baseReleaseSnapshotId?: string;
}): Promise<BomApplicabilityCandidateContract> {
  const bomPurpose = input.bomPurpose;
  if (bomPurpose === "sales_kit") return getSalesKitApplicabilityCandidateContractAsync({ ...input, bomPurpose });
  if (!isAssemblySharedBomV1Enabled() && bomPurpose) throw new SharedBomError("BOM_SHARED_STRUCTURE_DISABLED", 404);
  const client = input.client ?? getAsyncDatabaseClient();
  await assertSharedBomMigrationReadyAsync(client, input.companyId);
  const context = await client.queryOne<{
    id: string; company_id: string; part_root_id: string; part_number: string; part_name: string;
    item_kind: string; structure_type: string; record_status: string; updated_at: string;
  }>("SELECT id, company_id, part_root_id, part_number, part_name, item_kind, structure_type, record_status, updated_at FROM part_numbers WHERE id = :partNumberId AND company_id = :companyId", {
    partNumberId: input.contextPartNumberId, companyId: input.companyId
  });
  if (!context) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
  if (context.structure_type !== "assembly") throw new SharedBomError("BOM_PART_NOT_ASSEMBLY", 422);
  const purposeColumn = await getBomPurposeColumn(client);
  const binding = await client.queryOne<{ definition_id: string; row_version: number | string; purpose?: BomPurpose }>(`
    SELECT binding.definition_id, definition.row_version, ${purposeColumn ? `definition.${purposeColumn}` : "NULL"} AS purpose
    FROM bom_definition_parent_bindings binding JOIN bom_definitions definition ON definition.id = binding.definition_id
    WHERE binding.part_number_id = :partNumberId AND binding.company_id = :companyId AND definition.company_id = :companyId
  `, { partNumberId: context.id, companyId: input.companyId });
  if (input.definitionId && input.definitionId !== binding?.definition_id) {
    throw new SharedBomError("BOM_APPLICABILITY_STALE", 409);
  }
  if (binding) {
    const open = await client.queryOne<{ id: string }>("SELECT id FROM bom_drafts WHERE definition_id = :definitionId AND status IN ('Draft','Rejected','PendingReview','Archived') LIMIT 1", { definitionId: binding.definition_id });
    if (open) throw new SharedBomError("BOM_OPEN_REVISION_EXISTS", 409, { draftId: open.id });
  }
  const base = binding ? await client.queryOne<{ id: string; bom_revision: string }>(`
    SELECT id, bom_revision FROM bom_release_snapshots
    WHERE definition_id = :definitionId AND snapshot_schema_version >= 2 AND obsolete_at IS NULL
    ORDER BY released_at DESC, id DESC LIMIT 1
  `, { definitionId: binding.definition_id }) : null;
  if (input.baseReleaseSnapshotId && input.baseReleaseSnapshotId !== base?.id) {
    throw new SharedBomError("BOM_BASE_RELEASE_STALE", 409);
  }
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
    const blockedReason = ["Obsolete", "Merged", "MainDrawingInvalid"].includes(row.record_status)
        ? "BOM_PARENT_INACTIVE"
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
    purpose: "manufacturing",
    mode,
    definitionId: binding?.definition_id ?? null,
    baseReleaseSnapshotId: base?.id ?? null,
    contextPart: { partNumberId: context.id, partNumber: context.part_number, name: context.part_name },
    candidates,
    suggestedBomRevision,
    selectionEtag
  };
}

async function getSalesKitApplicabilityCandidateContractAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  contextPartNumberId: string;
  bomPurpose: "sales_kit";
}): Promise<BomApplicabilityCandidateContract> {
  const client = input.client ?? getAsyncDatabaseClient();
  if (!isAssemblySharedBomV1Enabled()) throw new SharedBomError("BOM_SHARED_STRUCTURE_DISABLED", 404);
  await assertSalesKitBomMigrationReadyAsync(client, input.companyId);
  const context = await client.queryOne<{
    id: string; part_number: string; part_name: string; custom_specification: string | null;
    structure_type: string; record_status: string; updated_at: string;
  }>(`
    SELECT id, part_number, part_name, custom_specification, structure_type, record_status, updated_at
    FROM part_numbers WHERE id = :partNumberId AND company_id = :companyId
  `, { partNumberId: input.contextPartNumberId, companyId: input.companyId });
  if (!context) throw new SharedBomError("BOM_RESOURCE_NOT_FOUND", 404);
  if (context.structure_type !== "assembly") throw new SharedBomError("BOM_PURPOSE_STRUCTURE_MISMATCH", 422);
  if (["Obsolete", "Merged", "MainDrawingInvalid"].includes(context.record_status)) {
    throw new SharedBomError("BOM_SALES_KIT_PARENT_INACTIVE", 409);
  }
  const purposeColumn = await getBomPurposeColumn(client);
  const binding = await client.queryOne<{ definition_id: string; purpose: BomPurpose; row_version: number | string }>(`
    SELECT binding.definition_id, ${purposeColumn ? `definition.${purposeColumn}` : "'manufacturing'"} AS purpose, definition.row_version
    FROM bom_definition_parent_bindings binding
    JOIN bom_definitions definition ON definition.id = binding.definition_id
    WHERE binding.part_number_id = :partNumberId AND binding.company_id = :companyId AND definition.company_id = :companyId
  `, { partNumberId: context.id, companyId: input.companyId });
  if (binding && binding.purpose !== "sales_kit") throw new SharedBomError("BOM_DEFINITION_PURPOSE_CONFLICT", 409);
  if (binding) {
    const open = await client.queryOne<{ id: string }>(
      "SELECT id FROM bom_drafts WHERE definition_id = :definitionId AND status IN ('Draft','Rejected','PendingReview','Archived') ORDER BY updated_at DESC, id DESC LIMIT 1",
      { definitionId: binding.definition_id }
    );
    if (open) throw new SharedBomError("BOM_OPEN_REVISION_EXISTS", 409, { draftId: open.id });
  }
  const base = binding ? await client.queryOne<{ id: string; bom_revision: string }>(`
    SELECT id, bom_revision FROM bom_release_snapshots
    WHERE definition_id = :definitionId AND snapshot_schema_version >= 2 AND obsolete_at IS NULL
    ORDER BY released_at DESC, id DESC LIMIT 1
  `, { definitionId: binding.definition_id }) : null;
  if (binding && !base) throw new SharedBomError("BOM_APPLICABILITY_CONFLICT", 409);
  const mode = base ? "next_revision" as const : "initial" as const;
  const suggestedBomRevision = base ? String(Number(base.bom_revision) + 1) : "1";
  const candidate = {
    partNumberId: context.id,
    partNumber: context.part_number,
    name: context.part_name,
    specification: context.custom_specification ?? "",
    selected: true,
    selectable: false,
    blockedReason: null,
    rowVersion: context.updated_at
  };
  const etagInput = {
    companyId: input.companyId,
    purpose: input.bomPurpose,
    contextPartNumberId: context.id,
    mode,
    definitionId: binding?.definition_id ?? null,
    definitionRowVersion: Number(binding?.row_version ?? 0),
    baseReleaseSnapshotId: base?.id ?? null,
    candidate: { id: context.id, status: context.record_status, structureType: context.structure_type, updatedAt: context.updated_at }
  };
  return {
    purpose: input.bomPurpose,
    mode,
    definitionId: binding?.definition_id ?? null,
    baseReleaseSnapshotId: base?.id ?? null,
    contextPart: { partNumberId: context.id, partNumber: context.part_number, name: context.part_name },
    candidates: [candidate],
    suggestedBomRevision,
    selectionEtag: `"${canonicalSha256(etagInput).hash}"`
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
    definitionPurpose: null,
    allowedCreatePurposes: [],
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
  if (!isAssemblySharedBomV1Enabled()) return empty();
  const openIssues = await client.queryOne<{ count: number | string }>(
    "SELECT COUNT(*) AS count FROM bom_shared_structure_migration_issues WHERE issue_status = 'open' AND (company_id = :companyId OR company_id IS NULL)",
    { companyId: input.companyId }
  );
  if (Number(openIssues?.count ?? 0) > 0) return empty({
    eligibility: "blocked",
    blocker: { code: "BOM_SHARED_MIGRATION_BLOCKED", message: "共用 BOM 資料尚待處理" }
  });
  const purposeColumn = await getBomPurposeColumn(client);
  const binding = await client.queryOne<{ definition_id: string; purpose: BomPurpose }>(`
    SELECT binding.definition_id, ${purposeColumn ? `definition.${purposeColumn}` : "'manufacturing'"} AS purpose
    FROM bom_definition_parent_bindings binding
    JOIN bom_definitions definition ON definition.id = binding.definition_id
    WHERE binding.part_number_id = :partNumberId AND binding.company_id = :companyId AND definition.company_id = :companyId
  `, { companyId: input.companyId, partNumberId: input.partNumberId });
  // BOM ownership is a property of the canonical Part structure, not of
  // item kind or the presence of a manufacturing drawing.  A purchased
  // assembly and an assembly promoted from SLDPRT are both valid parents.
  const manufacturingEligible = structureType === "assembly";
  const salesKitEligible = false;
  if (binding?.purpose === "sales_kit" && !isSalesKitBomV1Enabled()) {
    return empty({
      eligibility: "blocked",
      definitionId: binding.definition_id,
      definitionPurpose: binding.purpose,
      blocker: { code: "BOM_SALES_KIT_DISABLED", message: "非製造 BOM 功能尚未啟用" }
    });
  }
  if (!binding) {
    const allowedCreatePurposes: BomPurpose[] = manufacturingEligible ? ["manufacturing"] : [];
    if (allowedCreatePurposes.length) return empty({ eligibility: "eligible", action: input.canMutate ? "create_bom" : "none", allowedCreatePurposes });
    return empty({
      eligibility: manufacturingEligible ? "eligible" : "blocked",
      blocker: { code: "BOM_PART_NOT_ASSEMBLY", message: "此料號尚未設定為有下階結構" }
    });
  }
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
    definitionPurpose: binding.purpose,
    applicableParentCount: Number(parentCount?.count ?? 0),
    blocker: { code: "BOM_OPEN_REVISION_CONFLICT", message: "BOM 版次資料存在衝突，請先處理後再繼續" }
  });
  const open = openRows[0] ?? null;
  if (open) return empty({
    eligibility: "eligible",
    action: "open_bom",
    definitionId: binding.definition_id,
    definitionPurpose: binding.purpose,
    draftId: open.id,
    bomRevision: open.bom_revision,
    status: open.status,
    applicableParentCount: Number(parentCount?.count ?? 0)
  });
  const release = await client.queryOne<{ id: string; bom_draft_id: string; bom_revision: string; obsolete_at: string | null }>(`
    SELECT id, bom_draft_id, bom_revision, obsolete_at FROM bom_release_snapshots
    WHERE definition_id = :definitionId AND snapshot_schema_version >= 2
    ORDER BY CASE WHEN obsolete_at IS NULL THEN 0 ELSE 1 END, released_at DESC, id DESC LIMIT 1
  `, { definitionId: binding.definition_id });
  if (release) return empty({
    eligibility: "eligible",
    action: "open_bom",
    definitionId: binding.definition_id,
    definitionPurpose: binding.purpose,
    draftId: release.bom_draft_id,
    releaseSnapshotId: release.id,
    bomRevision: release.bom_revision,
    status: release.obsolete_at ? "Obsolete" : "Released",
    applicableParentCount: Number(parentCount?.count ?? 0)
  });
  return empty({
    eligibility: "blocked",
    definitionId: binding.definition_id,
    definitionPurpose: binding.purpose,
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
