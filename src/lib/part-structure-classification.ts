import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { canonicalSha256 } from "@/lib/bom-shared-structure";
import { parseStoredPartStructureType, type StoredPartStructureType, type NumberingStructureType } from "@/lib/numbering-structure-type";
import { lockPdmEntityScopeAsync } from "@/lib/pdm-review-lock";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { PlatformMappingAsyncRepository } from "@/lib/repositories/platform-mapping-async-repository";
import { PlatformOutboxAsyncRepository } from "@/lib/repositories/platform-outbox-async-repository";

const MAX_TARGETS = 100;
const ACTIVE_STATUSES = new Set(["Draft", "NeedInfo", "Active", "PendingReview", "Released", "Rejected", "PendingAdminConfirm"]);

export type PartStructureClassificationCandidate = {
  partNumberId: string;
  partNumber: string;
  name: string;
  structureType: StoredPartStructureType;
  itemKind: "manufactured" | "purchased";
  recordStatus: string;
  material: string | null;
  color: string | null;
  surfaceTreatment: string | null;
  selectable: boolean;
  blockedReason: string | null;
};

export type PartStructureClassificationView = {
  partNumberId: string;
  rootId: string;
  rootCode: string;
  structureType: StoredPartStructureType;
  candidates: PartStructureClassificationCandidate[];
  etag: string;
  canMutate: boolean;
};

export type PartStructureClassificationResult = {
  updatedPartIds: string[];
  structureType: NumberingStructureType;
  etag: string;
};

type PartRow = {
  id: string;
  company_id: string;
  part_root_id: string;
  root_code: string;
  part_number: string;
  part_name: string;
  item_kind: "manufactured" | "purchased";
  structure_type: string | null;
  record_status: string;
  updated_at: string | Date;
  material_code: string | null;
  material_label: string | null;
  color_code: string | null;
  color_label: string | null;
  surface_treatment: string | null;
};

function current(row: PartRow) {
  return ACTIVE_STATUSES.has(row.record_status);
}

function materialLabel(row: PartRow) {
  return row.material_label?.trim() || row.material_code?.trim() || null;
}

function colorLabel(row: PartRow) {
  return row.color_label?.trim() || row.color_code?.trim() || null;
}

function classificationEtag(rows: PartRow[]) {
  return `"${canonicalSha256(rows.map((row) => ({
    id: row.id,
    rootId: row.part_root_id,
    structureType: parseStoredPartStructureType(row.structure_type),
    recordStatus: row.record_status,
    // PostgreSQL returns TIMESTAMPTZ as a Date while SQLite returns text;
    // normalize both providers before hashing so stale-write protection is
    // provider-neutral.
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
  }))).hash}"`;
}

async function getPartRows(client: AsyncDatabaseClient, companyId: string, partNumberId: string, targetIds?: string[]) {
  const ids = [...new Set([partNumberId, ...(targetIds ?? [])].map((id) => id.trim()).filter(Boolean))];
  const params: Record<string, unknown> = { companyId, partNumberId };
  const targetPredicate = ids.length
    ? `AND p.id IN (${ids.map((_, index) => { params[`targetId${index}`] = ids[index]; return `:targetId${index}`; }).join(", ")})`
    : "AND p.id = :partNumberId";
  return client.query<PartRow>(`
    SELECT p.id, p.company_id, p.part_root_id, r.root_code, p.part_number, p.part_name,
      p.item_kind, p.structure_type, p.record_status, p.updated_at,
      va.material_code, va.material_label, va.color_code, va.color_label, va.surface_treatment
    FROM part_numbers p
    JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
    LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
    WHERE p.company_id = :companyId ${targetPredicate}
    ORDER BY p.part_number, p.id
  `, params);
}

async function getRootPartRows(client: AsyncDatabaseClient, companyId: string, rootId: string) {
  return client.query<PartRow>(`
    SELECT p.id, p.company_id, p.part_root_id, r.root_code, p.part_number, p.part_name,
      p.item_kind, p.structure_type, p.record_status, p.updated_at,
      va.material_code, va.material_label, va.color_code, va.color_label, va.surface_treatment
    FROM part_numbers p
    JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
    LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
    WHERE p.company_id = :companyId AND p.part_root_id = :rootId
      AND p.record_status NOT IN ('Obsolete', 'Merged')
    ORDER BY p.part_number, p.id
    LIMIT :limit
  `, { companyId, rootId, limit: MAX_TARGETS + 1 });
}

