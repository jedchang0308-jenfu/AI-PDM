import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  boundedText,
  DrawingRecognitionError,
  isExplicitNotApplicable,
  normalizeRecognitionKey,
  normalizeRecognitionValue,
  parseJsonValue,
  parseRecognitionCategory,
  parseRecognitionConfidence,
  sha256Canonical,
  type DrawingRecognitionAdapterCompletion,
  type DrawingRecognitionCategory,
  type DrawingRecognitionDecisionInput,
  type DrawingRecognitionImpactChange,
  type DrawingRecognitionSourceContextType
} from "@/lib/drawing-recognition-contract";

type SessionRow = {
  id: string;
  company_id: string;
  source_context_type: DrawingRecognitionSourceContextType;
  source_context_id: string;
  source_lineage_key: string;
  drawing_id: string | null;
  drawing_revision_id: string | null;
  source_set_fingerprint: string;
  deduplication_key: string;
  status: string;
  priority: number | string;
  not_before: string | null;
  attempt_count: number | string;
  locked_by: string | null;
  locked_at: string | null;
  heartbeat_at: string | null;
  supersedes_session_id: string | null;
  row_version: number | string;
  warning_count: number | string;
  conflict_count: number | string;
  unclassified_count: number | string;
  error_code: string | null;
  error_summary: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  formalized_by: string | null;
  formalized_at: string | null;
};

type SourceRow = {
  id: string;
  session_id: string;
  company_id: string;
  file_asset_id: string;
  content_hash: string;
  storage_generation: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string;
  file_size: number | string;
  source_role: string;
  sort_order: number | string;
  adapter_plan_json: string | string[];
  original_path?: string | null;
  storage_provider?: string;
  storage_key?: string;
};

type CandidateRow = {
  id: string;
  session_id: string;
  company_id: string;
  category: DrawingRecognitionCategory;
  field_key: string | null;
  field_label: string;
  raw_value: string | null;
  proposed_value: string | null;
  normalized_value: string | null;
  proposed_owner_type: string | null;
  proposed_owner_id: string | null;
  applicability_scope: string;
  variant_status: string;
  confidence_band: string;
  review_state: string;
  current_formal_value: string | null;
  current_formal_fingerprint: string | null;
  group_key: string;
  sort_order: number | string;
  row_version: number | string;
  created_at: string;
  updated_at: string;
};

type ObservationRow = {
  id: string;
  session_id: string;
  source_id: string;
  adapter_result_id: string;
  raw_text: string;
  raw_value: string | null;
  normalized_value: string | null;
  location_kind: string;
  page_number: number | string | null;
  sheet_name: string | null;
  configuration_name: string | null;
  geometry_json: string | Record<string, unknown> | null;
  confidence_band: string;
  extractor_code: string;
  extractor_version: string;
  captured_at: string;
};

type FileSourceRow = {
  file_asset_id: string;
  content_hash: string | null;
  storage_generation: string | null;
  file_name: string;
  file_ext: string;
  mime_type: string;
  file_size: number | string;
  source_role: string;
  sort_order: number | string;
};

type ScopeRow = { drawing_id: string | null; drawing_revision_id: string | null; owner_id: string | null };

export type RecognitionSessionProjection = ReturnType<typeof mapSession> & {
  sources: Array<ReturnType<typeof mapSource>>;
  candidates: Array<ReturnType<typeof mapCandidate> & { observations: Array<ReturnType<typeof mapObservation>> }>;
  baseline: Array<{ fieldKey: string; fieldLabel: string; value: string; support: number; partCount: number }>;
};

function now() {
  return new Date().toISOString();
}

function mapSession(row: SessionRow) {
  return {
    id: row.id,
    companyId: row.company_id,
    sourceContextType: row.source_context_type,
    sourceContextId: row.source_context_id,
    sourceLineageKey: row.source_lineage_key,
    drawingId: row.drawing_id,
    drawingRevisionId: row.drawing_revision_id,
    sourceSetFingerprint: row.source_set_fingerprint,
    status: row.status,
    priority: Number(row.priority),
    attemptCount: Number(row.attempt_count),
    rowVersion: Number(row.row_version),
    warningCount: Number(row.warning_count),
    conflictCount: Number(row.conflict_count),
    unclassifiedCount: Number(row.unclassified_count),
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    supersedesSessionId: row.supersedes_session_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    formalizedBy: row.formalized_by,
    formalizedAt: row.formalized_at
  };
}

function mapSource(row: SourceRow) {
  return {
    id: row.id,
    fileAssetId: row.file_asset_id,
    contentHash: row.content_hash,
    storageGeneration: row.storage_generation,
    fileName: row.file_name,
    fileExt: row.file_ext,
    mimeType: row.mime_type,
    fileSize: Number(row.file_size),
    sourceRole: row.source_role,
    sortOrder: Number(row.sort_order),
    adapterPlan: parseJsonValue<string[]>(row.adapter_plan_json, [])
  };
}

function mapCandidate(row: CandidateRow) {
  return {
    id: row.id,
    category: row.category,
    fieldKey: row.field_key,
    fieldLabel: row.field_label,
    rawValue: row.raw_value,
    proposedValue: row.proposed_value,
    normalizedValue: row.normalized_value,
    proposedOwnerType: row.proposed_owner_type,
    proposedOwnerId: row.proposed_owner_id,
    applicabilityScope: row.applicability_scope,
    variantStatus: row.variant_status,
    confidenceBand: row.confidence_band,
    reviewState: row.review_state,
    currentFormalValue: row.current_formal_value,
    currentFormalFingerprint: row.current_formal_fingerprint,
    groupKey: row.group_key,
    sortOrder: Number(row.sort_order),
    rowVersion: Number(row.row_version)
  };
}

function mapObservation(row: ObservationRow) {
  return {
    id: row.id,
    sourceId: row.source_id,
    rawText: row.raw_text,
    rawValue: row.raw_value,
    normalizedValue: row.normalized_value,
    locationKind: row.location_kind,
    pageNumber: row.page_number === null ? null : Number(row.page_number),
    sheetName: row.sheet_name,
    configurationName: row.configuration_name,
    geometry: parseJsonValue<Record<string, unknown> | null>(row.geometry_json, null),
    confidenceBand: row.confidence_band,
    extractorCode: row.extractor_code,
    extractorVersion: row.extractor_version,
    capturedAt: row.captured_at
  };
}

export class DrawingRecognitionAsyncRepository {
  constructor(private readonly client: AsyncDatabaseClient) {}

