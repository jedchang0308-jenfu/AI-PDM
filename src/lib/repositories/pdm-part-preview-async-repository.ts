import crypto from "node:crypto";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";

export type PartPreviewSettingAssetRow = {
  part_id: string;
  part_number: string;
  part_name: string;
  setting_id: string | null;
  source_mode: "auto" | "custom_image" | null;
  file_asset_id: string | null;
  row_version: number | string | null;
  storage_provider: string | null;
  original_path: string | null;
  storage_bucket: string | null;
  storage_key: string | null;
  file_name: string | null;
  file_ext: string | null;
  mime_type: string | null;
  file_size: number | string | null;
  content_hash: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  document_category: string | null;
  deleted_at: string | Date | null;
};

export type PartPreviewDrawingSourceRow = {
  part_id: string;
  drawing_id: string;
  row_id: string | null;
  revision_id: string | null;
  data_layer: "drawing_production" | "drawing_rd" | null;
  state_updated_at: string | Date | null;
  drawing_number: string;
  revision: string | null;
  lifecycle_state: string | null;
  revision_updated_at: string | Date | null;
  binding_id: string | null;
  asset_id: string | null;
  role: string | null;
  display_name: string | null;
  file_name: string | null;
  file_ext: string | null;
  mime_type: string | null;
  content_hash: string | null;
  is_primary: number | boolean | null;
  sort_order: number | string | null;
  binding_updated_at: string | Date | null;
};

export type PartPreviewDerivativeJobDbRow = {
  record_kind: "derivative" | "job";
  id: string | null;
  source_file_asset_id: string;
  source_content_hash: string;
  derivative_kind: string | null;
  storage_key: string | null;
  mime_type: string | null;
  generator_profile: string | null;
  generator_version: string | null;
  status: string;
  created_at: string | Date | null;
  last_heartbeat_at: string | Date | null;
};

export type PartPreviewSettingRow = {
  id: string;
  company_id: string;
  part_number_id: string;
  source_mode: "auto" | "custom_image";
  file_asset_id: string | null;
  row_version: number | string;
};

function namedList(prefix: string, values: readonly string[]) {
  const params: Record<string, string> = {};
  return {
    sql: values.map((value, index) => {
      const key = `${prefix}${index}`;
      params[key] = value;
      return `:${key}`;
    }).join(", "),
    params
  };
}

export class PdmPartPreviewAsyncRepository {
  constructor(
    private readonly client: AsyncDatabaseClient,
    private readonly clock: () => string = () => new Date().toISOString(),
    private readonly idFactory: () => string = () => crypto.randomUUID()
  ) {}

  async listSettingsAndCustomAssets(input: { companyId: string; partIds: readonly string[] }) {
    if (input.partIds.length === 0) return [];
    const list = namedList("partPreviewPart", input.partIds);
    return this.client.query<PartPreviewSettingAssetRow>(
      `SELECT part.id AS part_id, part.part_number, part.part_name,
              setting.id AS setting_id, setting.source_mode, setting.file_asset_id, setting.row_version,
              asset.storage_provider, asset.original_path, asset.storage_bucket, asset.storage_key,
              asset.file_name, asset.file_ext, asset.mime_type, asset.file_size, asset.content_hash,
              asset.linked_entity_type, asset.linked_entity_id, asset.document_category, asset.deleted_at
         FROM part_numbers part
         LEFT JOIN part_preview_settings setting
           ON setting.company_id = part.company_id AND setting.part_number_id = part.id
         LEFT JOIN file_assets asset ON asset.id = setting.file_asset_id
        WHERE part.company_id = :companyId AND part.id IN (${list.sql})
        ORDER BY part.id`,
      { companyId: input.companyId, ...list.params }
    );
  }

