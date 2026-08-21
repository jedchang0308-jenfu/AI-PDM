import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { projectEffectiveDrawingRevisionLifecycle } from "@/lib/drawing-revision-effective-lifecycle";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { DrawingModuleListRecord } from "@/lib/repositories/numbering-repository";
import type { DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";
import type { NumberSortDirection } from "@/lib/number-sort";
import { compareRevisionCodes } from "@/lib/revision-policy";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
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
  package_id: string;
  drawing_number_id: string;
  revision: string;
  lifecycle_state: NonNullable<DrawingModuleListRecord["lifecycle"]>["state"];
  active_correction_reason: string | null;
  updated_at: string;
  request_id: string | null;
  submitted_by: string | null;
  workflow_id: string | null;
  requested_at: string | null;
  package_status: string;
  legacy_review_confirmed: number | string | boolean;
};

type LifecycleReviewerRow = { workflow_id: string; reviewer_id: string };
type LifecycleDecisionCountRow = { request_id: string; value: number | string };

export type DrawingWorkbenchIdentityCursor = { sortValue: string; rowKey: string };

export type DrawingWorkbenchRevisionRecord = {
  id: string;
  drawingId: string;
  revision: string;
  lifecycleState: "preparing" | "in_review" | "correction_required" | "rd_controlled" | "released";
  updatedAt: string;
  releasedAt: string | null;
  sourceRevisionPackageId: string | null;
};

export type DrawingWorkbenchReadPage<T> = {
  rows: T[];
  seriesCodeOptions: string[];
  firstIdentity: DrawingWorkbenchIdentityRecord | null;
  lastIdentity: DrawingWorkbenchIdentityRecord | null;
};

