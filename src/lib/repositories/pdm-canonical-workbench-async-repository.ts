import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import type { CanonicalDataLayer, CanonicalDataState, CanonicalHandling, CanonicalLayer, CanonicalWorkbenchQuery, HistoricalCanonicalDataLayer, HistoricalWorkbenchEntityType, WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";
import { deriveDrawingRevisionBasis, type DrawingRevisionBasisState } from "@/lib/drawing-revision-lifecycle-policy";
import { CanonicalWorkbenchError, canonicalGroupKey } from "@/lib/pdm-canonical-workbench-contract";
import type { CanonicalWorkbenchStateRecord } from "@/lib/pdm-canonical-workbench-state";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { CanonicalPreviewDerivativeJobRow, CanonicalPreviewSourceRow } from "@/lib/pdm-canonical-preview";

type IdentityRow = { aggregate_id: string; entity_id: string; code: string; sort_value: string };
type StateRow = {
  id: string;
  aggregate_id: string;
  company_id: string;
  entity_type: HistoricalWorkbenchEntityType;
  canonical_entity_id: string;
  code: string;
  name: string;
  data_layer: HistoricalCanonicalDataLayer;
  branch_id: string | null;
  revision_id: string | null;
  revision: string | null;
  data_state: CanonicalDataState;
  work_id: string | null;
  work_owner_id: string | null;
  review_request_id: string | null;
  reviewer_user_id: string | null;
  handling: CanonicalHandling;
  blocker_reason: string | null;
  row_version: number;
  open_branch_count: number;
  branch_status: "open" | "historical" | null;
  base_production_revision_id: string | null;
  current_production_revision_id: string | null;
  current_production_row_id: string | null;
  updated_at: string | Date;
};

type PreviewSourceDbRow = {
  row_id: string;
  revision_id: string;
  data_layer: "drawing_production" | "drawing_rd";
  review_request_id: string | null;
  binding_id: string;
  asset_id: string;
  role: string;
  display_name: string;
  file_name: string;
  file_ext: string;
  mime_type: string | null;
  content_hash: string | null;
  is_primary: number | boolean;
  sort_order: number | string;
};

type PreviewDerivativeJobDbRow = {
  record_kind: "derivative" | "job";
  id: string | null;
  source_file_asset_id: string;
  source_content_hash: string;
  derivative_kind: string | null;
  storage_key: string | null;
  mime_type: string | null;
  generator_profile: string | null;
  generator_version: string | null;
  status: string;
  created_at: string | null;
  last_heartbeat_at: string | null;
};

const dataLayers: Record<WorkbenchEntityType, Record<CanonicalLayer, CanonicalDataLayer | null>> = {
  drawing: { production: "drawing_production", rd: "drawing_rd", formal: null, work: null },
  part: { production: null, rd: null, formal: "part_formal", work: "part_work" },
};

const canonicalDataStateSql = `CASE
  WHEN state.data_layer IN ('drawing_production', 'part_formal') THEN 'available'
  WHEN EXISTS (
    SELECT 1
      FROM pdm_work_review_requests state_request
     WHERE state_request.company_id = state.company_id
       AND state_request.request_kind = 'drawing_rd_void'
       AND state_request.branch_id = state.branch_id
  ) THEN 'available'
  WHEN state.handling = 'owner' THEN 'editing'
  WHEN state.handling = 'review_owner' THEN 'reviewing'
  WHEN state.handling IN ('system', 'system_admin', 'blocked') THEN 'publishing'
  ELSE 'available'
END`;

function namedList(prefix: string, values: readonly string[]) {
  const params: Record<string, string> = {};
  return {
    sql: values.map((value, index) => {
      const key = `${prefix}${index}`;
      params[key] = value;
      return `:${key}`;
    }).join(", "),
    params
  };
}

function cursorSecret() {
  return process.env.PDM_WORKBENCH_CURSOR_SECRET?.trim() || process.env.PDM_AUTH_SECRET?.trim() || "local-dev087-cursor";
}

function filterHash(input: { companyId: string; entityType: WorkbenchEntityType; query: CanonicalWorkbenchQuery }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    companyId: input.companyId,
    entityType: input.entityType,
    query: input.query.query,
    layers: [...input.query.layers].sort(),
    dataStates: [...input.query.dataStates].sort(),
    handling: [...input.query.handling].sort(),
    purposes: [...input.query.purposes].sort(),
    series: [...input.query.series].sort(),
    itemKinds: [...input.query.itemKinds].sort(),
    materials: [...input.query.materials].sort(),
    colors: [...input.query.colors].sort(),
    sortBy: input.query.sortBy,
    sort: input.query.sort,
    limit: input.query.limit
  })).digest("hex");
}

