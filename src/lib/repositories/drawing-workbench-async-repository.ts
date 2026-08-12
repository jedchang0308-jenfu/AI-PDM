import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { DrawingModuleListRecord } from "@/lib/repositories/numbering-repository";
import type { DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import type { NumberSortDirection } from "@/lib/number-sort";
import {
  UnifiedDrawingAsyncRepository,
  type UnifiedDrawingRecord
} from "@/lib/repositories/unified-drawing-async-repository";

const MIN_IDENTITY_PAGE_SIZE = 50;
const MAX_IDENTITY_PAGE_SIZE = 200;

type IdentityRow = {
  row_kind: "drawing";
  source_kind: "candidate" | "formal";
  id: string;
  workspace_id: string | null;
  formal_drawing_number_id: string | null;
  drawing_draft_id: string | null;
  updated_at: string;
  sort_value: string;
  row_key: string;
};

export type DrawingWorkbenchIdentityRecord = {
  id: string;
  rowKey: string;
  sourceKind: "candidate" | "formal";
  workspaceId: string | null;
  formalDrawingNumberId: string | null;
  drawingDraftId: string | null;
  updatedAt: string;
  sortValue: string;
};

type LifecycleOverlayRow = {
  drawing_number_id: string;
  revision: string;
  lifecycle_state: NonNullable<DrawingModuleListRecord["lifecycle"]>["state"];
  active_correction_reason: string | null;
  updated_at: string;
  request_id: string | null;
  submitted_by: string | null;
  workflow_id: string | null;
  requested_at: string | null;
};

type LifecycleReviewerRow = { workflow_id: string; reviewer_id: string };
type LifecycleDecisionCountRow = { request_id: string; value: number | string };

export type DrawingWorkbenchIdentityCursor = { sortValue: string; rowKey: string };

export type DrawingWorkbenchReadPage<T> = {
  rows: T[];
  seriesCodeOptions: string[];
};

export type DrawingWorkbenchRepositoryQuery = {
  companyId: string;
  query: string;
  seriesCode: string;
  purposeCode: DrawingPurposeCode | "";
  recordStatus: NumberingRecordStatus | "";
  sortDirection: NumberSortDirection;
  includeCandidates: boolean;
  cursor: DrawingWorkbenchIdentityCursor | null;
  limit: number;
};

function searchPattern(value: string) {
  return `%${value.toLocaleLowerCase("zh-Hant")}%`;
}

function createNamedList(prefix: string, values: string[]) {
  const params: Record<string, string> = {};
  const placeholders = values.map((value, index) => {
    const name = `${prefix}${index}`;
    params[name] = value;
    return `:${name}`;
  });
  return { sql: placeholders.join(", "), params };
}

export class DrawingWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private async identityPage(
    client: AsyncDatabaseClient,
    input: DrawingWorkbenchRepositoryQuery,
    cursor: DrawingWorkbenchIdentityCursor | null,
    scanLimit: number
  ) {
    const queryFilter = input.query
      ? `AND (
          LOWER(canonical.id) LIKE :queryPattern
          OR LOWER(COALESCE(canonical.drawing_number, '')) LIKE :queryPattern
          OR LOWER(COALESCE(workspace.id, '')) LIKE :queryPattern
          OR LOWER(COALESCE(draft_root.core_name, source_root.core_name, formal_root.core_name, '')) LIKE :queryPattern
          OR EXISTS (
            SELECT 1 FROM numbering_draft_parts draft_part
            WHERE draft_part.workspace_id = canonical.workspace_id
              AND draft_part.company_id = canonical.company_id
              AND (LOWER(draft_part.part_name) LIKE :queryPattern OR LOWER(COALESCE(draft_part.series_code, '')) LIKE :queryPattern)
          )
          OR EXISTS (
            SELECT 1
            FROM drawing_part_links link
            JOIN part_numbers part ON part.id = link.part_number_id
            WHERE link.drawing_number_id = canonical.formal_drawing_number_id
              AND LOWER(part.part_number) LIKE :queryPattern
          )
        )`
      : "";
    const seriesFilter = input.seriesCode
      ? `AND (
          EXISTS (
            SELECT 1 FROM numbering_draft_parts series_part
            WHERE series_part.workspace_id = canonical.workspace_id
              AND series_part.company_id = canonical.company_id
              AND series_part.series_code = :seriesCode
          )
          OR EXISTS (
            SELECT 1 FROM part_numbers series_part
            WHERE series_part.company_id = canonical.company_id
              AND series_part.part_root_id = canonical.part_root_id
              AND series_part.series_code = :seriesCode
          )
        )`
      : "";
    const purposeFilter = input.purposeCode ? "AND canonical.purpose_code = :purposeCode" : "";
    const recordStatusFilter = input.recordStatus ? "AND formal.record_status = :recordStatus" : "";
    const orderDirection = input.sortDirection === "desc" ? "DESC" : "ASC";
    const cursorClause = input.sortDirection === "desc"
      ? `(:cursorSortValue IS NULL OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`
      : `(:cursorSortValue IS NULL OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`;
    return client.query<IdentityRow>(
      `SELECT row_kind, source_kind, id, workspace_id, formal_drawing_number_id,
              drawing_draft_id, updated_at, sort_value, row_key
       FROM (
         SELECT
           'drawing' AS row_kind,
           CASE WHEN canonical.formal_drawing_number_id IS NULL THEN 'candidate' ELSE 'formal' END AS source_kind,
           canonical.id,
           canonical.workspace_id,
           canonical.formal_drawing_number_id,
           canonical.drawing_draft_id,
           canonical.updated_at,
           COALESCE(canonical.drawing_number, '尚未產生圖號') AS sort_value,
           'drawing:' || canonical.id AS row_key
         FROM drawings canonical
         LEFT JOIN numbering_draft_workspaces workspace
           ON workspace.id = canonical.workspace_id AND workspace.company_id = canonical.company_id
         LEFT JOIN numbering_draft_drawings draft_drawing
           ON draft_drawing.id = canonical.drawing_draft_id AND draft_drawing.company_id = canonical.company_id
         LEFT JOIN numbering_draft_roots draft_root
           ON draft_root.workspace_id = canonical.workspace_id AND draft_root.company_id = canonical.company_id
         LEFT JOIN part_roots source_root
           ON source_root.id = workspace.source_root_id AND source_root.company_id = canonical.company_id
         LEFT JOIN drawing_numbers formal
           ON formal.id = canonical.formal_drawing_number_id AND formal.company_id = canonical.company_id
         LEFT JOIN part_roots formal_root
           ON formal_root.id = canonical.part_root_id AND formal_root.company_id = canonical.company_id
         WHERE canonical.company_id = :companyId
           AND (:includeCandidates = 1 OR canonical.formal_drawing_number_id IS NOT NULL)
           ${queryFilter}
           ${seriesFilter}
           ${purposeFilter}
           ${recordStatusFilter}
       ) identity_page
       WHERE ${cursorClause}
       ORDER BY sort_value ${orderDirection}, row_key ASC
       LIMIT :scanLimit`,
      {
        companyId: input.companyId,
        includeCandidates: input.includeCandidates ? 1 : 0,
        queryPattern: searchPattern(input.query),
        seriesCode: input.seriesCode,
        purposeCode: input.purposeCode,
        recordStatus: input.recordStatus,
        cursorSortValue: cursor?.sortValue ?? null,
        cursorRowKey: cursor?.rowKey ?? "",
        scanLimit
      }
    );
  }

  async readListPage<T extends { rowKey: string; updatedAt: string }>(
    input: DrawingWorkbenchRepositoryQuery,
    project: (
      identities: DrawingWorkbenchIdentityRecord[],
      candidates: NumberingDraftWorkspaceRecord[],
      drawings: DrawingModuleListRecord[],
      canonicalDrawings: UnifiedDrawingRecord[]
    ) => T[]
  ): Promise<DrawingWorkbenchReadPage<T>> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const stateRepository = new AsyncNumberStateFlowRepository(client);
      const numberingRepository = new AsyncNumberingRepository(client);
      const unifiedDrawingRepository = new UnifiedDrawingAsyncRepository(client);
      const scanLimit = Math.min(MAX_IDENTITY_PAGE_SIZE, Math.max(MIN_IDENTITY_PAGE_SIZE, input.limit * 4));
      const rows: T[] = [];
      let scanCursor = input.cursor;
      while (rows.length <= input.limit) {
        const identities = await this.identityPage(client, input, scanCursor, scanLimit);
        if (identities.length === 0) break;
        const identityRecords = identities.map((row): DrawingWorkbenchIdentityRecord => ({
          id: row.id,
          rowKey: row.row_key,
          sourceKind: row.source_kind,
          workspaceId: row.workspace_id,
          formalDrawingNumberId: row.formal_drawing_number_id,
          drawingDraftId: row.drawing_draft_id,
          updatedAt: row.updated_at,
          sortValue: row.sort_value
        }));
        const candidateIds = [...new Set(identityRecords.filter((row) => row.sourceKind === "candidate").map((row) => row.workspaceId).filter((id): id is string => Boolean(id)))];
        const drawingIds = identityRecords.filter((row) => row.sourceKind === "formal").map((row) => row.formalDrawingNumberId).filter((id): id is string => Boolean(id));
        const [candidates, drawings, canonicalDrawings] = await Promise.all([
          stateRepository.getWorkspacesByIds(candidateIds, input.companyId),
          numberingRepository.listDrawingModuleRecordsByIds(drawingIds, input.companyId),
          unifiedDrawingRepository.getByIds(identityRecords.map((row) => row.id), input.companyId)
        ]);
        const drawingsWithLifecycle = await this.overlayLifecycle(client, drawings, input.companyId);
        const projected = new Map(project(identityRecords, candidates, drawingsWithLifecycle, canonicalDrawings).map((row) => [row.rowKey, row]));
        for (const identity of identities) {
          const row = projected.get(identity.row_key);
          if (row) rows.push(row);
          if (rows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (rows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { sortValue: lastIdentity.sort_value, rowKey: lastIdentity.row_key };
      }
      const seriesCodeOptions = await numberingRepository.listSeriesCodeOptions(input.companyId);
      return { rows: rows.slice(0, input.limit + 1), seriesCodeOptions };
    });
  }

  async readCandidateDetail(input: { workspaceId: string; companyId: string }) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const workspace = await new AsyncNumberStateFlowRepository(client)
        .getWorkspace(input.workspaceId, input.companyId)
        .catch((error) => {
          if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND") return null;
          throw error;
        });
      if (!workspace || workspace.lifecycleStatus === "published") return null;
      return workspace;
    });
  }

  async readUnifiedDetail(input: {
    drawingIdOrFormalId: string;
    companyId: string;
    includeSourceWorkspace: boolean;
  }) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const unifiedRepository = new UnifiedDrawingAsyncRepository(client);
      const canonical = await unifiedRepository.findByIdOrFormalId({
        drawingId: input.drawingIdOrFormalId,
        companyId: input.companyId
      });
      if (!canonical) return null;
      if (!canonical.formalDrawingNumberId) {
        if (!canonical.workspaceId) return null;
        const candidate = await new AsyncNumberStateFlowRepository(client)
          .getWorkspace(canonical.workspaceId, input.companyId)
          .catch((error) => {
            if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND") return null;
            throw error;
          });
        if (!candidate) return null;
        return { canonical, candidate, drawing: null, sourceWorkspace: null };
      }

      const drawing = (await new AsyncNumberingRepository(client)
        .listDrawingModuleRecordsByIds([canonical.formalDrawingNumberId], input.companyId))[0] ?? null;
      if (!drawing) return null;
      const drawingWithLifecycle = (await this.overlayLifecycle(client, [drawing], input.companyId))[0] ?? drawing;
      let sourceWorkspace: NumberingDraftWorkspaceRecord | null = null;
      if (input.includeSourceWorkspace && canonical.workspaceId) {
        sourceWorkspace = await new AsyncNumberStateFlowRepository(client)
          .getWorkspace(canonical.workspaceId, input.companyId)
          .catch((error) => {
            if (error instanceof Error && error.message === "WORKSPACE_NOT_FOUND") return null;
            throw error;
          });
      }
      return { canonical, candidate: null, drawing: drawingWithLifecycle, sourceWorkspace };
    });
  }

  async resolveLegacyCandidateDrawing(input: { workspaceId: string; companyId: string }) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      return new UnifiedDrawingAsyncRepository(client).findFirstByWorkspace(input);
    });
  }

  async readDrawingDetail(input: { drawingNumberId: string; companyId: string; includeSourceWorkspace: boolean }) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const drawing = (await new AsyncNumberingRepository(client)
        .listDrawingModuleRecordsByIds([input.drawingNumberId], input.companyId))[0] ?? null;
      if (!drawing) return null;
      const drawingWithLifecycle = (await this.overlayLifecycle(client, [drawing], input.companyId))[0] ?? drawing;
      let sourceWorkspace: NumberingDraftWorkspaceRecord | null = null;
      if (input.includeSourceWorkspace) {
        const source = await client.queryOne<{ workspace_id: string }>(
          `SELECT workspace_id
           FROM number_candidate_reservations
           WHERE company_id = :companyId
             AND promoted_master_type = 'drawing_number'
             AND promoted_master_id = :drawingNumberId
           ORDER BY promoted_at DESC, id DESC
           LIMIT 1`,
          input
        );
        if (source?.workspace_id) {
          sourceWorkspace = await new AsyncNumberStateFlowRepository(client).getWorkspace(source.workspace_id, input.companyId);
        }
      }
      return { drawing: drawingWithLifecycle, sourceWorkspace };
    });
  }

  private async overlayLifecycle(client: AsyncDatabaseClient, drawings: DrawingModuleListRecord[], companyId: string) {
    if (drawings.length === 0) return [];
    const drawingIds = [...new Set(drawings.map((drawing) => drawing.id))];
    const drawingList = createNamedList("drawingId", drawingIds);
    const lifecycleRows = await client.query<LifecycleOverlayRow>(
      `SELECT
         package.drawing_number_id,
         package.revision,
         package.lifecycle_state,
         package.active_correction_reason,
         package.updated_at,
         workflow.approval_request_id AS request_id,
         workflow.submitted_by,
         workflow.id AS workflow_id,
         request.requested_at
       FROM drawing_revision_packages package
       LEFT JOIN drawing_revision_lifecycle_workflows workflow
         ON workflow.package_id = package.id
        AND workflow.state IN ('active', 'finalizing', 'cleanup_pending')
       LEFT JOIN approval_platform_requests request ON request.id = workflow.approval_request_id
       WHERE package.company_id = :companyId
         AND package.drawing_number_id IN (${drawingList.sql})
         AND package.lifecycle_state IS NOT NULL
       ORDER BY package.drawing_number_id ASC, package.updated_at DESC, package.id DESC`,
      { companyId, ...drawingList.params }
    );
    const latestByDrawingId = new Map<string, LifecycleOverlayRow>();
    for (const row of lifecycleRows) {
      if (!latestByDrawingId.has(row.drawing_number_id)) latestByDrawingId.set(row.drawing_number_id, row);
    }

    const workflowIds = [...new Set(lifecycleRows.map((row) => row.workflow_id).filter((id): id is string => Boolean(id)))];
    const reviewerList = createNamedList("workflowId", workflowIds);
    const reviewerRows = workflowIds.length
      ? await client.query<LifecycleReviewerRow>(
          `SELECT workflow_id, reviewer_id
           FROM drawing_revision_lifecycle_reviewers
           WHERE workflow_id IN (${reviewerList.sql})
           ORDER BY workflow_id ASC, required_order ASC, reviewer_id ASC`,
          reviewerList.params
        )
      : [];
    const reviewersByWorkflowId = new Map<string, string[]>();
    for (const reviewer of reviewerRows) {
      const reviewers = reviewersByWorkflowId.get(reviewer.workflow_id) ?? [];
      reviewers.push(reviewer.reviewer_id);
      reviewersByWorkflowId.set(reviewer.workflow_id, reviewers);
    }

    const requestIds = [...new Set(lifecycleRows.map((row) => row.request_id).filter((id): id is string => Boolean(id)))];
    const requestList = createNamedList("requestId", requestIds);
    const decisionRows = requestIds.length
      ? await client.query<LifecycleDecisionCountRow>(
          `SELECT request_id, COUNT(*) AS value
           FROM approval_platform_decisions
           WHERE request_id IN (${requestList.sql})
           GROUP BY request_id`,
          requestList.params
        )
      : [];
    const decisionCountByRequestId = new Map(decisionRows.map((row) => [row.request_id, Number(row.value)]));

    return drawings.map((drawing) => {
      const row = latestByDrawingId.get(drawing.id);
      if (!row) return drawing;
      const reviewerIds = row.workflow_id ? reviewersByWorkflowId.get(row.workflow_id) ?? [] : [];
      const decisionCount = row.request_id ? decisionCountByRequestId.get(row.request_id) ?? 0 : 0;
      return {
        ...drawing,
        lifecycle: {
          state: row.lifecycle_state,
          revision: row.revision,
          requestId: row.request_id,
          submittedBy: row.submitted_by,
          decisionCount,
          reviewerIds,
          correctionReason: row.active_correction_reason
        },
        pendingApproval: row.lifecycle_state === "in_review" && row.request_id
          ? {
              count: 1,
              revisions: [row.revision],
              latestRequestedAt: row.requested_at,
              latestRequestId: row.request_id,
              workbenchHref: `/approvals?requestId=${encodeURIComponent(row.request_id)}&drawing=${encodeURIComponent(drawing.drawingNumber)}`
            }
          : null,
        updatedAt: row.updated_at > drawing.updatedAt ? row.updated_at : drawing.updatedAt
      };
    });
  }
}