  async createSession(input: {
    companyId: string;
    actorId: string;
    sourceContextType: DrawingRecognitionSourceContextType;
    sourceContextId: string;
    sourceAssetIds?: string[];
    drawingId?: string | null;
    drawingRevisionId?: string | null;
    supersedesSessionId?: string | null;
  }) {
    return this.client.transaction(async (client) => {
      const repository = new DrawingRecognitionAsyncRepository(client);
      const scope = await repository.resolveContextScope(input.companyId, input.sourceContextType, input.sourceContextId);
      if (!scope) throw new DrawingRecognitionError("RECOGNITION_CONTEXT_NOT_FOUND", "找不到可辨識的圖面來源。", 404);
      const available = await repository.listContextSources(input.companyId, input.sourceContextType, input.sourceContextId);
      const requested = new Set((input.sourceAssetIds ?? []).filter(Boolean));
      const sources = requested.size > 0 ? available.filter((source) => requested.has(source.file_asset_id)) : available;
      if (sources.length === 0 || (requested.size > 0 && sources.length !== requested.size)) {
        throw new DrawingRecognitionError("RECOGNITION_SOURCE_SCOPE_INVALID", "來源檔案不屬於指定圖面範圍。", 404);
      }
      if (sources.some((source) => !source.content_hash)) {
        throw new DrawingRecognitionError("RECOGNITION_SOURCE_HASH_REQUIRED", "來源檔案尚未具備內容指紋。", 422);
      }
      const ordered = [...sources].sort((left, right) => Number(left.sort_order) - Number(right.sort_order) || left.file_asset_id.localeCompare(right.file_asset_id));
      const sourceSetFingerprint = sha256Canonical(ordered.map((source) => ({
        fileAssetId: source.file_asset_id,
        contentHash: source.content_hash,
        storageGeneration: source.storage_generation ?? "",
        role: source.source_role
      })));
      const sourceLineageKey = `${input.sourceContextType}:${input.sourceContextId}`;
      const deduplicationKey = sha256Canonical({
        companyId: input.companyId,
        sourceLineageKey,
        sourceSetFingerprint,
        rerunOf: input.supersedesSessionId ?? null
      });
      const existing = await client.queryOne<SessionRow>(
        "SELECT * FROM drawing_recognition_sessions WHERE company_id = :companyId AND deduplication_key = :deduplicationKey",
        { companyId: input.companyId, deduplicationKey }
      );
      if (existing) return mapSession(existing);

      const timestamp = now();
      const latest = await client.queryOne<SessionRow>(
        `SELECT * FROM drawing_recognition_sessions
         WHERE company_id = :companyId AND source_lineage_key = :sourceLineageKey
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        { companyId: input.companyId, sourceLineageKey }
      );
      if (latest?.status === "queued") {
        await client.execute(
          `UPDATE drawing_recognition_sessions SET status = 'cancelled', cancelled_at = :timestamp,
             error_code = 'source_set_superseded_before_claim', error_summary = '上傳檔案集合已更新，系統改用最新檔案重新辨識。',
             row_version = row_version + 1, updated_at = :timestamp
           WHERE id = :id AND status = 'queued'`,
          { id: latest.id, timestamp }
        );
      }

      const id = `recognition-${crypto.randomUUID()}`;
      const drawingId = input.drawingId ?? scope.drawing_id;
      const drawingRevisionId = input.drawingRevisionId ?? scope.drawing_revision_id;
      const notBefore = new Date(Date.now() + 2_000).toISOString();
      await client.execute(
        `INSERT INTO drawing_recognition_sessions (
          id, company_id, source_context_type, source_context_id, source_lineage_key, drawing_id, drawing_revision_id,
          source_set_fingerprint, deduplication_key, status, priority, not_before, supersedes_session_id,
          created_by, created_at, updated_at
        ) VALUES (
          :id, :companyId, :sourceContextType, :sourceContextId, :sourceLineageKey, :drawingId, :drawingRevisionId,
          :sourceSetFingerprint, :deduplicationKey, 'queued', 100, :notBefore, :supersedesSessionId,
          :actorId, :timestamp, :timestamp
        )`,
        {
          id, companyId: input.companyId, sourceContextType: input.sourceContextType, sourceContextId: input.sourceContextId,
          sourceLineageKey, drawingId, drawingRevisionId, sourceSetFingerprint, deduplicationKey, notBefore,
          supersedesSessionId: input.supersedesSessionId ?? latest?.id ?? null, actorId: input.actorId, timestamp
        }
      );
      for (let index = 0; index < ordered.length; index += 1) {
        const source = ordered[index];
        await client.execute(
          `INSERT INTO drawing_recognition_sources (
             id, session_id, company_id, file_asset_id, content_hash, storage_generation, file_name, file_ext,
             mime_type, file_size, source_role, sort_order, adapter_plan_json, created_at
           ) VALUES (
             :id, :sessionId, :companyId, :fileAssetId, :contentHash, :storageGeneration, :fileName, :fileExt,
             :mimeType, :fileSize, :sourceRole, :sortOrder, :adapterPlanJson, :timestamp
           )`,
          {
            id: `recognition-source-${crypto.randomUUID()}`, sessionId: id, companyId: input.companyId,
            fileAssetId: source.file_asset_id, contentHash: source.content_hash, storageGeneration: source.storage_generation,
            fileName: source.file_name, fileExt: source.file_ext, mimeType: source.mime_type,
            fileSize: Number(source.file_size), sourceRole: source.source_role, sortOrder: index,
            adapterPlanJson: JSON.stringify(["filename.v1", "native-metadata-bridge.v1", "external-json-ocr.v1"]), timestamp
          }
        );
      }
      const created = await client.queryOne<SessionRow>("SELECT * FROM drawing_recognition_sessions WHERE id = :id", { id });
      if (!created) throw new DrawingRecognitionError("RECOGNITION_SESSION_CREATE_FAILED", "辨識工作建立失敗。", 500);
      return mapSession(created);
    });
  }

  async assertSessionScope(input: { sessionId: string; companyId: string; actorId: string; privileged: boolean }) {
    const row = await this.client.queryOne<SessionRow & { drawing_owner_id: string | null }>(
      `SELECT session.*, drawing.owner_id AS drawing_owner_id
       FROM drawing_recognition_sessions session
       LEFT JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
       WHERE session.id = :sessionId AND session.company_id = :companyId`,
      { sessionId: input.sessionId, companyId: input.companyId }
    );
    if (!row) throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
    if (!input.privileged && row.created_by !== input.actorId && row.drawing_owner_id !== input.actorId) {
      throw new DrawingRecognitionError("RECOGNITION_SESSION_FORBIDDEN", "你沒有權限處理這個辨識工作。", 403);
    }
    return row;
  }

  async getProjection(sessionId: string, companyId: string): Promise<RecognitionSessionProjection> {
    const session = await this.client.queryOne<SessionRow>(
      "SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId AND company_id = :companyId",
      { sessionId, companyId }
    );
    if (!session) throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
    const sources = await this.client.query<SourceRow>(
      "SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId AND company_id = :companyId ORDER BY sort_order, id",
      { sessionId, companyId }
    );
    const candidates = await this.client.query<CandidateRow>(
      "SELECT * FROM drawing_recognition_candidates WHERE session_id = :sessionId AND company_id = :companyId ORDER BY category, sort_order, id",
      { sessionId, companyId }
    );
    const observations = await this.client.query<ObservationRow & { candidate_id: string }>(
      `SELECT link.candidate_id, observation.*
       FROM drawing_recognition_candidate_observations link
       JOIN drawing_recognition_observations observation ON observation.id = link.observation_id
       WHERE observation.session_id = :sessionId AND observation.company_id = :companyId
       ORDER BY observation.captured_at, observation.id`,
      { sessionId, companyId }
    );
    const byCandidate = new Map<string, ObservationRow[]>();
    for (const observation of observations) {
      const list = byCandidate.get(observation.candidate_id) ?? [];
      list.push(observation);
      byCandidate.set(observation.candidate_id, list);
    }
    const mappedCandidates = candidates.map((candidate) => ({
      ...mapCandidate(candidate),
      observations: (byCandidate.get(candidate.id) ?? []).map(mapObservation)
    }));
    return {
      ...mapSession(session),
      sources: sources.map(mapSource),
      candidates: mappedCandidates,
      baseline: calculateBaseline(mappedCandidates)
    };
  }

  async getObservationEvidence(input: { sessionId: string; observationId: string; companyId: string }) {
    const observation = await this.client.queryOne<ObservationRow & { file_name: string; file_asset_id: string; source_role: string }>(
      `SELECT observation.*, source.file_name, source.file_asset_id, source.source_role
       FROM drawing_recognition_observations observation
       JOIN drawing_recognition_sources source ON source.id = observation.source_id
       WHERE observation.id = :observationId AND observation.session_id = :sessionId
         AND observation.company_id = :companyId AND source.company_id = :companyId`,
      input
    );
    if (!observation) throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_NOT_FOUND", "找不到辨識證據。", 404);
    return {
      ...mapObservation(observation),
      fileName: observation.file_name,
      fileAssetId: observation.file_asset_id,
      sourceRole: observation.source_role
    };
  }

  async latestForDrawing(companyId: string, drawingId: string) {
    const row = await this.client.queryOne<SessionRow>(
      `SELECT * FROM drawing_recognition_sessions WHERE company_id = :companyId AND drawing_id = :drawingId
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      { companyId, drawingId }
    );
    return row ? mapSession(row) : null;
  }

  async latestForDrawingNumber(drawingNumber: string, companyId: string) {
    const row = await this.client.queryOne<SessionRow>(
      `SELECT session.* FROM drawing_recognition_sessions session
       JOIN drawings drawing ON drawing.id = session.drawing_id AND drawing.company_id = session.company_id
       WHERE session.company_id = :companyId AND drawing.drawing_number = :drawingNumber
       ORDER BY session.created_at DESC, session.id DESC LIMIT 1`,
      { companyId, drawingNumber }
    );
    if (!row) return null;
    const sources = await this.client.query<{ file_asset_id: string }>(
      `SELECT file_asset_id FROM drawing_recognition_sources
       WHERE session_id = :sessionId AND company_id = :companyId
       ORDER BY sort_order, id`,
      { sessionId: row.id, companyId }
    );
    return { ...mapSession(row), sourceAssetIds: sources.map((source) => source.file_asset_id) };
  }

  async claimJob(input: { workerId: string; maxAttempts: number }) {
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE SKIP LOCKED" : "";
      const timestamp = now();
      const staleBefore = new Date(Date.now() - 60_000).toISOString();
      const session = await client.queryOne<SessionRow>(
        `SELECT * FROM drawing_recognition_sessions
         WHERE attempt_count < :maxAttempts AND (
           (status = 'queued' AND (not_before IS NULL OR not_before <= :timestamp))
           OR (status = 'extracting' AND heartbeat_at IS NOT NULL AND heartbeat_at < :staleBefore)
         )
         ORDER BY priority ASC, created_at ASC LIMIT 1${lock}`,
        { maxAttempts: input.maxAttempts, timestamp, staleBefore }
      );
      if (!session) return null;
      await client.execute(
        `UPDATE drawing_recognition_sessions SET status = 'extracting', locked_by = :workerId, locked_at = :timestamp,
           heartbeat_at = :timestamp, attempt_count = attempt_count + 1, row_version = row_version + 1, updated_at = :timestamp,
           error_code = NULL, error_summary = NULL WHERE id = :id`,
        { id: session.id, workerId: input.workerId, timestamp }
      );
      const sources = await client.query<SourceRow>(
        `SELECT source.*, asset.original_path, asset.storage_provider, asset.storage_key
         FROM drawing_recognition_sources source
         JOIN file_assets asset ON asset.id = source.file_asset_id
         WHERE source.session_id = :sessionId AND source.company_id = :companyId
         ORDER BY source.sort_order, source.id`,
        { sessionId: session.id, companyId: session.company_id }
      );
      const drawing = session.drawing_id
        ? await client.queryOne<{ drawing_id: string; drawing_number: string | null; drawing_revision_id: string | null; revision: string | null }>(
            `SELECT drawing.id AS drawing_id, drawing.drawing_number, revision.id AS drawing_revision_id, revision.revision
             FROM drawings drawing
             LEFT JOIN drawing_revisions revision ON revision.id = :drawingRevisionId AND revision.drawing_id = drawing.id
             WHERE drawing.id = :drawingId AND drawing.company_id = :companyId`,
            { drawingId: session.drawing_id, drawingRevisionId: session.drawing_revision_id, companyId: session.company_id }
          )
        : null;
      const parts = session.drawing_id
        ? await client.query<{ id: string; part_number: string; part_name: string; record_status: string }>(
            `SELECT part.id, part.part_number, part.part_name, part.record_status
             FROM drawings drawing
             JOIN drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
             JOIN part_numbers part ON part.id = link.part_number_id
             WHERE drawing.id = :drawingId AND drawing.company_id = :companyId AND part.company_id = :companyId
             ORDER BY part.part_number, part.id`,
            { drawingId: session.drawing_id, companyId: session.company_id }
          )
        : [];
      return {
        sessionId: session.id,
        companyId: session.company_id,
        sourceSetFingerprint: session.source_set_fingerprint,
        attemptCount: Number(session.attempt_count) + 1,
        targetContext: {
          drawingId: drawing?.drawing_id ?? session.drawing_id,
          drawingNumber: drawing?.drawing_number ?? null,
          drawingRevisionId: drawing?.drawing_revision_id ?? session.drawing_revision_id,
          revision: drawing?.revision ?? null,
          parts: parts.map((part) => ({ id: part.id, partNumber: part.part_number, partName: part.part_name, recordStatus: part.record_status }))
        },
        sources: sources.map((source) => ({
          ...mapSource(source),
          originalPath: source.storage_provider === "local_repository" ? source.original_path : null,
          storageProvider: source.storage_provider,
          storageKey: source.storage_key
        }))
      };
    });
  }