export async function getPartStructureClassificationAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  partNumberId: string;
  canMutate: boolean;
}): Promise<PartStructureClassificationView | null> {
  const client = input.client ?? getAsyncDatabaseClient();
  const contextRows = await getPartRows(client, input.companyId, input.partNumberId);
  const context = contextRows[0];
  if (!context) return null;
  const rows = await client.query<PartRow>(`
    SELECT p.id, p.company_id, p.part_root_id, r.root_code, p.part_number, p.part_name,
      p.item_kind, p.structure_type, p.record_status, p.updated_at,
      va.material_code, va.material_label, va.color_code, va.color_label, va.surface_treatment
    FROM part_numbers p
    JOIN part_roots r ON r.id = p.part_root_id AND r.company_id = p.company_id
    LEFT JOIN part_variant_attributes va ON va.part_number_id = p.id
    WHERE p.company_id = :companyId AND p.part_root_id = :rootId
      AND p.record_status NOT IN ('Obsolete', 'Merged')
    ORDER BY p.part_number, p.id
    LIMIT :limit
  `, { companyId: input.companyId, rootId: context.part_root_id, limit: MAX_TARGETS + 1 });
  const boundedRows = rows.slice(0, MAX_TARGETS);
  return {
    partNumberId: context.id,
    rootId: context.part_root_id,
    rootCode: context.root_code,
    structureType: parseStoredPartStructureType(context.structure_type),
    candidates: boundedRows.map((row) => ({
      partNumberId: row.id,
      partNumber: row.part_number,
      name: row.part_name,
      structureType: parseStoredPartStructureType(row.structure_type),
      itemKind: row.item_kind,
      recordStatus: row.record_status,
      material: materialLabel(row),
      color: colorLabel(row),
      surfaceTreatment: row.surface_treatment?.trim() || null,
      selectable: current(row),
      blockedReason: current(row) ? null : "此料號已不可修改"
    })),
    etag: classificationEtag(boundedRows),
    canMutate: input.canMutate
  };
}

async function hasBomConflict(client: AsyncDatabaseClient, companyId: string, partIds: string[]) {
  if (!partIds.length) return false;
  const params: Record<string, unknown> = { companyId };
  const ids = partIds.map((id, index) => { params[`partId${index}`] = id; return `:partId${index}`; }).join(", ");
  const row = await client.queryOne<{ id: string }>(`
    SELECT binding.id
    FROM bom_definition_parent_bindings binding
    JOIN bom_definitions definition ON definition.id = binding.definition_id AND definition.company_id = :companyId
    WHERE binding.company_id = :companyId AND binding.part_number_id IN (${ids})
    LIMIT 1
  `, params);
  return Boolean(row);
}

function normalizeIfMatch(value: string | null) {
  return value?.trim() || "";
}

