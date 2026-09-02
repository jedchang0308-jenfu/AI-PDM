import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { sanitizeDrawingRevisionWorkPayload } from "@/lib/drawing-revision-work-payload";
import { hydrateDrawingChangeImpactForWork } from "@/lib/drawing-change-impact";
import { dev087RequestHash } from "@/lib/pdm-canonical-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { RelationFormalAuthorityRepository } from "@/lib/repositories/relation-formal-authority-async-repository";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";
import { readDrawingRecognitionReviewProjections } from "@/lib/drawing-recognition-review-snapshot";
import type { DrawingRecognitionReviewProjectionBody } from "@/lib/drawing-recognition-review-projection";
import type { PartChangePayload } from "@/lib/repositories/part-change-work-async-repository";
import type {
  ReviewPackageEntityType,
  ReviewPackageEnvelope,
  ReviewPackageFile,
  ReviewPackageRequestKind,
  ReviewPackageTarget,
  ReviewPackageWorkspaceSnapshot
} from "@/lib/pdm-review-package-contract";
import { PDM_REVIEW_PACKAGE_MAX_BYTES, PDM_REVIEW_PACKAGE_MAX_CELLS, PDM_REVIEW_PACKAGE_MAX_TARGETS, PDM_REVIEW_PACKAGE_SCHEMA, isReviewPackageRecognitionProjection, parseReviewPackageSnapshot, reviewPackageTargetKey } from "@/lib/pdm-review-package-contract";
import { isDrawingRecognitionPartWorkHandoffProjection } from "@/lib/drawing-recognition-review-projection";

type BuildInput = {
  companyId: string;
  requestKind: ReviewPackageRequestKind;
  entityType: ReviewPackageEntityType;
  canonicalEntityId: string;
  workId: string | null;
  branchId: string | null;
  decisionBasis: { hash: string; payload: Record<string, unknown>; revisionId?: string | null; claimId?: string | null };
};

type FileRow = {
  id: string;
  binding_id?: string | null;
  drawing_revision_id?: string | null;
  linked_entity_id?: string | null;
  source_file_asset_id?: string | null;
  file_name?: string | null;
  display_name?: string | null;
  role?: string | null;
  mime_type?: string | null;
  file_size?: number | string | null;
  content_hash?: string | null;
  is_primary?: number | boolean | null;
  current_revision_upload?: number | boolean | null;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
}

export function reviewPackageHash(value: unknown) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

export function reviewPackageV2WriteEnabled() {
  return process.env.PDM_REVIEW_PACKAGE_V2_WRITE === "true";
}

function bool(value: unknown) { return value === true || value === 1 || value === "1"; }
function num(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : null; }

function inClause(prefix: string, ids: string[]) {
  return ids.map((_, index) => `:${prefix}${index}`).join(", ");
}

function inParams(prefix: string, ids: string[], base: Record<string, unknown>) {
  return { ...base, ...Object.fromEntries(ids.map((id, index) => [`${prefix}${index}`, id])) };
}

function mapFile(row: FileRow, fallbackBindingId = row.id, ordinal = 0): ReviewPackageFile {
  return {
    id: row.id,
    bindingId: row.binding_id || fallbackBindingId,
    sourceFileAssetId: row.source_file_asset_id ?? null,
    fileName: row.file_name ?? null,
    displayName: row.display_name ?? null,
    role: row.role ?? null,
    mimeType: row.mime_type ?? null,
    fileSize: num(row.file_size),
    contentHash: row.content_hash ?? null,
    isPrimary: bool(row.is_primary),
    currentRevisionUpload: bool(row.current_revision_upload),
    ordinal
  };
}

function sealRecognitionProjection(projection: DrawingRecognitionReviewProjectionBody) {
  return { ...projection, projectionHash: reviewPackageHash(projection) } as unknown as ReviewPackageWorkspaceSnapshot["recognition"];
}

async function drawingFiles(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; revisionId?: string | null; workId?: string | null }) {
  if (input.workId) {
    const rows = await client.query<FileRow>(`SELECT binding.file_binding_id AS id, binding.file_binding_id AS binding_id,
        file.source_file_asset_id, asset.file_name, file.display_name, file.role, asset.mime_type, asset.file_size,
        asset.content_hash, file.is_primary, 1 AS current_revision_upload
      FROM drawing_revision_work_files binding
      JOIN drawing_revision_files file ON file.id = binding.file_binding_id AND file.company_id = :companyId
      JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE binding.work_id = :workId AND file.removed_at IS NULL AND asset.deleted_at IS NULL
      ORDER BY binding.ordinal, binding.file_binding_id`, input);
    return rows.map((row, index) => mapFile(row, row.id, index));
  }
  if (!input.revisionId) return [];
  const rows = await client.query<FileRow>(`SELECT file.id, file.id AS binding_id, file.source_file_asset_id,
      asset.file_name, file.display_name, file.role, asset.mime_type, asset.file_size, asset.content_hash,
      file.is_primary, 0 AS current_revision_upload
    FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id
    WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId
      AND file.removed_at IS NULL AND asset.deleted_at IS NULL
    ORDER BY file.sort_order, file.id`, input);
  return rows.map((row, index) => mapFile(row, row.id, index));
}