  async heartbeatJob(input: { sessionId: string; workerId: string }) {
    const session = await this.client.queryOne<SessionRow>("SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId", { sessionId: input.sessionId });
    if (!session || session.status !== "extracting" || session.locked_by !== input.workerId) {
      throw new DrawingRecognitionError("RECOGNITION_JOB_LOCK_INVALID", "辨識 worker lock 已失效。", 409);
    }
    await this.client.execute(
      "UPDATE drawing_recognition_sessions SET heartbeat_at = :timestamp, updated_at = :timestamp WHERE id = :sessionId AND locked_by = :workerId",
      { sessionId: input.sessionId, workerId: input.workerId, timestamp: now() }
    );
  }

  async completeJob(input: { sessionId: string; workerId: string; sourceSetFingerprint: string; results: DrawingRecognitionAdapterCompletion[] }) {
    if (input.results.length > 64) throw new DrawingRecognitionError("RECOGNITION_RESULT_LIMIT", "辨識 adapter 結果數量超過限制。", 400);
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const session = await client.queryOne<SessionRow>(
        `SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId${lock}`,
        { sessionId: input.sessionId }
      );
      if (!session || session.status !== "extracting" || session.locked_by !== input.workerId) {
        throw new DrawingRecognitionError("RECOGNITION_JOB_LOCK_INVALID", "辨識 worker lock 已失效。", 409);
      }
      if (session.source_set_fingerprint !== input.sourceSetFingerprint) {
        throw new DrawingRecognitionError("RECOGNITION_SOURCE_STALE", "來源檔案集合已改變，請重新辨識。", 409);
      }
      const sources = await client.query<SourceRow>("SELECT * FROM drawing_recognition_sources WHERE session_id = :sessionId", { sessionId: input.sessionId });
      const sourceById = new Map(sources.map((source) => [source.id, source]));
      let observationCount = 0;
      let warningCount = 0;
      let successfulResults = 0;
      const timestamp = now();
      for (const result of input.results) {
        const source = sourceById.get(result.sourceId);
        if (!source) throw new DrawingRecognitionError("RECOGNITION_RESULT_SOURCE_INVALID", "辨識結果來源不在工作範圍內。", 400);
        const observations = (result.observations ?? []).slice(0, 1_000);
        if ((result.observations?.length ?? 0) > observations.length) throw new DrawingRecognitionError("RECOGNITION_OBSERVATION_LIMIT", "單一來源辨識結果超過限制。", 400);
        const diagnostics = (result.diagnostics ?? []).slice(0, 20).map((value) => boundedText(value, 300));
        const adapterResultId = `recognition-adapter-${crypto.randomUUID()}`;
        await client.execute(
          `INSERT INTO drawing_recognition_adapter_results (
             id, session_id, source_id, company_id, adapter_code, adapter_version, status, observation_count,
             diagnostics_json, started_at, completed_at
           ) VALUES (
             :id, :sessionId, :sourceId, :companyId, :adapterCode, :adapterVersion, :status, :observationCount,
             :diagnosticsJson, :timestamp, :timestamp
           )`,
          {
            id: adapterResultId, sessionId: session.id, sourceId: source.id, companyId: session.company_id,
            adapterCode: boundedText(result.adapterCode, 120), adapterVersion: boundedText(result.adapterVersion, 80),
            status: result.status, observationCount: observations.length, diagnosticsJson: JSON.stringify(diagnostics), timestamp
          }
        );
        if (result.status === "succeeded" || result.status === "partial") successfulResults += 1;
        if (result.status !== "succeeded") warningCount += 1;
        for (const raw of observations) {
          const rawText = boundedText(raw.rawText, 8_000);
          if (!rawText) continue;
          const explicitlyMissingValue = raw.rawValue === null && raw.normalizedValue == null;
          const rawValue = raw.rawValue === null || raw.rawValue === undefined ? null : boundedText(raw.rawValue, 4_000);
          const normalizedValue = explicitlyMissingValue
            ? null
            : raw.normalizedValue === null || raw.normalizedValue === undefined
            ? normalizeRecognitionValue(rawValue ?? rawText)
            : normalizeRecognitionValue(raw.normalizedValue);
          const observationId = `recognition-observation-${crypto.randomUUID()}`;
          await client.execute(
            `INSERT INTO drawing_recognition_observations (
              id, session_id, source_id, adapter_result_id, company_id, raw_text, raw_value, normalized_value,
              location_kind, page_number, sheet_name, configuration_name, geometry_json, confidence_band,
              extractor_code, extractor_version, raw_payload_hash, captured_at
            ) VALUES (
              :id, :sessionId, :sourceId, :adapterResultId, :companyId, :rawText, :rawValue, :normalizedValue,
              :locationKind, :pageNumber, :sheetName, :configurationName, :geometryJson, :confidenceBand,
              :extractorCode, :extractorVersion, :rawPayloadHash, :capturedAt
            )`,
            {
              id: observationId, sessionId: session.id, sourceId: source.id, adapterResultId, companyId: session.company_id,
              rawText, rawValue, normalizedValue, locationKind: boundedText(raw.locationKind, 80, "file") || "file",
              pageNumber: raw.pageNumber ?? null, sheetName: raw.sheetName ? boundedText(raw.sheetName, 200) : null,
              configurationName: raw.configurationName ? boundedText(raw.configurationName, 200) : null,
              geometryJson: raw.geometry ? JSON.stringify(raw.geometry).slice(0, 8_000) : null,
              confidenceBand: parseRecognitionConfidence(raw.confidenceBand), extractorCode: boundedText(result.adapterCode, 120),
              extractorVersion: boundedText(result.adapterVersion, 80), rawPayloadHash: raw.rawPayloadHash ? boundedText(raw.rawPayloadHash, 128) : null,
              capturedAt: timestamp
            }
          );
          const category = parseRecognitionCategory(raw.category);
          const fieldLabel = boundedText(raw.fieldLabel, 200, category === "unclassified" ? "尚未歸類" : "辨識候選") || "辨識候選";
          const fieldKey = normalizeRecognitionKey(raw.fieldKey ?? fieldLabel) || null;
          const ownerType = raw.proposedOwnerType ? boundedText(raw.proposedOwnerType, 80) : inferOwnerType(category);
          const ownerId = raw.proposedOwnerId ? boundedText(raw.proposedOwnerId, 200) : inferOwnerId(category, session);
          const groupKey = sha256Canonical({ category, fieldKey, normalizedValue, ownerType, ownerId });
          const existingCandidate = await client.queryOne<{ id: string }>(
            `SELECT id FROM drawing_recognition_candidates
             WHERE session_id = :sessionId AND company_id = :companyId AND group_key = :groupKey
             ORDER BY created_at, id LIMIT 1`,
            { sessionId: session.id, companyId: session.company_id, groupKey }
          );
          if (existingCandidate) {
            await client.execute(
              "INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (:candidateId, :observationId, :companyId, :timestamp)",
              { candidateId: existingCandidate.id, observationId, companyId: session.company_id, timestamp }
            );
            observationCount += 1;
            continue;
          }
          const current = await this.readCurrentFormalValue(client, {
            companyId: session.company_id, category, fieldKey, ownerType, ownerId
          });
          const candidateId = `recognition-candidate-${crypto.randomUUID()}`;
          await client.execute(
            `INSERT INTO drawing_recognition_candidates (
              id, session_id, company_id, category, field_key, field_label, raw_value, proposed_value, normalized_value,
              proposed_owner_type, proposed_owner_id, applicability_scope, variant_status, confidence_band, review_state,
              current_formal_value, current_formal_fingerprint, group_key, sort_order, created_at, updated_at
            ) VALUES (
              :id, :sessionId, :companyId, :category, :fieldKey, :fieldLabel, :rawValue, :proposedValue, :normalizedValue,
              :ownerType, :ownerId, :applicabilityScope, :variantStatus, :confidenceBand, :reviewState,
              :currentFormalValue, :currentFormalFingerprint, :groupKey, :sortOrder, :timestamp, :timestamp
            )`,
            {
              id: candidateId, sessionId: session.id, companyId: session.company_id, category, fieldKey, fieldLabel,
              rawValue, proposedValue: explicitlyMissingValue ? null : rawValue ?? rawText, normalizedValue, ownerType, ownerId,
              applicabilityScope: boundedText(raw.applicabilityScope, 120, "overall") || "overall",
              variantStatus: explicitlyMissingValue ? "unrecognized" : current.value === null ? "added" : current.value === normalizedValue ? "same" : isExplicitNotApplicable(normalizedValue) ? "explicit_not_applicable" : "changed",
              confidenceBand: parseRecognitionConfidence(raw.confidenceBand), reviewState: explicitlyMissingValue ? "blocked" : current.value !== null && current.value !== normalizedValue ? "conflict" : "proposed",
              currentFormalValue: current.value, currentFormalFingerprint: current.fingerprint, groupKey, sortOrder: observationCount, timestamp
            }
          );
          await client.execute(
            "INSERT INTO drawing_recognition_candidate_observations (candidate_id, observation_id, company_id, created_at) VALUES (:candidateId, :observationId, :companyId, :timestamp)",
            { candidateId, observationId, companyId: session.company_id, timestamp }
          );
          observationCount += 1;
        }
      }
      const conflict = await client.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM drawing_recognition_candidates
         WHERE session_id = :sessionId AND review_state = 'conflict'`,
        { sessionId: session.id }
      );
      const unclassified = await client.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM drawing_recognition_candidates
         WHERE session_id = :sessionId AND category = 'unclassified'`,
        { sessionId: session.id }
      );
      const status = observationCount === 0 || successfulResults === 0
        ? "extraction_failed"
        : warningCount > 0
          ? "extraction_partial"
          : "review_ready";
      await client.execute(
        `UPDATE drawing_recognition_sessions SET status = :status, locked_by = NULL, locked_at = NULL, heartbeat_at = NULL,
           warning_count = :warningCount, conflict_count = :conflictCount, unclassified_count = :unclassifiedCount,
           error_code = :errorCode, error_summary = :errorSummary, row_version = row_version + 1, updated_at = :timestamp
         WHERE id = :sessionId`,
        {
          status, warningCount, conflictCount: Number(conflict?.count ?? 0), unclassifiedCount: Number(unclassified?.count ?? 0),
          errorCode: status === "extraction_failed" ? "all_adapters_failed" : null,
          errorSummary: status === "extraction_failed" ? "目前沒有可供審核的辨識結果；請確認本機辨識能力後重試。" : null,
          timestamp, sessionId: session.id
        }
      );
      return new DrawingRecognitionAsyncRepository(client).getProjection(session.id, session.company_id);
    });
  }

  async saveDecisions(input: { sessionId: string; companyId: string; actorId: string; expectedRowVersion: number; decisions: DrawingRecognitionDecisionInput[] }) {
    if (input.decisions.length === 0 || input.decisions.length > 100) throw new DrawingRecognitionError("RECOGNITION_DECISION_BATCH_INVALID", "請提供 1 到 100 筆審核決策。", 400);
    return this.client.transaction(async (client) => {
      const lock = client.kind === "postgres" ? " FOR UPDATE" : "";
      const session = await client.queryOne<SessionRow>(
        `SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId AND company_id = :companyId${lock}`,
        { sessionId: input.sessionId, companyId: input.companyId }
      );
      if (!session) throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
      if (!["review_ready", "extraction_partial", "ready_to_formalize"].includes(session.status)) {
        throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_REVIEWABLE", "目前狀態不能修改審核結果。", 409);
      }
      if (Number(session.row_version) !== input.expectedRowVersion) throw new DrawingRecognitionError("RECOGNITION_SESSION_STALE", "辨識內容已被更新，請重新載入。", 409);
      const timestamp = now();
      for (const decision of input.decisions) {
        const candidate = await client.queryOne<CandidateRow>(
          "SELECT * FROM drawing_recognition_candidates WHERE id = :candidateId AND session_id = :sessionId AND company_id = :companyId",
          { candidateId: decision.candidateId, sessionId: session.id, companyId: session.company_id }
        );
        if (!candidate) throw new DrawingRecognitionError("RECOGNITION_CANDIDATE_NOT_FOUND", "找不到指定候選。", 404);
        const before = mapCandidate(candidate);
        const update = decisionUpdate(candidate, decision);
        if ((decision.action === "ignore" || decision.action === "not_applicable") && !boundedText(decision.reason, 500)) {
          throw new DrawingRecognitionError("RECOGNITION_DECISION_REASON_REQUIRED", "忽略或不適用需要填寫原因。", 400);
        }
        await client.execute(
          `INSERT INTO drawing_recognition_decisions (
             id, session_id, candidate_id, company_id, action, before_json, after_json, reason,
             expected_session_version, actor_id, decided_at
           ) VALUES (
             :id, :sessionId, :candidateId, :companyId, :action, :beforeJson, :afterJson, :reason,
             :expectedVersion, :actorId, :timestamp
           )`,
          {
            id: `recognition-decision-${crypto.randomUUID()}`, sessionId: session.id, candidateId: candidate.id,
            companyId: session.company_id, action: decision.action, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(update),
            reason: boundedText(decision.reason, 500) || null, expectedVersion: input.expectedRowVersion, actorId: input.actorId, timestamp
          }
        );
        await client.execute(
          `UPDATE drawing_recognition_candidates SET category = :category, field_key = :fieldKey, field_label = :fieldLabel,
             proposed_value = :proposedValue, normalized_value = :normalizedValue, proposed_owner_type = :ownerType,
             proposed_owner_id = :ownerId, applicability_scope = :applicabilityScope, variant_status = :variantStatus,
             review_state = :reviewState, row_version = row_version + 1, updated_at = :timestamp
           WHERE id = :candidateId`,
          { ...update, candidateId: candidate.id, timestamp }
        );
      }
      const blockers = await client.queryOne<{ count: number | string }>(
        `SELECT COUNT(*) AS count FROM drawing_recognition_candidates
         WHERE session_id = :sessionId AND category <> 'unclassified'
           AND review_state IN ('proposed', 'conflict', 'blocked')`,
        { sessionId: session.id }
      );
      const status = Number(blockers?.count ?? 0) === 0 ? "ready_to_formalize" : session.status === "extraction_partial" ? "extraction_partial" : "review_ready";
      await client.execute(
        `UPDATE drawing_recognition_sessions SET status = :status, row_version = row_version + 1, updated_at = :timestamp WHERE id = :sessionId`,
        { status, timestamp, sessionId: session.id }
      );
      return new DrawingRecognitionAsyncRepository(client).getProjection(session.id, session.company_id);
    });
  }

  async calculateImpact(input: { sessionId: string; companyId: string; expectedRowVersion: number; lockTargets?: boolean }) {
    const sessionLock = input.lockTargets && this.client.kind === "postgres" ? " FOR UPDATE" : "";
    const session = await this.client.queryOne<SessionRow>(
      `SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId AND company_id = :companyId${sessionLock}`,
      { sessionId: input.sessionId, companyId: input.companyId }
    );
    if (!session) throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
    if (!["ready_to_formalize", "review_ready", "extraction_partial"].includes(session.status)) {
      throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FORMALIZABLE", "目前狀態不能計算正式寫入內容。", 409);
    }
    if (Number(session.row_version) !== input.expectedRowVersion) throw new DrawingRecognitionError("RECOGNITION_SESSION_STALE", "辨識內容已被更新，請重新載入。", 409);
    const candidateOrder = input.lockTargets
      ? "proposed_owner_type, proposed_owner_id, field_key, id"
      : "sort_order, id";
    const candidates = await this.client.query<CandidateRow>(
      `SELECT * FROM drawing_recognition_candidates WHERE session_id = :sessionId AND company_id = :companyId ORDER BY ${candidateOrder}`,
      { sessionId: session.id, companyId: session.company_id }
    );
    if (input.lockTargets && this.client.kind === "postgres") {
      const targets = [...new Map(candidates
        .filter((candidate) => ["accepted", "corrected", "mapped"].includes(candidate.review_state))
        .filter((candidate) => candidate.proposed_owner_type && candidate.proposed_owner_id)
        .map((candidate) => [`${candidate.proposed_owner_type}:${candidate.proposed_owner_id}`, {
          ownerType: candidate.proposed_owner_type!, ownerId: candidate.proposed_owner_id!
        }])).values()];
      for (const target of targets) await this.lockFormalTargetParent(target.ownerType, target.ownerId, session.company_id);
    }
    const changes: DrawingRecognitionImpactChange[] = [];
    const blockers: Array<{ candidateId: string; reason: string }> = [];
    const exclusions: Array<{ candidateId: string; reason: string }> = [];
    for (const candidate of candidates) {
      if (candidate.review_state === "ignored" || candidate.review_state === "deferred" || candidate.category === "unclassified" || candidate.category === "identity_relation") {
        exclusions.push({ candidateId: candidate.id, reason: candidate.review_state === "ignored" ? "ignored" : candidate.category === "identity_relation" ? "identity_evidence_only" : "not_intended_for_write" });
        continue;
      }
      if (!["accepted", "corrected", "mapped"].includes(candidate.review_state)) {
        blockers.push({ candidateId: candidate.id, reason: candidate.review_state === "conflict" ? "unresolved_conflict" : "review_required" });
        continue;
      }
      const fieldKey = candidate.field_key ?? "";
      const ownerType = candidate.proposed_owner_type ?? "";
      const ownerId = candidate.proposed_owner_id ?? "";
      if (candidate.variant_status === "explicit_not_applicable" && (!fieldKey || !ownerType || !ownerId)) {
        exclusions.push({ candidateId: candidate.id, reason: "explicit_not_applicable_no_target" });
        continue;
      }
      if (!fieldKey || !ownerType || !ownerId) {
        blockers.push({ candidateId: candidate.id, reason: "target_mapping_required" });
        continue;
      }
      if (candidate.proposed_value === null && candidate.variant_status !== "explicit_not_applicable") {
        exclusions.push({ candidateId: candidate.id, reason: "missing_value_no_change" });
        continue;
      }
      const current = await this.readCurrentFormalValue(this.client, {
        companyId: session.company_id, category: candidate.category, fieldKey, ownerType, ownerId, lock: input.lockTargets
      });
      const afterValue = candidate.variant_status === "explicit_not_applicable" ? null : candidate.proposed_value;
      const changeKind = candidate.category === "engineering_evidence"
        ? "evidence"
        : candidate.variant_status === "explicit_not_applicable"
          ? "not_applicable"
          : current.value === null ? "create" : "update";
      if (current.value === afterValue && changeKind !== "evidence" && changeKind !== "not_applicable") {
        exclusions.push({ candidateId: candidate.id, reason: "unchanged" });
        continue;
      }
      changes.push({
        candidateId: candidate.id, category: candidate.category, targetType: ownerType, targetId: ownerId,
        fieldKey, fieldLabel: candidate.field_label, beforeValue: current.value, afterValue, changeKind,
        targetFingerprint: current.fingerprint
      });
    }
    const orderedChanges = [...changes].sort((left, right) =>
      `${left.targetType}:${left.targetId}:${left.fieldKey}:${left.candidateId}`.localeCompare(`${right.targetType}:${right.targetId}:${right.fieldKey}:${right.candidateId}`)
    );
    const orderedBlockers = [...blockers].sort((left, right) => left.candidateId.localeCompare(right.candidateId) || left.reason.localeCompare(right.reason));
    const orderedExclusions = [...exclusions].sort((left, right) => left.candidateId.localeCompare(right.candidateId) || left.reason.localeCompare(right.reason));
    const targetFingerprints = Object.fromEntries(orderedChanges.map((change) => [`${change.targetType}:${change.targetId}:${change.fieldKey}`, change.targetFingerprint]));
    const releasedTargetCount = await this.countReleasedTargets(orderedChanges, input.companyId);
    const impactFingerprint = sha256Canonical({
      sessionId: session.id, sessionVersion: Number(session.row_version), sourceSetFingerprint: session.source_set_fingerprint,
      changes: orderedChanges.map(({ targetFingerprint: _targetFingerprint, ...change }) => change), targetFingerprints, exclusions: orderedExclusions
    });
    return {
      sessionId: session.id,
      sessionRowVersion: Number(session.row_version),
      sourceSetFingerprint: session.source_set_fingerprint,
      changes: orderedChanges,
      blockers: orderedBlockers,
      exclusions: orderedExclusions,
      targetFingerprints,
      requiresPostReleaseChange: releasedTargetCount > 0,
      impactFingerprint
    };
  }

  async applyFormalization(input: {
    sessionId: string;
    companyId: string;
    actorId: string;
    expectedRowVersion: number;
    idempotencyKey: string;
    expectedImpactFingerprint: string;
    requirePostReleaseReason?: string | null;
  }) {
    const impact = await this.calculateImpact({
      sessionId: input.sessionId, companyId: input.companyId, expectedRowVersion: input.expectedRowVersion, lockTargets: true
    });
    if (impact.impactFingerprint !== input.expectedImpactFingerprint) {
      throw new DrawingRecognitionError("RECOGNITION_IMPACT_STALE", "正式資料已改變，請返回核對並重新計算寫入內容。", 409);
    }
    if (impact.blockers.length > 0) throw new DrawingRecognitionError("RECOGNITION_FORMALIZATION_BLOCKED", "仍有未完成的候選，請先返回核對。", 422);
    const session = await this.client.queryOne<SessionRow>(
      "SELECT * FROM drawing_recognition_sessions WHERE id = :sessionId AND company_id = :companyId",
      { sessionId: input.sessionId, companyId: input.companyId }
    );
    if (!session) throw new DrawingRecognitionError("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
    const releasedTargets = await this.countReleasedTargets(impact.changes, input.companyId);
    if (releasedTargets > 0 && !boundedText(input.requirePostReleaseReason, 500)) {
      throw new DrawingRecognitionError("RECOGNITION_POST_RELEASE_REASON_REQUIRED", "受控或已發布資料變更需要填寫原因。", 422);
    }
    const eventId = `recognition-event-${crypto.randomUUID()}`;
    const timestamp = now();
    const result = { eventId, sessionId: session.id, appliedCount: impact.changes.length, exclusions: impact.exclusions };
    await this.client.execute(
      `INSERT INTO drawing_recognition_formalization_events (
         id, session_id, company_id, actor_id, idempotency_key, impact_fingerprint, target_fingerprints_json,
         applied_changes_json, exclusions_json, result_json, created_at
       ) VALUES (
         :id, :sessionId, :companyId, :actorId, :idempotencyKey, :impactFingerprint, :targetFingerprintsJson,
         :appliedChangesJson, :exclusionsJson, :resultJson, :timestamp
       )`,
      {
        id: eventId, sessionId: session.id, companyId: session.company_id, actorId: input.actorId,
        idempotencyKey: input.idempotencyKey, impactFingerprint: impact.impactFingerprint,
        targetFingerprintsJson: JSON.stringify(impact.targetFingerprints), appliedChangesJson: JSON.stringify(impact.changes),
        exclusionsJson: JSON.stringify(impact.exclusions), resultJson: JSON.stringify(result), timestamp
      }
    );
    for (const change of impact.changes) {
      const candidate = await this.client.queryOne<CandidateRow>(
        "SELECT * FROM drawing_recognition_candidates WHERE id = :candidateId AND session_id = :sessionId",
        { candidateId: change.candidateId, sessionId: session.id }
      );
      if (!candidate) throw new DrawingRecognitionError("RECOGNITION_CANDIDATE_NOT_FOUND", "正式化候選已不存在。", 409);
      if (change.category === "part_attribute") await this.applyPartAttribute(change, candidate, eventId, input.actorId, timestamp);
      if (change.category === "drawing_revision") await this.applyDrawingMetadata(change, candidate, eventId, input.actorId, timestamp);
      if (change.category === "controlled_note") await this.applyControlledNote(change, candidate, eventId, input.actorId, timestamp);
      if (change.category === "engineering_evidence") await this.applyEngineeringEvidence(change, candidate, eventId, timestamp);
      await this.client.execute(
        `INSERT INTO drawing_recognition_formalization_links (
          event_id, candidate_id, company_id, target_type, target_id, field_key, change_kind, before_value, after_value, created_at
        ) VALUES (
          :eventId, :candidateId, :companyId, :targetType, :targetId, :fieldKey, :changeKind, :beforeValue, :afterValue, :timestamp
        )`,
        { eventId, candidateId: change.candidateId, companyId: session.company_id, targetType: change.targetType,
          targetId: change.targetId, fieldKey: change.fieldKey, changeKind: change.changeKind,
          beforeValue: change.beforeValue, afterValue: change.afterValue, timestamp }
      );
    }
    await this.client.execute(
      `UPDATE drawing_recognition_sessions SET status = 'formalized', formalized_by = :actorId, formalized_at = :timestamp,
         row_version = row_version + 1, updated_at = :timestamp WHERE id = :sessionId`,
      { actorId: input.actorId, timestamp, sessionId: session.id }
    );
    return result;
  }

  private async resolveContextScope(companyId: string, type: DrawingRecognitionSourceContextType, id: string): Promise<ScopeRow | null> {
    if (type === "drawing_number") {
      return this.client.queryOne<ScopeRow>(
        `SELECT drawing.id AS drawing_id, NULL AS drawing_revision_id, drawing.owner_id
         FROM drawing_numbers number
         LEFT JOIN drawings drawing
           ON drawing.formal_drawing_number_id = number.id
          AND drawing.company_id = number.company_id
         WHERE number.id = :id AND number.company_id = :companyId
         ORDER BY CASE WHEN drawing.id IS NULL THEN 1 ELSE 0 END, drawing.updated_at DESC, drawing.id DESC
         LIMIT 1`,
        { id, companyId }
      );
    }
    if (type === "drawing_revision") {
      return this.client.queryOne<ScopeRow>(
        `SELECT revision.drawing_id, revision.id AS drawing_revision_id, drawing.owner_id
         FROM drawing_revisions revision JOIN drawings drawing ON drawing.id = revision.drawing_id
         WHERE revision.id = :id AND revision.company_id = :companyId AND drawing.company_id = :companyId`,
        { id, companyId }
      );
    }
    if (type === "candidate_revision") {
      return this.client.queryOne<ScopeRow>(
        `SELECT drawing.id AS drawing_id, revision.id AS drawing_revision_id, drawing.owner_id
         FROM numbering_candidate_revision_drafts candidate
         LEFT JOIN drawing_revisions revision ON revision.source_candidate_revision_id = candidate.id AND revision.company_id = candidate.company_id
         LEFT JOIN drawings drawing ON drawing.company_id = candidate.company_id
           AND (drawing.id = revision.drawing_id OR drawing.drawing_draft_id = candidate.drawing_draft_id)
         WHERE candidate.id = :id AND candidate.company_id = :companyId
         ORDER BY CASE WHEN revision.id IS NULL THEN 1 ELSE 0 END LIMIT 1`,
        { id, companyId }
      );
    }
    return this.client.queryOne<ScopeRow>(
       `SELECT drawing.id AS drawing_id, revision.id AS drawing_revision_id, drawing.owner_id
        FROM drawing_revision_packages package
        LEFT JOIN drawing_revisions revision ON revision.source_revision_package_id = package.id AND revision.company_id = package.company_id
        LEFT JOIN drawings drawing ON drawing.company_id = package.company_id
          AND (drawing.id = revision.drawing_id OR drawing.formal_drawing_number_id = package.drawing_number_id)
        WHERE package.id = :id AND package.company_id = :companyId LIMIT 1`,
      { id, companyId }
    );
  }

  private async listContextSources(companyId: string, type: DrawingRecognitionSourceContextType, id: string): Promise<FileSourceRow[]> {
    const select = `SELECT asset.id AS file_asset_id, asset.content_hash, asset.storage_generation, asset.file_name,
      asset.file_ext, asset.mime_type, asset.file_size, scoped.source_role, scoped.sort_order
      FROM (%SCOPED%) scoped JOIN file_assets asset ON asset.id = scoped.file_asset_id
      WHERE asset.deleted_at IS NULL ORDER BY scoped.sort_order, asset.id`;
    if (type === "candidate_revision") {
      return this.client.query<FileSourceRow>(
        select.replace("%SCOPED%", `SELECT source_file_asset_id AS file_asset_id, role AS source_role, sort_order
          FROM numbering_candidate_revision_files WHERE candidate_revision_id = :id AND company_id = :companyId AND removed_at IS NULL`),
        { id, companyId }
      );
    }
    if (type === "drawing_number") {
      return this.client.query<FileSourceRow>(
        `SELECT asset.id AS file_asset_id, asset.content_hash, asset.storage_generation, asset.file_name,
                asset.file_ext, COALESCE(asset.mime_type, 'application/octet-stream') AS mime_type,
                asset.file_size, asset.document_category AS source_role,
                ROW_NUMBER() OVER (ORDER BY asset.created_at, asset.id) - 1 AS sort_order
           FROM file_assets asset
          WHERE asset.linked_entity_type = 'drawing_number'
            AND asset.linked_entity_id = :id
            AND asset.deleted_at IS NULL`,
        { id }
      );
    }
    if (type === "revision_package") {
      return this.client.query<FileSourceRow>(
        select.replace("%SCOPED%", `SELECT file.source_file_asset_id AS file_asset_id, file.role AS source_role, file.sort_order
          FROM drawing_revision_package_files file JOIN drawing_revision_packages package ON package.id = file.package_id
          WHERE file.package_id = :id AND package.company_id = :companyId`),
        { id, companyId }
      );
    }
    return this.client.query<FileSourceRow>(
      select.replace("%SCOPED%", `SELECT file.source_file_asset_id AS file_asset_id, file.role AS source_role, file.sort_order
        FROM drawing_revision_files file JOIN drawing_revisions revision ON revision.id = file.drawing_revision_id
        WHERE file.drawing_revision_id = :id AND revision.company_id = :companyId AND file.removed_at IS NULL`),
      { id, companyId }
    );
  }

  private async readCurrentFormalValue(client: AsyncDatabaseClient, input: {
    companyId: string; category: DrawingRecognitionCategory; fieldKey: string | null; ownerType: string | null; ownerId: string | null; lock?: boolean;
  }) {
    const fingerprintInput = {
      companyId: input.companyId,
      category: input.category,
      fieldKey: input.fieldKey,
      ownerType: input.ownerType,
      ownerId: input.ownerId
    };
    const missing = { value: null as string | null, fingerprint: sha256Canonical({ missing: true, ...fingerprintInput }) };
    if (!input.fieldKey || !input.ownerType || !input.ownerId) return missing;
    const lock = input.lock && client.kind === "postgres" ? " FOR UPDATE" : "";
    if (input.category === "part_attribute" && input.ownerType === "part_number") {
      const row = await client.queryOne<{ value_text: string | null; applicability_state: string; row_version: number | string; updated_at: string }>(
        `SELECT value.value_text, value.applicability_state, value.row_version, value.updated_at
         FROM pdm_part_attribute_values value
         JOIN pdm_attribute_definitions definition ON definition.id = value.attribute_definition_id
         WHERE value.company_id = :companyId AND value.part_number_id = :ownerId AND definition.stable_key = :fieldKey${lock}`,
        { companyId: input.companyId, ownerId: input.ownerId, fieldKey: input.fieldKey }
      );
      if (row) {
        const value = row.applicability_state === "not_applicable" ? null : row.value_text;
        return { value, fingerprint: sha256Canonical({ value, applicabilityState: row.applicability_state, rowVersion: Number(row.row_version), updatedAt: row.updated_at }) };
      }
      const legacyColumn = legacyColumnForField(input.fieldKey);
      if (legacyColumn) {
        const legacy = await client.queryOne<Record<string, string | null>>(
          `SELECT ${legacyColumn} AS value FROM part_variant_attributes WHERE part_number_id = :ownerId${lock}`,
          { ownerId: input.ownerId }
        );
        if (legacy) return { value: legacy.value ?? null, fingerprint: sha256Canonical({ legacy: true, fieldKey: input.fieldKey, value: legacy.value ?? null }) };
      }
      return missing;
    }
    if (input.category === "drawing_revision" && input.ownerType === "drawing_revision") {
      const row = await client.queryOne<{ value_text: string; row_version: number | string; updated_at: string }>(
        `SELECT value_text, row_version, updated_at FROM pdm_drawing_revision_metadata_values
         WHERE company_id = :companyId AND drawing_revision_id = :ownerId AND metadata_key = :fieldKey${lock}`,
        { companyId: input.companyId, ownerId: input.ownerId, fieldKey: input.fieldKey }
      );
      return row ? { value: row.value_text, fingerprint: sha256Canonical({ value: row.value_text, rowVersion: Number(row.row_version), updatedAt: row.updated_at }) } : missing;
    }
    return missing;
  }

  private async lockFormalTargetParent(ownerType: string, ownerId: string, companyId: string) {
    if (this.client.kind !== "postgres") return;
    if (ownerType === "part_number") {
      await this.client.queryOne("SELECT id FROM part_numbers WHERE id = :ownerId AND company_id = :companyId FOR UPDATE", { ownerId, companyId });
      return;
    }
    if (ownerType === "drawing") {
      await this.client.queryOne("SELECT id FROM drawings WHERE id = :ownerId AND company_id = :companyId FOR UPDATE", { ownerId, companyId });
      return;
    }
    if (ownerType === "drawing_revision") {
      await this.client.queryOne("SELECT id FROM drawing_revisions WHERE id = :ownerId AND company_id = :companyId FOR UPDATE", { ownerId, companyId });
    }
  }

  private async countReleasedTargets(changes: DrawingRecognitionImpactChange[], companyId: string) {
    let count = 0;
    for (const target of [...new Set(changes.map((change) => `${change.targetType}:${change.targetId}`))]) {
      const [type, id] = target.split(":", 2);
      if (type === "part_number") {
        const row = await this.client.queryOne<{ record_status: string }>("SELECT record_status FROM part_numbers WHERE id = :id AND company_id = :companyId", { id, companyId });
        if (row?.record_status === "Released") count += 1;
      }
      if (type === "drawing_revision") {
        const row = await this.client.queryOne<{ lifecycle_state: string }>("SELECT lifecycle_state FROM drawing_revisions WHERE id = :id AND company_id = :companyId", { id, companyId });
        if (row && ["rd_controlled", "released"].includes(row.lifecycle_state)) count += 1;
      }
    }
    return count;
  }

  private async applyPartAttribute(change: DrawingRecognitionImpactChange, candidate: CandidateRow, eventId: string, actorId: string, timestamp: string) {
    const definitionId = `attribute-${sha256Canonical({ companyId: candidate.company_id, fieldKey: change.fieldKey }).slice(0, 32)}`;
    const legacyTargetKey = legacyColumnForField(change.fieldKey) ? change.fieldKey === "surface_finish" ? "surface_treatment" : change.fieldKey : null;
    await this.client.execute(
      `INSERT INTO pdm_attribute_definitions (
         id, company_id, stable_key, display_label, aliases_json, legacy_target_key, created_by, created_at, updated_by, updated_at
       ) VALUES (
         :id, :companyId, :stableKey, :displayLabel, '[]', :legacyTargetKey, :actorId, :timestamp, :actorId, :timestamp
       ) ON CONFLICT (company_id, stable_key) DO NOTHING`,
      { id: definitionId, companyId: candidate.company_id, stableKey: change.fieldKey, displayLabel: candidate.field_label, legacyTargetKey, actorId, timestamp }
    );
    const definition = await this.client.queryOne<{ id: string }>(
      "SELECT id FROM pdm_attribute_definitions WHERE company_id = :companyId AND stable_key = :stableKey",
      { companyId: candidate.company_id, stableKey: change.fieldKey }
    );
    if (!definition) throw new DrawingRecognitionError("RECOGNITION_ATTRIBUTE_DEFINITION_FAILED", "正式欄位建立失敗。", 500);
    const valueId = `attribute-value-${crypto.randomUUID()}`;
    await this.client.execute(
      `INSERT INTO pdm_part_attribute_values (
         id, company_id, part_number_id, attribute_definition_id, applicability_state, value_text, last_formalization_event_id,
         created_by, created_at, updated_by, updated_at
       ) VALUES (
         :id, :companyId, :partNumberId, :definitionId, :applicabilityState, :valueText, :eventId,
         :actorId, :timestamp, :actorId, :timestamp
       ) ON CONFLICT (company_id, part_number_id, attribute_definition_id) DO UPDATE SET
         applicability_state = excluded.applicability_state, value_text = excluded.value_text,
         row_version = pdm_part_attribute_values.row_version + 1, last_formalization_event_id = excluded.last_formalization_event_id,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      { id: valueId, companyId: candidate.company_id, partNumberId: change.targetId, definitionId: definition.id,
        applicabilityState: change.changeKind === "not_applicable" ? "not_applicable" : "value", valueText: change.afterValue,
        eventId, actorId, timestamp }
    );
    const legacyColumn = legacyColumnForField(change.fieldKey);
    if (legacyColumn) {
      await this.client.execute(
        `INSERT INTO part_variant_attributes (id, part_number_id, ${legacyColumn}, updated_by, created_at, updated_at)
         VALUES (:id, :partNumberId, :value, :actorId, :timestamp, :timestamp)
         ON CONFLICT (part_number_id) DO UPDATE SET ${legacyColumn} = excluded.${legacyColumn}, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        { id: `part-variant-${crypto.randomUUID()}`, partNumberId: change.targetId, value: change.changeKind === "not_applicable" ? "無" : change.afterValue, actorId, timestamp }
      );
    }
  }

  private async applyDrawingMetadata(change: DrawingRecognitionImpactChange, candidate: CandidateRow, eventId: string, actorId: string, timestamp: string) {
    if (!["unit", "scale", "projection_method", "drawn_date", "reviewed_date"].includes(change.fieldKey)) {
      throw new DrawingRecognitionError("RECOGNITION_DRAWING_FIELD_INVALID", "圖面欄位不在可正式化範圍。", 422);
    }
    await this.client.execute(
      `INSERT INTO pdm_drawing_revision_metadata_values (
         id, company_id, drawing_revision_id, metadata_key, value_text, last_formalization_event_id,
         created_by, created_at, updated_by, updated_at
       ) VALUES (
         :id, :companyId, :drawingRevisionId, :metadataKey, :valueText, :eventId,
         :actorId, :timestamp, :actorId, :timestamp
       ) ON CONFLICT (company_id, drawing_revision_id, metadata_key) DO UPDATE SET
         value_text = excluded.value_text, row_version = pdm_drawing_revision_metadata_values.row_version + 1,
         last_formalization_event_id = excluded.last_formalization_event_id, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      { id: `drawing-metadata-${crypto.randomUUID()}`, companyId: candidate.company_id, drawingRevisionId: change.targetId,
        metadataKey: change.fieldKey, valueText: change.afterValue ?? "", eventId, actorId, timestamp }
    );
  }

  private async applyControlledNote(change: DrawingRecognitionImpactChange, candidate: CandidateRow, eventId: string, actorId: string, timestamp: string) {
    const owner = ownerColumns(change.targetType, change.targetId);
    await this.client.execute(
      `INSERT INTO pdm_controlled_notes (
         id, company_id, part_number_id, drawing_id, drawing_revision_id, note_text, applicability_scope,
         last_formalization_event_id, created_by, created_at, updated_by, updated_at
       ) VALUES (
         :id, :companyId, :partNumberId, :drawingId, :drawingRevisionId, :noteText, :scope,
         :eventId, :actorId, :timestamp, :actorId, :timestamp
       )`,
      { id: `controlled-note-${crypto.randomUUID()}`, companyId: candidate.company_id, ...owner,
        noteText: change.afterValue ?? candidate.proposed_value ?? candidate.raw_value ?? "", scope: candidate.applicability_scope,
        eventId, actorId, timestamp }
    );
  }

  private async applyEngineeringEvidence(change: DrawingRecognitionImpactChange, candidate: CandidateRow, eventId: string, timestamp: string) {
    const observation = await this.client.queryOne<ObservationRow>(
      `SELECT observation.* FROM drawing_recognition_candidate_observations link
       JOIN drawing_recognition_observations observation ON observation.id = link.observation_id
       WHERE link.candidate_id = :candidateId ORDER BY observation.captured_at, observation.id LIMIT 1`,
      { candidateId: candidate.id }
    );
    if (!observation) throw new DrawingRecognitionError("RECOGNITION_EVIDENCE_REQUIRED", "局部工程資訊缺少來源證據。", 422);
    const owner = ownerColumns(change.targetType, change.targetId);
    await this.client.execute(
      `INSERT INTO pdm_engineering_evidence (
         id, company_id, part_number_id, drawing_id, drawing_revision_id, session_id, candidate_id, observation_id,
         evidence_type, summary, page_number, sheet_name, configuration_name, created_at
       ) VALUES (
         :id, :companyId, :partNumberId, :drawingId, :drawingRevisionId, :sessionId, :candidateId, :observationId,
         :evidenceType, :summary, :pageNumber, :sheetName, :configurationName, :timestamp
       )`,
      { id: `engineering-evidence-${crypto.randomUUID()}`, companyId: candidate.company_id, ...owner,
        sessionId: candidate.session_id, candidateId: candidate.id, observationId: observation.id,
        evidenceType: change.fieldKey, summary: change.afterValue ?? candidate.proposed_value ?? observation.raw_text,
        pageNumber: observation.page_number, sheetName: observation.sheet_name, configurationName: observation.configuration_name, timestamp }
    );
    void eventId;
  }
}

function inferOwnerType(category: DrawingRecognitionCategory) {
  if (category === "part_attribute") return "part_number";
  if (category === "drawing_revision" || category === "controlled_note" || category === "engineering_evidence") return "drawing_revision";
  return null;
}

function inferOwnerId(category: DrawingRecognitionCategory, session: SessionRow) {
  if (category === "drawing_revision" || category === "controlled_note" || category === "engineering_evidence") return session.drawing_revision_id;
  return null;
}

function decisionUpdate(candidate: CandidateRow, decision: DrawingRecognitionDecisionInput) {
  const proposedValue = decision.action === "not_applicable" ? null : decision.value === undefined ? candidate.proposed_value : boundedText(decision.value, 4_000);
  const fieldLabel = boundedText(decision.fieldLabel, 200, candidate.field_label) || candidate.field_label;
  const fieldKey = normalizeRecognitionKey(decision.fieldKey ?? candidate.field_key ?? fieldLabel) || null;
  const reviewState = decision.action === "ignore" ? "ignored"
    : decision.action === "defer" ? "deferred"
      : decision.action === "restore" ? "proposed"
        : decision.action === "accept" || decision.action === "set_baseline" ? "accepted"
          : decision.action === "map" || decision.action === "create_field" ? "mapped"
            : "corrected";
  return {
    category: decision.category ?? candidate.category,
    fieldKey,
    fieldLabel,
    proposedValue,
    normalizedValue: proposedValue === null ? null : normalizeRecognitionValue(proposedValue),
    ownerType: decision.ownerType === undefined ? candidate.proposed_owner_type : boundedText(decision.ownerType, 80) || null,
    ownerId: decision.ownerId === undefined ? candidate.proposed_owner_id : boundedText(decision.ownerId, 200) || null,
    applicabilityScope: boundedText(decision.applicabilityScope, 120, candidate.applicability_scope) || candidate.applicability_scope,
    variantStatus: decision.action === "not_applicable" ? "explicit_not_applicable" : candidate.variant_status,
    reviewState
  };
}

function calculateBaseline(candidates: Array<ReturnType<typeof mapCandidate>>) {
  const byField = new Map<string, Array<ReturnType<typeof mapCandidate>>>();
  for (const candidate of candidates) {
    if (candidate.category !== "part_attribute" || candidate.proposedOwnerType !== "part_number" || !candidate.fieldKey || !candidate.normalizedValue) continue;
    const list = byField.get(candidate.fieldKey) ?? [];
    list.push(candidate);
    byField.set(candidate.fieldKey, list);
  }
  return [...byField.entries()].flatMap(([fieldKey, list]) => {
    const values = new Map<string, number>();
    for (const candidate of list) values.set(candidate.normalizedValue!, (values.get(candidate.normalizedValue!) ?? 0) + 1);
    const ranked = [...values.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
    const winner = ranked[0];
    if (!winner || (ranked[1] && ranked[1][1] === winner[1]) || winner[1] <= list.length / 2) return [];
    return [{ fieldKey, fieldLabel: list[0].fieldLabel, value: winner[0], support: winner[1], partCount: list.length }];
  });
}

function legacyColumnForField(fieldKey: string) {
  if (fieldKey === "material") return "material_label";
  if (fieldKey === "color") return "color_label";
  if (fieldKey === "surface_treatment" || fieldKey === "surface_finish") return "surface_treatment";
  if (fieldKey === "variant_note") return "variant_note";
  return null;
}

function ownerColumns(type: string, id: string) {
  if (type === "part_number") return { partNumberId: id, drawingId: null, drawingRevisionId: null };
  if (type === "drawing") return { partNumberId: null, drawingId: id, drawingRevisionId: null };
  if (type === "drawing_revision") return { partNumberId: null, drawingId: null, drawingRevisionId: id };
  throw new DrawingRecognitionError("RECOGNITION_OWNER_INVALID", "正式寫入對象不正確。", 422);
}
