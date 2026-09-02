import "server-only";

import crypto from "node:crypto";
import type { AsyncDatabaseClient } from "@/lib/db-async-provider";
import { getAsyncDatabaseClient } from "@/lib/db-async-provider";
import { DrawingRecognitionAsyncRepository } from "@/lib/repositories/drawing-recognition-async-repository";
import { PartChangeWorkAsyncRepository, validatePartChangePayload, type PartChangePayload, type PartWorkBatchMutation } from "@/lib/repositories/part-change-work-async-repository";
import { DrawingRecognitionPartWorkHandoffAsyncRepository, type HandoffScopePart } from "@/lib/repositories/drawing-recognition-part-work-handoff-async-repository";
import { executePdmCommandWithOutbox } from "@/lib/platform-command-service";
import { createPdmCommand, type PdmCommandMetadata } from "@/lib/platform-command";
import { CanonicalWorkbenchError } from "@/lib/pdm-canonical-workbench-contract";
import { sha256Canonical } from "@/lib/drawing-recognition-contract";
import {
  applyHandoffIntent,
  DRAWING_RECOGNITION_HANDOFF_COMMAND,
  DRAWING_RECOGNITION_HANDOFF_SCHEMA,
  handoffDraftHash,
  normalizeHandoffFieldKey,
  parseHandoffDraft,
  resolveHandoffEvidenceOwner,
  type HandoffDraft,
  type HandoffEligiblePart,
  type HandoffFieldKey,
  type HandoffIntent,
  type HandoffOverride
} from "@/lib/drawing-recognition-part-work-handoff-contract";
import { resolveDrawingRecognitionPartWorkAccess, type DrawingRecognitionPartWorkAccess } from "@/lib/drawing-recognition-part-work-access";

type HandoffInput = {
  sessionId: string;
  companyId: string;
  actorId: string;
  expectedRowVersion: number;
  expectedSourceSetFingerprint: string;
  expectedRelationScopeFingerprint: string;
  draft: unknown;
  metadata: PdmCommandMetadata;
  access?: DrawingRecognitionPartWorkAccess;
  client?: AsyncDatabaseClient;
  /** Isolated transaction-fault seam; never populated by the HTTP route. */
  faultInjector?: (point: "after_target_mutation" | "before_event" | "before_link" | "before_session", targetIndex?: number) => void | Promise<void>;
};

type PlannedField = { fieldKey: HandoffFieldKey; intent: HandoffIntent; value: string | null; sourceCandidateId?: string | null; conflictResolution?: HandoffOverride["conflictResolution"] };

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function equal(a: unknown, b: unknown) { return sha256Canonical(a) === sha256Canonical(b); }
function payloadFieldKeys(field: HandoffFieldKey): Array<keyof PartChangePayload> {
  if (field === "material") return ["materialCode", "materialLabel"];
  if (field === "color") return ["colorCode", "colorLabel"];
  if (field === "surface_finish") return ["surfaceTreatment"];
  return ["variantNote"];
}
function valueForField(payload: Record<string, unknown>, field: HandoffFieldKey) {
  if (field === "material") return payload.materialLabel ?? payload.materialCode ?? null;
  if (field === "color") return payload.colorLabel ?? payload.colorCode ?? null;
  const key = payloadFieldKeys(field).find((candidate) => payload[candidate] !== null && payload[candidate] !== undefined);
  return key ? payload[key] : null;
}

function partWorkDestination(partId: unknown, workId?: unknown) {
  if (typeof partId !== "string" || !partId.trim()) return "/numbering/drawings";
  const query = typeof workId === "string" && workId.trim()
    ? `?workId=${encodeURIComponent(workId)}&returnTo=%2Fnumbering%2Fdrawings`
    : "?returnTo=%2Fnumbering%2Fdrawings";
  return `/parts/${encodeURIComponent(partId)}/workspace${query}`;
}