type Cursor = { version: 3; companyId: string; entityType: WorkbenchEntityType; filterHash: string; sortBy: CanonicalWorkbenchQuery["sortBy"]; sort: "asc" | "desc"; direction: "after" | "before"; sortValue: string; code: string; entityId: string };
function encodeCursor(cursor: Cursor) {
  const encoded = Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
  return `${encoded}.${crypto.createHmac("sha256", cursorSecret()).update(encoded).digest("base64url")}`;
}
function decodeCursor(value: string | null, expected: { companyId: string; entityType: WorkbenchEntityType; filterHash: string; sortBy: CanonicalWorkbenchQuery["sortBy"]; sort: "asc" | "desc" }): Cursor | null {
  if (!value) return null;
  const [encoded, supplied, extra] = value.split(".");
  if (!encoded || !supplied || extra) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "這個清單位置已失效，請從第一頁重新查詢", 400);
  const signature = crypto.createHmac("sha256", cursorSecret()).update(encoded).digest("base64url");
  if (signature.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(supplied))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "這個清單位置已失效，請從第一頁重新查詢", 400);
  }
  let cursor: Cursor;
  try { cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Cursor; }
  catch { throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "這個清單位置已失效，請從第一頁重新查詢", 400); }
  if (cursor.version !== 3 || cursor.companyId !== expected.companyId || cursor.entityType !== expected.entityType || cursor.filterHash !== expected.filterHash || cursor.sortBy !== expected.sortBy || cursor.sort !== expected.sort || (cursor.direction !== "after" && cursor.direction !== "before") || typeof cursor.sortValue !== "string" || !cursor.code || !cursor.entityId) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "篩選條件已改變，請從第一頁重新查詢", 400);
  }
  return cursor;
}

function domainSql(entityType: WorkbenchEntityType) {
  if (entityType === "drawing") return {
    table: "drawings",
    alias: "entity",
    code: "COALESCE(entity.drawing_number, '')",
    name: "COALESCE(root.core_name, '')",
    joins: "LEFT JOIN part_roots root ON root.id = entity.part_root_id AND root.company_id = entity.company_id",
    workOwner: "drawing_work.owner_user_id",
    workJoin: "LEFT JOIN drawing_revision_works drawing_work ON drawing_work.id = state.work_id AND drawing_work.company_id = state.company_id",
    revisionJoin: "LEFT JOIN drawing_revisions revision ON revision.id = state.revision_id AND revision.company_id = state.company_id",
    branchJoin: "LEFT JOIN drawing_rd_branches branch ON branch.id = state.branch_id AND branch.company_id = state.company_id",
    currentProduction: "(SELECT production.revision_id FROM canonical_workbench_states production WHERE production.company_id = state.company_id AND production.entity_type = 'drawing' AND production.canonical_entity_id = state.canonical_entity_id AND production.data_layer = 'drawing_production' LIMIT 1)",
    currentProductionRow: "(SELECT production.id FROM canonical_workbench_states production WHERE production.company_id = state.company_id AND production.entity_type = 'drawing' AND production.canonical_entity_id = state.canonical_entity_id AND production.data_layer = 'drawing_production' LIMIT 1)"
  };
  if (entityType === "part") return {
    table: "part_numbers", alias: "entity", code: "entity.part_number", name: "entity.part_name", joins: "",
    workOwner: "part_work.owner_user_id",
    workJoin: "LEFT JOIN part_change_works part_work ON part_work.id = state.work_id AND part_work.company_id = state.company_id",
    revisionJoin: "LEFT JOIN drawing_revisions revision ON 1 = 0",
    branchJoin: "LEFT JOIN drawing_rd_branches branch ON 1 = 0",
    currentProduction: "NULL",
    currentProductionRow: "NULL"
  };
  throw new CanonicalWorkbenchError("WORKBENCH_COMMAND_CONTRACT_RETIRED", "此工作台已退役，請使用編號搜尋", 410);
}

