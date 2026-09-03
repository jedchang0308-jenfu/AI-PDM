import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { assertCanonicalDtoHasNoRetiredFields, CanonicalWorkbenchError, normalizeCanonicalWorkbenchQuery, parseCanonicalRowKey, type CanonicalDetailDisclosure, type CanonicalDetailField, type CanonicalDetailFile, type CanonicalDetailRecognitionProjection, type CanonicalDetailReadModelRow, type CanonicalDrawingHistory, type CanonicalRelationMatrixProjection, type CanonicalWorkbenchDetailDto, type CanonicalWorkbenchDetailPresentation, type CanonicalWorkbenchListDto, type WorkbenchEntityType } from "@/lib/pdm-canonical-workbench-contract";
import { projectCanonicalWorkbenchRow, sortCanonicalGroupRows, type CanonicalWorkbenchActor, type CanonicalWorkbenchStateRecord } from "@/lib/pdm-canonical-workbench-state";
import { issueCanonicalWorkbenchContract } from "@/lib/pdm-workbench-authority-control";
import { PdmCanonicalWorkbenchAsyncRepository } from "@/lib/repositories/pdm-canonical-workbench-async-repository";
import { RelationFormalAuthorityRepository } from "@/lib/repositories/relation-formal-authority-async-repository";
import type { DrawingPreviewSlotModel } from "@/lib/pdm-entity-detail-contract";
import { pdmFileReadHref } from "@/lib/pdm-file-read-contract";
import { buildCanonicalDrawingPreviewMap, resolveCanonicalDrawingPreview, selectCanonicalThreeDSource, selectCanonicalTwoDSource, type CanonicalPreviewProjection, type CanonicalPreviewSourceRow } from "@/lib/pdm-canonical-preview";
import { canonicalNumberingItemKindLabel } from "@/lib/numbering-item-kind";
import { isDrawingWorkbenchPreviewGalleryV1Enabled, isPartWorkbenchPreviewGalleryV1Enabled } from "@/lib/number-state-flow-feature";
import { resolvePartPreviewsAsync } from "@/lib/pdm-part-preview";
import { PdmPartPreviewAsyncRepository } from "@/lib/repositories/pdm-part-preview-async-repository";
import { withPdmWorkbenchReadSnapshot } from "@/lib/repositories/pdm-workbench-read-snapshot";
import { ensureAutomaticPreviewJobsForSourceAssetsAsync } from "@/lib/preview-derivatives";

type CanonicalPreviewSource = CanonicalPreviewSourceRow;

type CanonicalPreviewDerivative = {
  id: string;
  sourceFileAssetId: string;
  sourceContentHash: string;
  derivativeKind: string;
  storageKey: string | null;
  mimeType: string | null;
  generatorProfile: string | null;
  generatorVersion: string | null;
  createdAt: string | null;
};

type CanonicalPreviewJob = {
  sourceFileAssetId: string;
  sourceContentHash: string;
  status: string;
  lastHeartbeatAt: string;
};

export class PdmCanonicalWorkbenchService {
  constructor(private readonly client: AsyncDatabaseClient = getAsyncDatabaseClient()) {}

  async list(url: URL, entityType: WorkbenchEntityType, actor: CanonicalWorkbenchActor): Promise<CanonicalWorkbenchListDto> {
    const query = normalizeCanonicalWorkbenchQuery(url, entityType);
    const drawingPreviewEnabled = entityType === "drawing" && isDrawingWorkbenchPreviewGalleryV1Enabled();
    const partPreviewEnabled = entityType === "part" && isPartWorkbenchPreviewGalleryV1Enabled();
    const { result, previewByRowKey } = await withPdmWorkbenchReadSnapshot(this.client, async (snapshot) => {
      const repository = new PdmCanonicalWorkbenchAsyncRepository(snapshot);
      const result = await repository.listWithinSnapshot(snapshot, { companyId: actor.companyId, entityType, query });
      const visibleRows = result.groups.flatMap((group) => group.rows);
      const rowKeysByPartId = partPreviewEnabled ? Object.fromEntries(
        [...new Set(visibleRows.map((row) => row.canonicalEntityId))].map((partId) => [
          partId,
          visibleRows.filter((row) => row.canonicalEntityId === partId).map((row) => `cw_${row.id}`)
        ])
      ) : {};
      const previewByRowKey = drawingPreviewEnabled
        ? buildCanonicalDrawingPreviewMap({
            rows: visibleRows,
            sources: result.previewSources,
            derivativeJobs: result.previewDerivativeJobs
          })
        : partPreviewEnabled
          ? await resolvePartPreviewsAsync(snapshot, {
              companyId: actor.companyId,
              partIds: visibleRows.map((row) => row.canonicalEntityId),
              rowKeysByPartId
            })
          : undefined;
      return { result, previewByRowKey };
    });
    const response: CanonicalWorkbenchListDto = {
      data: {
        groups: result.groups.map((group) => ({ groupKey: group.groupKey, rows: sortCanonicalGroupRows(group.rows).map((row) => projectCanonicalWorkbenchRow(row, actor)) })),
        nextCursor: result.nextCursor,
        previousCursor: result.previousCursor,
        totalGroups: result.totalGroups,
        totalRows: result.totalRows,
        ...(previewByRowKey !== undefined ? { previewByRowKey } : {})
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
    if (!record) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "資料不存在", 404);
    if (record.entityType === "relation") throw new CanonicalWorkbenchError("WORKBENCH_COMMAND_CONTRACT_RETIRED", "此工作台已退役，請使用編號搜尋", 410);
    if (record.entityType !== entityType) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "資料不存在", 404);
    const currentRecord = record as CanonicalWorkbenchStateRecord & { entityType: WorkbenchEntityType };
    const presentation = await this.presentation(currentRecord, actor);
    const response: CanonicalWorkbenchDetailDto = {
      data: {
        row: projectCanonicalWorkbenchRow(currentRecord, actor),
        presentation
      },
      meta: { contractToken: await issueCanonicalWorkbenchContract(this.client, { companyId: actor.companyId, actorId: actor.id }), correlationId: crypto.randomUUID() }
    };
    assertCanonicalDtoHasNoRetiredFields(response);
    return response;
  }

