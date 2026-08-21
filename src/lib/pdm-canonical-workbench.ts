import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { assertCanonicalDtoHasNoRetiredFields, CanonicalWorkbenchError, normalizeCanonicalWorkbenchQuery, parseCanonicalRowKey, type CanonicalWorkbenchDetailDto, type CanonicalWorkbenchListDto, type WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";
import { projectCanonicalWorkbenchRow, sortCanonicalGroupRows, type CanonicalWorkbenchActor } from "@/lib/pdm-canonical-workbench-state";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { PdmCanonicalWorkbenchAsyncRepository } from "@/lib/repositories/pdm-canonical-workbench-async-repository";

export class PdmCanonicalWorkbenchService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}

  async list(url: URL, entityType: WorkbenchEntityType, actor: CanonicalWorkbenchActor): Promise<CanonicalWorkbenchListDto> {
    const query = normalizeCanonicalWorkbenchQuery(url, entityType);
    const repository = new PdmCanonicalWorkbenchAsyncRepository(this.client);
    const result = await repository.list({ companyId: actor.companyId, entityType, query });
    const response: CanonicalWorkbenchListDto = {
      data: {
        groups: result.groups.map((group) => ({ groupKey: group.groupKey, rows: sortCanonicalGroupRows(group.rows).map((row) => projectCanonicalWorkbenchRow(row, actor)) })),
        nextCursor: result.nextCursor,
        totalGroups: result.totalGroups,
        totalRows: result.totalRows
      },
      meta: {
        contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }),
        correlationId: crypto.randomUUID()
      }
    };
    assertCanonicalDtoHasNoRetiredFields(response);
    return response;
  }

  async detail(rowKey: string, entityType: WorkbenchEntityType, actor: CanonicalWorkbenchActor): Promise<CanonicalWorkbenchDetailDto> {
    const rowId = parseCanonicalRowKey(rowKey);
    const repository = new PdmCanonicalWorkbenchAsyncRepository(this.client);
    const record = await repository.getByRowId({ companyId: actor.companyId, rowId });
    if (!record || record.entityType !== entityType) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "資料不存在", 404);
    const [content, history, relations, attachments] = await Promise.all([
      this.content(record.entityType, actor.companyId, record.canonicalEntityId, record.revisionId),
      record.entityType === "drawing" ? this.drawingHistory(actor.companyId, record.canonicalEntityId) : Promise.resolve([]),
      this.relations(record.entityType, actor.companyId, record.canonicalEntityId),
      record.entityType === "part" ? this.partAttachments(actor.companyId, record.canonicalEntityId) : Promise.resolve(undefined)
    ]);
    const response: CanonicalWorkbenchDetailDto = {
      data: {
        row: projectCanonicalWorkbenchRow(record, actor), content, history, relations,
        ...(attachments ? { attachments, reviewScope: "excluded_live" as const } : {})
      },
      meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() }
    };
    assertCanonicalDtoHasNoRetiredFields(response);
    return response;
  }

  private async content(entityType: WorkbenchEntityType, companyId: string, entityId: string, revisionId: string | null) {
    if (entityType === "drawing") {
      const drawing = await this.client.queryOne(`SELECT id, drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :entityId AND company_id = :companyId`, { companyId, entityId });
      const files = revisionId ? await this.client.query(`SELECT file.id, file.role, file.display_name, file.description, file.sort_order, file.is_primary, asset.file_name, asset.mime_type, asset.file_size FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId AND file.removed_at IS NULL ORDER BY file.sort_order, file.id`, { companyId, revisionId }) : [];
      return { drawing, files };
    }
    if (entityType === "part") return this.client.queryOne(`SELECT id, part_number AS code, part_name, item_kind, is_universal, bom_usage_policy, custom_specification, universal_reason, series_code FROM part_numbers WHERE id = :entityId AND company_id = :companyId`, { companyId, entityId });
    const root = await this.client.queryOne(`SELECT id, root_code AS code, core_name, item_kind FROM part_roots WHERE id = :entityId AND company_id = :companyId`, { companyId, entityId });
    const tree = await this.client.query(`SELECT drawing.id AS drawingId, drawing.drawing_number AS drawingCode, part.id AS partId, part.part_number AS partCode, link.link_type AS linkType FROM drawing_part_links link JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.company_id = :companyId AND drawing.part_root_id = :entityId JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = :companyId AND part.part_root_id = :entityId ORDER BY drawing.drawing_number, part.part_number`, { companyId, entityId });
    return { root, tree };
  }

  private drawingHistory(companyId: string, drawingId: string) {
    return this.client.query(`SELECT revision.revision, CASE WHEN revision.lifecycle_state = 'released' THEN 'production' ELSE 'rd' END AS layer
      FROM drawing_revisions revision
      WHERE revision.company_id = :companyId AND revision.drawing_id = :drawingId
        AND (
          revision.lifecycle_state IN ('released','superseded','rd_controlled')
          OR EXISTS (
            SELECT 1 FROM drawing_rd_branches branch
            WHERE branch.company_id = revision.company_id
              AND branch.drawing_id = revision.drawing_id
              AND branch.latest_approved_revision_id = revision.id
          )
        )
      ORDER BY COALESCE(revision.controlled_at, revision.released_at, revision.updated_at) DESC, revision.id DESC`, { companyId, drawingId });
  }

  private async relations(entityType: WorkbenchEntityType, companyId: string, entityId: string) {
    if (entityType === "drawing") return this.client.query(`SELECT root.id AS rootId, root.root_code AS rootCode, part.id AS partId, part.part_number AS partCode FROM drawings drawing LEFT JOIN part_roots root ON root.id = drawing.part_root_id AND root.company_id = drawing.company_id LEFT JOIN drawing_numbers formal ON formal.id = drawing.formal_drawing_number_id AND formal.company_id = drawing.company_id LEFT JOIN drawing_part_links link ON link.drawing_number_id = formal.id LEFT JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = drawing.company_id WHERE drawing.id = :entityId AND drawing.company_id = :companyId`, { companyId, entityId });
    if (entityType === "part") return this.client.query(`SELECT root.id AS rootId, root.root_code AS rootCode, drawing.id AS drawingId, drawing.drawing_number AS drawingCode FROM part_numbers part JOIN part_roots root ON root.id = part.part_root_id AND root.company_id = part.company_id LEFT JOIN drawing_part_links link ON link.part_number_id = part.id LEFT JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.company_id = part.company_id WHERE part.id = :entityId AND part.company_id = :companyId`, { companyId, entityId });
    return this.client.query(`SELECT drawing.id AS drawingId, drawing.drawing_number AS drawingCode, part.id AS partId, part.part_number AS partCode FROM part_roots root LEFT JOIN drawing_numbers drawing ON drawing.part_root_id = root.id AND drawing.company_id = root.company_id LEFT JOIN drawing_part_links link ON link.drawing_number_id = drawing.id LEFT JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = root.company_id WHERE root.id = :entityId AND root.company_id = :companyId ORDER BY drawing.drawing_number, part.part_number`, { companyId, entityId });
  }

  private async partAttachments(companyId: string, partId: string) {
    return this.client.query(`SELECT asset.id, asset.file_name, asset.mime_type, asset.file_size, asset.document_category, asset.display_name, asset.description, asset.created_at
      FROM file_assets asset JOIN part_numbers part ON part.id = asset.linked_entity_id AND part.company_id = :companyId
      WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :partId AND asset.deleted_at IS NULL
      ORDER BY asset.created_at DESC, asset.id DESC`, { companyId, partId });
  }
}