async function partAttachments(client: AsyncDatabaseClient, input: { companyId: string; partId: string }) {
  const rows = await client.query<FileRow>(`SELECT asset.id, asset.id AS binding_id, asset.id AS source_file_asset_id,
      asset.file_name, asset.display_name, asset.document_category AS role, asset.mime_type, asset.file_size,
      asset.content_hash, 0 AS is_primary, 0 AS current_revision_upload
    FROM file_assets asset
    WHERE asset.linked_entity_type = 'part_number'
      AND asset.linked_entity_id = :partId AND asset.deleted_at IS NULL
    ORDER BY asset.created_at DESC, asset.id DESC`, input);
  return rows.map((row, index) => mapFile(row, row.id, index));
}

async function readDrawingTarget(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; primary?: Pick<BuildInput, "companyId" | "workId"> }) : Promise<ReviewPackageWorkspaceSnapshot | null> {
  const drawing = await client.queryOne<{ id: string; drawing_number: string; purpose_code: string | null; purpose_description: string | null; part_root_id: string }>(
    `SELECT id, drawing_number, purpose_code, purpose_description, part_root_id FROM drawings WHERE id = :drawingId AND company_id = :companyId`, input
  );
  if (!drawing) return null;
  const latest = await client.queryOne<{ id: string; revision: string; policy_snapshot_json: string | null }>(
    `SELECT id, revision, policy_snapshot_json FROM drawing_revisions WHERE company_id = :companyId AND drawing_id = :drawingId
      ORDER BY updated_at DESC, id DESC LIMIT 1`, input
  );
  const primary = input.primary;
  let payload: Record<string, unknown> = {};
  let baselinePayload: Record<string, unknown> | null = null;
  let revisionId = latest?.id ?? null;
  let revision = latest?.revision ?? null;
  let workId: string | null = null;
  let predecessorRevisionId: string | null = null;
  if (latest?.policy_snapshot_json) {
    try { baselinePayload = sanitizeDrawingRevisionWorkPayload(JSON.parse(latest.policy_snapshot_json)); } catch { baselinePayload = null; }
  }
  if (primary?.workId) {
    const work = await client.queryOne<{ proposed_payload: string | Record<string, unknown>; revision_id: string; target_label: string; predecessor_revision_id: string | null }>(
      `SELECT work.proposed_payload, state.revision_id, claim.target_label, claim.predecessor_revision_id FROM drawing_revision_works work
       JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id AND claim.company_id = work.company_id
       JOIN canonical_workbench_states state ON state.work_id = work.id AND state.company_id = work.company_id
       WHERE work.id = :workId AND work.company_id = :companyId`, primary
    );
    if (work) {
      payload = sanitizeDrawingRevisionWorkPayload(typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload);
      revisionId = work.revision_id;
      revision = work.target_label;
      workId = primary.workId;
      predecessorRevisionId = work.predecessor_revision_id;
    }
  } else payload = baselinePayload ?? {};
  const impactProjection = workId && revisionId
    ? await hydrateDrawingChangeImpactForWork(client, { companyId: input.companyId, drawingId: drawing.id, revisionId, predecessorRevisionId, impact: payload.changeImpact })
    : { changeImpactRequired: false, relatedParts: [], affectedParts: [], changeImpact: null };
  if (impactProjection.changeImpactRequired && impactProjection.changeImpact) payload.changeImpact = impactProjection.changeImpact;
  else delete payload.changeImpact;
  const files = await drawingFiles(client, { companyId: input.companyId, drawingId: drawing.id, revisionId, workId });
  const recognitionProjection = revisionId
    ? (await readDrawingRecognitionReviewProjections(client, { companyId: input.companyId, targets: [{ drawingId: drawing.id, revisionId }], selection: "formalized" })).get(`${drawing.id}:${revisionId}`) ?? null
    : null;
  return {
    kind: "drawing",
    entityId: drawing.id,
    identity: { code: drawing.drawing_number, name: drawing.purpose_description, revision, purposeCode: drawing.purpose_code, purposeDescription: drawing.purpose_description },
    revisionId,
    payload: payload as ReviewPackageWorkspaceSnapshot["payload"],
    baselinePayload: baselinePayload as ReviewPackageWorkspaceSnapshot["baselinePayload"],
    changeImpactRequired: impactProjection.changeImpactRequired,
    relatedParts: impactProjection.relatedParts,
    affectedParts: impactProjection.affectedParts,
    files,
    attachments: [],
    recognition: recognitionProjection ? sealRecognitionProjection(recognitionProjection) : null
  };
}