function error(code: string, message: string, status = 409) {
  const allowed = new Set([
    "RECOGNITION_HANDOFF_SOURCE_CONFLICT",
    "RECOGNITION_HANDOFF_PART_INVALID",
    "RECOGNITION_SESSION_NOT_FOUND",
    "RECOGNITION_HANDOFF_SCOPE_LIMIT",
    "RECOGNITION_SESSION_STALE",
    "RECOGNITION_HANDOFF_NOT_READY",
    "RECOGNITION_SOURCE_SET_STALE",
    "RECOGNITION_RELATION_SCOPE_STALE",
    "RECOGNITION_HANDOFF_OWNER_UNRESOLVED",
    "RECOGNITION_HANDOFF_WORK_CONFLICT",
    "RECOGNITION_HANDOFF_PERMISSION_DENIED"
  ]);
  const normalized = allowed.has(code) ? code : "WORKBENCH_BAD_REQUEST";
  return new CanonicalWorkbenchError(normalized as ConstructorParameters<typeof CanonicalWorkbenchError>[0], message, status as 400 | 403 | 404 | 409 | 422 | 503);
}

function ensureFieldPlan(map: Map<string, PlannedField>, entry: PlannedField) {
  const existing = map.get(entry.fieldKey);
  if (existing && !equal(existing.value, entry.value)) throw error("RECOGNITION_HANDOFF_SOURCE_CONFLICT", `辨識欄位「${entry.fieldKey}」有互相衝突的來源，請先處理。`, 422);
  if (!existing) map.set(entry.fieldKey, entry);
}

function draftEntries(draft: HandoffDraft, eligible: Map<string, HandoffScopePart>) {
  const common = new Map<string, PlannedField>();
  for (const entry of draft.commonValues) ensureFieldPlan(common, { fieldKey: entry.fieldKey, intent: entry.intent, value: entry.value ?? null });
  const overrides = new Map<string, PlannedField>();
  for (const entry of draft.overrides) {
    if (!eligible.has(entry.partId)) throw error("RECOGNITION_HANDOFF_PART_INVALID", "個別設定的料號不在目前圖面關聯範圍。", 422);
    const key = `${entry.partId}:${entry.fieldKey}`;
    overrides.set(key, { fieldKey: entry.fieldKey, intent: entry.intent, value: entry.value ?? null, conflictResolution: entry.conflictResolution });
  }
  return { common, overrides };
}

async function deriveRecognitionPlan(input: {
  client: AsyncDatabaseClient;
  sessionId: string;
  companyId: string;
  eligibleParts: HandoffScopePart[];
  draft: HandoffDraft;
}) {
  const projection = await new DrawingRecognitionAsyncRepository(input.client).getProjection(input.sessionId, input.companyId);
  const eligible = input.eligibleParts.map((part): HandoffEligiblePart => ({ id: part.id, partNumber: part.partNumber, partName: part.partName, partRootId: part.partRootId }));
  const partMap = new Map(input.eligibleParts.map((part) => [part.id, part]));
  const common = new Map<string, PlannedField>();
  const overrides = new Map<string, PlannedField>();
  const candidateLink = new Map<string, string>();
  const blockers: string[] = [];
  for (const candidate of projection.candidates) {
    if (candidate.category !== "part_attribute") continue;
    const fieldKey = normalizeHandoffFieldKey(candidate.fieldKey);
    if (!fieldKey || !text(candidate.proposedValue ?? candidate.normalizedValue)) continue;
    const value = text(candidate.proposedValue ?? candidate.normalizedValue);
    const candidateEntry = { fieldKey, intent: value === "無" ? "not_applicable" as const : "value" as const, value };
    const observations = candidate.observations ?? [];
    const resolutions = observations.length
      ? observations.map((observation) => resolveHandoffEvidenceOwner({
          rawText: observation.rawText,
          configurationName: observation.configurationName,
          applicabilityScope: candidate.applicabilityScope,
          candidateOwnerId: candidate.proposedOwnerId,
          eligibleParts: eligible
        }))
      : [];
    const resolved = [...new Set(resolutions.filter((resolution): resolution is Extract<typeof resolution, { kind: "resolved" }> => resolution.kind === "resolved").map((resolution) => resolution.partId))];
    const unresolved = resolutions.some((resolution) => resolution.kind === "unresolved");
    if (unresolved && resolved.length === 0 && candidate.applicabilityScope !== "overall") {
      blockers.push(`欄位「${fieldKey}」缺少可驗證的料號歸屬`);
      continue;
    }
    if (resolved.length > 1) {
      blockers.push(`欄位「${fieldKey}」有多個可能的料號歸屬`);
      continue;
    }
    if (resolved.length === 1) {
      const key = `${resolved[0]}:${fieldKey}`;
      overrides.set(key, { ...candidateEntry, sourceCandidateId: candidate.id });
      candidateLink.set(key, candidate.id);
    } else if (!unresolved && (candidate.applicabilityScope === "overall" || resolutions.some((resolution) => resolution.kind === "overall") || observations.length === 0)) {
      ensureFieldPlan(common, { ...candidateEntry, sourceCandidateId: candidate.id });
      candidateLink.set(`common:${fieldKey}`, candidate.id);
    }
  }
  const explicit = draftEntries(input.draft, partMap);
  for (const [key, entry] of explicit.common) common.set(key, entry);
  for (const [key, entry] of explicit.overrides) overrides.set(key, entry);
  return { common, overrides, candidateLink, blockers };
}