  async listPrimaryDrawingSources(input: { companyId: string; partIds: readonly string[] }) {
    if (input.partIds.length === 0) return [];
    const list = namedList("partPreviewDrawingPart", input.partIds);
    return this.client.query<PartPreviewDrawingSourceRow>(
      `SELECT part.id AS part_id, drawing.id AS drawing_id,
              state.id AS row_id, state.revision_id, state.data_layer,
              state.updated_at AS state_updated_at,
              number.drawing_number, revision.revision, revision.lifecycle_state,
              revision.updated_at AS revision_updated_at,
              binding.id AS binding_id, asset.id AS asset_id, binding.role, binding.display_name,
              asset.file_name, asset.file_ext, asset.mime_type, asset.content_hash,
              binding.is_primary, binding.sort_order, binding.updated_at AS binding_updated_at
         FROM part_numbers part
         JOIN drawing_part_links link
           ON link.part_number_id = part.id AND link.link_type = 'primary_manufacturing'
         JOIN drawing_numbers number
           ON number.id = link.drawing_number_id AND number.company_id = part.company_id
         JOIN drawings drawing
           ON drawing.formal_drawing_number_id = number.id AND drawing.company_id = part.company_id
         LEFT JOIN canonical_workbench_states state
           ON state.company_id = part.company_id
          AND state.entity_type = 'drawing'
          AND state.canonical_entity_id = drawing.id
          AND state.revision_id IS NOT NULL
          AND (
            state.data_layer = 'drawing_production'
            OR (
              state.data_layer = 'drawing_rd'
              AND EXISTS (
                SELECT 1
                  FROM drawing_revisions active_revision
                 WHERE active_revision.id = state.revision_id
                   AND active_revision.company_id = state.company_id
                   AND active_revision.drawing_id = drawing.id
                   AND active_revision.lifecycle_state IN ('preparing', 'in_review', 'correction_required', 'rd_controlled')
              )
              AND EXISTS (
                SELECT 1
                  FROM drawing_rd_branches active_branch
                 WHERE active_branch.id = state.branch_id
                   AND active_branch.company_id = state.company_id
                   AND active_branch.drawing_id = drawing.id
                   AND active_branch.status = 'open'
              )
            )
          )
         LEFT JOIN drawing_revisions revision
           ON revision.id = state.revision_id
          AND revision.company_id = state.company_id
          AND revision.drawing_id = drawing.id
         LEFT JOIN drawing_revision_files binding
           ON binding.company_id = state.company_id
          AND binding.drawing_revision_id = state.revision_id
          AND binding.removed_at IS NULL
         LEFT JOIN file_assets asset
           ON asset.id = binding.source_file_asset_id AND asset.deleted_at IS NULL
        WHERE part.company_id = :companyId AND part.id IN (${list.sql})
        ORDER BY part.id,
                 CASE state.data_layer WHEN 'drawing_production' THEN 0 WHEN 'drawing_rd' THEN 1 ELSE 2 END,
                 revision.updated_at DESC, state.updated_at DESC,
                 binding.is_primary DESC, binding.sort_order, binding.id`,
      { companyId: input.companyId, ...list.params }
    );
  }

  async listDerivativeJobs(input: { companyId: string; assetIds: readonly string[] }) {
    if (input.assetIds.length === 0) return [];
    const list = namedList("partPreviewAsset", input.assetIds);
    return this.client.query<PartPreviewDerivativeJobDbRow>(
      `SELECT 'derivative' AS record_kind, id, source_file_asset_id, source_content_hash,
              derivative_kind, storage_key, mime_type, generator_profile, generator_version,
              status, created_at, NULL AS last_heartbeat_at
         FROM file_derivatives
        WHERE company_id = :companyId AND source_file_asset_id IN (${list.sql})
       UNION ALL
       SELECT 'job' AS record_kind, NULL AS id, source_file_asset_id, source_content_hash,
              NULL AS derivative_kind, NULL AS storage_key, NULL AS mime_type,
              NULL AS generator_profile, NULL AS generator_version, status, NULL AS created_at,
              COALESCE(locked_at, updated_at) AS last_heartbeat_at
         FROM preview_jobs
        WHERE company_id = :companyId AND source_file_asset_id IN (${list.sql})
        ORDER BY source_file_asset_id, created_at DESC, last_heartbeat_at DESC`,
      { companyId: input.companyId, ...list.params }
    );
  }