async function readPartTarget(client: AsyncDatabaseClient, input: { companyId: string; partId: string; primary?: Pick<BuildInput, "companyId" | "workId"> }) : Promise<ReviewPackageWorkspaceSnapshot | null> {
  const row = await client.queryOne<{
    id: string; part_number: string; part_name: string; item_kind: string; custom_specification: string | null;
    is_universal: number | boolean; bom_usage_policy: string; material_code: string | null; material_label: string | null;
    color_code: string | null; color_label: string | null; surface_treatment: string | null; variant_note: string | null; base_uom_code: string | null;
  }>(`SELECT part.id, part.part_number, part.part_name, part.item_kind, part.custom_specification, part.is_universal,
      part.bom_usage_policy, part.base_uom_code, attributes.material_code, attributes.material_label, attributes.color_code, attributes.color_label,
      attributes.surface_treatment, attributes.variant_note
    FROM part_numbers part LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
    WHERE part.id = :partId AND part.company_id = :companyId`, input);
  if (!row) return null;
  const baselinePayload: PartChangePayload = {
    partName: row.part_name, itemKind: row.item_kind as PartChangePayload["itemKind"], customSpecification: row.custom_specification,
    isUniversal: bool(row.is_universal), bomUsagePolicy: row.bom_usage_policy as PartChangePayload["bomUsagePolicy"],
    materialCode: row.material_code, materialLabel: row.material_label, colorCode: row.color_code, colorLabel: row.color_label,
    surfaceTreatment: row.surface_treatment, variantNote: row.variant_note, baseUomCode: row.base_uom_code as PartChangePayload["baseUomCode"]
  };
  let payload: Record<string, unknown> = baselinePayload;
  if (input.primary?.workId) {
    const work = await client.queryOne<{ proposed_payload: string | Record<string, unknown> }>(`SELECT proposed_payload FROM part_change_works WHERE id = :workId AND company_id = :companyId`, input.primary);
    if (work) payload = typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload;
  }
  return {
    kind: "part",
    entityId: row.id,
    identity: { code: row.part_number, name: row.part_name, revision: null, purposeCode: null, purposeDescription: null },
    revisionId: null,
    payload: payload as ReviewPackageWorkspaceSnapshot["payload"],
    baselinePayload: baselinePayload as unknown as ReviewPackageWorkspaceSnapshot["baselinePayload"],
    files: [],
    attachments: await partAttachments(client, { companyId: input.companyId, partId: row.id }),
    recognition: null
  };
}

type ReviewPackageMatrixSource = {
  rootId: string;
  rootCode: string;
  drawings: Array<{ id: string; number: string; targetId: string | null }>;
  parts: Array<{ id: string; number: string; targetId: string }>;
  cells: Array<{ drawingNumberId: string; partNumberId: string; drawingNumber: string; partNumber: string; relationType: "manufacturing_basis" | "reference" | null }>;
};

async function buildMatrix(client: AsyncDatabaseClient, companyId: string, rootId: string): Promise<ReviewPackageMatrixSource> {
  const matrix = await new RelationFormalAuthorityRepository(client).getMatrix({ companyId, rootId });
  if (matrix.cells.length > PDM_REVIEW_PACKAGE_MAX_CELLS) throw new CanonicalWorkbenchError("REVIEW_PACKAGE_LIMIT_EXCEEDED", "審核包關聯矩陣超過上限", 422);
  const drawingNumberIds = matrix.drawings.map((item) => item.id);
  const drawingTargets = new Map<string, string>();
  if (drawingNumberIds.length) {
    const rows = await client.query<{ id: string; formal_drawing_number_id: string }>(
      `SELECT id, formal_drawing_number_id FROM drawings
       WHERE company_id = :companyId AND formal_drawing_number_id IN (${inClause("drawingNumber", drawingNumberIds)})
       ORDER BY formal_drawing_number_id, updated_at DESC, id DESC`,
      inParams("drawingNumber", drawingNumberIds, { companyId })
    );
    for (const row of rows) if (!drawingTargets.has(row.formal_drawing_number_id)) drawingTargets.set(row.formal_drawing_number_id, row.id);
  }
  return {
    rootId: matrix.rootId,
    rootCode: matrix.rootCode,
    drawings: matrix.drawings.map((item) => ({ id: item.id, number: item.number, targetId: drawingTargets.get(item.id) ?? null })),
    parts: matrix.parts.map((item) => ({ id: item.id, number: item.number, targetId: item.id })),
    cells: matrix.cells
  };
}