function plannedFor(partId: string, common: Map<string, PlannedField>, overrides: Map<string, PlannedField>) {
  const result = new Map(common);
  for (const [key, entry] of overrides) if (key.startsWith(`${partId}:`)) result.set(entry.fieldKey, entry);
  return result;
}

export async function handoffDrawingRecognitionToPartWorks(input: HandoffInput) {
  const client = input.client ?? getAsyncDatabaseClient();
  const draft = parseHandoffDraft(input.draft);
  const draftHash = handoffDraftHash(draft);
  const access = input.access ?? { canCreate: true, canUpdate: true, canEditNonOwned: true };
  if (!access.canCreate || !access.canUpdate) throw error("RECOGNITION_HANDOFF_PERMISSION_DENIED", "目前帳號沒有建立或修改料號工作資料的權限。", 403);
  const command = createPdmCommand({
    commandName: DRAWING_RECOGNITION_HANDOFF_COMMAND,
    schemaVersion: 2,
    idempotencyKey: input.metadata.idempotencyKey,
    actor: input.metadata.actor,
    payload: { sessionId: input.sessionId, expectedRowVersion: input.expectedRowVersion, expectedSourceSetFingerprint: input.expectedSourceSetFingerprint, expectedRelationScopeFingerprint: input.expectedRelationScopeFingerprint, draftHash }
  });
  const execution = await executePdmCommandWithOutbox({
    client,
    command,
    serializable: true,
    idempotencyPayload: command.payload,
    execute: async (tx) => {
      const scopeRepo = new DrawingRecognitionPartWorkHandoffAsyncRepository(tx);
      const scope = await scopeRepo.readScope({ companyId: input.companyId, sessionId: input.sessionId, lock: true });
      if (!scope.session) throw error("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
      if (!scope.parts) throw error("RECOGNITION_HANDOFF_SCOPE_LIMIT", "關聯料號超過一次移交上限，請拆分圖面工作。", 422);
      if (Number(scope.session.row_version) !== input.expectedRowVersion) throw error("RECOGNITION_SESSION_STALE", "辨識內容已更新，請重新載入後再試。", 409);
      if (!["review_ready", "extraction_partial", "ready_to_formalize", "formalized"].includes(scope.session.status)) throw error("RECOGNITION_HANDOFF_NOT_READY", "辨識工作尚未準備好移交。", 409);
      const sourceBasis = await new DrawingRecognitionAsyncRepository(tx).readCurrentSourceBasis({ companyId: input.companyId, sourceContextType: scope.session.source_context_type, sourceContextId: scope.session.source_context_id });
      if (sourceBasis.sourceSetFingerprint !== input.expectedSourceSetFingerprint || sourceBasis.sourceSetFingerprint !== scope.session.source_set_fingerprint) throw error("RECOGNITION_SOURCE_SET_STALE", "辨識來源檔案已變更，請重新辨識後再試。", 409);
      if (scope.relationScopeFingerprint !== input.expectedRelationScopeFingerprint) throw error("RECOGNITION_RELATION_SCOPE_STALE", "圖面關聯料號已變更，請重新載入後再試。", 409);
      const plan = await deriveRecognitionPlan({ client: tx, sessionId: input.sessionId, companyId: input.companyId, eligibleParts: scope.parts, draft });
      if (plan.blockers.length) throw error("RECOGNITION_HANDOFF_OWNER_UNRESOLVED", `${plan.blockers.slice(0, 3).join("；")}。`, 422);
      const partRepo = new PartChangeWorkAsyncRepository(tx);
      await partRepo.lockBatch(tx, {
        companyId: input.companyId,
        partIds: scope.parts.map((part) => part.id),
        workIds: scope.parts.map((part) => part.workId).filter((workId): workId is string => Boolean(workId))
      });
      const targets: Array<Record<string, unknown>> = [];
      const appliedChanges: Array<Record<string, unknown>> = [];
      const links: Array<{ candidateId: string; targetId: string; fieldKey: string; beforeValue: string | null; afterValue: string | null; changeKind: string }> = [];
      const mutations: PartWorkBatchMutation[] = [];
      for (const part of [...scope.parts].sort((a, b) => a.id.localeCompare(b.id))) {
        const fields = plannedFor(part.id, plan.common, plan.overrides);
        let plannedPayload = validatePartChangePayload(part.workPayload ?? part.formalPayload);
        const basePayload = validatePartChangePayload(part.formalPayload);
        const currentWorkPayload = part.workPayload ? validatePartChangePayload(part.workPayload) : null;
        const explicitlyApplied = new Set<string>();
        for (const entry of fields.values()) {
          const beforeFormal = valueForField(basePayload as unknown as Record<string, unknown>, entry.fieldKey);
          const beforeWork = valueForField((currentWorkPayload ?? basePayload) as unknown as Record<string, unknown>, entry.fieldKey);
          if (currentWorkPayload && !equal(beforeWork, beforeFormal) && !equal(beforeWork, entry.value)) {
            if (entry.conflictResolution === "keep_work") continue;
            if (entry.conflictResolution !== "use_recognition") throw error("RECOGNITION_HANDOFF_WORK_CONFLICT", `料號 ${part.partNumber} 的「${entry.fieldKey}」已有不同工作值，請先選擇保留或套用辨識值。`, 409);
          }
          plannedPayload = applyHandoffIntent(plannedPayload, entry.fieldKey, entry.intent, entry.value);
          explicitlyApplied.add(entry.fieldKey);
          const after = valueForField(plannedPayload as unknown as Record<string, unknown>, entry.fieldKey);
          if (!equal(beforeWork, after)) {
            const candidateId = entry.sourceCandidateId ?? plan.candidateLink.get(`${part.id}:${entry.fieldKey}`) ?? plan.candidateLink.get(`common:${entry.fieldKey}`) ?? null;
            appliedChanges.push({ partId: part.id, partNumber: part.partNumber, fieldKey: entry.fieldKey, intent: entry.intent, value: entry.value, origin: entry.sourceCandidateId ? "recognition" : "manual", candidateId });
            if (candidateId) links.push({ candidateId, targetId: part.id, fieldKey: entry.fieldKey, beforeValue: beforeWork === null ? null : String(beforeWork), afterValue: after === null ? null : String(after), changeKind: entry.intent === "not_applicable" ? "not_applicable" : equal(beforeWork, beforeFormal) ? (beforeFormal === null ? "create" : "update") : "update" });
          }
        }
        const formalEqual = equal(plannedPayload, basePayload);
        const workEqual = currentWorkPayload ? equal(plannedPayload, currentWorkPayload) : false;
        if (formalEqual) {
          targets.push({ partId: part.id, partNumber: part.partNumber, result: currentWorkPayload ? "already_in_work" : "already_current", workId: part.workId, rowVersion: part.workRowVersion });
          continue;
        }
        if (currentWorkPayload && workEqual) {
          targets.push({ partId: part.id, partNumber: part.partNumber, result: "already_in_work", workId: part.workId, rowVersion: part.workRowVersion });
          continue;
        }
        if (currentWorkPayload && part.workId) {
          if (part.workOwnerId !== input.actorId && !access.canEditNonOwned) throw error("RECOGNITION_HANDOFF_PERMISSION_DENIED", `料號 ${part.partNumber} 的工作資料不是目前帳號可編輯範圍。`, 403);
          mutations.push({ kind: "update", companyId: input.companyId, workId: part.workId, expectedRowVersion: part.workRowVersion ?? 1, payload: plannedPayload });
          targets.push({ partId: part.id, partNumber: part.partNumber, result: "pending_update", workId: part.workId, rowVersion: part.workRowVersion ?? 1 });
        } else {
          mutations.push({ kind: "create", companyId: input.companyId, partId: part.id, ownerUserId: input.actorId, expectedFormalRowVersion: part.formalRowVersion, initialPayload: plannedPayload });
          targets.push({ partId: part.id, partNumber: part.partNumber, result: "pending_create", workId: null, rowVersion: null });
        }
      }
      const mutationResults = await partRepo.applyLockedBatch(tx, mutations);
      for (const [targetIndex, result] of mutationResults.entries()) {
        const target = targets.find((candidate) => candidate.partId === result.partId && (candidate.result === "pending_create" || candidate.result === "pending_update"));
        if (!target) throw error("RECOGNITION_HANDOFF_SOURCE_CONFLICT", "料號工作結果無法對應目前移交範圍。", 409);
        target.result = result.kind === "create" ? "created" : "updated";
        target.workId = result.workId;
        target.rowVersion = result.rowVersion;
        await input.faultInjector?.("after_target_mutation", targetIndex);
      }
      const eventId = `recognition-handoff-${crypto.randomUUID()}`;
      const mutationCount = targets.filter((target) => target.result === "created" || target.result === "updated").length;
      const unchangedCount = targets.length - mutationCount;
      const destinationPart = targets.find((target) => target.result === "created" || target.result === "updated") ?? targets[0] ?? null;
      const eventResult = {
        schemaVersion: 2,
        destinationKind: "part_work",
        eventId,
        sessionId: input.sessionId,
        draftHash,
        eligiblePartCount: scope.parts.length,
        workMutationCount: mutationCount,
        unchangedCount,
        targets,
        destination: { path: partWorkDestination(destinationPart?.partId, destinationPart?.workId) }
      };
      await input.faultInjector?.("before_event");
      await tx.execute(`INSERT INTO drawing_recognition_formalization_events (
        id, session_id, company_id, actor_id, idempotency_key, impact_fingerprint, target_fingerprints_json,
        applied_changes_json, exclusions_json, result_json, created_at
      ) VALUES (:id, :sessionId, :companyId, :actorId, :idempotencyKey, :impactFingerprint, :targetFingerprintsJson,
        :appliedChangesJson, :exclusionsJson, :resultJson, CURRENT_TIMESTAMP)`, {
        id: eventId, sessionId: input.sessionId, companyId: input.companyId, actorId: input.actorId,
        idempotencyKey: input.metadata.idempotencyKey, impactFingerprint: sha256Canonical({ sessionId: input.sessionId, draftHash, relation: scope.relationScopeFingerprint }),
        targetFingerprintsJson: JSON.stringify({ sourceSetFingerprint: scope.session.source_set_fingerprint, relationScopeFingerprint: scope.relationScopeFingerprint, parts: scope.parts.map((part) => ({ id: part.id, formalRowVersion: part.formalRowVersion })) }),
        appliedChangesJson: JSON.stringify(appliedChanges), exclusionsJson: JSON.stringify([]), resultJson: JSON.stringify(eventResult)
      });
      await input.faultInjector?.("before_link");
      for (const link of links) {
        await tx.execute(`INSERT INTO drawing_recognition_formalization_links
          (event_id, candidate_id, company_id, target_type, target_id, field_key, change_kind, before_value, after_value, created_at)
          VALUES (:eventId, :candidateId, :companyId, 'part_number', :targetId, :fieldKey, :changeKind, :beforeValue, :afterValue, CURRENT_TIMESTAMP)`, { eventId, companyId: input.companyId, ...link });
      }
      await input.faultInjector?.("before_session");
      await tx.execute(`UPDATE drawing_recognition_sessions SET status = 'formalized', formalized_by = :actorId, formalized_at = CURRENT_TIMESTAMP, row_version = row_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = :sessionId AND company_id = :companyId`, { actorId: input.actorId, sessionId: input.sessionId, companyId: input.companyId });
      return { sessionId: input.sessionId, eventId, schemaVersion: DRAWING_RECOGNITION_HANDOFF_SCHEMA, eligiblePartCount: scope.parts.length, workMutationCount: mutationCount, unchangedCount, targets, destination: eventResult.destination };
    },
    event: (result) => ({ aggregateType: "drawing_recognition_session", aggregateId: input.sessionId, eventType: "part_work_handoff_completed", payload: result })
  });
  return { ...execution.result, reusedFromCommandReceipt: execution.reusedFromCommandReceipt };
}

export async function resolveHandoffAccessForUser(user: Parameters<typeof resolveDrawingRecognitionPartWorkAccess>[0]) {
  return resolveDrawingRecognitionPartWorkAccess(user);
}

export async function getDrawingRecognitionPartWorkHandoffProjection(input: { sessionId: string; companyId: string; client?: AsyncDatabaseClient }) {
  const client = input.client ?? getAsyncDatabaseClient();
  const scope = await new DrawingRecognitionPartWorkHandoffAsyncRepository(client).readScope({ companyId: input.companyId, sessionId: input.sessionId });
  if (!scope.session) throw error("RECOGNITION_SESSION_NOT_FOUND", "找不到辨識工作。", 404);
  if (!scope.parts) throw error("RECOGNITION_HANDOFF_SCOPE_LIMIT", "關聯料號超過一次移交上限。", 422);
  const plan = await deriveRecognitionPlan({ client, sessionId: input.sessionId, companyId: input.companyId, eligibleParts: scope.parts, draft: { commonValues: [], overrides: [] } });
  const labels: Record<string, string> = { material: "材質", color: "顏色", surface_finish: "表面處理", variant_note: "版本備註" };
  const commonFields = [...plan.common.entries()].map(([fieldKey, entry]) => ({ fieldKey, label: labels[fieldKey] ?? fieldKey, intent: entry.intent, value: entry.value, origin: entry.sourceCandidateId ? "recognition_overall" : "unset", exceptionCount: [...plan.overrides.keys()].filter((key) => key.endsWith(`:${fieldKey}`)).length }));
  const exceptions = [...plan.overrides.entries()].map(([key, entry]) => {
    const [partId] = key.split(":");
    const part = scope.parts!.find((candidate) => candidate.id === partId)!;
    return { partId, partNumber: part.partNumber, fieldKey: entry.fieldKey, label: labels[entry.fieldKey] ?? entry.fieldKey, intent: entry.intent, value: entry.value, origin: entry.sourceCandidateId ? "recognition_per_part" : "manual" };
  });
  const workMutationCount = scope.parts.filter((part) => {
    const fields = plannedFor(part.id, plan.common, plan.overrides);
    return [...fields.values()].some((entry) => !equal(valueForField((part.workPayload ?? part.formalPayload) as Record<string, unknown>, entry.fieldKey), entry.value));
  }).length;
  return {
    applicationScope: { drawingId: scope.session.drawing_id, eligibleParts: scope.parts.map(({ id, partNumber, partName, partRootId }) => ({ id, partNumber, partName, partRootId })), eligiblePartCount: scope.parts.length, relationScopeFingerprint: scope.relationScopeFingerprint },
    commonFields,
    exceptions,
    handoffControl: { state: plan.blockers.length ? "blocked" : workMutationCount ? "ready" : "synchronized", workMutationCount, unchangedCount: scope.parts.length - workMutationCount, blockers: plan.blockers.slice(0, 3) },
    destination: scope.parts[0] ? { partId: scope.parts[0].id, path: partWorkDestination(scope.parts[0].id, scope.parts[0].workId) } : { partId: null, path: "/numbering/drawings" }
  };
}
