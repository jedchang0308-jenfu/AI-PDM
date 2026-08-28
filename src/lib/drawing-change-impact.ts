import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";

export type DrawingFffState = "no_impact" | "suspected_impact" | "confirmed_impact";
export type DrawingChangeImpact = {
  schemaVersion: 2;
  affectedPartNumberIds: string[];
  affectedPartFingerprint: string;
  formState: DrawingFffState | null;
  fitState: DrawingFffState | null;
  functionState: DrawingFffState | null;
  /** Server-derived read model; clients may round-trip it but cannot author it. */
  outcome: DrawingFffState | null;
  reasonCategory: string | null;
  note: string | null;
  replacement: {
    sourcePartNumberId: string;
    reservedPartNumber: string;
    itemType: "self_made" | "purchased";
    detectedPartNumber: string | null;
    correctedPartNumber: string | null;
    attachmentSnapshot: Record<string, unknown> | null;
  } | null;
};
export type DrawingPartRelationProjection = { id: string; code: string; name: string | null };
export type DrawingChangeImpactProjection = {
  changeImpactRequired: boolean;
  relatedParts: DrawingPartRelationProjection[];
  affectedParts: DrawingPartRelationProjection[];
  changeImpact: DrawingChangeImpact | null;
};

const states = new Set<DrawingFffState>(["no_impact", "suspected_impact", "confirmed_impact"]);
const replacementKeys = new Set(["sourcePartNumberId", "reservedPartNumber", "itemType", "detectedPartNumber", "correctedPartNumber", "attachmentSnapshot"]);
// `outcome` is a server-derived read-model field.  Accept it on a round trip
// but always derive the authoritative value again from the three F/F/F states.
const impactKeys = new Set(["schemaVersion", "affectedPartNumberIds", "affectedPartFingerprint", "formState", "fitState", "functionState", "outcome", "reasonCategory", "note", "replacement"]);

function hash(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function fffOutcome(statesValue: [DrawingFffState, DrawingFffState, DrawingFffState]): DrawingFffState {
  if (statesValue.includes("confirmed_impact")) return "confirmed_impact";
  if (statesValue.includes("suspected_impact")) return "suspected_impact";
  return "no_impact";
}

export function affectedPartFingerprint(input: { companyId: string; drawingId: string; revisionId: string; partIds: readonly string[]; relationEtag?: string | null }) {
  const ordered = [...new Set(input.partIds.map((value) => value.trim()).filter(Boolean))].sort();
  return hash({ companyId: input.companyId, drawingId: input.drawingId, revisionId: input.revisionId, partIds: ordered, relationEtag: input.relationEtag ?? null });
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableState(value: unknown): DrawingFffState | null { return states.has(value as DrawingFffState) ? value as DrawingFffState : null; }
function fail(code: "DRAWING_FFF_INCOMPLETE" | "DRAWING_CHANGE_IMPACT_SNAPSHOT_STALE" | "WORKBENCH_BAD_REQUEST", message: string, status: 409 | 422 = 422): never {
  throw new CanonicalWorkbenchError(code, message, status);
}

export function normalizeDrawingChangeImpact(value: unknown, defaults: { affectedPartNumberIds?: string[]; affectedPartFingerprint?: string } = {}): DrawingChangeImpact {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (Object.keys(raw).some((key) => !impactKeys.has(key))) fail("WORKBENCH_BAD_REQUEST", "FFF 資料包含未知欄位");
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== 1 && raw.schemaVersion !== 2) fail("WORKBENCH_BAD_REQUEST", "FFF 資料版本不支援");
  const formState = nullableState(raw.formState);
  const fitState = nullableState(raw.fitState);
  const functionState = nullableState(raw.functionState);
  const affectedPartNumberIds = [...new Set((Array.isArray(raw.affectedPartNumberIds) ? raw.affectedPartNumberIds : defaults.affectedPartNumberIds ?? []).map(text).filter(Boolean))].sort();
  const outcome = formState && fitState && functionState ? fffOutcome([formState, fitState, functionState]) : null;
  const replacementRaw = raw.replacement;
  let replacement: DrawingChangeImpact["replacement"] = null;
  if (replacementRaw !== null && replacementRaw !== undefined) {
    if (!replacementRaw || typeof replacementRaw !== "object" || Array.isArray(replacementRaw)) fail("WORKBENCH_BAD_REQUEST", "替代料號資料格式無效");
    const candidate = replacementRaw as Record<string, unknown>;
    if (Object.keys(candidate).some((key) => !replacementKeys.has(key))) fail("WORKBENCH_BAD_REQUEST", "替代料號資料包含未知欄位");
    const sourcePartNumberId = text(candidate.sourcePartNumberId);
    const reservedPartNumber = text(candidate.reservedPartNumber).toUpperCase();
    if (candidate.itemType !== undefined && candidate.itemType !== "self_made" && candidate.itemType !== "purchased") fail("WORKBENCH_BAD_REQUEST", "替代料號的料件類型無效");
    const itemType = candidate.itemType === "purchased" ? "purchased" : "self_made";
    replacement = { sourcePartNumberId, reservedPartNumber, itemType, detectedPartNumber: text(candidate.detectedPartNumber) || null, correctedPartNumber: text(candidate.correctedPartNumber) || null, attachmentSnapshot: candidate.attachmentSnapshot && typeof candidate.attachmentSnapshot === "object" && !Array.isArray(candidate.attachmentSnapshot) ? candidate.attachmentSnapshot as Record<string, unknown> : null };
  }
  return {
    schemaVersion: 2,
    affectedPartNumberIds,
    affectedPartFingerprint: text(raw.affectedPartFingerprint) || defaults.affectedPartFingerprint || "",
    formState, fitState, functionState, outcome,
    reasonCategory: text(raw.reasonCategory) && text(raw.reasonCategory) !== "not_specified" ? text(raw.reasonCategory) : null,
    note: text(raw.note) || null,
    replacement
  };
}

export function completeDrawingChangeImpact(value: DrawingChangeImpact): DrawingChangeImpact {
  if (!value.formState || !value.fitState || !value.functionState || !value.outcome) {
    fail("DRAWING_FFF_INCOMPLETE", "Form、Fit、Function 三軸都必須由使用者完成判定");
  }
  const reasonRequired = value.outcome !== "no_impact";
  if (reasonRequired && !value.reasonCategory) fail("DRAWING_FFF_INCOMPLETE", "條件相容或不相容時必須選擇原因分類");
  if (value.outcome === "confirmed_impact") {
    if (!value.replacement?.sourcePartNumberId || !value.replacement.reservedPartNumber) fail("DRAWING_FFF_INCOMPLETE", "不相容時必須指定完整替代料號");
    if (!value.affectedPartNumberIds.includes(value.replacement.sourcePartNumberId)) fail("DRAWING_CHANGE_IMPACT_SNAPSHOT_STALE", "替代料號來源已不在目前判定範圍", 409);
    for (const candidate of [value.replacement.detectedPartNumber, value.replacement.correctedPartNumber]) {
      if (candidate && candidate.toUpperCase() !== value.replacement.reservedPartNumber) fail("DRAWING_FFF_INCOMPLETE", "辨識或修正料號必須與保留的替代料號一致");
    }
  } else if (value.replacement) {
    fail("DRAWING_FFF_INCOMPLETE", "只有不相容判定可以指定替代料號");
  }
  return { ...value, reasonCategory: value.outcome === "no_impact" ? "no_impact_confirmed" : value.reasonCategory };
}

async function drawingRelationScope(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string }) {
  const rows = await client.query<{ id: string; code: string; name: string | null; link_type: string }>(
    `SELECT part.id, part.part_number AS code, part.part_name AS name, link.link_type
       FROM drawings drawing
       JOIN drawing_numbers number ON number.id = drawing.formal_drawing_number_id AND number.company_id = drawing.company_id
       JOIN drawing_part_links link ON link.drawing_number_id = number.id
       JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = drawing.company_id
      WHERE drawing.company_id = :companyId AND drawing.id = :drawingId
        AND part.part_root_id = number.part_root_id
        AND link.link_type IN ('primary_manufacturing', 'reference')
      ORDER BY part.part_number, part.id, link.link_type`,
    { companyId: input.companyId, drawingId: input.drawingId }
  );
  const relatedParts = [...new Map(rows.map((row) => [row.id, { id: row.id, code: row.code, name: row.name }])).values()]
    .sort((left, right) => left.code.localeCompare(right.code) || left.id.localeCompare(right.id));
  return { rows, relatedParts, partIds: relatedParts.map((part) => part.id).sort() };
}