type DrawingBatchRow = { id: string; drawing_number: string; purpose_code: string | null; purpose_description: string | null };
type DrawingRevisionBatchRow = { id: string; drawing_id: string; revision: string; policy_snapshot_json: string | null };
type DrawingWorkBatchRow = { proposed_payload: string | Record<string, unknown>; revision_id: string; target_label: string; drawing_id: string; predecessor_revision_id: string | null };
async function readDrawingTargetsBatch(client: AsyncDatabaseClient, input: { companyId: string; drawingIds: string[]; primary: BuildInput }) {
  const ids = [...new Set(input.drawingIds)];
  if (!ids.length) return new Map<string, ReviewPackageWorkspaceSnapshot>();
  const params = inParams("drawing", ids, { companyId: input.companyId });
  const [drawings, revisions] = await Promise.all([
    client.query<DrawingBatchRow>(`SELECT id, drawing_number, purpose_code, purpose_description FROM drawings WHERE company_id = :companyId AND id IN (${inClause("drawing", ids)})`, params),
    client.query<DrawingRevisionBatchRow>(`SELECT id, drawing_id, revision, policy_snapshot_json FROM drawing_revisions WHERE company_id = :companyId AND drawing_id IN (${inClause("drawing", ids)}) ORDER BY drawing_id, updated_at DESC, id DESC`, params)
  ]);
  const latestRevision = new Map<string, DrawingRevisionBatchRow>();
  for (const row of revisions) if (!latestRevision.has(row.drawing_id)) latestRevision.set(row.drawing_id, row);
  const drawingById = new Map(drawings.map((row) => [row.id, row]));
  const work = input.primary.entityType === "drawing" && input.primary.workId
    ? await client.queryOne<DrawingWorkBatchRow>(`SELECT work.proposed_payload, state.revision_id, claim.target_label, work.drawing_id, claim.predecessor_revision_id
        FROM drawing_revision_works work
        JOIN drawing_revision_claims claim ON claim.id = work.target_claim_id AND claim.company_id = work.company_id
        JOIN canonical_workbench_states state ON state.work_id = work.id AND state.company_id = work.company_id
        WHERE work.id = :workId AND work.company_id = :companyId AND work.drawing_id = :drawingId`, { companyId: input.companyId, workId: input.primary.workId, drawingId: input.primary.canonicalEntityId })
    : null;
  const revisionIds = [...new Set([...latestRevision.values()].map((row) => row.id))];
  const revisionFiles = revisionIds.length
    ? await client.query<FileRow>(`SELECT file.id, file.id AS binding_id, file.drawing_revision_id, file.source_file_asset_id,
        asset.file_name, file.display_name, file.role, asset.mime_type, asset.file_size, asset.content_hash,
        file.is_primary, 0 AS current_revision_upload
      FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE file.company_id = :companyId AND file.drawing_revision_id IN (${inClause("revision", revisionIds)})
        AND file.removed_at IS NULL AND asset.deleted_at IS NULL
      ORDER BY file.drawing_revision_id, file.sort_order, file.id`, inParams("revision", revisionIds, { companyId: input.companyId }))
    : [];
  const workFiles = work
    ? await client.query<FileRow>(`SELECT binding.file_binding_id AS id, binding.file_binding_id AS binding_id,
        file.source_file_asset_id, asset.file_name, file.display_name, file.role, asset.mime_type, asset.file_size,
        asset.content_hash, file.is_primary, 1 AS current_revision_upload
      FROM drawing_revision_work_files binding
      JOIN drawing_revision_files file ON file.id = binding.file_binding_id AND file.company_id = :companyId
      JOIN file_assets asset ON asset.id = file.source_file_asset_id
      WHERE binding.work_id = :workId AND file.removed_at IS NULL AND asset.deleted_at IS NULL
      ORDER BY binding.ordinal, binding.file_binding_id`, { companyId: input.companyId, workId: input.primary.workId })
    : [];
  const recognitionRevisionByDrawing = new Map(ids.flatMap((id) => {
    const isPrimary = input.primary.entityType === "drawing" && input.primary.canonicalEntityId === id;
    const revisionId = isPrimary && work ? work.revision_id : latestRevision.get(id)?.id ?? null;
    return revisionId ? [[id, revisionId] as const] : [];
  }));
  const recognitionProjections = await readDrawingRecognitionReviewProjections(client, {
    companyId: input.companyId,
    targets: [...recognitionRevisionByDrawing].map(([drawingId, revisionId]) => ({ drawingId, revisionId })),
    selection: "formalized"
  });
  const filesByRevision = new Map<string, ReviewPackageFile[]>();
  for (const row of revisionFiles) {
    const list = filesByRevision.get(row.drawing_revision_id ?? "") ?? [];
    list.push(mapFile(row, row.id, list.length));
    filesByRevision.set(row.drawing_revision_id ?? "", list);
  }
  const result = new Map<string, ReviewPackageWorkspaceSnapshot>();
  for (const id of ids) {
    const drawing = drawingById.get(id);
    if (!drawing) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少圖號對象", 409);
    const latest = latestRevision.get(id);
    let baselinePayload: Record<string, unknown> | null = null;
    if (latest?.policy_snapshot_json) {
      try { baselinePayload = sanitizeDrawingRevisionWorkPayload(JSON.parse(latest.policy_snapshot_json)); } catch { baselinePayload = null; }
    }
    const isPrimary = input.primary.entityType === "drawing" && input.primary.canonicalEntityId === id;
    let payload = baselinePayload ?? {};
    let revisionId = latest?.id ?? null;
    let revision = latest?.revision ?? null;
    let files = latest ? (filesByRevision.get(latest.id) ?? []) : [];
    if (isPrimary && work) {
      payload = sanitizeDrawingRevisionWorkPayload(input.primary.decisionBasis.payload);
      revisionId = work.revision_id;
      revision = work.target_label;
      files = workFiles.map((row, index) => mapFile(row, row.id, index));
    }
    const impactProjection = isPrimary && work && revisionId
      ? await hydrateDrawingChangeImpactForWork(client, { companyId: input.companyId, drawingId: id, revisionId, predecessorRevisionId: work.predecessor_revision_id, impact: payload.changeImpact })
      : { changeImpactRequired: false, relatedParts: [], affectedParts: [], changeImpact: null };
    if (impactProjection.changeImpactRequired && impactProjection.changeImpact) payload.changeImpact = impactProjection.changeImpact;
    else delete payload.changeImpact;
    const recognition = revisionId ? recognitionProjections.get(`${id}:${revisionId}`) ?? null : null;
    result.set(id, {
      kind: "drawing", entityId: id,
      identity: { code: drawing.drawing_number, name: drawing.purpose_description, revision, purposeCode: drawing.purpose_code, purposeDescription: drawing.purpose_description },
      revisionId, payload: payload as ReviewPackageWorkspaceSnapshot["payload"], baselinePayload: baselinePayload as ReviewPackageWorkspaceSnapshot["baselinePayload"], changeImpactRequired: impactProjection.changeImpactRequired, relatedParts: impactProjection.relatedParts, affectedParts: impactProjection.affectedParts, files, attachments: [],
      recognition: recognition ? sealRecognitionProjection(recognition) : null
    });
  }
  return result;
}