function domainFilterSql(entityType: WorkbenchEntityType, input: CanonicalWorkbenchQuery) {
  const clauses: string[] = [];
  if (entityType === "drawing") {
    if (input.purposes.length) clauses.push(`entity.purpose_code IN (__PURPOSES__)`);
    if (input.series.length) clauses.push(`EXISTS (SELECT 1 FROM drawing_part_links series_link JOIN part_numbers series_part ON series_part.id = series_link.part_number_id AND series_part.company_id = entity.company_id WHERE series_link.drawing_number_id = entity.formal_drawing_number_id AND series_part.series_code IN (__SERIES__))`);
  } else {
    if (input.series.length) clauses.push(`entity.series_code IN (__SERIES__)`);
    if (input.itemKinds.length) clauses.push(`entity.item_kind IN (__ITEM_KINDS__)`);
    if (input.materials.length) clauses.push(`EXISTS (SELECT 1 FROM part_variant_attributes material_attr WHERE material_attr.part_number_id = entity.id AND (material_attr.material_code IN (__MATERIALS__) OR material_attr.material_label IN (__MATERIALS__)))`);
    if (input.colors.length) clauses.push(`EXISTS (SELECT 1 FROM part_variant_attributes color_attr WHERE color_attr.part_number_id = entity.id AND (color_attr.color_code IN (__COLORS__) OR color_attr.color_label IN (__COLORS__)))`);
  }
  return clauses.length ? clauses.join(" AND ") : "1 = 1";
}

function toRecord(row: StateRow): CanonicalWorkbenchStateRecord {
  const basisState: DrawingRevisionBasisState | null = row.entity_type === "drawing" && (row.data_layer === "drawing_production" || row.data_layer === "drawing_rd")
    ? deriveDrawingRevisionBasis({ dataLayer: row.data_layer, baseProductionRevisionId: row.base_production_revision_id, currentProductionRevisionId: row.current_production_revision_id })
    : null;
  return {
    id: row.id,
    aggregateId: row.aggregate_id,
    companyId: row.company_id,
    entityType: row.entity_type,
    canonicalEntityId: row.canonical_entity_id,
    code: row.code,
    name: row.name,
    dataLayer: row.data_layer,
    branchId: row.branch_id,
    revisionId: row.revision_id,
    revision: row.revision,
    dataState: row.data_state,
    workId: row.work_id,
    workOwnerId: row.work_owner_id,
    reviewRequestId: row.review_request_id,
    reviewerUserId: row.reviewer_user_id,
    handling: row.handling,
    blockerReason: row.blocker_reason,
    rowVersion: Number(row.row_version),
    openBranchCount: Number(row.open_branch_count),
    branchStatus: row.branch_status,
    baseProductionRevisionId: row.base_production_revision_id,
    currentProductionRevisionId: row.current_production_revision_id,
    currentProductionRowId: row.current_production_row_id,
    basisState,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at
  };
}

