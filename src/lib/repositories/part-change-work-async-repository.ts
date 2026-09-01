import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";

export type PartChangePayload = {
  partName: string;
  itemKind: "purchased" | "manufactured";
  customSpecification: string | null;
  isUniversal: boolean;
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
};

type PartRow = {
  id: string; company_id: string; part_name: string; item_kind: PartChangePayload["itemKind"];
  custom_specification: string | null; is_universal: number | boolean;
  updated_at: string | Date;
  material_code: string | null; material_label: string | null; color_code: string | null; color_label: string | null; surface_treatment: string | null; variant_note: string | null;
};
type WorkRow = { id: string; company_id: string; part_id: string; owner_user_id: string; proposed_payload: string | PartChangePayload; base_hash: string; row_version: number };

export function validatePartChangePayload(value: unknown): PartChangePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料格式無效", 400);
  const candidate = value as Record<string, unknown>;
  if ("attachments" in candidate || "attachmentIds" in candidate) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "附件獨立維護，不屬於本次資料修改", 422);
  const allowed = new Set(["partName", "itemKind", "customSpecification", "isUniversal", "materialCode", "materialLabel", "colorCode", "colorLabel", "surfaceTreatment", "variantNote"]);
  if (Object.keys(candidate).some((key) => !allowed.has(key))) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料包含不支援的欄位", 422);
  const itemKinds = new Set(["purchased", "manufactured"]);
  if (typeof candidate.partName !== "string" || !candidate.partName.trim() || !itemKinds.has(String(candidate.itemKind)) || typeof candidate.isUniversal !== "boolean") {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料未通過欄位驗證", 422);
  }
  const nullable = (entry: unknown) => entry === null || entry === undefined ? null : typeof entry === "string" ? entry.trim() || null : null;
  return {
    partName: candidate.partName.trim(), itemKind: candidate.itemKind as PartChangePayload["itemKind"],
    customSpecification: nullable(candidate.customSpecification), isUniversal: candidate.isUniversal,
    materialCode: nullable(candidate.materialCode), materialLabel: nullable(candidate.materialLabel),
    colorCode: nullable(candidate.colorCode), colorLabel: nullable(candidate.colorLabel),
    surfaceTreatment: nullable(candidate.surfaceTreatment), variantNote: nullable(candidate.variantNote)
  };
}

function rowPayload(row: PartRow): PartChangePayload {
  return {
    partName: row.part_name, itemKind: row.item_kind, customSpecification: row.custom_specification,
    isUniversal: Boolean(row.is_universal),
    materialCode: row.material_code, materialLabel: row.material_label, colorCode: row.color_code,
    colorLabel: row.color_label, surfaceTreatment: row.surface_treatment, variantNote: row.variant_note
  };
}
function parsePayload(value: string | PartChangePayload) { return validatePartChangePayload(typeof value === "string" ? JSON.parse(value) : value); }