type PartBatchRow = {
  id: string; part_number: string; part_name: string; item_kind: string; custom_specification: string | null;
  is_universal: number | boolean; bom_usage_policy: string; material_code: string | null; material_label: string | null;
  color_code: string | null; color_label: string | null; surface_treatment: string | null; variant_note: string | null; base_uom_code: string | null;
};

async function readPartTargetsBatch(client: AsyncDatabaseClient, input: { companyId: string; partIds: string[]; primary: BuildInput }) {
  const ids = [...new Set(input.partIds)];
  if (!ids.length) return new Map<string, ReviewPackageWorkspaceSnapshot>();
  const params = inParams("part", ids, { companyId: input.companyId });
  const [parts, attachments, work] = await Promise.all([
    client.query<PartBatchRow>(`SELECT part.id, part.part_number, part.part_name, part.item_kind, part.custom_specification, part.is_universal,
        part.bom_usage_policy, part.base_uom_code, attributes.material_code, attributes.material_label, attributes.color_code, attributes.color_label,
        attributes.surface_treatment, attributes.variant_note
      FROM part_numbers part LEFT JOIN part_variant_attributes attributes ON attributes.part_number_id = part.id
      WHERE part.company_id = :companyId AND part.id IN (${inClause("part", ids)})`, params),
    client.query<FileRow>(`SELECT asset.id, asset.id AS binding_id, asset.id AS source_file_asset_id, asset.linked_entity_id,
        asset.file_name, asset.display_name, asset.document_category AS role, asset.mime_type, asset.file_size,
        asset.content_hash, 0 AS is_primary, 0 AS current_revision_upload
      FROM file_assets asset WHERE asset.linked_entity_type = 'part_number'
        AND asset.linked_entity_id IN (${inClause("part", ids)}) AND asset.deleted_at IS NULL
      ORDER BY asset.linked_entity_id, asset.created_at DESC, asset.id DESC`, params),
    input.primary.entityType === "part" && input.primary.workId
      ? client.queryOne<{ proposed_payload: string | Record<string, unknown> }>(`SELECT proposed_payload FROM part_change_works WHERE id = :workId AND company_id = :companyId AND part_id = :partId`, { companyId: input.companyId, workId: input.primary.workId, partId: input.primary.canonicalEntityId })
      : Promise.resolve(null)
  ]);
  const partById = new Map(parts.map((row) => [row.id, row]));
  const attachmentsByPart = new Map<string, ReviewPackageFile[]>();
  for (const row of attachments) {
    const partId = row.linked_entity_id ?? "";
    const list = attachmentsByPart.get(partId) ?? [];
    list.push(mapFile(row, row.id, list.length));
    attachmentsByPart.set(partId, list);
  }
  const result = new Map<string, ReviewPackageWorkspaceSnapshot>();
  for (const id of ids) {
    const row = partById.get(id);
    if (!row) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少料號對象", 409);
    const baselinePayload: PartChangePayload = {
      partName: row.part_name, itemKind: row.item_kind as PartChangePayload["itemKind"], customSpecification: row.custom_specification,
      isUniversal: bool(row.is_universal), bomUsagePolicy: row.bom_usage_policy as PartChangePayload["bomUsagePolicy"],
      materialCode: row.material_code, materialLabel: row.material_label, colorCode: row.color_code, colorLabel: row.color_label,
      surfaceTreatment: row.surface_treatment, variantNote: row.variant_note, baseUomCode: row.base_uom_code as PartChangePayload["baseUomCode"]
    };
    const isPrimary = input.primary.entityType === "part" && input.primary.canonicalEntityId === id;
    const payload = isPrimary && work ? (typeof work.proposed_payload === "string" ? JSON.parse(work.proposed_payload) : work.proposed_payload) : baselinePayload;
    result.set(id, {
      kind: "part", entityId: id,
      identity: { code: row.part_number, name: row.part_name, revision: null, purposeCode: null, purposeDescription: null },
      revisionId: null, payload: payload as ReviewPackageWorkspaceSnapshot["payload"], baselinePayload: baselinePayload as unknown as ReviewPackageWorkspaceSnapshot["baselinePayload"],
      files: [], attachments: attachmentsByPart.get(id) ?? [], recognition: null
    });
  }
  return result;
}