export async function classifyPartStructureAsync(input: {
  client?: AsyncDatabaseClient;
  companyId: string;
  actorId: string;
  metadata: PdmCommandMetadata;
  partNumberId: string;
  targetPartNumberIds: string[];
  structureType: NumberingStructureType;
  reason: string;
  ifMatch: string;
}): Promise<{ result: PartStructureClassificationResult; reusedFromCommandReceipt: boolean }> {
  const client = input.client ?? getAsyncDatabaseClient();
  const targetIds = [...new Set([input.partNumberId, ...input.targetPartNumberIds].map((id) => id.trim()).filter(Boolean))];
  if (!targetIds.length || targetIds.length > MAX_TARGETS) throw new Error("PART_STRUCTURE_TARGET_LIMIT_EXCEEDED");
  const reason = input.reason.trim();
  const payload = { partNumberId: input.partNumberId, targetPartNumberIds: targetIds, structureType: input.structureType, reason, ifMatch: input.ifMatch };
  const command = createPdmCommand({
    commandName: "part.structure_type.classify",
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload
  });
  return client.transaction(async (transactionClient) => {
    const mappings = new PlatformMappingAsyncRepository(transactionClient);
    if (command.actor.pdmUserId !== "system" && (await mappings.ensureCurrentPrincipal(command.actor.pdmUserId)).mappingStatus !== "active") throw new Error("PLATFORM_PRINCIPAL_NOT_ACTIVE");
    const organization = await mappings.ensureCurrentOrganization(command.actor.organizationId);
    if (organization.mappingStatus !== "active") throw new Error("PLATFORM_ORGANIZATION_NOT_ACTIVE");
    const receipt = new PlatformOutboxAsyncRepository(transactionClient);
    const existing = await receipt.findCompletedCommand<PartStructureClassificationResult>(command, payload);
    if (existing) return { result: existing, reusedFromCommandReceipt: true };
    if (!(await receipt.claimCommand(command, payload))) throw new Error("PLATFORM_COMMAND_IN_PROGRESS");

    await lockPdmEntityScopeAsync(transactionClient, targetIds.map((id) => ({ type: "part_number", id, companyId: input.companyId })));
    const rows = await getPartRows(transactionClient, input.companyId, input.partNumberId, targetIds);
    if (rows.length !== targetIds.length || !rows.some((row) => row.id === input.partNumberId)) throw new Error("PART_STRUCTURE_TARGET_SCOPE_INVALID");
    const rootId = rows[0]?.part_root_id;
    if (!rootId || rows.some((row) => row.part_root_id !== rootId)) throw new Error("PART_STRUCTURE_TARGET_ROOT_MISMATCH");
    if (rows.some((row) => !current(row))) throw new Error("PART_STRUCTURE_TARGET_INACTIVE");
    const allCurrentRows = await getRootPartRows(transactionClient, input.companyId, rootId);
    if (allCurrentRows.length > MAX_TARGETS) throw new Error("PART_STRUCTURE_TARGET_LIMIT_EXCEEDED");
    const etag = classificationEtag(allCurrentRows);
    if (normalizeIfMatch(input.ifMatch) !== etag) throw new Error("PART_STRUCTURE_STALE_ETAG");
    const changedRows = rows.filter((row) => parseStoredPartStructureType(row.structure_type) !== input.structureType);
    const requiresReason = targetIds.length > 1 || rows.some((row) => {
      const previous = parseStoredPartStructureType(row.structure_type);
      return previous !== "unclassified" && previous !== input.structureType;
    });
    if (requiresReason && !reason) throw new Error("PART_STRUCTURE_REASON_REQUIRED");
    if (input.structureType === "single_part" && await hasBomConflict(transactionClient, input.companyId, changedRows.map((row) => row.id))) throw new Error("PART_STRUCTURE_BOM_CONFLICT");
    if (!changedRows.length) {
      const result = { updatedPartIds: [], structureType: input.structureType, etag };
      await receipt.completeCommand(command, result, payload);
      return { result, reusedFromCommandReceipt: false };
    }
    const now = new Date().toISOString();
    const updateParams: Record<string, unknown> = { structureType: input.structureType, updatedAt: now, companyId: input.companyId };
    const predicates = changedRows.map((row, index) => { updateParams[`partId${index}`] = row.id; return `:partId${index}`; }).join(", ");
    await transactionClient.execute(`UPDATE part_numbers SET structure_type = :structureType, updated_at = :updatedAt WHERE company_id = :companyId AND id IN (${predicates})`, updateParams);
    await transactionClient.execute(`INSERT INTO audit_logs (id, actor_id, action, detail_json, created_at) VALUES (:id, :actorId, :action, :detailJson, :createdAt)`, {
      id: crypto.randomUUID(), actorId: input.actorId, action: "part.structure_type.classify",
      detailJson: JSON.stringify({ companyId: input.companyId, rootId, targetPartNumberIds: changedRows.map((row) => row.id), structureType: input.structureType, reason: reason || null, before: changedRows.map((row) => ({ id: row.id, structureType: parseStoredPartStructureType(row.structure_type) })), after: input.structureType }),
      createdAt: now
    });
    const afterRows = await getRootPartRows(transactionClient, input.companyId, rootId);
    const result = { updatedPartIds: changedRows.map((row) => row.id), structureType: input.structureType, etag: classificationEtag(afterRows) };
    await receipt.completeCommand(command, result, payload);
    return { result, reusedFromCommandReceipt: false };
  }, { serializable: true });
}