export async function hydrateDrawingChangeImpactForWork(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; revisionId: string; predecessorRevisionId: string | null; impact: unknown }): Promise<DrawingChangeImpactProjection> {
  const scope = await drawingRelationScope(client, input);
  if (input.predecessorRevisionId === null) {
    return { changeImpactRequired: false, relatedParts: scope.relatedParts, affectedParts: [], changeImpact: null };
  }
  const relationEtag = JSON.stringify(scope.rows.map((row) => ({ id: row.id, link_type: row.link_type })).sort((left, right) => left.id.localeCompare(right.id) || left.link_type.localeCompare(right.link_type)));
  const expected = affectedPartFingerprint({ companyId: input.companyId, drawingId: input.drawingId, revisionId: input.revisionId, partIds: scope.partIds, relationEtag });
  const impact = normalizeDrawingChangeImpact(input.impact, { affectedPartNumberIds: scope.partIds, affectedPartFingerprint: expected });
  if (JSON.stringify(scope.partIds) !== JSON.stringify(impact.affectedPartNumberIds) || (impact.affectedPartFingerprint && impact.affectedPartFingerprint !== expected)) {
    fail("DRAWING_CHANGE_IMPACT_SNAPSHOT_STALE", "關聯料號已變更，請重新整理判定範圍", 409);
  }
  return { changeImpactRequired: true, relatedParts: scope.relatedParts, affectedParts: scope.relatedParts, changeImpact: { ...impact, affectedPartNumberIds: scope.partIds, affectedPartFingerprint: expected } };
}

export async function validateDrawingChangeImpactForWork(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; revisionId: string; predecessorRevisionId: string | null; impact: unknown; mode: "draft" | "submit" }) {
  const projection = await hydrateDrawingChangeImpactForWork(client, input);
  if (!projection.changeImpactRequired || !projection.changeImpact) throw new CanonicalWorkbenchError("DRAWING_FFF_NOT_APPLICABLE", "首版工作不適用 FFF 判定", 422);
  return input.mode === "submit" ? completeDrawingChangeImpact(projection.changeImpact) : projection.changeImpact;
}