  private async presentation(record: CanonicalWorkbenchStateRecord & { entityType: WorkbenchEntityType }, actor: CanonicalWorkbenchActor): Promise<CanonicalWorkbenchDetailPresentation> {
    const [fields, files, matrix, recognition] = await Promise.all([
      this.fields(record.entityType, actor.companyId, record.canonicalEntityId),
      this.files(record, actor.companyId),
      this.matrixForRecord(record, actor.companyId),
      this.recognitionProjection(record, actor.companyId)
    ]);
    const base = { surface: "drawer_minimal" as const, fields, files, recognition };
    if (record.entityType === "drawing") {
      const [history, previews] = await Promise.all([
        this.drawingHistory(actor.companyId, record.canonicalEntityId),
        this.previewSlots(record, actor)
      ]);
      return {
        kind: "drawing",
        ...base,
        relationMatrix: matrix,
        history,
        previews,
        preview: drawingProjectionFromSlot(record, previews[0])
      };
    }
    if (record.entityType === "part") {
      if (!isPartWorkbenchPreviewGalleryV1Enabled()) return { kind: "part", ...base, relationMatrix: matrix };
      const [previewMap, setting] = await Promise.all([
        resolvePartPreviewsAsync(this.client, {
          companyId: actor.companyId,
          partIds: [record.canonicalEntityId],
          rowKeysByPartId: { [record.canonicalEntityId]: [record.id] }
        }),
        new PdmPartPreviewAsyncRepository(this.client).getSetting({ companyId: actor.companyId, partId: record.canonicalEntityId })
      ]);
      const preview = previewMap[record.id];
      if (!preview) throw new CanonicalWorkbenchError("WORKBENCH_BAD_REQUEST", "料號預覽資料不存在", 404);
      return {
        kind: "part",
        ...base,
        relationMatrix: matrix,
        preview,
        previewSourceControl: {
          settingRowVersion: Number(setting?.row_version ?? 0),
          canManage: actor.permissions.manageAttachments === true,
          hasPrimaryManufacturingDrawing: preview.hasPrimaryManufacturingDrawing === true,
          disabledReason: actor.permissions.manageAttachments === true ? null : "沒有管理附件權限"
        }
      };
    }
    throw new CanonicalWorkbenchError("WORKBENCH_COMMAND_CONTRACT_RETIRED", "此工作台已退役，請使用編號搜尋", 410);
  }

