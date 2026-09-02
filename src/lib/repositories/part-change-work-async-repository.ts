import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { normalizeBomUomCode, type BomUomCode } from "@/lib/bom-unit-of-measure";

export type PartChangePayload = {
  partName: string;
  itemKind: "purchased" | "manufactured";
  customSpecification: string | null;
  isUniversal: boolean;
  bomUsagePolicy: "undecided" | "not_required" | "available" | "restricted" | "obsolete";
  materialCode: string | null;
  materialLabel: string | null;
  colorCode: string | null;
  colorLabel: string | null;
  surfaceTreatment: string | null;
  variantNote: string | null;
  baseUomCode: BomUomCode | null;
};

type PartRow = {
  id: string; company_id: string; part_name: string; item_kind: PartChangePayload["itemKind"];
  custom_specification: string | null; is_universal: number | boolean; bom_usage_policy: PartChangePayload["bomUsagePolicy"]; base_uom_code: string | null;
  updated_at: string | Date;
  material_code: string | null; material_label: string | null; color_code: string | null; color_label: string | null; surface_treatment: string | null; variant_note: string | null;
};
type WorkRow = { id: string; company_id: string; part_id: string; owner_user_id: string; proposed_payload: string | PartChangePayload; base_hash: string; row_version: number };

export type PartWorkBatchMutation =
  | { kind: "create"; companyId: string; partId: string; ownerUserId: string; expectedFormalRowVersion: number; initialPayload: PartChangePayload }
  | { kind: "update"; companyId: string; workId: string; expectedRowVersion: number; payload: PartChangePayload };

export function validatePartChangePayload(value: unknown): PartChangePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料格式無效", 400);
  const candidate = value as Record<string, unknown>;
  if ("attachments" in candidate || "attachmentIds" in candidate) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "附件獨立維護，不屬於本次資料修改", 422);
  const allowed = new Set(["partName", "itemKind", "customSpecification", "isUniversal", "bomUsagePolicy", "materialCode", "materialLabel", "colorCode", "colorLabel", "surfaceTreatment", "variantNote", "baseUomCode"]);
  if (Object.keys(candidate).some((key) => !allowed.has(key))) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料包含不支援的欄位", 422);
  const itemKinds = new Set(["purchased", "manufactured"]);
  const bomPolicies = new Set(["undecided", "not_required", "available", "restricted", "obsolete"]);
  if (typeof candidate.partName !== "string" || !candidate.partName.trim() || !itemKinds.has(String(candidate.itemKind)) || typeof candidate.isUniversal !== "boolean" || !bomPolicies.has(String(candidate.bomUsagePolicy))) {
    throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號資料未通過欄位驗證", 422);
  }
  const nullable = (entry: unknown) => entry === null || entry === undefined ? null : typeof entry === "string" ? entry.trim() || null : null;
  let baseUomCode: BomUomCode | null = null;
  if (candidate.baseUomCode !== undefined && candidate.baseUomCode !== null && candidate.baseUomCode !== "") {
    try { baseUomCode = normalizeBomUomCode(candidate.baseUomCode); } catch { throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "基本單位代碼無效", 422); }
  }
  return {
    partName: candidate.partName.trim(), itemKind: candidate.itemKind as PartChangePayload["itemKind"],
    customSpecification: nullable(candidate.customSpecification), isUniversal: candidate.isUniversal,
    bomUsagePolicy: candidate.bomUsagePolicy as PartChangePayload["bomUsagePolicy"],
    materialCode: nullable(candidate.materialCode), materialLabel: nullable(candidate.materialLabel),
    colorCode: nullable(candidate.colorCode), colorLabel: nullable(candidate.colorLabel),
    surfaceTreatment: nullable(candidate.surfaceTreatment), variantNote: nullable(candidate.variantNote), baseUomCode
  };
}

/**
 * Normalizes the two controlled identity pairs without making the browser
 * carry hidden code fields while a user edits a label.  The formal payload is
 * the comparison baseline: an unchanged label keeps its code; a changed or
 * cleared label drops the old code.
 */
