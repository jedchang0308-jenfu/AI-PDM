import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { NumberingRecordStatus, PartModuleDetailRecord, PartModuleListRecord } from "@/lib/repositories/numbering-repository";

const MIN_IDENTITY_PAGE_SIZE = 50;
const MAX_IDENTITY_PAGE_SIZE = 200;

type IdentityRow = {
  row_kind: "candidate_bundle" | "part_master";
  id: string;
  updated_at: string;
  row_key: string;
};

export type PartWorkbenchIdentityCursor = { updatedAt: string; rowKey: string };

export type PartWorkbenchRepositoryQuery = {
  companyId: string;
  query: string;
  seriesCode: string;
  itemKind: string;
  recordStatus: NumberingRecordStatus | "";
  includeCandidates: boolean;
  cursor: PartWorkbenchIdentityCursor | null;
  limit: number;
};

export type PartWorkbenchReadPage<T> = {
  rows: T[];
  seriesCodeOptions: string[];
};

function searchPattern(value: string) {
  return `%${value.toLocaleLowerCase("zh-Hant")}%`;
}

export class PartWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private identityPage(
    client: AsyncDatabaseClient,
    input: PartWorkbenchRepositoryQuery,
    cursor: PartWorkbenchIdentityCursor | null,
    scanLimit: number
  ) {
    const candidateQuery = input.query ? `AND (
      LOWER(w.id) LIKE :queryPattern
      OR LOWER(COALESCE(draft_root.core_name, source_root.core_name, '')) LIKE :queryPattern
      OR EXISTS (
        SELECT 1 FROM numbering_draft_parts candidate_part
        LEFT JOIN number_candidate_reservations reservation ON reservation.id = candidate_part.candidate_reservation_id
        WHERE candidate_part.workspace_id = w.id
          AND candidate_part.company_id = w.company_id
          AND (LOWER(candidate_part.part_name) LIKE :queryPattern OR LOWER(COALESCE(reservation.candidate_code, '')) LIKE :queryPattern)
      )
    )` : "";
    const candidateSeries = input.seriesCode ? `AND EXISTS (
      SELECT 1 FROM numbering_draft_parts candidate_part
      WHERE candidate_part.workspace_id = w.id
        AND candidate_part.company_id = w.company_id
        AND candidate_part.series_code = :seriesCode
    )` : "";
    const candidateKind = input.itemKind ? `AND EXISTS (
      SELECT 1 FROM numbering_draft_parts candidate_part
      WHERE candidate_part.workspace_id = w.id
        AND candidate_part.company_id = w.company_id
        AND candidate_part.item_kind = :itemKind
    )` : "";
    const formalQuery = input.query ? `AND (
      LOWER(p.part_number) LIKE :queryPattern
      OR LOWER(p.part_name) LIKE :queryPattern
      OR LOWER(r.root_code) LIKE :queryPattern
      OR LOWER(r.core_name) LIKE :queryPattern
      OR LOWER(COALESCE(v.material_label, '')) LIKE :queryPattern
      OR LOWER(COALESCE(v.color_label, '')) LIKE :queryPattern
    )` : "";
    return client.query<IdentityRow>(
      `SELECT row_kind, id, updated_at, row_key
       FROM (
         SELECT DISTINCT
           'candidate_bundle' AS row_kind,
           w.id AS id,
           w.updated_at AS updated_at,
           'candidate:' || w.id AS row_key
         FROM numbering_draft_workspaces w
         LEFT JOIN numbering_draft_roots draft_root ON draft_root.workspace_id = w.id AND draft_root.company_id = w.company_id
         LEFT JOIN part_roots source_root ON source_root.id = w.source_root_id AND source_root.company_id = w.company_id
         WHERE :includeCandidates = 1
           AND w.company_id = :companyId
           AND w.lifecycle_status <> 'published'
           AND EXISTS (SELECT 1 FROM numbering_draft_parts candidate_part WHERE candidate_part.workspace_id = w.id AND candidate_part.company_id = w.company_id)
           ${candidateQuery}
           ${candidateSeries}
           ${candidateKind}
         UNION ALL
         SELECT
           'part_master' AS row_kind,
           p.id AS id,
           p.updated_at AS updated_at,
           'part:' || p.id AS row_key
         FROM part_numbers p
         JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
         LEFT JOIN part_variant_attributes v ON v.part_number_id = p.id
         WHERE p.company_id = :companyId
           ${formalQuery}
           ${input.seriesCode ? "AND p.series_code = :seriesCode" : ""}
           ${input.itemKind ? "AND p.item_kind = :itemKind" : ""}
           ${input.recordStatus ? "AND p.record_status = :recordStatus" : ""}
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
        itemKind: input.itemKind,
        recordStatus: input.recordStatus,
        cursorUpdatedAt: cursor?.updatedAt ?? null,
        cursorRowKey: cursor?.rowKey ?? "",
        scanLimit
      }
    );
  }

  async readListPage<T extends { rowKey: string; updatedAt: string }>(
    input: PartWorkbenchRepositoryQuery,
    project: (candidates: NumberingDraftWorkspaceRecord[], parts: PartModuleListRecord[]) => T[]
  ): Promise<PartWorkbenchReadPage<T>> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const stateRepository = new AsyncNumberStateFlowRepository(client);
      const numberingRepository = new AsyncNumberingRepository(client);
      const scanLimit = Math.min(MAX_IDENTITY_PAGE_SIZE, Math.max(MIN_IDENTITY_PAGE_SIZE, input.limit * 4));
      const projectedRows: T[] = [];
      let scanCursor = input.cursor;
      while (projectedRows.length <= input.limit) {
        const identities = await this.identityPage(client, input, scanCursor, scanLimit);
        if (identities.length === 0) break;
        const candidateIds = identities.filter((row) => row.row_kind === "candidate_bundle").map((row) => row.id);
        const partIds = identities.filter((row) => row.row_kind === "part_master").map((row) => row.id);
        const [candidates, parts] = await Promise.all([
          stateRepository.getWorkspacesByIds(candidateIds, input.companyId),
          numberingRepository.listPartModuleRecordsByIds(partIds, input.companyId)
        ]);
        const byKey = new Map(project(candidates, parts).map((row) => [row.rowKey, row]));
        for (const identity of identities) {
          const row = byKey.get(identity.row_key);
          if (row) projectedRows.push(row);
          if (projectedRows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (projectedRows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { updatedAt: lastIdentity.updated_at, rowKey: lastIdentity.row_key };
      }
      return {
        rows: projectedRows.slice(0, input.limit + 1),
        seriesCodeOptions: await numberingRepository.listSeriesCodeOptions(input.companyId)
      };
    });
  }

  async readCandidateDetail(workspaceId: string, companyId: string) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const workspace = (await new AsyncNumberStateFlowRepository(client).getWorkspacesByIds([workspaceId], companyId))[0] ?? null;
      return workspace && workspace.lifecycleStatus !== "published" && workspace.parts.length > 0 ? workspace : null;
    });
  }

  async readPartDetailById(partNumberId: string, companyId: string): Promise<PartModuleDetailRecord | null> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const repository = new AsyncNumberingRepository(client);
      const summary = (await repository.listPartModuleRecordsByIds([partNumberId], companyId))[0] ?? null;
      return summary ? repository.getPartModuleDetail(summary.partNumber, companyId) : null;
    });
  }

  async readPartDetailByCode(partNumber: string, companyId: string): Promise<PartModuleDetailRecord | null> {
    return withPdmWorkbenchReadSnapshot(this.client, (client) => new AsyncNumberingRepository(client).getPartModuleDetail(partNumber, companyId));
  }
}
