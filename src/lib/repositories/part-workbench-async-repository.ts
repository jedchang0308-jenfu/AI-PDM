import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { AsyncNumberStateFlowRepository, type NumberingDraftWorkspaceRecord } from "@/lib/repositories/number-state-flow-async-repository";
import { AsyncNumberingRepository } from "@/lib/repositories/numbering-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import type { NumberingRecordStatus, PartModuleDetailRecord, PartModuleListRecord } from "@/lib/repositories/numbering-repository";
import type { NumberSortDirection } from "@/lib/number-sort";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";

const MIN_IDENTITY_PAGE_SIZE = 50;
const MAX_IDENTITY_PAGE_SIZE = 200;

type IdentityRow = {
  row_kind: "candidate_bundle" | "part_master";
  id: string;
  updated_at: string;
  sort_value: string;
  row_key: string;
};

export type PartWorkbenchIdentityCursor = { sortValue: string; rowKey: string; direction?: "after" | "before" };

export type PartWorkbenchRepositoryQuery = {
  companyId: string;
  query: string;
  seriesCode: PdmWorkbenchFilterSelection<string>;
  itemKind: PdmWorkbenchFilterSelection<string>;
  recordStatus: PdmWorkbenchFilterSelection<NumberingRecordStatus>;
  sortDirection: NumberSortDirection;
  direction?: "after" | "before";
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

export class PartWorkbenchAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  private identityPage(
    client: AsyncDatabaseClient,
    input: PartWorkbenchRepositoryQuery,
    cursor: PartWorkbenchIdentityCursor | null,
    scanLimit: number
  ) {
    if (input.seriesCode.mode === "none" || input.itemKind.mode === "none" || input.recordStatus.mode === "none") return [];
    const seriesValues = selectionValues(input.seriesCode);
    const itemKindValues = selectionValues(input.itemKind);
    const recordStatusValues = selectionValues(input.recordStatus);
    const seriesBinding = createNamedList("seriesCode", seriesValues);
    const itemKindBinding = createNamedList("itemKind", itemKindValues);
    const recordStatusBinding = createNamedList("recordStatus", recordStatusValues);
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
    const candidateSeries = input.seriesCode.mode === "some" ? `AND EXISTS (
      SELECT 1 FROM numbering_draft_parts candidate_part
      WHERE candidate_part.workspace_id = w.id
        AND candidate_part.company_id = w.company_id
        AND candidate_part.series_code IN (${seriesBinding.sql})
    )` : "";
    const candidateKind = input.itemKind.mode === "some" ? `AND EXISTS (
      SELECT 1 FROM numbering_draft_parts candidate_part
      WHERE candidate_part.workspace_id = w.id
        AND candidate_part.company_id = w.company_id
        AND candidate_part.item_kind IN (${itemKindBinding.sql})
    )` : "";
    const formalQuery = input.query ? `AND (
      LOWER(p.part_number) LIKE :queryPattern
      OR LOWER(p.part_name) LIKE :queryPattern
      OR LOWER(r.root_code) LIKE :queryPattern
      OR LOWER(r.core_name) LIKE :queryPattern
      OR LOWER(COALESCE(v.material_label, '')) LIKE :queryPattern
      OR LOWER(COALESCE(v.color_label, '')) LIKE :queryPattern
    )` : "";
    const cursorDirection = cursor?.direction ?? input.direction ?? "after";
    const descending = input.sortDirection === "desc";
    const orderDirection = (descending !== (cursorDirection === "before")) ? "DESC" : "ASC";
    const candidateSortValue = `COALESCE(
      (SELECT MIN(reservation.candidate_code)
       FROM numbering_draft_parts candidate_part
       JOIN number_candidate_reservations reservation ON reservation.id = candidate_part.candidate_reservation_id
       WHERE candidate_part.workspace_id = w.id AND candidate_part.company_id = w.company_id),
      (SELECT reservation.candidate_code
       FROM number_candidate_reservations reservation
       WHERE reservation.id = draft_root.candidate_reservation_id),
      '尚未產生料號'
    )`;
    const cursorClause = cursorDirection === "before"
      ? (descending ? `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))` : `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key < :cursorRowKey))`)
      : (descending ? `(:hasCursor = 0 OR sort_value < :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))` : `(:hasCursor = 0 OR sort_value > :cursorSortValue OR (sort_value = :cursorSortValue AND row_key > :cursorRowKey))`);
    return client.query<IdentityRow>(
      `SELECT row_kind, id, updated_at, sort_value, row_key
       FROM (
         SELECT DISTINCT
           'candidate_bundle' AS row_kind,
           w.id AS id,
           w.updated_at AS updated_at,
           ${candidateSortValue} AS sort_value,
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
           p.part_number AS sort_value,
           'part:' || p.id AS row_key
         FROM part_numbers p
         JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
         LEFT JOIN part_variant_attributes v ON v.part_number_id = p.id
         WHERE p.company_id = :companyId
           ${formalQuery}
           ${input.seriesCode.mode === "some" ? `AND p.series_code IN (${seriesBinding.sql})` : ""}
           ${input.itemKind.mode === "some" ? `AND p.item_kind IN (${itemKindBinding.sql})` : ""}
           ${input.recordStatus.mode === "some" ? `AND p.record_status IN (${recordStatusBinding.sql})` : ""}
       ) identity_page
       WHERE ${cursorClause}
       ORDER BY sort_value ${orderDirection}, row_key ASC
       LIMIT :scanLimit`,
      {
        companyId: input.companyId,
        includeCandidates: input.includeCandidates ? 1 : 0,
        queryPattern: searchPattern(input.query),
        ...seriesBinding.params,
        ...itemKindBinding.params,
        ...recordStatusBinding.params,
        hasCursor: cursor ? 1 : 0,
        cursorSortValue: cursor?.sortValue ?? "",
        cursorRowKey: cursor?.rowKey ?? "",
        scanLimit
      }
    );
  }

  async readListPage<T extends { rowKey: string; updatedAt: string }>(
    input: PartWorkbenchRepositoryQuery,
    project: (candidates: NumberingDraftWorkspaceRecord[], parts: PartModuleListRecord[], sourceWorkspaces?: NumberingDraftWorkspaceRecord[]) => T[]
  ): Promise<PartWorkbenchReadPage<T>> {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const stateRepository = new AsyncNumberStateFlowRepository(client);
      const numberingRepository = new AsyncNumberingRepository(client);
      const scanLimit = Math.min(MAX_IDENTITY_PAGE_SIZE, Math.max(MIN_IDENTITY_PAGE_SIZE, input.limit * 4));
      const projectedRows: T[] = [];
      if (input.seriesCode.mode === "none" || input.itemKind.mode === "none" || input.recordStatus.mode === "none") {
        return { rows: [], seriesCodeOptions: await numberingRepository.listSeriesCodeOptions(input.companyId) };
      }
      let scanCursor = input.cursor;
      while (projectedRows.length <= input.limit) {
        const identities = await this.identityPage(client, input, scanCursor, scanLimit);
        if (identities.length === 0) break;
        const canonicalIdentities = input.cursor?.direction === "before" ? [...identities].reverse() : identities;
        const candidateIds = canonicalIdentities.filter((row) => row.row_kind === "candidate_bundle").map((row) => row.id);
        const partIds = canonicalIdentities.filter((row) => row.row_kind === "part_master").map((row) => row.id);
        const [candidates, parts] = await Promise.all([
          stateRepository.getWorkspacesByIds(candidateIds, input.companyId),
          numberingRepository.listPartModuleRecordsByIds(partIds, input.companyId)
        ]);
        const sourcePartIds = parts.map((part) => part.id);
        const sourceWorkspaceRows = sourcePartIds.length === 0 ? [] : await client.query<{ id: string }>(
          `SELECT id FROM numbering_draft_workspaces
           WHERE company_id = :companyId
             AND source_part_number_id IN (${sourcePartIds.map((_, index) => `:sourcePart${index}`).join(", ")})
             AND lifecycle_status NOT IN ('published', 'cancelled', 'merged', 'obsolete')`,
          { companyId: input.companyId, ...Object.fromEntries(sourcePartIds.map((id, index) => [`sourcePart${index}`, id])) }
        );
        const sourceWorkspaces = sourceWorkspaceRows.length === 0
          ? []
          : await stateRepository.getWorkspacesByIds(sourceWorkspaceRows.map((row) => row.id), input.companyId);
        const byKey = new Map<string, T[]>();
        for (const row of project(candidates, parts, sourceWorkspaces)) {
          const baseKey = row.rowKey.replace(/:(?:rd|production)$/u, "");
          byKey.set(baseKey, [...(byKey.get(baseKey) ?? []), row]);
        }
        for (const identity of canonicalIdentities) {
          projectedRows.push(...(byKey.get(identity.row_key) ?? []));
          if (projectedRows.length > input.limit) break;
        }
        const lastIdentity = identities.at(-1);
        if (projectedRows.length > input.limit || identities.length < scanLimit || !lastIdentity) break;
        scanCursor = { sortValue: lastIdentity.sort_value, rowKey: lastIdentity.row_key };
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

  async readSourceWorkspacesForPart(partNumberId: string, companyId: string) {
    return withPdmWorkbenchReadSnapshot(this.client, async (client) => {
      const rows = await client.query<{ id: string }>(
        `SELECT id FROM numbering_draft_workspaces
         WHERE company_id = :companyId AND source_part_number_id = :partNumberId
           AND lifecycle_status NOT IN ('published', 'cancelled', 'merged', 'obsolete')
         ORDER BY updated_at DESC, id DESC`,
        { companyId, partNumberId }
      );
      return new AsyncNumberStateFlowRepository(client).getWorkspacesByIds(rows.map((row) => row.id), companyId);
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