  async findPart(input: { companyId: string; partNumber: string; lock?: boolean }) {
    const lock = input.lock && this.client.kind === "postgres" ? " FOR UPDATE" : "";
    return this.client.queryOne<{ id: string; part_number: string; part_name: string }>(
      `SELECT id, part_number, part_name FROM part_numbers
        WHERE company_id = :companyId AND part_number = :partNumber${lock}`,
      input
    );
  }

  async getSetting(input: { companyId: string; partId: string; lock?: boolean }) {
    const lock = input.lock && this.client.kind === "postgres" ? " FOR UPDATE" : "";
    return this.client.queryOne<PartPreviewSettingRow>(
      `SELECT id, company_id, part_number_id, source_mode, file_asset_id, row_version
         FROM part_preview_settings
        WHERE company_id = :companyId AND part_number_id = :partId${lock}`,
      input
    );
  }

  async insertCustomAsset(input: {
    id?: string;
    partId: string;
    storageProvider: string;
    originalPath: string | null;
    storageBucket: string | null;
    storageKey: string;
    fileName: string;
    fileExt: string;
    mimeType: string;
    fileSize: number;
    contentHash: string;
    actorId: string;
  }) {
    const id = input.id ?? this.idFactory();
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO file_assets (
         id, storage_provider, original_path, storage_bucket, storage_key,
         file_name, file_ext, mime_type, file_size, content_hash, hash_algorithm,
         linked_entity_type, linked_entity_id, document_category, display_name,
         description, uploaded_by, gdrive_status, sync_status, created_at, updated_at
       ) VALUES (
         :id, :storageProvider, :originalPath, :storageBucket, :storageKey,
         :fileName, :fileExt, :mimeType, :fileSize, :contentHash, 'SHA-256',
         'part_number', :partId, 'part_preview_image', :fileName,
         '', :actorId, 'none', 'local_only', :now, :now
       )`,
      { ...input, id, now }
    );
    return id;
  }

  async setCustom(input: { companyId: string; partId: string; fileAssetId: string; actorId: string }) {
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO part_preview_settings (
         id, company_id, part_number_id, source_mode, file_asset_id, row_version,
         created_by, updated_by, created_at, updated_at
       ) VALUES (
         :id, :companyId, :partId, 'custom_image', :fileAssetId, 1,
         :actorId, :actorId, :now, :now
       )
       ON CONFLICT (company_id, part_number_id) DO UPDATE SET
         source_mode = 'custom_image', file_asset_id = excluded.file_asset_id,
         row_version = part_preview_settings.row_version + 1,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      { id: this.idFactory(), ...input, now }
    );
    return this.requiredSetting(input.companyId, input.partId);
  }

  async resetAuto(input: { companyId: string; partId: string; actorId: string }) {
    const now = this.clock();
    await this.client.execute(
      `INSERT INTO part_preview_settings (
         id, company_id, part_number_id, source_mode, file_asset_id, row_version,
         created_by, updated_by, created_at, updated_at
       ) VALUES (
         :id, :companyId, :partId, 'auto', NULL, 1,
         :actorId, :actorId, :now, :now
       )
       ON CONFLICT (company_id, part_number_id) DO UPDATE SET
         source_mode = 'auto', file_asset_id = NULL,
         row_version = part_preview_settings.row_version + 1,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      { id: this.idFactory(), ...input, now }
    );
    return this.requiredSetting(input.companyId, input.partId);
  }

  private async requiredSetting(companyId: string, partId: string) {
    const setting = await this.getSetting({ companyId, partId });
    if (!setting) throw new Error("PART_PREVIEW_SETTING_WRITE_FAILED");
    return setting;
  }
}