  private async matrixForRecord(record: CanonicalWorkbenchStateRecord & { entityType: WorkbenchEntityType }, companyId: string): Promise<CanonicalRelationMatrixProjection> {
    const repository = new RelationFormalAuthorityRepository(this.client);
    const rootId = await repository.rootForEntity({ companyId, entityType: record.entityType, entityId: record.canonicalEntityId });
    if (rootId) {
      try {
        return await repository.getMatrix({ companyId, rootId });
      } catch (error) {
        if (!(error instanceof CanonicalWorkbenchError) || error.code !== "WORKBENCH_RELATION_SCOPE_INVALID") throw error;
        const matrixEtag = crypto.createHash("sha256")
          .update(JSON.stringify({ companyId, entityType: record.entityType, entityId: record.canonicalEntityId, rootId, scope: "invalid" }))
          .digest("hex");
        return {
          rootId: "",
          rootCode: "",
          matrixEtag,
          drawings: [],
          parts: [],
          cells: [],
          issue: { code: "WORKBENCH_RELATION_SCOPE_INVALID", message: "圖料關聯資料不完整，請聯絡系統管理員" }
        };
      }
    }

    // A legacy/preparation drawing or part may legitimately exist before it
    // is assigned to a part root.  It is still a readable workbench record;
    // absence of a relation scope is not a snapshot conflict.  Return an
    // explicit empty projection so the drawer can explain the empty matrix
    // without offering a PATCH against an invalid root id.
    const matrixEtag = crypto.createHash("sha256")
      .update(JSON.stringify({ companyId, entityType: record.entityType, entityId: record.canonicalEntityId, scope: "unscoped" }))
      .digest("hex");
    return { rootId: "", rootCode: "", matrixEtag, drawings: [], parts: [], cells: [] };
  }

  /** The canonical drawer resolves every domain through canonical revision/file
   * relations.  It never falls back to the retired workspace detail graph. */
  private async previewSlots(record: CanonicalWorkbenchStateRecord & { entityType: WorkbenchEntityType }, actor: CanonicalWorkbenchActor): Promise<[DrawingPreviewSlotModel, DrawingPreviewSlotModel]> {
    const revisionId = record.entityType === "drawing" && record.revisionId
      ? record.revisionId
      : await this.representativeDrawingRevisionId(record.entityType, actor.companyId, record.canonicalEntityId);
    if (!revisionId) return emptyPreviewSlots();
    const rows = await this.client.query<Record<string, unknown>>(`SELECT binding.id AS binding_id, binding.drawing_revision_id,
        binding.role, binding.display_name, asset.id AS asset_id, asset.file_name, asset.file_ext,
        asset.mime_type, asset.content_hash, binding.is_primary, binding.sort_order
      FROM drawing_revision_files binding
      JOIN file_assets asset ON asset.id = binding.source_file_asset_id
      WHERE binding.company_id = :companyId AND binding.drawing_revision_id = :revisionId
        AND binding.removed_at IS NULL AND asset.deleted_at IS NULL
      ORDER BY binding.sort_order, binding.id`, { companyId: actor.companyId, revisionId });
    const sources = rows.map((row): CanonicalPreviewSource => ({
      rowId: record.id,
      bindingId: String(row.binding_id), revisionId: String(row.drawing_revision_id), assetId: String(row.asset_id),
      dataLayer: record.dataLayer === "drawing_rd" ? "drawing_rd" : "drawing_production",
      role: textValue(row.role).toLowerCase(), displayName: textValue(row.display_name), fileName: textValue(row.file_name),
      fileExt: textValue(row.file_ext).replace(/^\./u, "").toLowerCase(), mimeType: textValue(row.mime_type).toLowerCase(),
      contentHash: textValue(row.content_hash), isPrimary: Number(row.is_primary ?? 0), sortOrder: Number(row.sort_order ?? 0),
      reviewRequestId: record.reviewRequestId
    }));
    if (!sources.length) return emptyPreviewSlots();
    const assetIds = sources.map((source) => source.assetId);
    await ensureAutomaticPreviewJobsForSourceAssetsAsync(this.client, {
      companyId: actor.companyId,
      sourceFileAssetIds: assetIds,
      actorUserId: actor.id
    });
    const derivatives = await this.previewDerivatives(actor.companyId, assetIds);
    const jobs = await this.previewJobs(actor.companyId, assetIds);
    const readContext = record.entityType === "drawing" && record.dataLayer === "drawing_rd"
      ? "candidate_revision" as const
      : "drawing_revision" as const;
    return [
      canonicalPreviewSlot("three-d", "3D 模型", pickPreviewSource(sources, "three-d"), derivatives, jobs, readContext, record.reviewRequestId),
      canonicalPreviewSlot("two-d", "2D 圖面", pickPreviewSource(sources, "two-d", derivatives), derivatives, jobs, readContext, record.reviewRequestId)
    ];
  }

  private async representativeDrawingRevisionId(entityType: WorkbenchEntityType, companyId: string, entityId: string) {
    if (entityType === "drawing") return null;
    const relation = `JOIN drawing_part_links link ON link.part_number_id = :entityId
         JOIN drawing_numbers number ON number.id = link.drawing_number_id AND number.company_id = :companyId
         JOIN drawings drawing ON drawing.formal_drawing_number_id = number.id AND drawing.company_id = number.company_id`;
    const row = await this.client.queryOne<{ revision_id: string }>(`SELECT state.revision_id
      FROM canonical_workbench_states state
      ${relation}
      WHERE state.company_id = :companyId AND state.entity_type = 'drawing'
        AND state.canonical_entity_id = drawing.id AND state.revision_id IS NOT NULL
      ORDER BY CASE state.data_layer WHEN 'drawing_production' THEN 0 ELSE 1 END,
        state.updated_at DESC, state.id
      LIMIT 1`, { companyId, entityId });
    return row?.revision_id ?? null;
  }

