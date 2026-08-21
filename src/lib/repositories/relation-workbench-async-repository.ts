import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { NumberingRecordStatus, NumberingRootDetailRecord, NumberingSearchEntityType } from "@/lib/repositories/numbering-repository";
import type { NumberSortDirection } from "@/lib/number-sort";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";

type IdentityRow = {
  row_kind: "candidate_root" | "formal_root";
  id: string;
  updated_at: string;
  sort_value: string;
  row_key: string;
};

export type RelationWorkbenchIdentityCursor = { sortValue: string; rowKey: string; direction?: "after" | "before" };
export type RelationWorkbenchRepositoryQuery = {
  companyId: string;
  query: string;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  entityType: PdmWorkbenchFilterSelection<NumberingSearchEntityType>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  sortDirection: NumberSortDirection;
  direction?: "after" | "before";
  includeCandidates: boolean;
  includeHistory: boolean;
  cursor: RelationWorkbenchIdentityCursor | null;
  limit: number;
};
export type RelationWorkbenchReadPage<T> = { rows: T[]; seriesCodeOptions: string[] };
export type RelationWorkbenchChangeSource = {
  id: string;
  ownerId: string;
  sourceRootId: string;
  lifecycleStatus: "active" | "cancelled";
  updatedAt: string;
  root: { candidateCode: string | null; coreName: string } | null;
  parts: Array<{ candidateCode: string | null; partName: string }>;
  drawings: Array<{ candidateCode: string | null }>;
  projectedStage: "building" | "drawing_preparation" | "in_review" | "auto_finalizing" | "recovery_required" | "correction_required" | "history_only";
};

function searchPattern(value: string) {
  return `%${value.toLocaleLowerCase("zh-Hant")}%`;
}

function selectionValues<T extends string>(selection: PdmWorkbenchFilterSelection<T>) {
  return selection.mode === "some" ? [...selection.values] : [];
}

function createNamedList(prefix: string, values: string[]) {
  const params: Record<string, string> = {};
  const placeholders = values.map((value, index) => {
    const name = `${prefix}${index}`;
    params[name] = value;
    return `:${name}`;
  });
  return { params, sql: placeholders.join(", ") };
}

function buildPartMasterDataGapMap(root: NumberingRootDetailRecord & { partMasterDataGaps?: Record<string, boolean> }) {
  return new Map(Object.entries(root.partMasterDataGaps ?? {}));
}