export class PartChangeWorkAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async readPart(client: AsyncDatabaseClient, companyId: string, partId: string, lock = false) {
    return client.queryOne<PartRow>(
      `SELECT part.id, part.company_id, part.part_name, part.item_kind, part.custom_specification, part.is_universal, part.updated_at,
              attributes.material_code, attributes.material_label, attributes.color_code, attributes.color_label, attributes.surface_treatment, attributes.variant_note
       FROM part_numbers part
       LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
       WHERE part.id = :partId AND part.company_id = :companyId${lock && client.kind === "postgres" ? " FOR UPDATE OF part" : ""}`,
      { companyId, partId }
    );
  }

  async readWork(client: AsyncDatabaseClient, companyId: string, workId: string, lock = false) {
    return client.queryOne<WorkRow>(
      `SELECT id, company_id, part_id, owner_user_id, proposed_payload, base_hash, row_version
       FROM part_change_works WHERE id = :workId AND company_id = :companyId${lock && client.kind === "postgres" ? " FOR UPDATE" : ""}`,
      { companyId, workId }
    );
  }

  async create(tx: AsyncDatabaseClient, input: { companyId: string; partId: string; ownerUserId: string; expectedFormalRowVersion: number }) {
    const part = await this.readPart(tx, input.companyId, input.partId, true);
    if (!part) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號不存在", 404);
    const formal = await tx.queryOne<{ row_version: number }>(
      `SELECT row_version FROM canonical_workbench_states WHERE company_id = :companyId AND entity_type = 'part' AND canonical_entity_id = :partId AND data_layer = 'part_formal'${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (!formal || Number(formal.row_version) !== input.expectedFormalRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    if (await tx.queryOne(`SELECT id FROM part_change_works WHERE company_id = :companyId AND part_id = :partId`, input)) {
      throw new CanonicalWorkbenchError("WORKBENCH_ACTIVE_WORK_EXISTS", "開啟既有工作資料", 409);
    }
    const payload = rowPayload(part);
    const workId = crypto.randomUUID();
    await tx.execute(
      `INSERT INTO part_change_works (id, company_id, part_id, owner_user_id, proposed_payload, base_formal_row_version, base_hash, row_version)
       VALUES (:id, :companyId, :partId, :ownerUserId, :payload, :baseVersion, :baseHash, 1)`,
      { id: workId, companyId: input.companyId, partId: input.partId, ownerUserId: input.ownerUserId, payload: JSON.stringify(payload), baseVersion: input.expectedFormalRowVersion, baseHash: dev087RequestHash(payload) }
    );
    const stateId = crypto.randomUUID();
    await tx.execute(
      `INSERT INTO canonical_workbench_states (id, company_id, entity_type, canonical_entity_id, data_layer, work_id, handling, row_version)
       VALUES (:id, :companyId, 'part', :partId, 'part_work', :workId, 'owner', 1)`,
      { id: stateId, companyId: input.companyId, partId: input.partId, workId }
    );
    return { workId, rowId: stateId, rowVersion: 1, payload };
  }

  async update(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number; payload: PartChangePayload }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const state = await tx.queryOne<{ handling: string }>(
      `SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前資料不可編輯", 409);
    await tx.execute(
      `UPDATE part_change_works SET proposed_payload = :payload, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`,
      { ...input, payload: JSON.stringify(input.payload) }
    );
    await tx.execute(
      `UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = :companyId AND work_id = :workId`, input
    );
    return { workId: input.workId, rowVersion: input.expectedRowVersion + 1, payload: input.payload };
  }

  async cancel(tx: AsyncDatabaseClient, input: { companyId: string; workId: string; expectedRowVersion: number }) {
    const work = await this.readWork(tx, input.companyId, input.workId, true);
    if (!work || Number(work.row_version) !== input.expectedRowVersion) throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "重新讀取目前資料", 409);
    const state = await tx.queryOne<{ handling: string }>(`SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`, input);
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前資料不可取消", 409);
    await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId`, input);
    await tx.execute(`DELETE FROM part_change_works WHERE company_id = :companyId AND id = :workId`, input);
    return { cancelled: true };
  }

  async formalize(tx: AsyncDatabaseClient, input: { companyId: string; work: WorkRow; reviewCycleId: string }) {
    const part = await this.readPart(tx, input.companyId, input.work.part_id, true);
    if (!part) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "資料已改變，請退回修改後重新送審", 409);
    const before = rowPayload(part);
    const after = parsePayload(input.work.proposed_payload);
    const snapshotId = crypto.randomUUID();
    const contentHash = dev087RequestHash({ reviewCycleId: input.reviewCycleId, before, after });
    await tx.execute(
      `INSERT INTO part_approved_change_snapshots (id, company_id, part_id, before_payload, after_payload, content_hash, formalized_at)
       VALUES (:id, :companyId, :partId, :beforePayload, :afterPayload, :contentHash, CURRENT_TIMESTAMP)`,
      { id: snapshotId, companyId: input.companyId, partId: input.work.part_id, beforePayload: JSON.stringify(before), afterPayload: JSON.stringify(after), contentHash }
    );
    await tx.execute(
      `UPDATE part_numbers SET part_name = :partName, item_kind = :itemKind, custom_specification = :customSpecification,
         is_universal = :isUniversal, updated_at = CURRENT_TIMESTAMP
       WHERE id = :partId AND company_id = :companyId`,
      { companyId: input.companyId, partId: input.work.part_id, ...after, isUniversal: after.isUniversal ? 1 : 0 }
    );
    await tx.execute(
      `INSERT INTO part_variant_attributes (id, part_number_id, material_code, material_label, color_code, color_label, surface_treatment, variant_note, updated_by)
       VALUES (:id, :partId, :materialCode, :materialLabel, :colorCode, :colorLabel, :surfaceTreatment, :variantNote, :updatedBy)
       ON CONFLICT (part_number_id) DO UPDATE SET material_code = excluded.material_code, material_label = excluded.material_label,
         color_code = excluded.color_code, color_label = excluded.color_label, surface_treatment = excluded.surface_treatment,
         variant_note = excluded.variant_note, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`,
      { id: crypto.randomUUID(), partId: input.work.part_id, updatedBy: input.work.owner_user_id, ...after }
    );
    // Initial migrated Parts can legitimately start with part_work only. The
    // approval transaction must create the formal navigation anchor before it
    // removes the work anchor, or the Part remains in relations but disappears
    // from the canonical list/detail projection.
    await tx.execute(
      `INSERT INTO canonical_workbench_states
         (id, company_id, entity_type, canonical_entity_id, data_layer, handling, row_version)
       VALUES (:id, :companyId, 'part', :partId, 'part_formal', 'none', 1)
       ON CONFLICT DO NOTHING`,
      { id: crypto.randomUUID(), companyId: input.companyId, partId: input.work.part_id }
    );
    const formalState = await tx.queryOne<{ id: string }>(
      `SELECT id FROM canonical_workbench_states
       WHERE company_id = :companyId AND entity_type = 'part'
         AND canonical_entity_id = :partId AND data_layer = 'part_formal'`,
      { companyId: input.companyId, partId: input.work.part_id }
    );
    if (!formalState) {
      throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "核准後資料狀態未完成，請稍後再試", 503);
    }
    await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(`DELETE FROM part_change_works WHERE company_id = :companyId AND id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(
      `UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = :formalStateId AND company_id = :companyId`,
      { formalStateId: formalState.id, companyId: input.companyId }
    );
    const postcondition = await tx.queryOne<{ formal_count: number | string; work_count: number | string }>(
      `SELECT
         (SELECT COUNT(*) FROM canonical_workbench_states
           WHERE company_id = :companyId AND entity_type = 'part'
             AND canonical_entity_id = :partId AND data_layer = 'part_formal') AS formal_count,
         (SELECT COUNT(*) FROM canonical_workbench_states
           WHERE company_id = :companyId AND entity_type = 'part'
             AND canonical_entity_id = :partId AND data_layer = 'part_work') AS work_count`,
      { companyId: input.companyId, partId: input.work.part_id }
    );
    if (Number(postcondition?.formal_count ?? 0) !== 1 || Number(postcondition?.work_count ?? 0) !== 0) {
      throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "核准後資料狀態未完成，請稍後再試", 503);
    }
    return { snapshotId, partId: input.work.part_id };
  }
}