export function normalizePartChangePayload(value: unknown, formalBaseline?: PartChangePayload | null): PartChangePayload {
  const payload = validatePartChangePayload(value);
  const baseline = formalBaseline ? validatePartChangePayload(formalBaseline) : null;
  const normalizePair = (code: string | null, label: string | null, baseCode: string | null, baseLabel: string | null) => {
    if (!label) return { code: null, label: null };
    if (baseline && label === baseLabel) return { code: baseCode, label };
    return { code: null, label };
  };
  const material = normalizePair(payload.materialCode, payload.materialLabel, baseline?.materialCode ?? null, baseline?.materialLabel ?? null);
  const color = normalizePair(payload.colorCode, payload.colorLabel, baseline?.colorCode ?? null, baseline?.colorLabel ?? null);
  const hasBaseUom = value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "baseUomCode");
  const baseUomCode = hasBaseUom ? payload.baseUomCode : (baseline?.baseUomCode ?? payload.baseUomCode);
  if (baseline?.baseUomCode && !baseUomCode) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "基本單位一旦設定不可清空", 422);
  return { ...payload, materialCode: material.code, materialLabel: material.label, colorCode: color.code, colorLabel: color.label, baseUomCode };
}

function rowPayload(row: PartRow): PartChangePayload {
  return {
    partName: row.part_name, itemKind: row.item_kind, customSpecification: row.custom_specification,
    isUniversal: Boolean(row.is_universal), bomUsagePolicy: row.bom_usage_policy,
    materialCode: row.material_code, materialLabel: row.material_label, colorCode: row.color_code,
    colorLabel: row.color_label, surfaceTreatment: row.surface_treatment, variantNote: row.variant_note, baseUomCode: row.base_uom_code ? normalizeBomUomCode(row.base_uom_code) : null
  };
}
function parsePayload(value: string | PartChangePayload) { return validatePartChangePayload(typeof value === "string" ? JSON.parse(value) : value); }