export async function buildReviewPackage(client: AsyncDatabaseClient, input: BuildInput): Promise<ReviewPackageEnvelope> {
  const root = await new RelationFormalAuthorityRepository(client).rootForEntity({ companyId: input.companyId, entityType: input.entityType, entityId: input.canonicalEntityId });
  if (!root) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核對象缺少同公司圖料根號", 409);
  const rootRow = await client.queryOne<{ id: string; root_code: string }>(`SELECT id, root_code FROM part_roots WHERE company_id = :companyId AND id = :rootId`, { companyId: input.companyId, rootId: root });
  if (!rootRow) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核對象缺少圖料根號", 409);
  const matrixSource = await buildMatrix(client, input.companyId, root);
  if (matrixSource.drawings.some((drawing) => !drawing.targetId) || matrixSource.parts.some((part) => !part.targetId)) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包無法映射完整圖料對象", 409);
  const targetCount = matrixSource.drawings.length + matrixSource.parts.length;
  if (targetCount > PDM_REVIEW_PACKAGE_MAX_TARGETS) throw new CanonicalWorkbenchError("REVIEW_PACKAGE_LIMIT_EXCEEDED", "審核包對象數超過上限", 422);
  const [drawingTargets, partTargets] = await Promise.all([
    readDrawingTargetsBatch(client, { companyId: input.companyId, drawingIds: matrixSource.drawings.map((drawing) => drawing.targetId!), primary: input }),
    readPartTargetsBatch(client, { companyId: input.companyId, partIds: matrixSource.parts.map((part) => part.targetId!), primary: input })
  ]);
  const targetFromWorkspace = (axisId: string, workspace: ReviewPackageWorkspaceSnapshot | undefined): ReviewPackageTarget => {
    if (!workspace) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少完整對象快照", 409);
    const submitted = workspace.kind === input.entityType && workspace.entityId === input.canonicalEntityId;
    const changedPaths = workspace.baselinePayload ? Object.keys(workspace.payload).filter((key) => reviewPackageHash(workspace.payload[key]) !== reviewPackageHash(workspace.baselinePayload?.[key] ?? null)).sort() : [];
    const submittedFileChange = submitted && input.requestKind === "drawing_revision" && workspace.files.some((file) => file.currentRevisionUpload);
    if (submittedFileChange) changedPaths.push("files");
    const changeMarker = submitted && input.requestKind === "drawing_rd_void"
      ? { kind: "lifecycle" as const, paths: ["lifecycle"] }
      : changedPaths.length
        ? { kind: changedPaths.some((path) => path !== "files") ? "field" as const : "file" as const, paths: [...new Set(changedPaths)].sort() }
        : null;
    const recognitionConflictCount = isReviewPackageRecognitionProjection(workspace.recognition)
      ? Number(workspace.recognition.session.conflictCount ?? 0)
      : 0;
    const evidenceHash = reviewPackageWorkspaceEvidenceHash(workspace);
    return {
      targetKey: reviewPackageTargetKey(workspace.kind, workspace.entityId),
      axisId,
      scope: submitted ? "submitted" : "context_only",
      markers: {
        submitted,
        change: changeMarker,
        risk: recognitionConflictCount > 0 ? { level: recognitionConflictCount > 1 ? "high" : "attention", codes: ["recognition_conflict"] } : null
      },
      evidenceHash,
      workspace
    };
  };
  const targets = [
    ...matrixSource.drawings.map((drawing) => targetFromWorkspace(drawing.id, drawingTargets.get(drawing.targetId!))),
    ...matrixSource.parts.map((part) => targetFromWorkspace(part.id, partTargets.get(part.targetId)))
  ];
  const primaryTargetKey = reviewPackageTargetKey(input.entityType, input.canonicalEntityId);
  if (!targets.some((target) => target.targetKey === primaryTargetKey)) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少主要送審對象", 409);
  const matrixBody = {
    rootId: matrixSource.rootId,
    rootCode: matrixSource.rootCode,
    drawings: matrixSource.drawings.map((drawing) => {
      const workspace = drawingTargets.get(drawing.targetId!);
      if (!workspace) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少圖號軸快照", 409);
      return { axisId: drawing.id, targetKey: reviewPackageTargetKey("drawing", workspace.entityId), code: drawing.number, revision: workspace.identity.revision };
    }),
    parts: matrixSource.parts.map((part) => {
      const workspace = partTargets.get(part.targetId);
      if (!workspace) throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包缺少料號軸快照", 409);
      return { axisId: part.id, targetKey: reviewPackageTargetKey("part", workspace.entityId), code: part.number, revision: null as null };
    }),
    cells: matrixSource.cells
  };
  const matrix = { ...matrixBody, evidenceHash: reviewPackageHash(matrixBody) };
  const body = {
    schemaVersion: PDM_REVIEW_PACKAGE_SCHEMA,
    submittedAt: new Date().toISOString(),
    requestKind: input.requestKind,
    primaryTargetKey,
    root: { id: rootRow.id, code: rootRow.root_code },
    decisionBasis: {
      version: 1 as const,
      kind: input.requestKind === "drawing_revision" ? "drawing_revision_work" as const : input.requestKind === "drawing_rd_void" ? "drawing_rd_void" as const : "part_change_work" as const,
      hash: input.decisionBasis.hash,
      payload: input.decisionBasis.payload as ReviewPackageEnvelope["decisionBasis"]["payload"],
      revisionId: input.decisionBasis.revisionId ?? null,
      claimId: input.decisionBasis.claimId ?? null
    },
    matrix,
    targets
  };
  const packageHash = reviewPackageHash(body);
  const envelope = { ...body, packageHash } as ReviewPackageEnvelope;
  if (Buffer.byteLength(JSON.stringify(envelope), "utf8") > PDM_REVIEW_PACKAGE_MAX_BYTES) throw new CanonicalWorkbenchError("REVIEW_PACKAGE_LIMIT_EXCEEDED", "審核包內容大小超過上限", 422);
  const parsed = parseReviewPackageSnapshot(envelope);
  if (parsed.kind !== "v2") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", `審核包格式無效：${parsed.kind === "invalid" ? parsed.reason : "legacy"} (${JSON.stringify({ submittedAt: envelope.submittedAt, requestKind: envelope.requestKind, primaryTargetKey: envelope.primaryTargetKey, packageHash: envelope.packageHash, root: envelope.root })})`, 409);
  return envelope;
}

