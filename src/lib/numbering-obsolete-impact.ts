import crypto from "node:crypto";
import { getAsyncDatabaseClient, type AsyncDatabaseClient } from "@/lib/db-async-provider";

export type FormalObsoleteImpactEntityType = "drawing_number" | "part_number";
export type FormalObsoleteDependency = { kind: string; id: string; code: string; disposition: string };
export type FormalObsoleteImpactDto = {
  entityType: FormalObsoleteImpactEntityType;
  entityId: string;
  entityCode: string;
  recordStatus: string;
  dependencies: FormalObsoleteDependency[];
  fingerprint: string;
  pendingRequestId: string | null;
};

export class FormalObsoleteImpactError extends Error {
  constructor(public readonly code: "LIFE_UNSUPPORTED_ENTITY" | "LIFE_ENTITY_NOT_FOUND" | "LIFE_ENTITY_IDENTITY_MISMATCH", message: string) {
    super(message);
    this.name = "FormalObsoleteImpactError";
  }
}

function text(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(input: { companyId: string; entityType: FormalObsoleteImpactEntityType; entityId: string; entityCode: string; recordStatus: string; dependencies: FormalObsoleteDependency[] }) {
  return crypto.createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function dependency(kind: string, id: unknown, code: unknown, disposition: unknown): FormalObsoleteDependency | null {
  const normalizedId = text(id);
  if (!normalizedId) return null;
  return { kind, id: normalizedId, code: text(code) || normalizedId, disposition: text(disposition) || "active" };
}

function sortedDependencies(values: FormalObsoleteDependency[]) {
  const unique = new Map(values.map((value) => [`${value.kind}:${value.id}`, value]));
  return [...unique.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

async function resolveFormalEntity(client: AsyncDatabaseClient, input: { companyId: string; entityType: FormalObsoleteImpactEntityType; entityId?: string | null; entityCode?: string | null }) {
  const table = input.entityType === "drawing_number" ? "drawing_numbers" : "part_numbers";
  const codeColumn = input.entityType === "drawing_number" ? "drawing_number" : "part_number";
  const requestedId = text(input.entityId);
  const requestedCode = text(input.entityCode);
  if (!requestedId && !requestedCode) throw new FormalObsoleteImpactError("LIFE_ENTITY_NOT_FOUND", "缺少正式圖號或料號識別值");
  const row = await client.queryOne<Record<string, unknown>>(
    `SELECT id, ${codeColumn} AS entity_code, record_status
       FROM ${table}
      WHERE company_id = :companyId
        AND (id = :entityId OR ${codeColumn} = :entityCode)
      ORDER BY CASE WHEN id = :entityId THEN 0 ELSE 1 END, id
      LIMIT 1`,
    { companyId: input.companyId, entityId: requestedId || "__missing__", entityCode: requestedCode || "__missing__" }
  );
  if (!row) throw new FormalObsoleteImpactError("LIFE_ENTITY_NOT_FOUND", "正式資料不存在");
  if (requestedId && text(row.id) !== requestedId) throw new FormalObsoleteImpactError("LIFE_ENTITY_IDENTITY_MISMATCH", "正式資料識別值不一致");
  if (requestedCode && text(row.entity_code) !== requestedCode) throw new FormalObsoleteImpactError("LIFE_ENTITY_IDENTITY_MISMATCH", "正式資料識別值不一致");
  return { id: text(row.id), code: text(row.entity_code), recordStatus: text(row.record_status) };
}

async function drawingDependencies(client: AsyncDatabaseClient, companyId: string, entityId: string) {
  const dependencies: FormalObsoleteDependency[] = [];
  const relationRows = await client.query<Record<string, unknown>>(
    `SELECT link.part_number_id AS dependency_id, part.part_number AS dependency_code, link.link_type
       FROM drawing_part_links link
       JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.company_id = :companyId
       JOIN part_numbers part ON part.id = link.part_number_id AND part.company_id = :companyId
      WHERE link.drawing_number_id = :entityId
      ORDER BY link.link_type, link.part_number_id`,
    { companyId, entityId }
  );
  relationRows.forEach((row) => {
    const value = dependency("part_relation", row.dependency_id, row.dependency_code, row.link_type);
    if (value) dependencies.push(value);
  });

  const canonicalDrawing = await client.queryOne<{ id: string }>(
    `SELECT id FROM drawings WHERE company_id = :companyId AND formal_drawing_number_id = :entityId LIMIT 1`,
    { companyId, entityId }
  );
  if (canonicalDrawing) {
    const revisionRows = await client.query<Record<string, unknown>>(
      `SELECT id, revision, lifecycle_state FROM drawing_revisions
        WHERE company_id = :companyId AND drawing_id = :drawingId
        ORDER BY id`,
      { companyId, drawingId: canonicalDrawing.id }
    );
    revisionRows.forEach((row) => {
      const value = dependency("controlled_revision", row.id, row.revision, row.lifecycle_state);
      if (value) dependencies.push(value);
    });
    const fileRows = await client.query<Record<string, unknown>>(
      `SELECT file.id, asset.file_name, file.role, file.drawing_revision_id
         FROM drawing_revision_files file
         JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE file.company_id = :companyId AND file.drawing_revision_id IN (
          SELECT id FROM drawing_revisions WHERE company_id = :companyId AND drawing_id = :drawingId
        ) AND file.removed_at IS NULL AND asset.deleted_at IS NULL
        ORDER BY file.id`,
      { companyId, drawingId: canonicalDrawing.id }
    );
    fileRows.forEach((row) => {
      const value = dependency("controlled_file", row.id, row.file_name, `${text(row.role)}:${text(row.drawing_revision_id)}`);
      if (value) dependencies.push(value);
    });
  }

  const packageRows = await client.query<Record<string, unknown>>(
    `SELECT package.id, package.revision, package.status
       FROM drawing_revision_packages package
      WHERE package.company_id = :companyId AND package.drawing_number_id = :entityId
      ORDER BY package.id`,
    { companyId, entityId }
  );
  packageRows.forEach((row) => {
    const value = dependency("revision_package", row.id, row.revision, row.status);
    if (value) dependencies.push(value);
  });
  return sortedDependencies(dependencies);
}

async function partDependencies(client: AsyncDatabaseClient, companyId: string, entityId: string) {
  const dependencies: FormalObsoleteDependency[] = [];
  const relationRows = await client.query<Record<string, unknown>>(
    `SELECT link.drawing_number_id AS dependency_id, drawing.drawing_number AS dependency_code, link.link_type, drawing.record_status
       FROM drawing_part_links link
       JOIN drawing_numbers drawing ON drawing.id = link.drawing_number_id AND drawing.company_id = :companyId
      WHERE link.part_number_id = :entityId
      ORDER BY link.link_type, link.drawing_number_id`,
    { companyId, entityId }
  );
  relationRows.forEach((row) => {
    const value = dependency("drawing_relation", row.dependency_id, row.dependency_code, `${text(row.link_type)}:${text(row.record_status)}`);
    if (value) dependencies.push(value);
  });

  const replacementRows = await client.query<Record<string, unknown>>(
    `SELECT link.id, new_part.part_number AS new_code, link.released_at
       FROM part_replacement_links link
       JOIN part_numbers old_part ON old_part.id = link.old_part_number_id AND old_part.company_id = :companyId
       JOIN part_numbers new_part ON new_part.id = link.new_part_number_id AND new_part.company_id = :companyId
      WHERE link.company_id = :companyId AND link.old_part_number_id = :entityId
      ORDER BY link.id`,
    { companyId, entityId }
  );
  replacementRows.forEach((row) => {
    const value = dependency("replacement_link", row.id, row.new_code, text(row.released_at) || "released");
    if (value) dependencies.push(value);
  });

  const reconfirmationRows = await client.query<Record<string, unknown>>(
    `SELECT id, bom_draft_id, reason, resolved_at
       FROM bom_reconfirmation_flags
      WHERE company_id = :companyId AND old_part_number_id = :entityId
      ORDER BY id`,
    { companyId, entityId }
  );
  reconfirmationRows.forEach((row) => {
    const value = dependency("bom_reconfirmation", row.id, row.bom_draft_id, text(row.resolved_at) ? "resolved" : text(row.reason) || "open");
    if (value) dependencies.push(value);
  });
  return sortedDependencies(dependencies);
}

export async function getFormalObsoleteImpactAsync(input: { companyId: string; entityType: FormalObsoleteImpactEntityType; entityId?: string | null; entityCode?: string | null; client?: AsyncDatabaseClient }): Promise<FormalObsoleteImpactDto> {
  if (input.entityType !== "drawing_number" && input.entityType !== "part_number") throw new FormalObsoleteImpactError("LIFE_UNSUPPORTED_ENTITY", "只支援正式圖號或料號");
  const client = input.client ?? getAsyncDatabaseClient();
  const entity = await resolveFormalEntity(client, input);
  const dependencies = input.entityType === "drawing_number"
    ? await drawingDependencies(client, input.companyId, entity.id)
    : await partDependencies(client, input.companyId, entity.id);
  const pending = await client.queryOne<{ id: string }>(
    `SELECT id FROM approval_requests
      WHERE company_id = :companyId AND entity_type = :entityType AND entity_id = :entityId
        AND request_status = 'pending'
        AND action_code IN ('obsolete_part_number', 'obsolete_ma_drawing')
      ORDER BY requested_at DESC, id DESC LIMIT 1`,
    { companyId: input.companyId, entityType: input.entityType, entityId: entity.id }
  );
  const base = { companyId: input.companyId, entityType: input.entityType, entityId: entity.id, entityCode: entity.code, recordStatus: entity.recordStatus, dependencies };
  return { entityType: input.entityType, entityId: entity.id, entityCode: entity.code, recordStatus: entity.recordStatus, dependencies, fingerprint: fingerprint(base), pendingRequestId: pending?.id ?? null };
}

