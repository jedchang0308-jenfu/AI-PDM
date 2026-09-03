import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError, canonicalRowKey } from "@/lib/pdm-canonical-workbench-contract";
import { normalizePartChangePayload, validatePartChangePayload, type PartChangePayload } from "@/lib/repositories/part-change-work-async-repository";

export const PART_NUMBER_MATRIX_MAX_COLUMNS = 100;

export type PartMatrixActor = {
  id: string;
  canEditNonOwned: boolean;
  permissions: { create: boolean; update: boolean; submit: boolean };
};

export type PartNumberMatrixColumn = {
  partId: string;
  partNumber: string;
  sequenceNo: number;
  formalRowVersion: number;
  handling: string;
  canEdit: boolean;
  canSubmit: boolean;
  disabledReason: string | null;
  workId: string | null;
  workRowVersion: number | null;
  workOwner: { id: string } | null;
  valueSource: "formal" | "work";
  payload: PartChangePayload;
  formalPayload: PartChangePayload;
  attachmentCount: number;
  confirmedAttributes: Array<{ key: string; label: string; value: string | null; applicabilityState: string }>;
};

export type PartNumberMatrixProjection = {
  root: { id: string; code: string };
  sourcePartId: string;
  sourceRowKey: string;
  columns: PartNumberMatrixColumn[];
};

type SourceGuardRow = {
  source_part_id: string;
  source_root_id: string | null;
  root_id: string | null;
  root_code: string | null;
  source_work_id: string | null;
  source_work_state_id: string | null;
};

type MatrixPartRow = {
  part_id: string;
  part_number: string;
  sequence_no: number | string;
  formal_row_version: number | string | null;
  part_name: string;
  item_kind: PartChangePayload["itemKind"];
  custom_specification: string | null;
  is_universal: number | boolean;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
  variant_note: string | null;
  work_id: string | null;
  work_owner_user_id: string | null;
  work_payload: string | null;
  work_row_version: number | string | null;
  handling: string | null;
  blocker_reason: string | null;
  attachment_count: number | string;
};

type AttributeRow = { part_id: string; key: string; label: string; value: string | null; applicability_state: string };

// These values already have canonical editable cells in PartChangePayload.
// Keeping them out of confirmedAttributes prevents a duplicate "other
// attributes" presentation while preserving dynamic attributes such as heat
// treatment as their own matrix rows.
const LEGACY_ATTRIBUTE_KEYS = new Set(["material", "color", "surface_finish", "surface_treatment", "variant_note"]);

function formalPayload(row: MatrixPartRow): PartChangePayload {
  return validatePartChangePayload({
    partName: row.part_name,
    itemKind: row.item_kind,
    customSpecification: row.custom_specification,
    isUniversal: Boolean(row.is_universal),
    materialCode: row.material_code,
    materialLabel: row.material_label,
    colorCode: row.color_code,
    colorLabel: row.color_label,
    surfaceTreatment: row.surface_treatment,
    variantNote: row.variant_note
  });
}

function parseWorkPayload(value: string | null, baseline: PartChangePayload): PartChangePayload | null {
  if (!value) return null;
  try {
    return normalizePartChangePayload(JSON.parse(value), baseline);
  } catch {
    throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號工作資料格式無效，請重新載入", 409);
  }
}

function handlingReason(handling: string | null, ownerId: string | null, actor: PartMatrixActor) {
  if (!handling || handling === "none") return null;
  if (handling === "owner" && ownerId === actor.id) return null;
  if (handling === "owner" && actor.canEditNonOwned) return null;
  if (handling === "review_owner") return "目前已送審，等待審核";
  if (handling === "system" || handling === "system_admin") return "目前由系統處理";
  if (handling === "blocked") return "目前資料受阻，無法編輯";
  return "目前由其他使用者編輯";
}