export class RelationWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private identityPage(client: AsyncDatabaseClient, input: RelationWorkbenchRepositoryQuery) {
    if (input.seriesCode.mode === "none" || input.entityType.mode === "none" || input.recordStatus.mode === "none") return [];
    const seriesValues = selectionValues(input.seriesCode);
    const recordStatusValues = selectionValues(input.recordStatus);
    const entityValues = selectionValues(input.entityType);
    const seriesBinding = createNamedList("seriesCode", seriesValues);
    const recordStatusBinding = createNamedList("recordStatus", recordStatusValues);
    const formalQuery = input.query ? `AND (
      LOWER(r.root_code) LIKE :queryPattern OR LOWER(r.core_name) LIKE :queryPattern
      OR EXISTS (SELECT 1 FROM part_numbers p WHERE p.part_root_id = r.id AND LOWER(p.part_number) LIKE :queryPattern)
      OR EXISTS (SELECT 1 FROM drawing_numbers d WHERE d.part_root_id = r.id AND LOWER(d.drawing_number) LIKE :queryPattern)
      OR EXISTS (
        SELECT 1 FROM numbering_draft_workspaces w
        LEFT JOIN numbering_draft_parts dp ON dp.workspace_id = w.id AND dp.company_id = w.company_id
        LEFT JOIN number_candidate_reservations reservation ON reservation.workspace_id = w.id AND reservation.company_id = w.company_id
        WHERE w.source_root_id = r.id AND w.company_id = r.company_id AND w.lifecycle_status <> 'published'
          AND (LOWER(COALESCE(dp.part_name, '')) LIKE :queryPattern OR LOWER(COALESCE(reservation.candidate_code, '')) LIKE :queryPattern)
      )
    )` : "";
    const entityFilter = input.entityType.mode !== "some" || entityValues.includes("part_root") ? ""
      : `AND (${entityValues.map((value, index) => value === "part_number"
        ? "EXISTS (SELECT 1 FROM part_numbers p WHERE p.part_root_id = r.id)"
        : `EXISTS (SELECT 1 FROM drawing_numbers d WHERE d.part_root_id = r.id)`).join(" OR ")})`;
    const candidateEntityFilter = input.entityType.mode !== "some" || entityValues.includes("part_root") ? ""
      : `AND (${entityValues.map((value) => value === "part_number"
        ? "EXISTS (SELECT 1 FROM numbering_draft_parts p WHERE p.workspace_id = w.id AND p.company_id = w.company_id)"
        : "EXISTS (SELECT 1 FROM numbering_draft_drawings d WHERE d.workspace_id = w.id AND d.company_id = w.company_id)").join(" OR ")})`;
    const cursorDirection = input.cursor?.direction ?? input.direction ?? "after";
    const descending = input.sortDirection === "desc";
    const orderDirection = (descending !== (cursorDirection === "before")) ? "DESC" : "ASC";
    const candidateSortValue = `COALESCE(
      (SELECT reservation.candidate_code
       FROM number_candidate_reservations reservation
       WHERE reservation.id = draft_root.candidate_reservation_id),
      (SELECT MIN(reservation.candidate_code)
       FROM numbering_draft_drawings draft_drawing
       JOIN number_candidate_reservations reservation ON reservation.id = draft_drawing.candidate_reservation_id
       WHERE draft_drawing.workspace_id = w.id AND draft_drawing.company_id = w.company_id),
      (SELECT MIN(reservation.candidate_code)
       FROM numbering_draft_parts draft_part
       JOIN number_candidate_reservations reservation ON reservation.id = draft_part.candidate_reservation_id
       WHERE draft_part.workspace_id = w.id AND draft_part.company_id = w.company_id),
      '尚未產生編號'
    )`;
    const cursorClause = cursorDirection === "before"
      ? (descending ? `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))` : `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))`)
      : (descending ? `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))` : `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`);
    return client.query<IdentityRow>(
      `SELECT row_kind, id, updated_at, sort_value, row_key
       FROM (
         SELECT
           'formal_root' AS row_kind,
           r.id AS id,
           CASE WHEN (SELECT MAX(w.updated_at) FROM numbering_draft_workspaces w WHERE w.source_root_id = r.id AND w.company_id = r.company_id AND w.lifecycle_status <> 'published') > r.updated_at
             THEN (SELECT MAX(w.updated_at) FROM numbering_draft_workspaces w WHERE w.source_root_id = r.id AND w.company_id = r.company_id AND w.lifecycle_status <> 'published')
             ELSE r.updated_at END AS updated_at,
           r.root_code AS sort_value,
           'root:' || r.id AS row_key
         FROM part_roots r
         WHERE r.company_id = :companyId
           ${formalQuery}
           ${entityFilter}
           ${input.seriesCode.mode === "some" ? `AND EXISTS (SELECT 1 FROM part_numbers p WHERE p.part_root_id = r.id AND p.series_code IN (${seriesBinding.sql}))` : ""}
           ${input.recordStatus.mode === "some" ? `AND (r.record_status IN (${recordStatusBinding.sql}) OR EXISTS (SELECT 1 FROM part_numbers p WHERE p.part_root_id = r.id AND p.record_status IN (${recordStatusBinding.sql})) OR EXISTS (SELECT 1 FROM drawing_numbers d WHERE d.part_root_id = r.id AND d.record_status IN (${recordStatusBinding.sql})))` : ""}
         UNION ALL
         SELECT
           'candidate_root' AS row_kind,
           w.id AS id,
           w.updated_at AS updated_at,
           ${candidateSortValue} AS sort_value,
           'candidate:' || w.id AS row_key
         FROM numbering_draft_workspaces w
         LEFT JOIN numbering_draft_roots draft_root ON draft_root.workspace_id = w.id AND draft_root.company_id = w.company_id
         WHERE :includeCandidates = 1
           AND w.company_id = :companyId
           AND w.source_root_id IS NULL
           AND w.lifecycle_status <> 'published'
           AND (:includeHistory = 1 OR w.lifecycle_status = 'active')
           ${candidateEntityFilter}
           ${input.query ? `AND (
             LOWER(w.id) LIKE :queryPattern OR LOWER(COALESCE(draft_root.core_name, '')) LIKE :queryPattern
             OR EXISTS (SELECT 1 FROM numbering_draft_parts p LEFT JOIN number_candidate_reservations reservation ON reservation.id = p.candidate_reservation_id WHERE p.workspace_id = w.id AND p.company_id = w.company_id AND (LOWER(p.part_name) LIKE :queryPattern OR LOWER(COALESCE(reservation.candidate_code, '')) LIKE :queryPattern))
             OR EXISTS (SELECT 1 FROM numbering_draft_drawings d LEFT JOIN number_candidate_reservations reservation ON reservation.id = d.candidate_reservation_id WHERE d.workspace_id = w.id AND d.company_id = w.company_id AND LOWER(COALESCE(reservation.candidate_code, '')) LIKE :queryPattern)
           )` : ""}
           ${input.seriesCode.mode === "some" ? `AND EXISTS (SELECT 1 FROM numbering_draft_parts p WHERE p.workspace_id = w.id AND p.company_id = w.company_id AND p.series_code IN (${seriesBinding.sql}))` : ""}
       ) identity_page
       WHERE ${cursorClause}
       ORDER BY sort_value ${orderDirection}, row_key ASC
       LIMIT :scanLimit`,
      {
        companyId: input.companyId,
        includeCandidates: input.includeCandidates ? 1 : 0,
        includeHistory: input.includeHistory ? 1 : 0,
        queryPattern: searchPattern(input.query),
        ...seriesBinding.params,
        ...recordStatusBinding.params,
        hasCursor: input.cursor ? 1 : 0,
        cursorSortValue: input.cursor?.sortValue ?? "",
        cursorRowKey: input.cursor?.rowKey ?? "",
        scanLimit: Math.min(240, Math.max(60, input.limit * 4))
      }
    );
  }

  async readListPage<T extends { rowKey: string; updatedAt: string }>(
    input: RelationWorkbenchRepositoryQuery,
    project: (workspaces: NumberingDraftWorkspaceRecord[], roots: NumberingRootDetailRecord[], partMasterDataGaps: ReadonlyMap<string, boolean>, rdRootIds?: ReadonlySet<string>) => T[]
  ): Promise<RelationWorkbenchReadPage<T>> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const numberingRepository = new AsyncNumberingRepository(client);
      const rows: T[] = [];
      if (input.seriesCode.mode === "none" || input.entityType.mode === "none" || input.recordStatus.mode === "none") {
        return { rows: [], seriesCodeOptions: await numberingRepository.listSeriesCodeOptions(input.companyId) };
      }
      const scanLimit = Math.min(240, Math.max(60, input.limit * 4));
      let scanCursor = input.cursor;
      while (rows.length <= input.limit) {
        const identities = await this.identityPage(client, { ...input, cursor: scanCursor });
        if (identities.length === 0) break;
        const canonicalIdentities = input.cursor?.direction === "before" ? [...identities].reverse() : identities;
        const rootIds = canonicalIdentities.filter((row) => row.row_kind === "formal_root").map((row) => row.id);
        const sourceLessWorkspaceIds = canonicalIdentities.filter((row) => row.row_kind === "candidate_root").map((row) => row.id);
        const rootsPromise = numberingRepository.getNumberingRootDetailsByIds(rootIds, input.companyId, { includeAncillary: false, includePartMasterDataGaps: true });
        const sourceWorkspaceRowsPromise = rootIds.length > 0 && input.includeCandidates
          ? client.query<{ id: string }>(
              `SELECT id FROM numbering_draft_workspaces
               WHERE company_id = :companyId AND source_root_id IN (${rootIds.map((_, index) => `:sourceRootId${index}`).join(", ")})
                 AND lifecycle_status <> 'published' AND (:includeHistory = 1 OR lifecycle_status = 'active')
               ORDER BY updated_at DESC, id ASC`,
              {
                companyId: input.companyId,
                includeHistory: input.includeHistory ? 1 : 0,
                ...Object.fromEntries(rootIds.map((id, index) => [`sourceRootId${index}`, id]))
              }
            )
          : Promise.resolve([] as Array<{ id: string }>);
        const [roots, sourceWorkspaceRows] = await Promise.all([rootsPromise, sourceWorkspaceRowsPromise]);
        const rootList = createNamedList("rootId", rootIds);
        const rdRootRows = rootIds.length === 0 ? [] : await client.query<{ root_id: string }>(
          `SELECT DISTINCT drawing.part_root_id AS root_id
             FROM drawing_revisions revision
             JOIN drawings drawing ON drawing.id = revision.drawing_id AND drawing.company_id = revision.company_id
            WHERE revision.company_id = :companyId
              AND drawing.part_root_id IN (${rootList.sql})
              AND revision.lifecycle_state IN ('preparing', 'in_review', 'correction_required', 'rd_controlled')`,
          { companyId: input.companyId, ...rootList.params }
        );
        const rdRootIds = new Set(rdRootRows.map((row) => row.root_id));
        const partMasterDataGaps = new Map(roots.flatMap((root) => [...buildPartMasterDataGapMap(root).entries()]));
        const workspaceIds = [...new Set([...sourceLessWorkspaceIds, ...sourceWorkspaceRows.map((row) => row.id)])];
        const workspaces = input.includeCandidates
          ? await new AsyncNumberStateFlowRepository(client).getWorkspacesByIds(workspaceIds, input.companyId)
          : [];
        const projectedByKey = new Map<string, T[]>();
        for (const row of project(workspaces, roots, partMasterDataGaps, rdRootIds)) {
          const baseKey = row.rowKey.replace(/:(?:rd|production)$/u, "");
          projectedByKey.set(baseKey, [...(projectedByKey.get(baseKey) ?? []), row]);
        }
        for (const identity of canonicalIdentities) {
          for (const row of projectedByKey.get(identity.row_key) ?? []) rows.push({ ...row, updatedAt: identity.updated_at });
          if (rows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (rows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { sortValue: lastIdentity.sort_value, rowKey: lastIdentity.row_key };
      }
      return {
        rows: rows.slice(0, input.limit + 1),
        seriesCodeOptions: await numberingRepository.listSeriesCodeOptions(input.companyId)
      };
    });
  }

  async readRootDetail(rootId: string, companyId: string) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const numberingRepository = new AsyncNumberingRepository(client);
      const root = (await numberingRepository.getNumberingRootDetailsByIds([rootId], companyId, { includePartMasterDataGaps: true }))[0] ?? null;
      if (!root) return null;
      const partMasterDataGaps = buildPartMasterDataGapMap(root);
      type ChangeWorkspaceRow = { id: string; owner_id: string; source_root_id: string; lifecycle_status: "active" | "cancelled"; updated_at: string; root_core_name: string | null; root_candidate_code: string | null };
      type ChangePartRow = { workspace_id: string; part_name: string; candidate_code: string | null };
      type ChangeDrawingRow = { workspace_id: string; candidate_code: string | null };
      type ChangeApprovalRow = { workspace_id: string; request_status: string };
      const workspaceRows = await client.query<ChangeWorkspaceRow>(
        `SELECT w.id, w.owner_id, w.source_root_id, w.lifecycle_status, w.updated_at,
                draft_root.core_name AS root_core_name, root_reservation.candidate_code AS root_candidate_code
         FROM numbering_draft_workspaces w
         LEFT JOIN numbering_draft_roots draft_root ON draft_root.workspace_id = w.id AND draft_root.company_id = w.company_id
         LEFT JOIN number_candidate_reservations root_reservation ON root_reservation.id = draft_root.candidate_reservation_id
         WHERE w.company_id = :companyId AND w.source_root_id = :rootId AND w.lifecycle_status <> 'published'
         ORDER BY w.updated_at DESC, w.id ASC`,
        { companyId, rootId }
      );
      if (workspaceRows.length === 0) return { root, workspaces: [] as RelationWorkbenchChangeSource[], partMasterDataGaps };
      const bindings = { companyId, ...Object.fromEntries(workspaceRows.map((row, index) => [`workspaceId${index}`, row.id])) };
      const placeholders = workspaceRows.map((_, index) => `:workspaceId${index}`).join(", ");
      const [partRows, drawingRows, approvalRows] = await Promise.all([
        client.query<ChangePartRow>(`SELECT part.workspace_id, part.part_name, reservation.candidate_code
          FROM numbering_draft_parts part
          LEFT JOIN number_candidate_reservations reservation ON reservation.id = part.candidate_reservation_id
          WHERE part.company_id = :companyId AND part.workspace_id IN (${placeholders}) ORDER BY part.created_at, part.id`, bindings),
        client.query<ChangeDrawingRow>(`SELECT drawing.workspace_id, reservation.candidate_code
          FROM numbering_draft_drawings drawing
          LEFT JOIN number_candidate_reservations reservation ON reservation.id = drawing.candidate_reservation_id
          WHERE drawing.company_id = :companyId AND drawing.workspace_id IN (${placeholders}) ORDER BY drawing.created_at, drawing.id`, bindings),
        client.query<ChangeApprovalRow>(`SELECT target.target_id AS workspace_id, request.request_status
          FROM approval_platform_requests request
          JOIN approval_platform_targets target ON target.request_id = request.id
          WHERE request.company_id = :companyId
            AND request.action_code IN ('numbering.candidate_bundle_review', 'numbering.candidate_publication_review')
            AND target.target_type = 'numbering_draft_workspace'
            AND target.target_id IN (${placeholders})
          ORDER BY request.requested_at DESC, request.id DESC`, bindings)
      ]);
      const partsByWorkspace = new Map<string, ChangePartRow[]>();
      for (const row of partRows) partsByWorkspace.set(row.workspace_id, [...(partsByWorkspace.get(row.workspace_id) ?? []), row]);
      const drawingsByWorkspace = new Map<string, ChangeDrawingRow[]>();
      for (const row of drawingRows) drawingsByWorkspace.set(row.workspace_id, [...(drawingsByWorkspace.get(row.workspace_id) ?? []), row]);
      const approvalByWorkspace = new Map<string, string>();
      for (const row of approvalRows) if (!approvalByWorkspace.has(row.workspace_id)) approvalByWorkspace.set(row.workspace_id, row.request_status);
      const workspaces: RelationWorkbenchChangeSource[] = workspaceRows.map((row) => {
        const parts = partsByWorkspace.get(row.id) ?? [];
        const drawings = drawingsByWorkspace.get(row.id) ?? [];
        const approval = approvalByWorkspace.get(row.id);
        const projectedStage = row.lifecycle_status === "cancelled" ? "history_only"
          : approval === "pending" ? "in_review"
          : approval === "needs_info" || approval === "rejected" ? "correction_required"
          : approval === "apply_failed" ? "recovery_required"
          : approval === "approved" ? "auto_finalizing"
          : [...parts, ...drawings].some((item) => Boolean(item.candidate_code)) ? "drawing_preparation"
          : "building";
        return {
          id: row.id,
          ownerId: row.owner_id,
          sourceRootId: row.source_root_id,
          lifecycleStatus: row.lifecycle_status,
          updatedAt: row.updated_at,
          root: row.root_core_name ? { candidateCode: row.root_candidate_code, coreName: row.root_core_name } : null,
          parts: parts.map((part) => ({ candidateCode: part.candidate_code, partName: part.part_name })),
          drawings: drawings.map((drawing) => ({ candidateCode: drawing.candidate_code })),
          projectedStage
        };
      });
      return { root, workspaces, partMasterDataGaps };
    });
  }

  async readCandidateDetail(workspaceId: string, companyId: string) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const workspace = (await new AsyncNumberStateFlowRepository(client).getWorkspacesByIds([workspaceId], companyId))[0] ?? null;
      return workspace && workspace.lifecycleStatus !== "published" ? workspace : null;
    });
  }

  async resolveRootByCode(rootCode: string, companyId: string) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const numberingRepository = new AsyncNumberingRepository(client);
      const root = await numberingRepository.getNumberingRootDetail(rootCode, companyId, { includePartMasterDataGaps: true });
      if (!root) return null;
      const partMasterDataGaps = buildPartMasterDataGapMap(root);
      const workspaceRows = await client.query<{ id: string }>(
        `SELECT id FROM numbering_draft_workspaces WHERE company_id = :companyId AND source_root_id = :rootId AND lifecycle_status <> 'published' ORDER BY updated_at DESC, id ASC`,
        { companyId, rootId: root.root.id }
      );
      const workspaces = await new AsyncNumberStateFlowRepository(client).getWorkspacesByIds(workspaceRows.map((row) => row.id), companyId);
      return { root, workspaces, partMasterDataGaps };
    });
  }
}
