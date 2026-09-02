import "server-only";

import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import {
  canonicalRecognitionFieldLabel,
  canonicalizeRecognitionSemantics,
  canonicalizeRecognitionValue,
  parseJsonValue,
  sha256Canonical
} from "@/lib/drawing-recognition-contract";
import {
  DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA,
  projectDrawingRecognitionReviewFields,
  type DrawingRecognitionReviewProjectionBody,
  type RecognitionReviewCandidateDecision,
  type RecognitionReviewObservation,
  type RecognitionReviewScope,
  type DrawingRecognitionPartWorkHandoffProjection
} from "@/lib/drawing-recognition-review-projection";
import type { RecognitionPartOwnerTarget } from "@/lib/drawing-recognition-part-owner";

type SessionRow = {
  id: string;
  company_id: string;
  source_context_type: string;
  source_context_id: string;
  drawing_id: string | null;
  drawing_revision_id: string | null;
  source_set_fingerprint: string;
  session_purpose?: "recognition" | "rerun" | "amendment";
  evidence_origin_session_id?: string | null;
  status: string;
  row_version: number | string;
  warning_count: number | string;
  conflict_count: number | string;
  unclassified_count: number | string;
  error_code: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  formalized_at: string | null;
};

type SourceRow = {
  id: string;
  session_id: string;
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
};

type CandidateRow = {
  id: string;
  session_id: string;
  category: string;
  field_key: string | null;
  field_label: string;
  proposed_value: string | null;
  normalized_value: string | null;
  proposed_owner_type: string | null;
  proposed_owner_id: string | null;
  applicability_scope: string;
  confidence_band: string;
  review_state: string;
  current_formal_value: string | null;
  sort_order: number | string;
  row_version: number | string;
};