export class PdmCanonicalWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async list(input: { companyId: string; entityType: WorkbenchEntityType; query: CanonicalWorkbenchQuery }) {
    return withPdmWorkbenchReadSnapshot(this.client, (client) => this.listWithinSnapshot(client, input));
  }

  async listWithinSnapshot(
    client: AsyncDatabaseClient,
    input: { companyId: string; entityType: WorkbenchEntityType; query: CanonicalWorkbenchQuery }
  ) {
      const domain = domainSql(input.entityType);
      const layerValues = input.query.layers.map((layer) => dataLayers[input.entityType][layer]).filter((value): value is CanonicalDataLayer => Boolean(value));
      const layerList = namedList("layer", layerValues);
      const dataStateList = namedList("stage", input.query.dataStates);
      const handlingList = namedList("handling", input.query.handling);
      const purposeList = namedList("purpose", input.query.purposes);
      const seriesList = namedList("series", input.query.series);
      const itemKindList = namedList("itemKind", input.query.itemKinds);
      const materialList = namedList("material", input.query.materials);
      const colorList = namedList("color", input.query.colors);
      const sortExpression = input.query.sortBy === "name" ? domain.name : domain.code;
      const hash = filterHash(input);
      const cursor = decodeCursor(input.query.cursor, { companyId: input.companyId, entityType: input.entityType, filterHash: hash, sortBy: input.query.sortBy, sort: input.query.sort });
      if (cursor) {
        const anchor = await client.queryOne<{ id: string }>(
          `SELECT entity.id
             FROM ${domain.table} entity
             ${domain.joins}
            WHERE entity.company_id = :companyId
              AND entity.id = :cursorEntityId
              AND ${domain.code} = :cursorCode
              AND ${sortExpression} = :cursorSortValue`,
          { companyId: input.companyId, cursorEntityId: cursor.entityId, cursorCode: cursor.code, cursorSortValue: cursor.sortValue }
        );
        if (!anchor) {
          throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "這個清單位置已失效，請從第一頁重新查詢", 400);
        }
      }
      const cursorDirection = cursor?.direction ?? input.query.cursorDirection;
      const before = Boolean(cursor) && cursorDirection === "before";
      const descending = before ? input.query.sort !== "desc" : input.query.sort === "desc";
      const comparator = descending ? "<" : ">";
      const direction = descending ? "DESC" : "ASC";
      const queryPattern = `%${input.query.query.toLocaleLowerCase("zh-Hant")}%`;
      const commonParams = {
        companyId: input.companyId,
        entityType: input.entityType,
        queryPattern,
        hasQuery: input.query.query ? 1 : 0,
        hasCursor: cursor ? 1 : 0,
        cursorSortValue: cursor?.sortValue ?? "",
        cursorCode: cursor?.code ?? "",
        cursorEntityId: cursor?.entityId ?? "",
        ...layerList.params,
        ...dataStateList.params,
        ...handlingList.params
        , ...purposeList.params, ...seriesList.params, ...itemKindList.params, ...materialList.params, ...colorList.params
      };
      if (!layerValues.length || !input.query.dataStates.length || !input.query.handling.length) return { groups: [], nextCursor: null, previousCursor: null, totalGroups: 0, totalRows: 0, previewSources: [], previewDerivativeJobs: [] };
      const domainFilter = domainFilterSql(input.entityType, input.query)
        .replaceAll("__PURPOSES__", purposeList.sql || "NULL")
        .replaceAll("__SERIES__", seriesList.sql || "NULL")
        .replaceAll("__ITEM_KINDS__", itemKindList.sql || "NULL")
        .replaceAll("__MATERIALS__", materialList.sql || "NULL")
        .replaceAll("__COLORS__", colorList.sql || "NULL");
      const match = `state.company_id = :companyId AND state.entity_type = :entityType
        AND state.data_layer IN (${layerList.sql}) AND state.handling IN (${handlingList.sql})
        AND ${canonicalDataStateSql} IN (${dataStateList.sql})
        AND ${domainFilter}
        AND (:hasQuery = 0 OR LOWER(${domain.code}) LIKE :queryPattern OR LOWER(${domain.name}) LIKE :queryPattern)`;
      const identities = await client.query<IdentityRow>(
        `SELECT aggregate.id AS aggregate_id, entity.id AS entity_id, ${domain.code} AS code, ${sortExpression} AS sort_value
           FROM ${domain.table} entity
           JOIN pdm_workbench_aggregates aggregate
             ON aggregate.company_id = entity.company_id AND aggregate.entity_type = :entityType AND aggregate.canonical_entity_id = entity.id
           ${domain.joins}
          WHERE entity.company_id = :companyId
            AND EXISTS (SELECT 1 FROM canonical_workbench_states state WHERE state.canonical_entity_id = entity.id AND ${match})
            AND (:hasCursor = 0
              OR ${sortExpression} ${comparator} :cursorSortValue
              OR (${sortExpression} = :cursorSortValue AND ${domain.code} ${comparator} :cursorCode)
              OR (${sortExpression} = :cursorSortValue AND ${domain.code} = :cursorCode AND entity.id ${comparator} :cursorEntityId))
          ORDER BY ${sortExpression} ${direction}, ${domain.code} ${direction}, entity.id ${direction}
          LIMIT :pageLimit`,
        { ...commonParams, pageLimit: input.query.limit + 1 }
      );
      const page = identities.slice(0, input.query.limit);
      const orderedPage = before ? [...page].reverse() : page;
      if (!orderedPage.length) return { groups: [], nextCursor: null, previousCursor: null, totalGroups: 0, totalRows: 0, previewSources: [], previewDerivativeJobs: [] };
      const entityList = namedList("entityId", orderedPage.map((row) => row.entity_id));
      const rows = await client.query<StateRow>(
        `SELECT state.id, aggregate.id AS aggregate_id, state.company_id, state.entity_type, state.canonical_entity_id,
                ${domain.code} AS code, ${domain.name} AS name, state.data_layer, state.branch_id, state.revision_id,
                revision.revision, ${canonicalDataStateSql} AS data_state, state.work_id, ${domain.workOwner} AS work_owner_id,
                request.id AS review_request_id, request.reviewer_user_id, state.handling, state.blocker_reason,
                 state.row_version, aggregate.open_branch_count, branch.status AS branch_status,
                 branch.base_production_revision_id, ${domain.currentProduction} AS current_production_revision_id,
                 ${domain.currentProductionRow} AS current_production_row_id, state.updated_at
           FROM canonical_workbench_states state
           JOIN pdm_workbench_aggregates aggregate
             ON aggregate.company_id = state.company_id AND aggregate.entity_type = state.entity_type AND aggregate.canonical_entity_id = state.canonical_entity_id
           JOIN ${domain.table} entity ON entity.id = state.canonical_entity_id AND entity.company_id = state.company_id
           ${domain.joins} ${domain.workJoin} ${domain.revisionJoin} ${domain.branchJoin}
           LEFT JOIN pdm_work_review_requests request
             ON request.company_id = state.company_id AND (request.work_id = state.work_id OR (request.request_kind = 'drawing_rd_void' AND request.branch_id = state.branch_id))
          WHERE ${match} AND state.canonical_entity_id IN (${entityList.sql})
          ORDER BY ${sortExpression} ${direction}, ${domain.code} ${direction}, entity.id ${direction}, state.updated_at DESC, state.id`,
        { ...commonParams, ...entityList.params }
      );
      let previewSources: CanonicalPreviewSourceRow[] = [];
      let previewDerivativeJobs: CanonicalPreviewDerivativeJobRow[] = [];
      if (input.entityType === "drawing" && rows.length) {
        const rowList = namedList("previewRow", rows.map((row) => row.id));
        const sources = await client.query<PreviewSourceDbRow>(
          `SELECT state.id AS row_id, state.revision_id, state.data_layer,
                  (SELECT request.id FROM pdm_work_review_requests request
                    WHERE request.company_id = state.company_id
                      AND (request.work_id = state.work_id OR (request.request_kind = 'drawing_rd_void' AND request.branch_id = state.branch_id))
                    ORDER BY request.created_at DESC, request.id DESC LIMIT 1) AS review_request_id,
                  binding.id AS binding_id, asset.id AS asset_id, binding.role, binding.display_name,
                  asset.file_name, asset.file_ext, asset.mime_type, asset.content_hash,
                  binding.is_primary, binding.sort_order
             FROM canonical_workbench_states state
             JOIN drawing_revision_files binding
               ON binding.company_id = state.company_id
              AND binding.drawing_revision_id = state.revision_id
              AND binding.removed_at IS NULL
             JOIN file_assets asset
               ON asset.id = binding.source_file_asset_id
              AND asset.deleted_at IS NULL
            WHERE state.company_id = :companyId
              AND state.entity_type = 'drawing'
              AND state.id IN (${rowList.sql})
            ORDER BY state.id, binding.is_primary DESC, binding.sort_order, binding.id`,
          { companyId: input.companyId, ...rowList.params }
        );
        previewSources = sources.map((row) => ({
          rowId: row.row_id,
          revisionId: row.revision_id,
          dataLayer: row.data_layer,
          reviewRequestId: row.review_request_id,
          bindingId: row.binding_id,
          assetId: row.asset_id,
          role: row.role,
          displayName: row.display_name,
          fileName: row.file_name,
          fileExt: row.file_ext,
          mimeType: row.mime_type ?? "",
          contentHash: row.content_hash ?? "",
          isPrimary: row.is_primary,
          sortOrder: row.sort_order
        }));
        const assetIds = [...new Set(previewSources.map((row) => row.assetId))];
        if (assetIds.length) {
          const assetList = namedList("previewAsset", assetIds);
          const derivativeJobs = await client.query<PreviewDerivativeJobDbRow>(
            `SELECT 'derivative' AS record_kind, id, source_file_asset_id, source_content_hash,
                    derivative_kind, storage_key, mime_type, generator_profile, generator_version,
                    status, created_at, NULL AS last_heartbeat_at
               FROM file_derivatives
              WHERE company_id = :companyId AND source_file_asset_id IN (${assetList.sql})
             UNION ALL
             SELECT 'job' AS record_kind, NULL AS id, source_file_asset_id, source_content_hash,
                    NULL AS derivative_kind, NULL AS storage_key, NULL AS mime_type,
                    NULL AS generator_profile, NULL AS generator_version, status, NULL AS created_at,
                    COALESCE(locked_at, updated_at) AS last_heartbeat_at
               FROM preview_jobs
              WHERE company_id = :companyId AND source_file_asset_id IN (${assetList.sql})
              ORDER BY source_file_asset_id, created_at DESC, last_heartbeat_at DESC`,
            { companyId: input.companyId, ...assetList.params }
          );
          previewDerivativeJobs = derivativeJobs.map((row) => ({
            recordKind: row.record_kind,
            id: row.id,
            sourceFileAssetId: row.source_file_asset_id,
            sourceContentHash: row.source_content_hash,
            derivativeKind: row.derivative_kind,
            storageKey: row.storage_key,
            mimeType: row.mime_type,
            generatorProfile: row.generator_profile,
            generatorVersion: row.generator_version,
            status: row.status,
            createdAt: row.created_at,
            lastHeartbeatAt: row.last_heartbeat_at
          }));
        }
      }
      const count = await client.queryOne<{ total_groups: number | string; total_rows: number | string }>(
        `SELECT COUNT(DISTINCT state.canonical_entity_id) AS total_groups, COUNT(*) AS total_rows
           FROM canonical_workbench_states state
           JOIN ${domain.table} entity ON entity.id = state.canonical_entity_id AND entity.company_id = state.company_id
           ${domain.joins}
          WHERE ${match}`,
        commonParams
      );
      const byAggregate = new Map<string, CanonicalWorkbenchStateRecord[]>();
      rows.map(toRecord).forEach((row) => byAggregate.set(row.aggregateId, [...(byAggregate.get(row.aggregateId) ?? []), row]));
      const groups = orderedPage.map((identity) => ({
        groupKey: canonicalGroupKey(identity.aggregate_id),
        rows: byAggregate.get(identity.aggregate_id) ?? []
      })).filter((group) => group.rows.length > 0);
      const first = orderedPage.at(0);
      const last = orderedPage.at(-1);
      const cursorPayload = (anchor: IdentityRow, direction: "after" | "before") => ({ version: 3 as const, companyId: input.companyId, entityType: input.entityType, filterHash: hash, sortBy: input.query.sortBy, sort: input.query.sort, direction, sortValue: anchor.sort_value, code: anchor.code, entityId: anchor.entity_id });
      return {
        groups,
        nextCursor: last && (before || identities.length > input.query.limit) ? encodeCursor(cursorPayload(last, "after")) : null,
        previousCursor: first && Boolean(cursor) ? encodeCursor(cursorPayload(first, "before")) : null,
        totalGroups: Number(count?.total_groups ?? 0),
        totalRows: Number(count?.total_rows ?? 0),
        previewSources,
        previewDerivativeJobs
      };
  }

  async getByRowId(input: { companyId: string; rowId: string }): Promise<CanonicalWorkbenchStateRecord | null> {
    const state = await this.client.queryOne<{ entity_type: HistoricalWorkbenchEntityType }>(
      `SELECT entity_type FROM canonical_workbench_states WHERE id = :rowId AND company_id = :companyId`, input
    );
    if (!state) return null;
    if (state.entity_type === "relation") return null;
    const domain = domainSql(state.entity_type);
    const row = await this.client.queryOne<StateRow>(
      `SELECT state.id, aggregate.id AS aggregate_id, state.company_id, state.entity_type, state.canonical_entity_id,
              ${domain.code} AS code, ${domain.name} AS name, state.data_layer, state.branch_id, state.revision_id,
              revision.revision, ${canonicalDataStateSql} AS data_state, state.work_id, ${domain.workOwner} AS work_owner_id,
              request.id AS review_request_id, request.reviewer_user_id, state.handling, state.blocker_reason,
               state.row_version, aggregate.open_branch_count, branch.status AS branch_status,
               branch.base_production_revision_id, ${domain.currentProduction} AS current_production_revision_id,
               ${domain.currentProductionRow} AS current_production_row_id, state.updated_at
       FROM canonical_workbench_states state
       JOIN pdm_workbench_aggregates aggregate ON aggregate.company_id = state.company_id AND aggregate.entity_type = state.entity_type AND aggregate.canonical_entity_id = state.canonical_entity_id
       JOIN ${domain.table} entity ON entity.id = state.canonical_entity_id AND entity.company_id = state.company_id
       ${domain.joins} ${domain.workJoin} ${domain.revisionJoin} ${domain.branchJoin}
       LEFT JOIN pdm_work_review_requests request ON request.company_id = state.company_id AND (request.work_id = state.work_id OR (request.request_kind = 'drawing_rd_void' AND request.branch_id = state.branch_id))
       WHERE state.id = :rowId AND state.company_id = :companyId`, input
    );
    return row ? toRecord(row) : null;
  }
}