export class PartNumberMatrixAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  /**
   * The projection intentionally uses three bounded statements: source/work
   * guard, root columns (including counts and active work), and confirmed
   * attributes.  No attachment bytes or preview derivatives are touched.
   */
  async getMatrix(input: { companyId: string; sourcePartId: string; sourceWorkId: string; actor: PartMatrixActor }): Promise<PartNumberMatrixProjection> {
    const source = await this.client.queryOne<SourceGuardRow>(`
      SELECT source.id AS source_part_id, source.part_root_id AS source_root_id,
             root.id AS root_id, root.root_code AS root_code,
             source_work.id AS source_work_id,
             source_state.id AS source_work_state_id
        FROM part_numbers source
        LEFT JOIN part_roots root ON root.id = source.part_root_id AND root.company_id = source.company_id
        LEFT JOIN part_change_works source_work
          ON source_work.id = :sourceWorkId AND source_work.part_id = source.id AND source_work.company_id = source.company_id
        LEFT JOIN canonical_workbench_states source_state
          ON source_state.company_id = source.company_id
         AND source_state.entity_type = 'part' AND source_state.data_layer = 'part_work'
         AND source_state.canonical_entity_id = source.id AND source_state.work_id = source_work.id
       WHERE source.id = :sourcePartId AND source.company_id = :companyId`, input);
    if (!source) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404);
    if (!source.root_id || !source.source_root_id || source.root_id !== source.source_root_id) {
      throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號缺少有效的圖料根號", 409);
    }
    if (!source.source_work_id) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "修改資料不存在", 404);
    if (!source.source_work_state_id) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "修改資料狀態不完整，請重新載入", 409);

    const rows = await this.client.query<MatrixPartRow>(`
      SELECT part.id AS part_id, part.part_number, part.sequence_no,
             formal_state.row_version AS formal_row_version,
             part.part_name, part.item_kind, part.custom_specification, part.is_universal,
             attributes.material_code, attributes.material_label, attributes.color_code,
             attributes.color_label, attributes.surface_treatment, attributes.variant_note,
             work.id AS work_id, work.owner_user_id AS work_owner_user_id,
             work.proposed_payload AS work_payload, work.row_version AS work_row_version,
             work_state.handling, work_state.blocker_reason,
             (SELECT COUNT(*) FROM file_assets asset
               WHERE asset.linked_entity_type = 'part_number'
                 AND asset.linked_entity_id = part.id AND asset.deleted_at IS NULL) AS attachment_count
        FROM part_numbers part
        JOIN part_roots root ON root.id = part.part_root_id AND root.company_id = part.company_id
        LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
        LEFT JOIN canonical_workbench_states formal_state
          ON formal_state.company_id = part.company_id AND formal_state.entity_type = 'part'
         AND formal_state.canonical_entity_id = part.id AND formal_state.data_layer = 'part_formal'
        LEFT JOIN part_change_works work
          ON work.company_id = part.company_id AND work.part_id = part.id
        LEFT JOIN canonical_workbench_states work_state
          ON work_state.company_id = work.company_id AND work_state.work_id = work.id
         AND work_state.entity_type = 'part' AND work_state.data_layer = 'part_work'
       WHERE part.company_id = :companyId AND part.part_root_id = :rootId
         AND part.record_status NOT IN ('Obsolete', 'Merged', 'Cancelled')
       ORDER BY part.sequence_no, part.part_number, part.id
       LIMIT :limit`, { companyId: input.companyId, rootId: source.root_id, limit: PART_NUMBER_MATRIX_MAX_COLUMNS + 1 });
    if (rows.length > PART_NUMBER_MATRIX_MAX_COLUMNS) {
      throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "同一根號料號超過100筆，請縮小範圍後再編輯", 422);
    }

    const attributes = await this.client.query<AttributeRow>(`
      SELECT value.part_number_id AS part_id, definition.stable_key AS key,
             definition.display_label AS label, value.value_text AS value,
             value.applicability_state
        FROM pdm_part_attribute_values value
        JOIN pdm_attribute_definitions definition
          ON definition.id = value.attribute_definition_id AND definition.company_id = value.company_id
        JOIN part_numbers part ON part.id = value.part_number_id AND part.company_id = value.company_id
       WHERE value.company_id = :companyId AND part.part_root_id = :rootId
       ORDER BY value.part_number_id, definition.display_label, definition.stable_key`, { companyId: input.companyId, rootId: source.root_id });
    const attrsByPart = new Map<string, AttributeRow[]>();
    for (const attribute of attributes) {
      const list = attrsByPart.get(attribute.part_id) ?? [];
      list.push(attribute);
      attrsByPart.set(attribute.part_id, list);
    }

    return {
      root: { id: source.root_id, code: source.root_code ?? "" },
      sourcePartId: source.source_part_id,
      sourceRowKey: canonicalRowKey(source.source_work_state_id),
      columns: rows.map((row) => {
        const formal = formalPayload(row);
        const workPayload = parseWorkPayload(row.work_payload, formal);
        const handling = row.handling ?? (row.work_id ? "owner" : "none");
        const canEdit = !handlingReason(row.handling, row.work_owner_user_id, input.actor)
          ? row.work_id ? (row.work_owner_user_id === input.actor.id || input.actor.canEditNonOwned) : input.actor.permissions.create && input.actor.permissions.update
          : false;
        const effective = workPayload && canEdit ? workPayload : formal;
        const workVisible = Boolean(row.work_id && canEdit);
        const differs = JSON.stringify(effective) !== JSON.stringify(formal);
        return {
          partId: row.part_id,
          partNumber: row.part_number,
          sequenceNo: Number(row.sequence_no),
          formalRowVersion: Number(row.formal_row_version ?? 1),
          handling,
          canEdit,
          canSubmit: Boolean(row.work_id && canEdit && differs && input.actor.permissions.submit),
          disabledReason: canEdit ? null : handlingReason(row.handling, row.work_owner_user_id, input.actor) ?? "目前沒有編輯權限",
          workId: workVisible ? row.work_id : null,
          workRowVersion: workVisible && row.work_row_version != null ? Number(row.work_row_version) : null,
          workOwner: workVisible && row.work_owner_user_id ? { id: row.work_owner_user_id } : null,
          valueSource: workPayload && canEdit ? "work" : "formal",
          payload: effective,
          formalPayload: formal,
          attachmentCount: Number(row.attachment_count ?? 0),
          confirmedAttributes: (attrsByPart.get(row.part_id) ?? [])
            .filter((attribute) => !LEGACY_ATTRIBUTE_KEYS.has(attribute.key))
            .map((attribute) => ({ key: attribute.key, label: attribute.label, value: attribute.value, applicabilityState: attribute.applicability_state }))
        } satisfies PartNumberMatrixColumn;
      })
    };
  }
}