export async function readCurrentReviewTarget(client: AsyncDatabaseClient, input: { companyId: string; entityType: ReviewPackageEntityType; entityId: string; workId?: string | null }) {
  const primary = input.workId ? { companyId: input.companyId, workId: input.workId } : undefined;
  return input.entityType === "drawing"
    ? readDrawingTarget(client, { companyId: input.companyId, drawingId: input.entityId, primary })
    : readPartTarget(client, { companyId: input.companyId, partId: input.entityId, primary });
}

export function reviewPackageWorkspaceEvidenceHash(workspace: ReviewPackageWorkspaceSnapshot) {
  return reviewPackageHash({
    kind: workspace.kind,
    entityId: workspace.entityId,
    revisionId: workspace.revisionId,
    identity: workspace.identity,
    payload: workspace.payload,
    baselinePayload: workspace.baselinePayload,
    changeImpactRequired: workspace.changeImpactRequired ?? false,
    relatedParts: workspace.relatedParts ?? [],
    affectedParts: workspace.affectedParts ?? [],
    files: workspace.files,
    attachments: workspace.attachments,
    recognition: workspace.recognition
  });
}

export function compareReviewTarget(snapshot: ReviewPackageTarget, current: ReviewPackageWorkspaceSnapshot | null) {
  if (!current) return { status: "missing" as const, changed: true, changedSections: ["identity"], currentEvidenceHash: null };
  const changedSections: string[] = [];
  if (reviewPackageHash(snapshot.workspace.identity) !== reviewPackageHash(current.identity)) changedSections.push("identity");
  if (reviewPackageHash(snapshot.workspace.payload) !== reviewPackageHash(current.payload)) changedSections.push("fields");
  if (reviewPackageHash(snapshot.workspace.files) !== reviewPackageHash(current.files) || reviewPackageHash(snapshot.workspace.attachments) !== reviewPackageHash(current.attachments)) changedSections.push("files");
  if (reviewPackageHash(snapshot.workspace.recognition) !== reviewPackageHash(current.recognition)) changedSections.push("recognition");
  return { status: changedSections.length ? "changed" as const : "unchanged" as const, changed: changedSections.length > 0, changedSections, currentEvidenceHash: reviewPackageWorkspaceEvidenceHash(current) };
}

export function reviewPackageDecisionBasis(value: unknown) {
  const parsed = parseReviewPackageSnapshot(value);
  return parsed.kind === "v2" ? parsed.value.decisionBasis : null;
}

export function assertReviewPackageRecognitionReady(value: ReviewPackageEnvelope) {
  for (const target of value.targets.filter((candidate) => candidate.scope === "submitted" && candidate.workspace.kind === "drawing")) {
    const recognition = target.workspace.recognition;
    if (recognition === null) continue;
    if (!isReviewPackageRecognitionProjection(recognition)) {
      throw new CanonicalWorkbenchError("WORKBENCH_RECOGNITION_BASIS_INCOMPLETE", "辨識依據不是完整送審快照，請退回修改後重新送審", 409);
    }
    if (recognition.session.status !== "formalized") {
      throw new CanonicalWorkbenchError("WORKBENCH_RECOGNITION_NOT_WRITTEN", "智慧辨識尚未寫入 PDM，請先按「確認寫入 PDM」後再送審", 409);
    }
    if (recognition.handoff !== undefined && recognition.handoff !== null && !isDrawingRecognitionPartWorkHandoffProjection(recognition.handoff)) {
      throw new CanonicalWorkbenchError("WORKBENCH_RECOGNITION_BASIS_INCOMPLETE", "辨識移交快照格式無效，請重新載入後再送審", 409);
    }
    if (recognition.fields.some((field) => field.blockingReason !== null)) {
      throw new CanonicalWorkbenchError("WORKBENCH_RECOGNITION_OWNER_UNRESOLVED", "辨識欄位仍有未完成的料號歸屬，請退回修改後重新送審", 409);
    }
  }
}

/** Server-side submit guard independent of the optional v2 package writer. */
/**
 * Submission is gated only by the current exact source lineage.  Historical
 * sessions for a replaced file set are evidence, not a reason to block the
 * Drawing submit command.  The work transaction has already locked the
 * Drawing aggregate before entering this read, preserving the global lock
 * order documented by DEV-107.
 */