export type DrawingWorkbenchRepositoryQuery = {
  companyId: string;
  query: string;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  purposeCode: PdmWorkbenchFilterSelection<DrawingPurposeCode>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  sortDirection: NumberSortDirection;
  includeCandidates: boolean;
  cursor: DrawingWorkbenchIdentityCursor | null;
  direction: "after" | "before";
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

function selectionValues<T extends string>(selection: PdmWorkbenchFilterSelection<T>) {
  return selection.mode === "some" ? [...selection.values] : [];
}

export class DrawingWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private async identityPage(
    client: AsyncDatabaseClient,
    input: DrawingWorkbenchRepositoryQuery,
    cursor: DrawingWorkbenchIdentityCursor | null,
    scanLimit: number
  ) {
    if (input.seriesCode.mode === "none" || input.purposeCode.mode === "none" || input.recordStatus.mode === "none") return [];
    const seriesValues = selectionValues(input.seriesCode);
    const purposeValues = selectionValues(input.purposeCode);
    const recordStatusValues = selectionValues(input.recordStatus);
    const seriesBinding = createNamedList("seriesCode", seriesValues);
    const purposeBinding = createNamedList("purposeCode", purposeValues);
    const recordStatusBinding = createNamedList("recordStatus", recordStatusValues);
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
    const seriesFilter = input.seriesCode.mode === "some"
      ? `AND (
          EXISTS (
            SELECT 1 FROM numbering_draft_parts series_part
            WHERE series_part.workspace_id = canonical.workspace_id
              AND series_part.company_id = canonical.company_id
              AND series_part.series_code IN (${seriesBinding.sql})
          )
          OR EXISTS (
            SELECT 1 FROM part_numbers series_part
            WHERE series_part.company_id = canonical.company_id
              AND series_part.part_root_id = canonical.part_root_id
              AND series_part.series_code IN (${seriesBinding.sql})
          )
        )`
      : "";
    const purposeFilter = input.purposeCode.mode === "some" ? `AND canonical.purpose_code IN (${purposeBinding.sql})` : "";
    const recordStatusFilter = input.recordStatus.mode === "some" ? `AND formal.record_status IN (${recordStatusBinding.sql})` : "";
    const cursorClause = input.direction === "before"
      ? input.sortDirection === "desc"
        ? `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))`
        : `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))`
      : input.sortDirection === "desc"
        ? `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`
        : `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`;
    const orderDirection = input.direction === "before"
      ? input.sortDirection === "desc" ? "ASC" : "DESC"
      : input.sortDirection === "desc" ? "DESC" : "ASC";
    const rowKeyDirection = input.direction === "before" ? "DESC" : "ASC";
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
       ORDER BY sort_value ${orderDirection}, row_key ${rowKeyDirection}
       LIMIT :scanLimit`,
      {
        companyId: input.companyId,
        includeCandidates: input.includeCandidates ? 1 : 0,
        queryPattern: searchPattern(input.query),
        ...seriesBinding.params,
        ...purposeBinding.params,
        ...recordStatusBinding.params,
        hasCursor: cursor ? 1 : 0,
        cursorSortValue: cursor?.sortValue ?? "",
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
      canonicalDrawings: UnifiedDrawingRecord[],
      sourceWorkspaces?: NumberingDraftWorkspaceRecord[],
      revisions?: DrawingWorkbenchRevisionRecord[]
    ) => T[]
  ): Promise<DrawingWorkbenchReadPage<T>> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const stateRepository = new AsyncNumberStateFlowRepository(client);
      const numberingRepository = new AsyncNumberingRepository(client);
      const unifiedDrawingRepository = new UnifiedDrawingAsyncRepository(client);
      const scanLimit = Math.min(MAX_IDENTITY_PAGE_SIZE, Math.max(MIN_IDENTITY_PAGE_SIZE, input.limit * 4));
      const rows: T[] = [];
      if (input.seriesCode.mode === "none" || input.purposeCode.mode === "none" || input.recordStatus.mode === "none") {
        return { rows: [], seriesCodeOptions: await numberingRepository.listSeriesCodeOptions(input.companyId), firstIdentity: null, lastIdentity: null };
      }
      const allIdentityRecords: DrawingWorkbenchIdentityRecord[] = [];
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
        allIdentityRecords.push(...identityRecords);
        const candidateIds = [...new Set(identityRecords.filter((row) => row.sourceKind === "candidate").map((row) => row.workspaceId).filter((id): id is string => Boolean(id)))];
        const drawingIds = identityRecords.filter((row) => row.sourceKind === "formal").map((row) => row.formalDrawingNumberId).filter((id): id is string => Boolean(id));
        const [candidates, drawings, canonicalDrawings] = await Promise.all([
          stateRepository.getWorkspacesByIds(candidateIds, input.companyId),
          numberingRepository.listDrawingModuleRecordsByIds(drawingIds, input.companyId),
          unifiedDrawingRepository.getByIds(identityRecords.map((row) => row.id), input.companyId)
        ]);
        const sourceWorkspaceIds = [...new Set(canonicalDrawings.map((drawing) => drawing.workspaceId).filter((id): id is string => Boolean(id)))];
        const sourceWorkspaces = await stateRepository.getWorkspacesByIds(sourceWorkspaceIds, input.companyId);
        const revisionDrawingIds = [...new Set(canonicalDrawings.map((drawing) => drawing.id))];
        const revisionList = createNamedList("drawingId", revisionDrawingIds);
        const revisions = revisionDrawingIds.length === 0 ? [] : await client.query<{
          id: string;
          drawing_id: string;
          revision: string;
          lifecycle_state: DrawingWorkbenchRevisionRecord["lifecycleState"];
          updated_at: string;
          released_at: string | null;
          source_revision_package_id: string | null;
        }>(
          `SELECT id, drawing_id, revision, lifecycle_state, updated_at, released_at, source_revision_package_id
             FROM drawing_revisions
            WHERE company_id = :companyId
              AND drawing_id IN (${revisionList.sql})
              AND lifecycle_state IN ('preparing', 'in_review', 'correction_required', 'rd_controlled', 'released')
            ORDER BY drawing_id ASC, updated_at DESC, id DESC`,
          { companyId: input.companyId, ...revisionList.params }
        );
        const revisionRecords = revisions.map((revision): DrawingWorkbenchRevisionRecord => ({
          id: revision.id,
          drawingId: revision.drawing_id,
          revision: revision.revision,
          lifecycleState: revision.lifecycle_state,
          updatedAt: revision.updated_at,
          releasedAt: revision.released_at,
          sourceRevisionPackageId: revision.source_revision_package_id
        }));
        const drawingsWithLifecycle = await this.overlayLifecycle(client, drawings, input.companyId);
        const projectedByBaseKey = new Map<string, T[]>();
        for (const row of project(identityRecords, candidates, drawingsWithLifecycle, canonicalDrawings, sourceWorkspaces, revisionRecords)) {
          const baseKey = row.rowKey.replace(/:(?:rd|production)$/u, "");
          projectedByBaseKey.set(baseKey, [...(projectedByBaseKey.get(baseKey) ?? []), row]);
        }
        for (const identity of identities) {
          const projected = projectedByBaseKey.get(identity.row_key) ?? [];
          rows.push(...projected);
          if (rows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (rows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { sortValue: lastIdentity.sort_value, rowKey: lastIdentity.row_key };
      }
      const seriesCodeOptions = await numberingRepository.listSeriesCodeOptions(input.companyId);
      const orderedRows = input.direction === "before" ? rows.reverse() : rows;
      const visibleRows = orderedRows.slice(0, input.limit);
      const identityByKey = new Map(allIdentityRecords.map((identity) => [identity.rowKey, identity]));
      const firstRow = visibleRows[0];
      const lastRow = visibleRows.at(-1);
      const identityForRow = (row: T | undefined) => row ? identityByKey.get(row.rowKey) ?? identityByKey.get(row.rowKey.replace(/:(?:rd|production)$/u, "")) ?? null : null;
      return {
        rows: orderedRows.slice(0, input.limit + 1),
        seriesCodeOptions,
        firstIdentity: identityForRow(firstRow),
        lastIdentity: identityForRow(lastRow)
      };
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

  async readLatestRevision(input: { drawingId: string; companyId: string; lane: "released" | "rd" }) {
    const states = input.lane === "released" ? ["released"] : ["preparing", "in_review", "correction_required", "rd_controlled"];
    const stateList = createNamedList("revisionState", states);
    const rows = await this.client.query<{
      id: string;
      drawing_id: string;
      revision: string;
      lifecycle_state: DrawingWorkbenchRevisionRecord["lifecycleState"];
      updated_at: string;
      released_at: string | null;
      source_revision_package_id: string | null;
    }>(
      `SELECT id, drawing_id, revision, lifecycle_state, updated_at, released_at, source_revision_package_id
         FROM drawing_revisions
        WHERE company_id = :companyId
          AND drawing_id = :drawingId
          AND lifecycle_state IN (${stateList.sql})
        ORDER BY updated_at DESC, id DESC`,
      { companyId: input.companyId, drawingId: input.drawingId, ...stateList.params }
    );
    const sorted = rows.sort((left, right) => {
      try { return compareRevisionCodes(right.revision, left.revision, { allowLegacy: true }); }
      catch { return right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id); }
    });
    const row = sorted[0];
    return row ? {
      id: row.id,
      drawingId: row.drawing_id,
      revision: row.revision,
      lifecycleState: row.lifecycle_state,
      updatedAt: row.updated_at,
      releasedAt: row.released_at,
      sourceRevisionPackageId: row.source_revision_package_id
    } satisfies DrawingWorkbenchRevisionRecord : null;
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
         package.id AS package_id,
         package.drawing_number_id,
         package.revision,
         package.status AS package_status,
         package.lifecycle_state,
         package.active_correction_reason,
         package.updated_at,
         workflow.approval_request_id AS request_id,
         workflow.submitted_by,
         workflow.id AS workflow_id,
         request.requested_at,
         CASE WHEN EXISTS (
           SELECT 1
           FROM drawing_revision_fff_assessments assessment
           JOIN review_confirmation_events confirmation
             ON confirmation.review_id = assessment.id
            AND confirmation.company_id = assessment.company_id
           WHERE assessment.company_id = package.company_id
             AND assessment.submission_id = package.source_submission_id
             AND assessment.drawing_number_id = package.drawing_number_id
             AND assessment.revision = package.revision
             AND confirmation.action IN (
               'confirm_bom_no_revision',
               'confirm_original_part_reuse',
               'approve_replacement_part_and_drawing_release'
             )
         ) THEN 1 ELSE 0 END AS legacy_review_confirmed
       FROM drawing_revision_packages package
       LEFT JOIN drawing_revision_lifecycle_workflows workflow
         ON workflow.package_id = package.id
        AND workflow.state IN ('active', 'finalizing', 'cleanup_pending')
       LEFT JOIN approval_platform_requests request ON request.id = workflow.approval_request_id
       WHERE package.company_id = :companyId
         AND package.drawing_number_id IN (${drawingList.sql})
       ORDER BY package.drawing_number_id ASC, package.updated_at DESC, package.id DESC`,
      { companyId, ...drawingList.params }
    );
    const latestByDrawingId = new Map<string, LifecycleOverlayRow>();
    for (const row of lifecycleRows) {
      const effectiveState = projectEffectiveDrawingRevisionLifecycle({
        revision: row.revision,
        physicalStatus: row.package_status,
        lifecycleState: row.lifecycle_state,
        hasLegacyTerminalConfirmation: row.legacy_review_confirmed === true || Number(row.legacy_review_confirmed) === 1
      });
      if (["cancelled", "superseded"].includes(effectiveState)) continue;
      const projectedRow = { ...row, lifecycle_state: effectiveState as LifecycleOverlayRow["lifecycle_state"] };
      const current = latestByDrawingId.get(row.drawing_number_id);
      if (!current) {
        latestByDrawingId.set(row.drawing_number_id, projectedRow);
        continue;
      }
      let revisionOrder = 0;
      try {
        revisionOrder = compareRevisionCodes(row.revision, current.revision, { allowLegacy: true });
      } catch {
        revisionOrder = row.revision.localeCompare(current.revision, "en");
      }
      if (revisionOrder > 0 || (revisionOrder === 0 && (row.updated_at.localeCompare(current.updated_at) > 0 || (row.updated_at === current.updated_at && row.package_id.localeCompare(current.package_id, "en") > 0)))) {
        latestByDrawingId.set(row.drawing_number_id, projectedRow);
      }
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