type ObservationRow = {
  candidate_id: string;
  session_id: string;
  id: string;
  source_id: string;
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

type PartOwnerTargetRow = {
  drawing_id: string;
  id: string;
  part_number: string;
  record_status: string;
  owner_source: RecognitionPartOwnerTarget["source"];
};

type HandoffEventRow = { session_id: string; result_json: string };

function list(prefix: string, values: string[]) {
  return {
    sql: values.map((_, index) => `:${prefix}${index}`).join(", "),
    params: Object.fromEntries(values.map((value, index) => [`${prefix}${index}`, value]))
  };
}

function sessionKey(drawingId: string, revisionId: string) {
  return `${drawingId}:${revisionId}`;
}

function nonempty(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function timestamp(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapObservation(row: ObservationRow, candidateId: string, source: SourceRow | undefined): RecognitionReviewObservation {
  return {
    id: row.id,
    candidateId,
    sourceId: row.source_id,
    sourceFileName: source?.file_name ?? null,
    sourceRole: source?.source_role ?? null,
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
    capturedAt: timestamp(row.captured_at)
  };
}

function reviewScopes(candidates: RecognitionReviewCandidateDecision[]): RecognitionReviewScope[] {
  const groups = new Map<string, RecognitionReviewCandidateDecision[]>();
  for (const candidate of candidates) {
    const key = sha256Canonical({ category: candidate.category, fieldKey: candidate.fieldKey, ownerType: candidate.proposedOwnerType, ownerId: candidate.proposedOwnerId });
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return [...groups.entries()].map(([id, members]) => {
    const distinctValues = [...new Set(members.map((member) => member.normalizedValue ?? member.proposedValue).filter((value): value is string => nonempty(value)))].sort();
    const preferredValue = distinctValues.length === 1 ? distinctValues[0] : null;
    const primary = [...members].sort((left, right) => {
      const leftPreferred = preferredValue !== null && (left.normalizedValue ?? left.proposedValue) === preferredValue;
      const rightPreferred = preferredValue !== null && (right.normalizedValue ?? right.proposedValue) === preferredValue;
      return Number(rightPreferred) - Number(leftPreferred) || left.id.localeCompare(right.id);
    })[0];
    const currentFormalValue = [...new Set(members.map((member) => member.currentFormalValue?.trim()).filter((value): value is string => Boolean(value)))].join(" ／ ") || null;
    const observations = members.flatMap((member) => member.observations);
    const conflict = distinctValues.length > 1 || members.some((member) => member.reviewState === "conflict");
    const blocked = members.some((member) => member.reviewState === "blocked");
    return {
      id,
      category: primary.category,
      fieldKey: primary.fieldKey,
      fieldLabel: primary.fieldLabel,
      primaryCandidateId: primary.id,
      memberCandidateIds: members.map((member) => member.id).sort(),
      distinctValues,
      conflictState: distinctValues.length > 1 ? "conflict" as const : "none" as const,
      reviewState: conflict ? "conflict" : preferredValue !== null ? primary.reviewState : blocked ? "blocked" : primary.reviewState,
      proposedValue: primary.proposedValue,
      currentFormalValue,
      observations
    };
  });
}

function projectionFor(
  session: SessionRow,
  sources: SourceRow[],
  candidateRows: CandidateRow[],
  observations: ObservationRow[],
  partOwnerTargets: RecognitionPartOwnerTarget[],
  handoffEvent?: HandoffEventRow | null
): DrawingRecognitionReviewProjectionBody {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const observationsByCandidate = new Map<string, ObservationRow[]>();
  for (const observation of observations) observationsByCandidate.set(observation.candidate_id, [...(observationsByCandidate.get(observation.candidate_id) ?? []), observation]);
  const candidateDecisions = candidateRows.map((candidate): RecognitionReviewCandidateDecision => {
    const semantics = canonicalizeRecognitionSemantics({
      category: candidate.category,
      fieldKey: candidate.field_key,
      ownerType: candidate.proposed_owner_type,
      ownerId: candidate.proposed_owner_id
    });
    const currentFormalValue = canonicalizeRecognitionValue(semantics.fieldKey, candidate.current_formal_value);
    return {
      id: candidate.id,
      category: semantics.category,
      fieldKey: semantics.fieldKey,
      fieldLabel: canonicalRecognitionFieldLabel(semantics.fieldKey, candidate.field_label),
      proposedValue: canonicalizeRecognitionValue(semantics.fieldKey, candidate.proposed_value),
      normalizedValue: canonicalizeRecognitionValue(semantics.fieldKey, candidate.normalized_value),
      proposedOwnerType: semantics.ownerType,
      proposedOwnerId: semantics.ownerId,
      applicabilityScope: candidate.applicability_scope,
      confidenceBand: candidate.confidence_band,
      reviewState: candidate.review_state === "conflict" && !nonempty(currentFormalValue) ? "proposed" : candidate.review_state,
      currentFormalValue,
      rowVersion: Number(candidate.row_version),
      observations: (observationsByCandidate.get(candidate.id) ?? []).map((observation) => mapObservation(observation, candidate.id, sourceById.get(observation.source_id)))
    };
  });
  const fields = projectDrawingRecognitionReviewFields(reviewScopes(candidateDecisions), candidateDecisions, { partOwnerTargets });
  let handoff: DrawingRecognitionPartWorkHandoffProjection | null = null;
  if (handoffEvent) {
    try {
      const parsed = JSON.parse(handoffEvent.result_json) as Record<string, unknown>;
      if (parsed.schemaVersion === 2 && (parsed.destinationKind === "part_work" || parsed.destination === "part_work")) {
        const targets = Array.isArray(parsed.targets) ? parsed.targets : [];
        handoff = {
          schemaVersion: 2,
          destination: "part_work",
          relationScopeFingerprint: typeof parsed.relationScopeFingerprint === "string" ? parsed.relationScopeFingerprint : "",
          eligiblePartCount: Number(parsed.eligiblePartCount ?? 0),
          workMutationCount: Number(parsed.workMutationCount ?? 0),
          unchangedCount: Number(parsed.unchangedCount ?? 0),
          eventId: typeof parsed.eventId === "string" ? parsed.eventId : handoffEvent.session_id,
          targets: targets.filter((target): target is Record<string, unknown> => Boolean(target && typeof target === "object")).map((target) => ({
            partId: String(target.partId ?? ""), partNumber: String(target.partNumber ?? ""),
            result: ["created", "updated", "already_current", "already_in_work"].includes(String(target.result)) ? String(target.result) as DrawingRecognitionPartWorkHandoffProjection["targets"][number]["result"] : "already_current",
            workId: target.workId == null ? null : String(target.workId), rowVersion: target.rowVersion == null ? null : Number(target.rowVersion)
          }))
        };
      }
    } catch { handoff = null; }
  }
  return {
    schemaVersion: DRAWING_RECOGNITION_REVIEW_PROJECTION_SCHEMA,
    session: {
      id: session.id,
      sourceContextType: session.source_context_type,
      sourceContextId: session.source_context_id,
      drawingId: session.drawing_id,
      drawingRevisionId: session.drawing_revision_id,
      sourceSetFingerprint: session.source_set_fingerprint,
      sessionPurpose: session.session_purpose ?? "recognition",
      evidenceOriginSessionId: session.evidence_origin_session_id ?? null,
      status: session.status,
      rowVersion: Number(session.row_version),
      warningCount: Number(session.warning_count),
      conflictCount: fields.filter((field) => field.conflictState === "conflict").length,
      unclassifiedCount: Number(session.unclassified_count),
      errorCode: session.error_code,
      errorSummary: session.error_summary,
      createdAt: timestamp(session.created_at),
      updatedAt: timestamp(session.updated_at),
      formalizedAt: session.formalized_at === null ? null : timestamp(session.formalized_at)
    },
    sources: sources.map((source) => ({
      id: source.id,
      fileAssetId: source.file_asset_id,
      contentHash: source.content_hash,
      storageGeneration: source.storage_generation,
      fileName: source.file_name,
      fileExt: source.file_ext,
      mimeType: source.mime_type,
      fileSize: Number(source.file_size),
      sourceRole: source.source_role,
      sortOrder: Number(source.sort_order),
      adapterPlan: parseJsonValue<string[]>(source.adapter_plan_json, [])
    })),
    candidateDecisions,
    fields,
    handoff
  };
}

/** Batch, zero-write snapshot read. Sessions are matched to the exact Drawing revision, never latest-by-Drawing. */
export async function readDrawingRecognitionReviewProjections(
  client: AsyncDatabaseClient,
  input: { companyId: string; targets: Array<{ drawingId: string; revisionId: string }>; selection?: "current" | "formalized" }
) {
  const targets = [...new Map(input.targets.map((target) => [sessionKey(target.drawingId, target.revisionId), target])).values()];
  const result = new Map<string, DrawingRecognitionReviewProjectionBody>();
  if (!targets.length) return result;
  const drawingIds = [...new Set(targets.map((target) => target.drawingId))];
  const revisionIds = [...new Set(targets.map((target) => target.revisionId))];
  const drawingList = list("recognitionDrawing", drawingIds);
  const revisionList = list("recognitionRevision", revisionIds);
  const sessions = await client.query<SessionRow>(
    `SELECT * FROM drawing_recognition_sessions
     WHERE company_id = :companyId AND source_context_type = 'drawing_revision'
       AND drawing_id IN (${drawingList.sql}) AND drawing_revision_id IN (${revisionList.sql})
       AND source_context_id IN (${revisionList.sql})
     ORDER BY created_at DESC, id DESC`,
    { companyId: input.companyId, ...drawingList.params, ...revisionList.params }
  );
  const targetKeys = new Set(targets.map((target) => sessionKey(target.drawingId, target.revisionId)));
  const selected = new Map<string, SessionRow>();
  for (const session of sessions) {
    if (!session.drawing_id || !session.drawing_revision_id) continue;
    const key = sessionKey(session.drawing_id, session.drawing_revision_id);
    if (!targetKeys.has(key) || selected.has(key)) continue;
    // Embedded workbench reads the current open successor.  Review packages
    // explicitly request the last formalized leaf, so an unsent amendment can
    // never leak into an immutable submitted snapshot.
    const eligibleStatuses = input.selection === "formalized"
      ? ["formalized"]
      : ["queued", "extracting", "review_ready", "extraction_partial", "ready_to_formalize", "formalized"];
    if (eligibleStatuses.includes(session.status)) {
      selected.set(key, session);
    }
  }
  const selectedSessions = [...selected.values()];
  if (!selectedSessions.length) return result;
  const sessionList = list("recognitionSession", selectedSessions.map((session) => session.id));
  const evidenceSessionIds = [...new Set(selectedSessions.map((session) => session.session_purpose === "amendment"
    ? session.evidence_origin_session_id ?? session.id
    : session.id))];
  const evidenceSessionList = list("recognitionEvidenceSession", evidenceSessionIds);
  const sessionParams = { companyId: input.companyId, ...sessionList.params, ...evidenceSessionList.params };
  const [sources, candidates, observations, partOwnerTargetRows, handoffEvents] = await Promise.all([
    client.query<SourceRow>(`SELECT * FROM drawing_recognition_sources WHERE company_id = :companyId AND session_id IN (${evidenceSessionList.sql}) ORDER BY session_id, sort_order, id`, sessionParams),
    client.query<CandidateRow>(`SELECT * FROM drawing_recognition_candidates WHERE company_id = :companyId AND session_id IN (${sessionList.sql}) ORDER BY session_id, category, sort_order, id`, sessionParams),
    client.query<ObservationRow>(`SELECT link.candidate_id, observation.* FROM drawing_recognition_candidate_observations link
      JOIN drawing_recognition_observations observation ON observation.id = link.observation_id
      JOIN drawing_recognition_candidates candidate ON candidate.id = link.candidate_id
      WHERE observation.company_id = :companyId AND observation.session_id IN (${evidenceSessionList.sql})
        AND link.company_id = :companyId AND candidate.company_id = :companyId
        AND candidate.session_id IN (${sessionList.sql})
      ORDER BY observation.session_id, observation.captured_at, observation.id`, sessionParams),
    client.query<PartOwnerTargetRow>(`SELECT drawing.id AS drawing_id, part.id, part.part_number, part.record_status, 'formal' AS owner_source
      FROM drawings drawing
      JOIN drawing_part_links link ON link.drawing_number_id = drawing.formal_drawing_number_id
      JOIN part_numbers part ON part.id = link.part_number_id
      WHERE drawing.company_id = :companyId AND drawing.id IN (${drawingList.sql}) AND part.company_id = :companyId
      UNION ALL
      SELECT drawing.id AS drawing_id, draft.id, reservation.candidate_code AS part_number, 'Draft' AS record_status, 'draft' AS owner_source
      FROM drawings drawing
      JOIN numbering_draft_parts draft ON draft.workspace_id = drawing.workspace_id AND draft.company_id = drawing.company_id
      JOIN number_candidate_reservations reservation ON reservation.id = draft.candidate_reservation_id
        AND reservation.company_id = drawing.company_id AND reservation.reservation_state = 'active'
      WHERE drawing.company_id = :companyId AND drawing.id IN (${drawingList.sql})`, { companyId: input.companyId, ...drawingList.params }),
    client.query<HandoffEventRow>(`SELECT session_id, result_json FROM drawing_recognition_formalization_events WHERE company_id = :companyId AND session_id IN (${sessionList.sql})`, sessionParams)
  ]);
  const handoffBySession = new Map(handoffEvents.map((event) => [event.session_id, event]));
  const partOwnerTargetsByDrawing = new Map<string, RecognitionPartOwnerTarget[]>();
  for (const row of partOwnerTargetRows) {
    partOwnerTargetsByDrawing.set(row.drawing_id, [...(partOwnerTargetsByDrawing.get(row.drawing_id) ?? []), {
      id: row.id,
      partNumber: row.part_number,
      recordStatus: row.record_status,
      source: row.owner_source
    }]);
  }
  for (const [key, session] of selected) {
    const evidenceSessionId = session.session_purpose === "amendment"
      ? session.evidence_origin_session_id ?? session.id
      : session.id;
    const sessionCandidates = candidates.filter((candidate) => candidate.session_id === session.id);
    const candidateIds = new Set(sessionCandidates.map((candidate) => candidate.id));
    result.set(key, projectionFor(
      session,
      sources.filter((source) => source.session_id === evidenceSessionId),
      sessionCandidates,
      observations.filter((observation) => observation.session_id === evidenceSessionId && candidateIds.has(observation.candidate_id)),
      session.drawing_id ? partOwnerTargetsByDrawing.get(session.drawing_id) ?? [] : [],
      handoffBySession.get(session.id) ?? null
    ));
  }
  return result;
}