export async function assertDrawingRecognitionSubmissionReady(client: AsyncDatabaseClient, input: { companyId: string; drawingId: string; revisionId: string }) {
  const sourceBasis = await new DrawingRecognitionAsyncRepository(client).readCurrentSourceBasis({
    companyId: input.companyId,
    sourceContextType: "drawing_revision",
    sourceContextId: input.revisionId
  });
  if (sourceBasis.sources.some((source) => !source.contentHash)) return;

  const sessions = await client.query<{
    id: string;
    status: string;
    source_set_fingerprint: string;
    source_lineage_key: string;
    session_purpose: string;
    evidence_origin_session_id: string | null;
    supersedes_session_id: string | null;
    created_at: string;
  }>(
    `SELECT id, status, source_set_fingerprint, source_lineage_key, session_purpose,
            evidence_origin_session_id, supersedes_session_id, created_at
       FROM drawing_recognition_sessions
      WHERE company_id = :companyId
        AND drawing_id = :drawingId
        AND drawing_revision_id = :revisionId
        AND source_context_type = 'drawing_revision'
        AND source_context_id = :revisionId
        AND source_lineage_key = :sourceLineageKey
        AND source_set_fingerprint = :sourceSetFingerprint
      ORDER BY created_at DESC, id DESC`,
    {
      ...input,
      sourceLineageKey: `drawing_revision:${input.revisionId}`,
      sourceSetFingerprint: sourceBasis.sourceSetFingerprint
    }
  );
  const latest = sessions[0];
  if (!latest) return;

  const intended = await client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count
       FROM drawing_recognition_candidates
      WHERE company_id = :companyId
        AND session_id = :sessionId
        AND category NOT IN ('unclassified', 'identity_relation', 'engineering_evidence')
        AND review_state IN ('accepted', 'corrected', 'mapped')`,
    { companyId: input.companyId, sessionId: latest.id }
  );
  if (Number(intended?.count ?? 0) === 0) return;
  if (latest.status === "formalized") return;

  const blocker = await client.queryOne<{ count: number | string }>(
    `SELECT COUNT(*) AS count
       FROM drawing_recognition_candidates
      WHERE company_id = :companyId
        AND session_id = :sessionId
        AND category NOT IN ('unclassified', 'identity_relation', 'engineering_evidence')
        AND review_state IN ('accepted', 'corrected', 'mapped')
        AND (review_state = 'blocked' OR proposed_owner_id IS NULL OR TRIM(COALESCE(proposed_owner_id, '')) = '')`,
    { companyId: input.companyId, sessionId: latest.id }
  );
  const code = Number(blocker?.count ?? 0) > 0
    ? "RECOGNITION_SUBMISSION_WRITE_BLOCKED"
    : "RECOGNITION_SUBMISSION_WRITE_PENDING";
  const message = Number(blocker?.count ?? 0) > 0
    ? "智慧辨識仍有未完成的料號歸屬或寫入阻擋，請先在智慧辨識分頁處理。"
    : "智慧辨識尚未寫入 PDM，請先按「確認寫入 PDM」後再送審。";
  throw new CanonicalWorkbenchError(code, message, 422);
}

/** Backward-compatible name used by older Drawing submit call sites. */
export const assertDrawingRecognitionWriteReady = assertDrawingRecognitionSubmissionReady;

export function verifyReviewPackageIntegrity(value: unknown, expectedSnapshotHash: string) {
  const parsed = parseReviewPackageSnapshot(value);
  if (parsed.kind !== "v2") throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INVALID", "審核包格式無效", 409);
  const { packageHash, ...body } = parsed.value;
  const calculated = reviewPackageHash(body);
  if (calculated !== packageHash || calculated !== expectedSnapshotHash) {
    throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED", "審核包完整性驗證失敗", 409);
  }
  const { evidenceHash: matrixEvidenceHash, ...matrixBody } = parsed.value.matrix;
  const decisionHash = parsed.value.decisionBasis.kind === "drawing_revision_work"
    ? dev087RequestHash({ payload: parsed.value.decisionBasis.payload, revisionId: parsed.value.decisionBasis.revisionId, claimId: parsed.value.decisionBasis.claimId })
    : dev087RequestHash(parsed.value.decisionBasis.payload);
  const recognitionIntegrityFailed = parsed.value.targets.some((target) => {
    const recognition = target.workspace.recognition;
    if (!isReviewPackageRecognitionProjection(recognition)) return false;
    const { projectionHash, ...projectionBody } = recognition;
    return reviewPackageHash(projectionBody) !== projectionHash
      || recognition.session.drawingId !== target.workspace.entityId
      || recognition.session.drawingRevisionId !== target.workspace.revisionId;
  });
  if (reviewPackageHash(matrixBody) !== matrixEvidenceHash
    || parsed.value.targets.some((target) => reviewPackageWorkspaceEvidenceHash(target.workspace) !== target.evidenceHash)
    || recognitionIntegrityFailed
    || decisionHash !== parsed.value.decisionBasis.hash) {
    throw new CanonicalWorkbenchError("WORKBENCH_REVIEW_PACKAGE_INTEGRITY_FAILED", "審核包證據雜湊驗證失敗", 409);
  }
  return parsed.value;
}
