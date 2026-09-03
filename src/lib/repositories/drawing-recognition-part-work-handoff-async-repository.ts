import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { sha256Canonical } from "@/lib/drawing-recognition-contract";
import { DRAWING_RECOGNITION_HANDOFF_MAX_PARTS, type HandoffEligiblePart } from "@/lib/drawing-recognition-part-work-handoff-contract";

export type HandoffScopePart = HandoffEligiblePart & {
  formalRowVersion: number;
  formalPayload: Record<string, unknown>;
  workId: string | null;
  workOwnerId: string | null;
  workHandling: string | null;
  workRowVersion: number | null;
  workPayload: Record<string, unknown> | null;
};

function bool(value: unknown) { return value === true || value === 1 || value === "1"; }
function parse(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null; } catch { return null; }
}

function natural(left: HandoffEligiblePart, right: HandoffEligiblePart) {
  return left.partNumber.localeCompare(right.partNumber, undefined, { numeric: true, sensitivity: "base" }) || left.id.localeCompare(right.id);
}

export class DrawingRecognitionPartWorkHandoffAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async readScope(input: { companyId: string; sessionId: string; lock?: boolean }) {
    const lock = input.lock && this.client.kind === "postgres" ? " FOR UPDATE" : "";
    const session = await this.client.queryOne<{ drawing_id: string | null; source_context_type: "candidate_revision" | "revision_package" | "drawing_revision" | "drawing_number"; source_context_id: string; source_set_fingerprint: string; row_version: number; status: string }>(
      `SELECT drawing_id, source_context_type, source_context_id, source_set_fingerprint, row_version, status FROM drawing_recognition_sessions WHERE id = :sessionId AND company_id = :companyId${lock}`,
      input
    );
    if (!session?.drawing_id) return { session, parts: [] as HandoffScopePart[], relationScopeFingerprint: sha256Canonical([]), relationId: null as string | null };
    const rows = await this.client.query<{
      id: string; part_number: string; part_name: string; part_root_id: string; record_status: string;
      formal_row_version: number | string | null;
      material_code: string | null; material_label: string | null; color_code: string | null; color_label: string | null;
      surface_treatment: string | null; variant_note: string | null; custom_specification: string | null;
      item_kind: string; is_universal: number | boolean; bom_usage_policy: string;
      work_id: string | null; work_owner_id: string | null; work_handling: string | null; work_row_version: number | string | null; work_payload: string | Record<string, unknown> | null;
    }>(
      `SELECT part.id, part.part_number, part.part_name, part.part_root_id, part.record_status,
              formal_state.row_version AS formal_row_version,
              part.custom_specification, part.item_kind, part.is_universal, part.bom_usage_policy,
              attributes.material_code, attributes.material_label, attributes.color_code, attributes.color_label,
              attributes.surface_treatment, attributes.variant_note,
              work.id AS work_id, work.owner_user_id AS work_owner_id, work_state.handling AS work_handling,
              work.row_version AS work_row_version, work.proposed_payload AS work_payload
         FROM drawings drawing
         JOIN drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
              AND link.link_type = 'primary_manufacturing'
         JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = drawing.company_id
         LEFT JOIN canonical_workbench_states formal_state ON formal_state.company_id = part.company_id
              AND formal_state.entity_type = 'part' AND formal_state.canonical_entity_id = part.id AND formal_state.data_layer = 'part_formal'
         LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
         LEFT JOIN part_change_works work ON work.company_id = part.company_id AND work.part_id = part.id
         LEFT JOIN canonical_workbench_states work_state ON work_state.company_id = work.company_id
              AND work_state.work_id = work.id AND work_state.data_layer = 'part_work'
        WHERE drawing.id = :drawingId AND drawing.company_id = :companyId
          AND part.part_root_id = drawing.part_root_id
          AND formal_state.id IS NOT NULL
          AND part.record_status NOT IN ('Obsolete', 'Merged', 'MainDrawingInvalid')
        ORDER BY part.part_number, part.id
        LIMIT ${DRAWING_RECOGNITION_HANDOFF_MAX_PARTS + 1}`,
      { companyId: input.companyId, drawingId: session.drawing_id }
    );
    if (rows.length > DRAWING_RECOGNITION_HANDOFF_MAX_PARTS) {
      return { session, parts: null, relationScopeFingerprint: "limit-exceeded", relationId: session.drawing_id };
    }
    const parts = rows.map((row): HandoffScopePart => ({
      id: row.id, partNumber: row.part_number, partName: row.part_name, partRootId: row.part_root_id,
      formalRowVersion: Number(row.formal_row_version ?? 1),
      formalPayload: {
        partName: row.part_name, itemKind: row.item_kind, customSpecification: row.custom_specification,
        isUniversal: bool(row.is_universal), bomUsagePolicy: row.bom_usage_policy,
        materialCode: row.material_code, materialLabel: row.material_label,
        colorCode: row.color_code, colorLabel: row.color_label,
        surfaceTreatment: row.surface_treatment, variantNote: row.variant_note
      },
      workId: row.work_id, workOwnerId: row.work_owner_id, workHandling: row.work_handling,
      workRowVersion: row.work_row_version === null ? null : Number(row.work_row_version), workPayload: parse(row.work_payload)
    }));
    const relationScopeFingerprint = sha256Canonical({
      drawingId: session.drawing_id,
      parts: parts.map((part) => ({ id: part.id, partNumber: part.partNumber, partRootId: part.partRootId, recordStatus: "current", formalRowVersion: part.formalRowVersion }))
    });
    return { session, parts, relationScopeFingerprint, relationId: session.drawing_id };
  }
}
