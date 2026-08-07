import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import type { DrawingModuleListRecord } from "@/lib/repositories/numbering-repository";
import type { DrawingPurposeCode, NumberingRecordStatus } from "@/lib/repositories/numbering-repository";

const MIN_IDENTITY_PAGE_SIZE = 50;
const MAX_IDENTITY_PAGE_SIZE = 200;

type IdentityRow = {
  row_kind: "candidate_bundle" | "drawing_master";
  id: string;
  updated_at: string;
  row_key: string;
};

export type DrawingWorkbenchIdentityCursor = {
  updatedAt: string;
  rowKey: string;
};

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
  includeCandidates: boolean;
  cursor: DrawingWorkbenchIdentityCursor | null;
  limit: number;
};

function searchPattern(value: string) {
  return `%${value.toLocaleLowerCase("zh-Hant")}%`;
}

export class DrawingWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private async inReadSnapshot<T>(read: (client: AsyncDatabaseClient) => Promise<T>) {
    return this.client.transaction(async (client) => {
      if (client.kind === "postgres") {
        await client.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      }
      return read(client);
    });
  }

  private async identityPage(
    client: AsyncDatabaseClient,
    input: DrawingWorkbenchRepositoryQuery,
    cursor: DrawingWorkbenchIdentityCursor | null,
    scanLimit: number
  ) {
    const queryFilter = input.query
      ? `AND (
          LOWER(w.id) LIKE :queryPattern
          OR EXISTS (
            SELECT 1 FROM number_candidate_reservations reservation
            WHERE reservation.workspace_id = w.id
              AND reservation.company_id = w.company_id
              AND LOWER(reservation.candidate_code) LIKE :queryPattern
          )
          OR LOWER(COALESCE(draft_root.core_name, source_root.core_name, '')) LIKE :queryPattern
          OR EXISTS (
            SELECT 1 FROM numbering_draft_parts draft_part
            WHERE draft_part.workspace_id = w.id
              AND draft_part.company_id = w.company_id
              AND LOWER(draft_part.part_name) LIKE :queryPattern
          )
        )`
      : "";
    const candidateSeriesFilter = input.seriesCode
      ? `AND EXISTS (
          SELECT 1 FROM numbering_draft_parts series_part
          WHERE series_part.workspace_id = w.id
            AND series_part.company_id = w.company_id
            AND series_part.series_code = :seriesCode
        )`
      : "";
    const drawingQueryFilter = input.query
      ? `AND (
          LOWER(d.id) LIKE :queryPattern
          OR LOWER(d.drawing_number) LIKE :queryPattern
          OR LOWER(r.root_code) LIKE :queryPattern
          OR LOWER(r.core_name) LIKE :queryPattern
          OR EXISTS (
            SELECT 1
            FROM drawing_part_links link
            JOIN part_numbers part ON part.id = link.part_number_id
            WHERE link.drawing_number_id = d.id
              AND LOWER(part.part_number) LIKE :queryPattern
          )
          OR EXISTS (
            SELECT 1 FROM number_candidate_reservations reservation
            WHERE reservation.promoted_master_id = d.id
              AND LOWER(reservation.workspace_id) LIKE :queryPattern
          )
        )`
      : "";
    const drawingSeriesFilter = input.seriesCode
      ? `AND EXISTS (
          SELECT 1 FROM part_numbers series_part
          WHERE series_part.company_id = d.company_id
            AND series_part.part_root_id = d.part_root_id
            AND series_part.series_code = :seriesCode
        )`
      : "";
    const drawingPurposeFilter = input.purposeCode ? "AND d.purpose_code = :purposeCode" : "";
    const drawingRecordStatusFilter = input.recordStatus ? "AND d.record_status = :recordStatus" : "";
    return client.query<IdentityRow>(
      `SELECT row_kind, id, updated_at, row_key
       FROM (
         SELECT DISTINCT
           'candidate_bundle' AS row_kind,
           w.id AS id,
           w.updated_at AS updated_at,
           'candidate:' || w.id AS row_key
         FROM numbering_draft_workspaces w
         LEFT JOIN numbering_draft_roots draft_root
           ON draft_root.workspace_id = w.id AND draft_root.company_id = w.company_id
         LEFT JOIN part_roots source_root
           ON source_root.id = w.source_root_id AND source_root.company_id = w.company_id
         WHERE :includeCandidates = 1
           AND w.company_id = :companyId
           AND w.lifecycle_status <> 'published'
           ${queryFilter}
           ${candidateSeriesFilter}
         UNION ALL
         SELECT
           'drawing_master' AS row_kind,
           d.id AS id,
           d.updated_at AS updated_at,
           'drawing:' || d.id AS row_key
         FROM drawing_numbers d
         JOIN part_roots r ON r.id = d.part_root_id AND r.company_id = d.company_id
         WHERE d.company_id = :companyId
            ${drawingQueryFilter}
            ${drawingSeriesFilter}
            ${drawingPurposeFilter}
            ${drawingRecordStatusFilter}
       ) identity_page
       WHERE (
         :cursorUpdatedAt IS NULL
         OR updated_at < :cursorUpdatedAt
         OR (updated_at = :cursorUpdatedAt AND row_key > :cursorRowKey)
       )
       ORDER BY updated_at DESC, row_key ASC
       LIMIT :scanLimit`,
      {
        companyId: input.companyId,
        includeCandidates: input.includeCandidates ? 1 : 0,
        queryPattern: searchPattern(input.query),
        seriesCode: input.seriesCode,
        purposeCode: input.purposeCode,
        recordStatus: input.recordStatus,
        cursorUpdatedAt: cursor?.updatedAt ?? null,
        cursorRowKey: cursor?.rowKey ?? "",
        scanLimit
      }
    );
  }

  async readListPage<T extends { rowKey: string; updatedAt: string }>(
    input: DrawingWorkbenchRepositoryQuery,
    project: (candidates: NumberingDraftWorkspaceRecord[], drawings: DrawingModuleListRecord[]) => T[]
  ): Promise<DrawingWorkbenchReadPage<T>> {
    return this.inReadSnapshot(async (client) => {
      const stateRepository = new AsyncNumberStateFlowRepository(client);
      const numberingRepository = new AsyncNumberingRepository(client);
      const scanLimit = Math.min(MAX_IDENTITY_PAGE_SIZE, Math.max(MIN_IDENTITY_PAGE_SIZE, input.limit * 4));
      const rows: T[] = [];
      let scanCursor = input.cursor;
      while (rows.length <= input.limit) {
        const identities = await this.identityPage(client, input, scanCursor, scanLimit);
        if (identities.length === 0) break;
        const candidateIds = identities.filter((row) => row.row_kind === "candidate_bundle").map((row) => row.id);
        const drawingIds = identities.filter((row) => row.row_kind === "drawing_master").map((row) => row.id);
        const [candidates, drawings] = await Promise.all([
          stateRepository.getWorkspacesByIds(candidateIds, input.companyId),
          numberingRepository.listDrawingModuleRecordsByIds(drawingIds, input.companyId)
        ]);
        const drawingsWithLifecycle = await this.overlayLifecycle(client, drawings, input.companyId);
        const projected = new Map(project(candidates, drawingsWithLifecycle).map((row) => [row.rowKey, row]));
        for (const identity of identities) {
          const row = projected.get(identity.row_key);
          if (row) rows.push(row);
          if (rows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (rows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { updatedAt: lastIdentity.updated_at, rowKey: lastIdentity.row_key };
      }
      const seriesCodeOptions = await numberingRepository.listSeriesCodeOptions(input.companyId);
      return { rows: rows.slice(0, input.limit + 1), seriesCodeOptions };
    });
  }

  async readCandidateDetail(input: { workspaceId: string; companyId: string }) {
    return this.inReadSnapshot(async (client) => {
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

  async readDrawingDetail(input: { drawingNumberId: string; companyId: string; includeSourceWorkspace: boolean }) {
    return this.inReadSnapshot(async (client) => {
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
    const result: DrawingModuleListRecord[] = [];
    for (const drawing of drawings) {
      const row = await client.queryOne<{
        revision: string;
        lifecycle_state: NonNullable<DrawingModuleListRecord["lifecycle"]>["state"];
        active_correction_reason: string | null;
        updated_at: string;
        request_id: string | null;
        submitted_by: string | null;
        workflow_id: string | null;
        requested_at: string | null;
      }>(
        `SELECT
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
           AND package.drawing_number_id = :drawingNumberId
           AND package.lifecycle_state IS NOT NULL
         ORDER BY package.updated_at DESC, package.id DESC
         LIMIT 1`,
        { companyId, drawingNumberId: drawing.id }
      );
      if (!row) {
        result.push(drawing);
        continue;
      }
      const reviewers = row.workflow_id
        ? await client.query<{ reviewer_id: string }>(
            `SELECT reviewer_id FROM drawing_revision_lifecycle_reviewers
             WHERE workflow_id = :workflowId ORDER BY required_order, reviewer_id`,
            { workflowId: row.workflow_id }
          )
        : [];
      const decisionCount = row.request_id
        ? Number((await client.queryOne<{ value: number | string }>(
            `SELECT COUNT(*) AS value FROM approval_platform_decisions WHERE request_id = :requestId`,
            { requestId: row.request_id }
          ))?.value ?? 0)
        : 0;
      result.push({
        ...drawing,
        lifecycle: {
          state: row.lifecycle_state,
          revision: row.revision,
          requestId: row.request_id,
          submittedBy: row.submitted_by,
          decisionCount,
          reviewerIds: reviewers.map((reviewer) => reviewer.reviewer_id),
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
      });
    }
    return result;
  }
}