  private async previewDerivatives(companyId: string, assetIds: string[]): Promise<CanonicalPreviewDerivative[]> {
    const list = namedSqlList("previewAsset", assetIds);
    const rows = await this.client.query<Record<string, unknown>>(`SELECT id, source_file_asset_id, source_content_hash, derivative_kind,
        storage_key, mime_type, generator_profile, generator_version, created_at
      FROM file_derivatives
      WHERE company_id = :companyId AND source_file_asset_id IN (${list.sql}) AND status = 'ready'
        AND generator_profile <> 'fake_preview_worker' AND generator_version <> 'fake-local-pipeline'
      ORDER BY created_at DESC, id`, { companyId, ...list.params });
    return rows.map((row) => ({ id: String(row.id), sourceFileAssetId: String(row.source_file_asset_id), sourceContentHash: textValue(row.source_content_hash), derivativeKind: textValue(row.derivative_kind), storageKey: textValue(row.storage_key) || null, mimeType: textValue(row.mime_type) || null, generatorProfile: textValue(row.generator_profile) || null, generatorVersion: textValue(row.generator_version) || null, createdAt: textValue(row.created_at) || null }));
  }

  private async previewJobs(companyId: string, assetIds: string[]): Promise<CanonicalPreviewJob[]> {
    const list = namedSqlList("previewJobAsset", assetIds);
    const rows = await this.client.query<Record<string, unknown>>(`SELECT source_file_asset_id, source_content_hash, status,
        COALESCE(locked_at, updated_at) AS last_heartbeat_at
      FROM preview_jobs WHERE company_id = :companyId AND source_file_asset_id IN (${list.sql})
      ORDER BY updated_at DESC, created_at DESC`, { companyId, ...list.params });
    const seen = new Set<string>();
    return rows.filter((row) => {
      const id = String(row.source_file_asset_id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }).map((row) => ({ sourceFileAssetId: String(row.source_file_asset_id), sourceContentHash: textValue(row.source_content_hash), status: textValue(row.status), lastHeartbeatAt: textValue(row.last_heartbeat_at) }));
  }

  private async fields(entityType: WorkbenchEntityType, companyId: string, entityId: string): Promise<CanonicalDetailField[]> {
    if (entityType === "drawing") {
      const drawing = await this.client.queryOne<Record<string, unknown>>(`SELECT drawing_number AS code, purpose_code, purpose_description FROM drawings WHERE id = :entityId AND company_id = :companyId`, { companyId, entityId });
      return compactFields([
        field("code", "圖號", drawing?.code),
        field("purpose", "圖面用途", drawing?.purpose_code),
        field("purposeDescription", "用途說明", drawing?.purpose_description)
      ]);
    }
    if (entityType === "part") {
      const part = await this.client.queryOne<Record<string, unknown>>(`SELECT part_number AS code, part_name, item_kind, is_universal, custom_specification, series_code FROM part_numbers WHERE id = :entityId AND company_id = :companyId`, { companyId, entityId });
      const kind = canonicalNumberingItemKindLabel(part?.item_kind);
      const universal = Number(part?.is_universal ?? 0) === 1;
      return compactFields([
        field("code", "料號", part?.code), field("name", "品名", part?.part_name),
        field("kind", "料件類型", kind), field("universal", "共用件", universal ? "是" : "否"),
        field("specification", "規格", part?.custom_specification),
        field("series", "系列代號", part?.series_code)
      ]);
    }
    throw new CanonicalWorkbenchError("WORKBENCH_COMMAND_CONTRACT_RETIRED", "此工作台已退役，請使用編號搜尋", 410);
  }

  /**
   * Formalized recognition values are a read-only projection of the existing
   * PDM tables.  It deliberately does not expose raw OCR or decision payloads;
   * the disclosure rows retain only the traceability needed by the drawer.
   */
  private async recognitionProjection(record: CanonicalWorkbenchStateRecord & { entityType: WorkbenchEntityType }, companyId: string): Promise<CanonicalDetailRecognitionProjection> {
    if (record.entityType === "part") {
      const [partAttributes, controlledNotes, engineeringEvidence] = await Promise.all([
        this.partAttributeRows(companyId, record.canonicalEntityId),
        this.controlledNoteRows(companyId, { partNumberId: record.canonicalEntityId }),
        this.engineeringEvidenceRows(companyId, { partNumberId: record.canonicalEntityId })
      ]);
      return { partAttributes, revisionMetadata: [], controlledNotes, engineeringEvidence };
    }
    const [revisionMetadata, controlledNotes, engineeringEvidence] = await Promise.all([
      record.revisionId ? this.revisionMetadataRows(companyId, record.revisionId) : Promise.resolve([]),
      this.controlledNoteRows(companyId, { drawingId: record.canonicalEntityId, drawingRevisionId: record.revisionId }),
      this.engineeringEvidenceRows(companyId, { drawingId: record.canonicalEntityId, drawingRevisionId: record.revisionId })
    ]);
    return { partAttributes: [], revisionMetadata, controlledNotes, engineeringEvidence };
  }

  private async partAttributeRows(companyId: string, partNumberId: string): Promise<CanonicalDetailReadModelRow[]> {
    const rows = await this.client.query<Record<string, unknown>>(`SELECT definition.stable_key, definition.display_label,
        value.applicability_state, value.value_text, value.unit_text, value.updated_at,
        value.last_formalization_event_id, event.created_at AS formalized_at
      FROM pdm_part_attribute_values value
      JOIN pdm_attribute_definitions definition ON definition.id = value.attribute_definition_id
      LEFT JOIN drawing_recognition_formalization_events event ON event.id = value.last_formalization_event_id AND event.company_id = value.company_id
      WHERE value.company_id = :companyId AND value.part_number_id = :partNumberId
      ORDER BY definition.display_label, definition.stable_key`, { companyId, partNumberId });
    const formalKeys = new Set<string>();
    const formal = rows.flatMap((row) => {
      const key = textValue(row.stable_key);
      if (!key) return [];
      formalKeys.add(key);
      const notApplicable = textValue(row.applicability_state) === "not_applicable";
      const value = notApplicable ? "不適用" : textValue(row.value_text);
      if (!value) return [];
      const details = detailTrace({
        scope: notApplicable ? "不適用" : "適用",
        source: row.last_formalization_event_id ? "智慧辨識正式化" : "PDM 屬性",
        updatedAt: row.formalized_at ?? row.updated_at,
        eventId: row.last_formalization_event_id
      });
      const unit = textValue(row.unit_text);
      return [{ key, label: textValue(row.display_label) || key, value: unit ? `${value} ${unit}` : value, details }];
    });
    const legacy = await this.client.queryOne<Record<string, unknown>>(`SELECT attributes.material_label, attributes.color_label,
        attributes.surface_treatment, attributes.variant_note, attributes.updated_at
      FROM part_variant_attributes attributes
      JOIN part_numbers part ON part.id = attributes.part_number_id AND part.company_id = :companyId
      WHERE attributes.part_number_id = :partNumberId`, { companyId, partNumberId });
    const legacyDefinitions: Array<{ key: string; label: string; column: string }> = [
      { key: "material", label: "材質", column: "material_label" },
      { key: "color", label: "顏色", column: "color_label" },
      { key: "surface_treatment", label: "表面處理", column: "surface_treatment" },
      { key: "variant_note", label: "變體備註", column: "variant_note" }
    ];
    const legacyRows = legacy ? legacyDefinitions.flatMap(({ key, label, column }) => {
      if (formalKeys.has(key)) return [];
      const value = textValue(legacy[column]);
      return value ? [{ key, label, value, details: detailTrace({ source: "既有料件屬性", updatedAt: legacy.updated_at }) }] : [];
    }) : [];
    return [...formal, ...legacyRows];
  }

  private async revisionMetadataRows(companyId: string, drawingRevisionId: string): Promise<CanonicalDetailReadModelRow[]> {
    const rows = await this.client.query<Record<string, unknown>>(`SELECT metadata_key, value_text, updated_at,
        last_formalization_event_id, event.created_at AS formalized_at
      FROM pdm_drawing_revision_metadata_values metadata
      LEFT JOIN drawing_recognition_formalization_events event ON event.id = metadata.last_formalization_event_id AND event.company_id = metadata.company_id
      WHERE metadata.company_id = :companyId AND metadata.drawing_revision_id = :drawingRevisionId
      ORDER BY CASE metadata.metadata_key
        WHEN 'unit' THEN 1 WHEN 'scale' THEN 2 WHEN 'projection_method' THEN 3
        WHEN 'drawn_date' THEN 4 WHEN 'reviewed_date' THEN 5 ELSE 99 END`, { companyId, drawingRevisionId });
    const labels: Record<string, string> = {
      unit: "單位", scale: "比例", projection_method: "投影法", drawn_date: "製圖日期", reviewed_date: "審查日期"
    };
    return rows.flatMap((row) => {
      const key = textValue(row.metadata_key);
      const value = textValue(row.value_text);
      return key && value ? [{
        key,
        label: labels[key] || key,
        value,
        details: detailTrace({
          source: row.last_formalization_event_id ? "智慧辨識正式化" : "PDM 版次資料",
          updatedAt: row.formalized_at ?? row.updated_at,
          eventId: row.last_formalization_event_id
        })
      }] : [];
    });
  }

  private async controlledNoteRows(companyId: string, owner: { partNumberId?: string; drawingId?: string; drawingRevisionId?: string | null }): Promise<CanonicalDetailReadModelRow[]> {
    const ownerParams = { companyId, partNumberId: owner.partNumberId ?? "", drawingId: owner.drawingId ?? "", drawingRevisionId: owner.drawingRevisionId ?? "" };
    const rows = await this.client.query<Record<string, unknown>>(`SELECT id, note_text, applicability_scope, updated_at, last_formalization_event_id
      FROM pdm_controlled_notes
      WHERE company_id = :companyId AND status = 'active'
        AND ((:partNumberId <> '' AND part_number_id = :partNumberId)
          OR (:drawingId <> '' AND drawing_id = :drawingId)
          OR (:drawingRevisionId <> '' AND drawing_revision_id = :drawingRevisionId))
      ORDER BY updated_at DESC, id DESC`, ownerParams);
    return rows.flatMap((row, index) => {
      const value = textValue(row.note_text);
      return value ? [{
        key: textValue(row.id) || `note-${index + 1}`,
        label: "受控註記",
        value,
        details: detailTrace({
          scope: textValue(row.applicability_scope) || "整體",
          source: "智慧辨識正式化",
          updatedAt: row.updated_at,
          eventId: row.last_formalization_event_id
        })
      }] : [];
    });
  }

  private async engineeringEvidenceRows(companyId: string, owner: { partNumberId?: string; drawingId?: string; drawingRevisionId?: string | null }): Promise<CanonicalDetailReadModelRow[]> {
    const ownerParams = { companyId, partNumberId: owner.partNumberId ?? "", drawingId: owner.drawingId ?? "", drawingRevisionId: owner.drawingRevisionId ?? "" };
    const rows = await this.client.query<Record<string, unknown>>(`SELECT id, evidence_type, summary, page_number, sheet_name,
        configuration_name, created_at, session_id, candidate_id, observation_id
      FROM pdm_engineering_evidence
      WHERE company_id = :companyId
        AND ((:partNumberId <> '' AND part_number_id = :partNumberId)
          OR (:drawingId <> '' AND drawing_id = :drawingId)
          OR (:drawingRevisionId <> '' AND drawing_revision_id = :drawingRevisionId))
      ORDER BY created_at DESC, id DESC`, ownerParams);
    return rows.flatMap((row, index) => {
      const value = textValue(row.summary);
      if (!value) return [];
      const details = [
        disclosure("來源", "辨識證據"),
        disclosure("類型", textValue(row.evidence_type)),
        disclosure("頁碼", row.page_number),
        disclosure("圖紙名稱", row.sheet_name),
        disclosure("組態", row.configuration_name),
        disclosure("建立時間", row.created_at),
        disclosure("辨識工作階段", row.session_id),
        disclosure("候選項目", row.candidate_id),
        disclosure("觀察紀錄", row.observation_id)
      ].filter((entry): entry is CanonicalDetailDisclosure => Boolean(entry));
      return [{ key: textValue(row.id) || `evidence-${index + 1}`, label: "辨識證據", value, details }];
    });
  }

  private async files(record: CanonicalWorkbenchStateRecord, companyId: string): Promise<CanonicalDetailFile[]> {
    if (record.entityType === "drawing" && record.revisionId) {
      const rows = await this.client.query<Record<string, unknown>>(`SELECT file.id, file.role, file.display_name, asset.id AS asset_id, asset.file_name
        FROM drawing_revision_files file JOIN file_assets asset ON asset.id = file.source_file_asset_id
        WHERE file.company_id = :companyId AND file.drawing_revision_id = :revisionId AND file.removed_at IS NULL
        ORDER BY file.sort_order, file.id`, { companyId, revisionId: record.revisionId });
      const context = record.dataLayer === "drawing_rd" ? "candidate_revision" as const : "drawing_revision" as const;
      const contextId = record.revisionId;
      return rows.map((row) => ({
        id: String(row.id), name: textValue(row.display_name) || textValue(row.file_name), role: textValue(row.role) || null,
        downloadHref: pdmFileReadHref({ fileAssetId: String(row.asset_id), context, contextId, bindingId: String(row.id), reviewRequestId: record.reviewRequestId })
      }));
    }
    if (record.entityType !== "part") return [];
    const rows = await this.client.query<Record<string, unknown>>(`SELECT asset.id, asset.file_name, asset.display_name, asset.document_category
      FROM file_assets asset JOIN part_numbers part ON part.id = asset.linked_entity_id AND part.company_id = :companyId
      WHERE asset.linked_entity_type = 'part_number' AND asset.linked_entity_id = :partId AND asset.deleted_at IS NULL
      ORDER BY asset.created_at DESC, asset.id DESC`, { companyId, partId: record.canonicalEntityId });
    return rows.map((row) => ({
      id: String(row.id), name: textValue(row.display_name) || textValue(row.file_name), role: textValue(row.document_category) || null,
      downloadHref: pdmFileReadHref({ fileAssetId: String(row.id), context: "part_attachment", contextId: record.canonicalEntityId, bindingId: String(row.id), reviewRequestId: record.reviewRequestId })
    }));
  }

  private async drawingHistory(companyId: string, drawingId: string): Promise<CanonicalDrawingHistory[]> {
    const rows = await this.client.query<Record<string, unknown>>(`SELECT revision.id, revision.drawing_id, revision.revision, CASE WHEN revision.lifecycle_state = 'released' THEN 'production' ELSE 'rd' END AS layer
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
    return rows.map((row) => ({ id: String(row.id), drawingId: String(row.drawing_id), revision: textValue(row.revision), layerLabel: row.layer === "production" ? "量產版" : "研發版" }));
  }

}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value).trim();
}

function field(key: string, label: string, value: unknown): CanonicalDetailField | null {
  const normalized = textValue(value);
  return normalized ? { key, label, value: normalized } : null;
}

function compactFields(fields: Array<CanonicalDetailField | null>): CanonicalDetailField[] {
  return fields.filter((entry): entry is CanonicalDetailField => Boolean(entry));
}

function disclosure(label: string, value: unknown): CanonicalDetailDisclosure | null {
  const normalized = textValue(value);
  return normalized ? { label, value: normalized } : null;
}

function detailTrace(input: { scope?: unknown; source?: unknown; updatedAt?: unknown; eventId?: unknown }): CanonicalDetailDisclosure[] {
  return [
    disclosure("適用範圍", input.scope),
    disclosure("來源", input.source),
    disclosure("更新時間", input.updatedAt),
    disclosure("正式化事件", input.eventId)
  ].filter((entry): entry is CanonicalDetailDisclosure => Boolean(entry));
}

function drawingProjectionFromSlot(record: CanonicalWorkbenchStateRecord, slot: DrawingPreviewSlotModel): CanonicalPreviewProjection {
  const state = slot.state === "queued" || slot.state === "running" ? "pending" : slot.state;
  return {
    state,
    media: state === "ready" && slot.mediaHref
      ? { mode: "image", href: slot.mediaHref, fileName: slot.fileName }
      : null,
    sourceType: "primary_manufacturing_drawing",
    sourceLabel: "3D 模型",
    sourceDrawingNumber: record.code,
    sourceRevision: record.revision,
    alt: `${record.code} 3D 預覽圖`
  };
}

function emptyPreviewSlots(): [DrawingPreviewSlotModel, DrawingPreviewSlotModel] {
  return [
    { kind: "three-d", title: "3D 模型", fileName: null, state: "missing", stateTitle: "無可用預覽", stateText: "目前沒有可預覽的 3D 檔案。", mediaHref: null, downloadHref: null, retryCommandRef: null },
    { kind: "two-d", title: "2D 圖面", fileName: null, state: "missing", stateTitle: "無可用預覽", stateText: "目前沒有可預覽的 2D 檔案。", mediaHref: null, downloadHref: null, retryCommandRef: null }
  ];
}

function pickPreviewSource(sources: CanonicalPreviewSource[], kind: "three-d" | "two-d", derivatives: CanonicalPreviewDerivative[] = []) {
  if (kind === "three-d") return selectCanonicalThreeDSource(sources, sources[0]?.revisionId ?? "");
  return selectCanonicalTwoDSource(sources, sources[0]?.revisionId ?? "", derivatives);
}

function canonicalPreviewSlot(
  kind: "three-d" | "two-d",
  title: string,
  source: CanonicalPreviewSource | null,
  derivatives: CanonicalPreviewDerivative[],
  jobs: CanonicalPreviewJob[],
  readContext: "candidate_revision" | "drawing_revision",
  reviewRequestId: string | null
): DrawingPreviewSlotModel {
  if (!source) return emptyPreviewSlots()[kind === "three-d" ? 0 : 1];
  const readHref = pdmFileReadHref({
    fileAssetId: source.assetId,
    context: readContext,
    contextId: source.revisionId,
    bindingId: source.bindingId,
    reviewRequestId
  });
  const displayName = source.displayName || source.fileName;
  if (kind === "three-d") {
    const resolved = resolveCanonicalDrawingPreview({
      source,
      derivativeJobs: [
        ...derivatives.map((item) => ({ recordKind: "derivative" as const, id: item.id, sourceFileAssetId: item.sourceFileAssetId, sourceContentHash: item.sourceContentHash, derivativeKind: item.derivativeKind, storageKey: item.storageKey, mimeType: item.mimeType, generatorProfile: item.generatorProfile, generatorVersion: item.generatorVersion, status: "ready", createdAt: item.createdAt, lastHeartbeatAt: null })),
        ...jobs.map((item) => ({ recordKind: "job" as const, id: null, sourceFileAssetId: item.sourceFileAssetId, sourceContentHash: item.sourceContentHash, derivativeKind: null, storageKey: null, mimeType: null, generatorProfile: null, generatorVersion: null, status: item.status, createdAt: null, lastHeartbeatAt: item.lastHeartbeatAt }))
      ]
    });
    const state = resolved.state === "pending" ? "queued" : resolved.state;
    const text = state === "ready" ? "可直接開啟預覽。" : state === "queued" ? "工作已排入佇列。" : state === "delayed" ? "請稍後重新整理或確認預覽服務。" : state === "failed" ? "可先下載原始檔查看。" : state === "missing" ? "3D 原檔已存在，預覽工作尚未建立。" : "3D 原檔已存在，但目前沒有可看的預覽。";
    return { kind, title, fileName: resolved.media?.fileName ?? (source.displayName || source.fileName), state, stateTitle: state === "ready" ? "預覽已就緒" : state === "queued" ? "等待預覽服務" : state === "delayed" ? "預覽服務未回應" : state === "failed" ? "預覽產生失敗" : state === "missing" ? "預覽尚未建立" : "預覽暫時無法顯示", stateText: text, mediaHref: resolved.media?.href ?? null, downloadHref: readHref, retryCommandRef: null };
  }
  if (kind === "two-d" && source.fileExt === "pdf" && source.mimeType === "application/pdf") {
    return { kind, title, fileName: displayName, state: "ready", stateTitle: "PDF 預覽已就緒", stateText: "直接使用受控 PDF 原檔顯示。", mediaHref: appendQuery(readHref, "preview", "1"), downloadHref: readHref, retryCommandRef: null };
  }
  const accepted = new Set(["drawing_pdf", "sheet_png", "thumbnail_png"]);
  const derivative = derivatives.find((item) => item.sourceFileAssetId === source.assetId && item.sourceContentHash === source.contentHash && accepted.has(item.derivativeKind));
  if (derivative) {
    return { kind, title, fileName: displayName, state: "ready", stateTitle: "預覽已就緒", stateText: "可直接開啟預覽。", mediaHref: appendQuery(readHref, "previewDerivative", derivative.id), downloadHref: readHref, retryCommandRef: null };
  }
  const job = jobs.find((item) => item.sourceFileAssetId === source.assetId && item.sourceContentHash === source.contentHash);
  if (job?.status === "running") {
    const heartbeat = Date.parse(job.lastHeartbeatAt);
    const delayed = !Number.isFinite(heartbeat) || Date.now() - heartbeat > 30_000;
    return { kind, title, fileName: displayName, state: delayed ? "delayed" : "running", stateTitle: delayed ? "預覽服務未回應" : "預覽產生中", stateText: delayed ? "請稍後重新整理或確認預覽服務。" : "預覽服務正在處理。", mediaHref: null, downloadHref: readHref, retryCommandRef: null };
  }
  if (job?.status === "queued") return { kind, title, fileName: displayName, state: "queued", stateTitle: "等待預覽服務", stateText: "工作已排入佇列。", mediaHref: null, downloadHref: readHref, retryCommandRef: null };
  if (job?.status === "failed") return { kind, title, fileName: displayName, state: "failed", stateTitle: "預覽產生失敗", stateText: "可先下載原始檔查看。", mediaHref: null, downloadHref: readHref, retryCommandRef: null };
  return { kind, title, fileName: displayName, state: "unavailable", stateTitle: "尚未產生可看的預覽", stateText: "可先下載原始檔查看。", mediaHref: null, downloadHref: readHref, retryCommandRef: null };
}

function appendQuery(href: string, key: string, value: string) {
  const url = new URL(href, "http://localhost");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function namedSqlList(prefix: string, values: string[]) {
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