export class PartChangeWorkAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  /**
   * Lock the complete Part/work scope before the handoff starts writing.
   * The caller must pass the server-derived exact Part ids; this method never
   * expands the target set from client input or part-number text.
   */
  async lockBatch(tx: AsyncDatabaseClient, input: { companyId: string; partIds: string[]; workIds?: string[] }) {
    const partIds = [...new Set(input.partIds.filter((id) => typeof id === "string" && id.trim()))].sort();
    const workIds = [...new Set((input.workIds ?? []).filter((id) => typeof id === "string" && id.trim()))].sort();
    if (partIds.length > 0) {
      const partParams: Record<string, unknown> = { companyId: input.companyId };
      const predicates = partIds.map((id, index) => {
        const key = `partId${index}`;
        partParams[key] = id;
        return `:${key}`;
      }).join(", ");
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM part_numbers WHERE company_id = :companyId AND id IN (${predicates}) ORDER BY id${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        partParams
      );
      if (rows.length !== partIds.length) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號關聯範圍已變更，請重新載入。", 409);
    }
    if (workIds.length > 0) {
      const workParams: Record<string, unknown> = { companyId: input.companyId };
      const predicates = workIds.map((id, index) => {
        const key = `workId${index}`;
        workParams[key] = id;
        return `:${key}`;
      }).join(", ");
      const rows = await tx.query<{ id: string }>(
        `SELECT id FROM part_change_works WHERE company_id = :companyId AND id IN (${predicates}) ORDER BY id${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
        workParams
      );
      if (rows.length !== workIds.length) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號工作範圍已變更，請重新載入。", 409);
    }
    return { partIds, workIds };
  }

  /** Apply already-locked mutations through the same canonical create/update primitives. */
  async applyLockedBatch(tx: AsyncDatabaseClient, mutations: PartWorkBatchMutation[]) {
    const ordered = [...mutations].sort((left, right) => {
      const leftKey = left.kind === "create" ? left.partId : left.workId;
      const rightKey = right.kind === "create" ? right.partId : right.workId;
      return leftKey.localeCompare(rightKey);
    });
    const results: Array<{ kind: PartWorkBatchMutation["kind"]; partId: string; workId: string; rowVersion: number; payload: PartChangePayload }> = [];
    for (const mutation of ordered) {
      if (mutation.kind === "create") {
        const result = await this.create(tx, mutation);
        results.push({ kind: mutation.kind, partId: mutation.partId, workId: result.workId, rowVersion: result.rowVersion, payload: result.payload });
      } else {
        const work = await this.readWork(tx, mutation.companyId, mutation.workId, false);
        if (!work) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號工作已變更，請重新載入。", 409);
        const result = await this.update(tx, mutation);
        results.push({ kind: mutation.kind, partId: work.part_id, workId: result.workId, rowVersion: result.rowVersion, payload: result.payload });
      }
    }
    return results;
  }

  async readPart(client: AsyncDatabaseClient, companyId: string, partId: string, lock = false) {
    return client.queryOne<PartRow>(
      `SELECT part.id, part.company_id, part.part_name, part.item_kind, part.custom_specification, part.is_universal, part.bom_usage_policy, part.base_uom_code, part.updated_at,
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

  async create(tx: AsyncDatabaseClient, input: { companyId: string; partId: string; ownerUserId: string; expectedFormalRowVersion: number; initialPayload?: PartChangePayload }) {
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
    const formalPayload = rowPayload(part);
    const payload = input.initialPayload ? normalizePartChangePayload(input.initialPayload, formalPayload) : formalPayload;
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
    const part = await this.readPart(tx, input.companyId, work.part_id, true);
    if (!part) throw new CanonicalWorkbenchError("WORKBENCH_SNAPSHOT_DRIFT", "料號資料已不存在，請重新載入", 409);
    const payload = normalizePartChangePayload(input.payload, rowPayload(part));
    const state = await tx.queryOne<{ handling: string }>(
      `SELECT handling FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId${tx.kind === "postgres" ? " FOR UPDATE" : ""}`,
      input
    );
    if (state?.handling !== "owner") throw new CanonicalWorkbenchError("WORKBENCH_ROW_VERSION_CONFLICT", "目前資料不可編輯", 409);
    await tx.execute(
      `UPDATE part_change_works SET proposed_payload = :payload, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = :workId AND company_id = :companyId AND row_version = :expectedRowVersion`,
      { ...input, payload: JSON.stringify(payload) }
    );
    await tx.execute(
      `UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP
       WHERE company_id = :companyId AND work_id = :workId`, input
    );
    return { workId: input.workId, rowVersion: input.expectedRowVersion + 1, payload };
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
         is_universal = :isUniversal, bom_usage_policy = :bomUsagePolicy, base_uom_code = :baseUomCode, updated_at = CURRENT_TIMESTAMP
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
    // A legacy migrated Part may intentionally have only part_work state
    // (initial work without a formal baseline). Approval must promote that
    // work into a navigable part_formal row before removing the work row;
    // otherwise list/detail lose the only canonical navigation anchor while
    // relation matrix still exposes the master identity.
    await tx.execute(
      `INSERT INTO canonical_workbench_states
         (id, company_id, entity_type, canonical_entity_id, data_layer, handling, row_version)
       VALUES (:id, :companyId, 'part', :partId, 'part_formal', 'none', 1)
       ON CONFLICT DO NOTHING`,
      { id: crypto.randomUUID(), companyId: input.companyId, partId: input.work.part_id }
    );
    const formalState = await tx.queryOne<{ id: string }>(
      `SELECT id
         FROM canonical_workbench_states
        WHERE company_id = :companyId
          AND entity_type = 'part'
          AND canonical_entity_id = :partId
          AND data_layer = 'part_formal'`,
      { companyId: input.companyId, partId: input.work.part_id }
    );
    if (!formalState) {
      throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "核准後資料狀態未完成，請稍後再試", 503);
    }
    await tx.execute(`DELETE FROM canonical_workbench_states WHERE company_id = :companyId AND work_id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(`DELETE FROM part_change_works WHERE company_id = :companyId AND id = :workId`, { companyId: input.companyId, workId: input.work.id });
    await tx.execute(`UPDATE canonical_workbench_states SET row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :formalStateId AND company_id = :companyId`, { formalStateId: formalState.id, companyId: input.companyId });
    const postcondition = await tx.queryOne<{ formal_count: number | string; work_count: number | string }>(
      `SELECT
         (SELECT COUNT(*) FROM canonical_workbench_states
           WHERE company_id = :companyId AND entity_type = 'part' AND canonical_entity_id = :partId AND data_layer = 'part_formal') AS formal_count,
         (SELECT COUNT(*) FROM canonical_workbench_states
           WHERE company_id = :companyId AND entity_type = 'part' AND canonical_entity_id = :partId AND data_layer = 'part_work') AS work_count`,
      { companyId: input.companyId, partId: input.work.part_id }
    );
    if (Number(postcondition?.formal_count ?? 0) !== 1 || Number(postcondition?.work_count ?? 0) !== 0) {
      throw new CanonicalWorkbenchError("WORKBENCH_AUTHORITY_MISMATCH", "核准後資料狀態未完成，請稍後再試", 503);
    }
    return { snapshotId, partId: input.work.part_id };
  }
}
