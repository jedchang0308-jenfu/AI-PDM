"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, LoaderCircle, RefreshCcw, ScanSearch } from "lucide-react";
import {
  useDrawingRecognitionBrowserOcr,
  type DrawingRecognitionBrowserOcrSession
} from "@/components/drawing-recognition-pdf-ocr";
import { TextHint } from "@/components/compact-hints";
import { getStatusDisplay } from "@/lib/status-display";
import type { DrawingRecognitionReviewProjection, RecognitionReviewField } from "@/lib/drawing-recognition-review-projection";
import styles from "./drawing-recognition-workspace-panel.module.css";

export type DrawingRecognitionEvidence = {
  sessionId: string | null;
  sourceId: string | null;
  sourceRole: string | null;
  rawText: string;
  fileName: string | null;
  pageNumber: number | null;
  sheetName: string | null;
  configurationName: string | null;
  geometry: Record<string, unknown> | null;
  locatable: boolean;
};

type Observation = DrawingRecognitionEvidence & {
  id: string;
  sourceId: string;
  confidenceBand: string;
  sourceFileName?: string | null;
  sourceRole?: string | null;
};

type ReviewGroup = {
  id: string;
  category: string;
  fieldKey: string | null;
  fieldLabel: string;
  ownerType?: string | null;
  ownerId?: string | null;
  primaryCandidateId: string;
  memberCandidateIds: string[];
  distinctValues: string[];
  conflictState: "none" | "conflict";
  reviewState: string;
  proposedValue: string | null;
  currentFormalValue: string | null;
  observations: Array<Observation & { candidateId?: string; sourceFileName?: string | null; sourceRole?: string | null }>;
};

type Candidate = {
  id: string;
  category: string;
  fieldKey: string | null;
  fieldLabel: string;
  proposedValue: string | null;
  proposedOwnerType: string | null;
  proposedOwnerId: string | null;
  applicabilityScope?: string | null;
  confidenceBand: string;
  reviewState: string;
  currentFormalValue: string | null;
  observations: Observation[];
};

type DisplayReviewGroup = Omit<ReviewGroup, "ownerId" | "primaryCandidateId" | "memberCandidateIds" | "observations"> & {
  reviewGroups: ReviewGroup[];
  primaryCandidateId: string;
  memberCandidateIds: string[];
  observations: ReviewGroup["observations"];
  ownerResolution?: "not_required" | "resolved" | "unresolved" | "ambiguous" | "invalid";
  effectiveOwnerId?: string | null;
  blockingReason?: "part_owner_required" | "part_owner_ambiguous" | "part_owner_invalid" | null;
};

type BatchDecision = {
  candidateId: string;
  action: "accept" | "correct" | "ignore";
  value?: string;
  fieldKey?: string | null;
  fieldLabel?: string;
  category?: string;
  ownerType?: string | null;
  ownerId?: string | null;
  reason?: string;
};

type Session = DrawingRecognitionBrowserOcrSession & {
  id: string;
  status: string;
  sourceContextType?: string;
  sourceContextId?: string;
  rowVersion: number;
  warningCount: number;
  conflictCount: number;
  errorSummary: string | null;
  adapterHealth?: { nativeMetadata: NativeMetadataHealth | null };
  sources: Array<{ id: string; fileName: string; sourceRole: string }>;
  candidates: Candidate[];
  reviewGroups?: ReviewGroup[];
  reviewFields?: RecognitionReviewField[];
  sessionPurpose?: "recognition" | "rerun" | "amendment";
  evidenceOriginSessionId?: string | null;
  applicationScope?: { eligibleParts: Array<{ id: string; partNumber: string; partName: string; partRootId: string }>; eligiblePartCount: number; relationScopeFingerprint: string };
  contractToken?: string | null;
  commonFields?: Array<{ fieldKey: string; label: string; intent: "value" | "clear" | "not_applicable"; value: string | null; origin: string; exceptionCount: number }>;
  exceptions?: Array<{ partId: string; partNumber: string; fieldKey: string; label: string; intent: "value" | "clear" | "not_applicable"; value: string | null; origin: string }>;
  handoffControl?: { state: string; workMutationCount: number; unchangedCount: number; blockers: string[] };
};

type NativeMetadataHealth = {
  state: "ready" | "empty" | "partial" | "unavailable" | "failed";
  issueCode: string | null;
  message: string | null;
  retryable: boolean;
  affectedSources: Array<{ sourceId: string; fileName: string; status: string }>;
};

const HANDOFF_FIELD_OPTIONS = [
  { fieldKey: "material", label: "材質" },
  { fieldKey: "color", label: "顏色" },
  { fieldKey: "surface_finish", label: "表面處理" },
  { fieldKey: "variant_note", label: "版本備註" }
] as const;

function NativeMetadataHealthBanner({
  health,
  onRetry,
  retryDisabled = false
}: {
  health: NativeMetadataHealth | null | undefined;
  onRetry?: () => void;
  retryDisabled?: boolean;
}) {
  if (!health || health.state === "ready") return null;
  const isError = health.state === "failed";
  const affected = health.affectedSources.map((source) => source.fileName).filter(Boolean);
  const showRetry = Boolean(onRetry && ["partial", "unavailable", "failed"].includes(health.state));
  return (
    <div className={`dev079-recognition-adapter-health is-${health.state}`} role={isError ? "alert" : "status"}>
      {isError ? <AlertTriangle size={15} aria-hidden="true" /> : <ScanSearch size={15} aria-hidden="true" />}
      <div>
        <strong>{health.state === "empty" ? "SolidWorks 屬性讀取已完成" : health.state === "partial" ? "SolidWorks 屬性讀取部分完成" : health.state === "unavailable" ? "此批未使用 SolidWorks 屬性讀取器" : "SolidWorks 屬性讀取失敗"}</strong>
        <span>{health.message}</span>
        {affected.length > 0 ? <small>受影響來源：{affected.join("、")}</small> : null}
        {showRetry ? <button type="button" className="link-button" disabled={retryDisabled} title={retryDisabled ? "請先儲存或還原目前修改" : undefined} onClick={onRetry}><RefreshCcw size={14} />重新辨識</button> : null}
      </div>
    </div>
  );
}

const sections = [
  { key: "identity_relation", title: "識別與關聯" },
  { key: "part_attribute", title: "料號與屬性" },
  { key: "drawing_revision", title: "圖面與版次" },
  { key: "controlled_note", title: "特殊要求與註記" },
  { key: "engineering_evidence", title: "工程辨識證據" },
  { key: "unclassified", title: "未歸類 OCR" }
] as const;

function messageFrom(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { message?: string; error?: string | { message?: string } };
  return record.message || (typeof record.error === "object" ? record.error.message : record.error) || fallback;
}

function sameSourceSet(expected: string[], actual: string[]) {
  const left = [...expected].filter(Boolean).sort();
  const right = [...actual].filter(Boolean).sort();
  return left.length > 0 && left.length === right.length && left.every((id, index) => id === right[index]);
}

function isHiddenCandidate(candidate: Candidate) {
  return ["source_file_stem", "source_file_role"].includes(candidate.fieldKey ?? "");
}

function isPendingReview(candidate: Candidate) {
  return ["proposed", "conflict", "blocked"].includes(candidate.reviewState);
}

function requiresPartOwner(candidate: Candidate) {
  return candidate.proposedOwnerType === "part_number"
    && !candidate.proposedOwnerId
    && Boolean(candidate.proposedValue?.trim());
}

function isNormalizedPageGeometry(value: Record<string, unknown> | null) {
  if (!value || value.coordinateSpace !== "normalized_page" || value.origin !== "top_left") return false;
  const values = [value.x, value.y, value.width, value.height].map(Number);
  return values.every(Number.isFinite) && values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0
    && values[0] + values[2] <= 1.000001 && values[1] + values[3] <= 1.000001;
}

function evidenceSourceLabel(observation: ReviewGroup["observations"][number]) {
  return observation.sourceRole === "pdf"
    ? "PDF圖面"
    : observation.sourceRole === "cad_3d" || observation.sourceRole === "drawing_2d"
      ? "檔案屬性"
      : observation.sourceRole ?? "來源證據";
}

function canonicalDisplayFieldKey(fieldKey: string | null) {
  if (fieldKey === "surface_treatment") return "surface_finish";
  if (fieldKey === "drawn_by") return "drawn_by_name";
  if (fieldKey && /^sw_custom_(?:2d圖號_用途|圖號)_[\p{L}\p{N}]+$/u.test(fieldKey)) return "drawing_number";
  if (fieldKey && /^sw_custom_swformatsize_[\p{L}\p{N}]+$/u.test(fieldKey)) return "paper_size";
  return fieldKey;
}

function displayGroupKey(group: ReviewGroup) {
  const fieldKey = canonicalDisplayFieldKey(group.fieldKey);
  if (fieldKey) return `field:${fieldKey}`;
  return [group.category, `label:${group.fieldLabel}`, group.ownerType ?? "unassigned"].join(":");
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function coalesceReviewGroupsForDisplay(groups: ReviewGroup[], candidates: Candidate[]): DisplayReviewGroup[] {
  const displayGroups: DisplayReviewGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const group of groups) {
    const key = displayGroupKey(group);
    const existingIndex = indexByKey.get(key);
    if (existingIndex === undefined) {
      indexByKey.set(key, displayGroups.length);
      displayGroups.push({ ...group, fieldKey: canonicalDisplayFieldKey(group.fieldKey), reviewGroups: [group] });
      continue;
    }

    const existing = displayGroups[existingIndex];
    const reviewGroups = [...existing.reviewGroups, group];
    const distinctValues = uniqueValues(reviewGroups.flatMap((item) => item.distinctValues.length > 0 ? item.distinctValues : [item.proposedValue]));
    const observations = [...new Map(reviewGroups.flatMap((item) => item.observations).map((observation) => [observation.id, observation])).values()];
    const memberCandidateIds = [...new Set(reviewGroups.flatMap((item) => item.memberCandidateIds))];
    const preferredValue = distinctValues.length === 1 ? distinctValues[0] : null;
    const primaryGroup = preferredValue
      ? reviewGroups.find((item) => uniqueValues([...item.distinctValues, item.proposedValue]).includes(preferredValue)) ?? reviewGroups[0]
      : reviewGroups[0];
    const hasConflictGroup = reviewGroups.some((item) => item.reviewState === "conflict");
    const hasBlockedGroup = reviewGroups.some((item) => item.reviewState === "blocked");
    displayGroups[existingIndex] = {
      ...existing,
      reviewGroups,
      primaryCandidateId: primaryGroup.primaryCandidateId,
      memberCandidateIds,
      distinctValues,
      conflictState: distinctValues.length > 1 ? "conflict" : reviewGroups.some((item) => item.conflictState === "conflict") ? "conflict" : "none",
      reviewState: distinctValues.length > 1 || hasConflictGroup
        ? "conflict"
        : preferredValue !== null
          ? primaryGroup.reviewState
          : hasBlockedGroup ? "blocked" : existing.reviewState,
      proposedValue: distinctValues.length === 1 ? distinctValues[0] : existing.proposedValue,
      currentFormalValue: uniqueValues(reviewGroups.map((item) => item.currentFormalValue)).join(" ／ ") || null,
      observations
    };
  }

  return displayGroups.map((group) => {
    const preferredValue = group.distinctValues.length === 1 ? group.distinctValues[0] : null;
    if (!preferredValue) return group;
    const preferredCandidate = candidates.find((candidate) => group.memberCandidateIds.includes(candidate.id) && candidate.proposedValue?.trim() === preferredValue);
    return preferredCandidate ? { ...group, primaryCandidateId: preferredCandidate.id, proposedValue: preferredValue } : group;
  });
}

function scopeLabelsForGroup(group: ReviewGroup, candidates: Candidate[]) {
  const configurations = uniqueValues(group.observations.map((observation) => observation.configurationName));
  if (configurations.length > 0) return configurations;
  const scopes = uniqueValues(group.memberCandidateIds.map((id) => candidates.find((candidate) => candidate.id === id)?.applicabilityScope));
  return scopes.map((scope) => {
    if (scope === "overall") return "整體";
    if (scope === "document") return "文件";
    if (scope.startsWith("configuration:")) return scope.slice("configuration:".length);
    if (scope.startsWith("sheet:")) return scope.slice("sheet:".length);
    return scope;
  });
}

function recognitionExceptionHelp(group: Pick<DisplayReviewGroup, "fieldKey" | "reviewState" | "currentFormalValue">) {
  if (group.reviewState === "conflict") {
    return `辨識值與目前系統正式值不同。系統正式值：${group.currentFormalValue ?? "尚無"}。請人工確認後再儲存。`;
  }
  if (group.fieldKey === "part_number") {
    return "已辨識到料號文字，但尚未連結正式料號主檔；「需處理」表示料號關係尚未建立，不代表 OCR 辨識錯誤。";
  }
  return "已辨識到候選值，但尚缺必要核對或歸屬；「需處理」不代表 OCR 辨識錯誤。";
}

function immutableSessionFromProjection(projection: DrawingRecognitionReviewProjection): Session {
  const mapObservation = (observation: DrawingRecognitionReviewProjection["candidateDecisions"][number]["observations"][number]): Observation => ({
    ...observation,
    sessionId: projection.session.id,
    fileName: observation.sourceFileName,
    locatable: isNormalizedPageGeometry(observation.geometry)
  });
  return {
    ...projection.session,
    sources: projection.sources.map((source) => ({ ...source })),
    candidates: projection.candidateDecisions.map((candidate) => ({ ...candidate, observations: candidate.observations.map(mapObservation) })),
    reviewGroups: projection.fields.flatMap((field) => field.scopes.map((scope) => ({ ...scope, observations: scope.observations.map(mapObservation) }))),
    reviewFields: projection.fields.map((field) => ({
      ...field,
      observations: field.observations.map(mapObservation),
      scopes: field.scopes.map((scope) => ({ ...scope, observations: scope.observations.map(mapObservation) }))
    })),
    baseline: [],
    pendingClientAdapters: [],
    pdfOcrSources: []
  } as unknown as Session;
}

export function DrawingRecognitionWorkspacePanel({
  drawingNumber,
  sourceContextType,
  sourceContextId,
  sourceAssetIds,
  snapshotProjection,
  disabled = false,
  onEvidenceSelect,
  onDirtyChange
}: {
  drawingNumber: string;
  sourceContextType: "candidate_revision" | "drawing_revision" | "drawing_number";
  sourceContextId: string;
  sourceAssetIds: string[];
  snapshotProjection?: DrawingRecognitionReviewProjection | null;
  disabled?: boolean;
  onEvidenceSelect?: (evidence: DrawingRecognitionEvidence) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const snapshotMode = snapshotProjection !== undefined;
  const immutableSession = useMemo(() => snapshotProjection ? immutableSessionFromProjection(snapshotProjection) : null, [snapshotProjection]);
  const [session, setSession] = useState<Session | null>(() => immutableSession);
  const [loading, setLoading] = useState(!snapshotMode);
  const [busy, setBusy] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries((immutableSession?.candidates ?? []).map((candidate) => [candidate.id, candidate.proposedValue ?? ""])));
  const [handoffCommonDraft, setHandoffCommonDraft] = useState<Record<string, string>>({});
  const [handoffOverrideDraft, setHandoffOverrideDraft] = useState<Record<string, string>>({});
  const [overridePartId, setOverridePartId] = useState("");
  const [overrideFieldKey, setOverrideFieldKey] = useState("material");
  const [overrideValue, setOverrideValue] = useState("");
  const loadedSourceContextRef = useRef<string | null>(null);
  const latestLoadAbortRef = useRef<AbortController | null>(null);
  const commitIdempotencyKeyRef = useRef<string | null>(null);
  const amendmentIdempotencyKeyRef = useRef<string | null>(null);
  const cancelAmendmentIdempotencyKeyRef = useRef<string | null>(null);
  const handoffIdempotencyKeyRef = useRef<string | null>(null);
  const sourceKey = useMemo(() => [...sourceAssetIds].filter(Boolean).sort().join("|"), [sourceAssetIds]);
  const stableSourceAssetIds = useMemo(() => sourceKey ? sourceKey.split("|") : [], [sourceKey]);
  const visibleCandidates = useMemo(() => session?.candidates.filter((candidate) => !isHiddenCandidate(candidate)) ?? [], [session]);
  const visibleReviewGroups = useMemo(() => {
    if (!session) return [];
    const groups = session.reviewGroups?.filter((group) => group.category !== "part_attribute" && !isHiddenCandidate({ fieldKey: group.fieldKey } as Candidate));
    return groups && groups.length > 0 ? groups : visibleCandidates.map((candidate) => ({
      id: candidate.id,
      category: candidate.category,
      fieldKey: candidate.fieldKey,
      fieldLabel: candidate.fieldLabel,
      primaryCandidateId: candidate.id,
      memberCandidateIds: [candidate.id],
      distinctValues: candidate.proposedValue ? [candidate.proposedValue] : [],
      conflictState: "none" as const,
      reviewState: candidate.reviewState,
      proposedValue: candidate.proposedValue,
      currentFormalValue: candidate.currentFormalValue,
      observations: candidate.observations
    }));
  }, [session, visibleCandidates]);
  const displayReviewGroups = useMemo(() => session?.reviewFields?.length
    ? session.reviewFields.filter((field) => !isHiddenCandidate({ fieldKey: field.fieldKey } as Candidate)).map((field) => ({ ...field, reviewGroups: field.scopes as unknown as ReviewGroup[] })) as unknown as DisplayReviewGroup[]
    : coalesceReviewGroupsForDisplay(visibleReviewGroups, visibleCandidates), [session, visibleCandidates, visibleReviewGroups]);
  const hasDraftChanges = useMemo(() => visibleCandidates.some((candidate) => (drafts[candidate.id] ?? "") !== (candidate.proposedValue ?? "")), [drafts, visibleCandidates]);
  const handoffCommonFields = useMemo(() => session?.commonFields ?? [], [session?.commonFields]);
  const handoffFieldRows = useMemo(() => HANDOFF_FIELD_OPTIONS.map((option) => session?.commonFields?.find((field) => field.fieldKey === option.fieldKey) ?? ({ ...option, intent: "value" as const, value: null, origin: "unset", exceptionCount: 0 })), [session?.commonFields]);
  const handoffExceptions = useMemo(() => session?.exceptions ?? [], [session?.exceptions]);
  const hasHandoffDraftChanges = useMemo(() => {
    const commonChanged = handoffCommonFields.some((field) => (handoffCommonDraft[field.fieldKey] ?? field.value ?? "") !== (field.value ?? ""));
    const overrideChanged = handoffExceptions.some((field) => (handoffOverrideDraft[`${field.partId}:${field.fieldKey}`] ?? field.value ?? "") !== (field.value ?? ""));
    return commonChanged || overrideChanged || Boolean(Object.keys(handoffOverrideDraft).some((key) => !handoffExceptions.some((field) => `${field.partId}:${field.fieldKey}` === key)));
  }, [handoffCommonDraft, handoffExceptions, handoffOverrideDraft, handoffCommonFields]);
  const hasUnresolvedPartOwner = useMemo(() => displayReviewGroups.some((group) => Boolean(group.blockingReason)) || visibleCandidates.some(requiresPartOwner), [displayReviewGroups, visibleCandidates]);
  const hasDecisionsToSave = visibleReviewGroups.some((group) => {
    const modified = group.memberCandidateIds.some((id) => {
      const candidate = visibleCandidates.find((item) => item.id === id);
      return candidate && !requiresPartOwner(candidate) && (drafts[id] ?? candidate.proposedValue ?? "") !== (candidate.proposedValue ?? "");
    });
    return modified || (group.conflictState === "none" && group.memberCandidateIds.some((id) => {
      const candidate = visibleCandidates.find((item) => item.id === id);
      return candidate ? !requiresPartOwner(candidate) && isPendingReview(candidate) : false;
    }));
  });

  const handoffFields = useMemo(() => {
    const fields = new Map<string, { fieldKey: string; intent: "value" | "clear" | "not_applicable"; value: string | null }>();
    for (const field of handoffFieldRows) {
      const value = handoffCommonDraft[field.fieldKey] ?? field.value;
      if (value !== null || field.value !== null) fields.set(field.fieldKey, { fieldKey: field.fieldKey, intent: field.intent, value });
    }
    return [...fields.values()];
  }, [handoffCommonDraft, handoffFieldRows]);
  const handoffOverrides = useMemo(() => {
    const values = new Map<string, { partId: string; fieldKey: string; intent: "value" | "clear" | "not_applicable"; value: string | null }>();
    for (const field of handoffExceptions) {
      const key = `${field.partId}:${field.fieldKey}`;
      values.set(key, { partId: field.partId, fieldKey: field.fieldKey, intent: field.intent, value: handoffOverrideDraft[key] ?? field.value });
    }
    for (const [key, value] of Object.entries(handoffOverrideDraft)) {
      if (values.has(key)) continue;
      const [partId, fieldKey] = key.split(":");
      if (partId && fieldKey) values.set(key, { partId, fieldKey, intent: "value", value });
    }
    return [...values.values()];
  }, [handoffExceptions, handoffOverrideDraft]);

  const setProjection = useCallback((next: Session) => {
    setSession(next);
    setDrafts(Object.fromEntries(next.candidates.map((candidate) => [candidate.id, candidate.proposedValue ?? ""])));
    setHandoffCommonDraft(Object.fromEntries((next.commonFields ?? []).map((field) => [field.fieldKey, field.value ?? ""])));
    setHandoffOverrideDraft(Object.fromEntries((next.exceptions ?? []).map((field) => [`${field.partId}:${field.fieldKey}`, field.value ?? ""])));
  }, []);

  const mergeProjection = useCallback((next: Session) => {
    setSession(next);
    setDrafts((current) => Object.fromEntries(next.candidates.map((candidate) => [candidate.id, current[candidate.id] ?? candidate.proposedValue ?? ""])));
    setHandoffCommonDraft((current) => Object.fromEntries((next.commonFields ?? []).map((field) => [field.fieldKey, current[field.fieldKey] ?? field.value ?? ""])));
    setHandoffOverrideDraft((current) => Object.fromEntries((next.exceptions ?? []).map((field) => [`${field.partId}:${field.fieldKey}`, current[`${field.partId}:${field.fieldKey}`] ?? field.value ?? ""])));
  }, []);

  useEffect(() => {
    if (!snapshotMode) return;
    setSession(immutableSession);
    setDrafts(Object.fromEntries((immutableSession?.candidates ?? []).map((candidate) => [candidate.id, candidate.proposedValue ?? ""])));
    setHandoffCommonDraft(Object.fromEntries((immutableSession?.commonFields ?? []).map((field) => [field.fieldKey, field.value ?? ""])));
    setHandoffOverrideDraft(Object.fromEntries((immutableSession?.exceptions ?? []).map((field) => [`${field.partId}:${field.fieldKey}`, field.value ?? ""])));
    setLoading(false);
    setError("");
  }, [immutableSession, snapshotMode]);

  useDrawingRecognitionBrowserOcr({
    session: snapshotMode ? null : session,
    onProjection: mergeProjection,
    onError: setError,
    onNotice: setNotice
  });

  const loadSession = useCallback(async (sessionId: string, quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      let currentSessionId = sessionId;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(currentSessionId)}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (response.status === 403) {
          setRestricted(true);
          setSession(null);
          return;
        }
        if (!response.ok || !body.session) throw new Error(messageFrom(body, "辨識結果目前無法載入。"));
        const next = { ...body.session, contractToken: body.meta?.contractToken ?? null } as Session;
        const hasLocatablePdfEvidence = [
          ...(next.reviewGroups ?? []).flatMap((group) => group.observations ?? []),
          ...(next.candidates ?? []).flatMap((candidate) => candidate.observations ?? [])
        ].some((observation) => {
          const sourceFileName = observation.sourceFileName ?? next.sources.find((source) => source.id === observation.sourceId)?.fileName ?? "";
          return /\.pdf$/iu.test(sourceFileName)
            && observation.geometry?.coordinateSpace === "normalized_page"
            && observation.geometry?.origin === "top_left";
        });
        const needsPdfPlanUpgrade = next.sourceContextType === "candidate_revision"
          && next.sources.some((source) => /\.pdf$/iu.test(source.fileName))
          && (next.pdfOcrSources?.length ?? 0) === 0
          && !hasLocatablePdfEvidence
          && next.status !== "review_ready"
          && !["queued", "extracting"].includes(next.status);
        if (needsPdfPlanUpgrade && attempt === 0) {
          const rerunResponse = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(next.id)}/reruns`, {
            method: "POST",
            headers: { "idempotency-key": `dev082:legacy-plan-upgrade:${next.id}` }
          });
          const rerunBody = await rerunResponse.json().catch(() => ({}));
          if (!rerunResponse.ok || !rerunBody.session?.id) throw new Error(messageFrom(rerunBody, "PDF 辨識升級批次目前無法建立。"));
          currentSessionId = String(rerunBody.session.id);
          continue;
        }
        setRestricted(false);
        setProjection(next);
        return;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "辨識結果目前無法載入。");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [setProjection]);

  const loadLatest = useCallback(async () => {
    latestLoadAbortRef.current?.abort();
    const controller = new AbortController();
    latestLoadAbortRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/recognition-session`, {
        cache: "no-store",
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setRestricted(true);
        setSession(null);
        return;
      }
      if (!response.ok) throw new Error(messageFrom(body, "辨識狀態目前無法載入。"));
      setRestricted(false);
      const enabled = body?.feature?.enabled !== false;
      setFeatureEnabled(enabled);
      if (!enabled) {
        setSession(null);
        return;
      }
      const latest = body.session as ({ id?: string; sourceAssetIds?: string[]; sourceContextType?: string; sourceContextId?: string } | null | undefined);
      if (latest?.id && latest.sourceContextType === sourceContextType && latest.sourceContextId === sourceContextId && sameSourceSet(stableSourceAssetIds, latest.sourceAssetIds ?? [])) {
        await loadSession(latest.id, true);
      } else if (stableSourceAssetIds.length > 0 && !disabled) {
        const startResponse = await fetch("/api/numbering/recognition-sessions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceContextType, sourceContextId, sourceAssetIds: stableSourceAssetIds }),
          signal: controller.signal
        });
        const startBody = await startResponse.json().catch(() => ({}));
        if (startResponse.status === 403) {
          setRestricted(true);
          setSession(null);
          return;
        }
        if (!startResponse.ok || !startBody.session?.id) throw new Error(messageFrom(startBody, "自動辨識工作目前無法建立。"));
        await loadSession(String(startBody.session.id), true);
      } else {
        setSession(null);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "辨識狀態目前無法載入。");
    } finally {
      if (latestLoadAbortRef.current === controller) {
        latestLoadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [disabled, drawingNumber, loadSession, sourceContextId, sourceContextType, stableSourceAssetIds]);

  useEffect(() => {
    if (snapshotMode) return;
    const loadKey = `${sourceContextType}:${sourceContextId}:${sourceKey}`;
    if (loadedSourceContextRef.current === loadKey) return;
    loadedSourceContextRef.current = loadKey;
    void loadLatest();
    return () => {
      if (loadedSourceContextRef.current === loadKey) loadedSourceContextRef.current = null;
    };
  }, [loadLatest, snapshotMode, sourceContextId, sourceContextType, sourceKey]);
  useEffect(() => () => latestLoadAbortRef.current?.abort(), []);
  useEffect(() => { onDirtyChange?.(hasDraftChanges || hasHandoffDraftChanges); }, [hasDraftChanges, hasHandoffDraftChanges, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (snapshotMode || !session || !["queued", "extracting"].includes(session.status)) return;
    const timer = window.setInterval(() => void loadSession(session.id, true), 2_500);
    return () => window.clearInterval(timer);
  }, [loadSession, session, snapshotMode]);

  function collectDecisions() {
    return visibleReviewGroups.reduce<BatchDecision[]>((result, group) => {
      const allMembers = group.memberCandidateIds.map((id) => visibleCandidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is Candidate => Boolean(candidate));
      const members = allMembers.filter((candidate) => !requiresPartOwner(candidate));
      const primary = members.find((candidate) => candidate.id === group.primaryCandidateId) ?? members[0];
      if (!primary) return result;
      const primaryValue = drafts[primary.id] ?? primary.proposedValue ?? "";
      const primaryModified = primaryValue !== (primary.proposedValue ?? "");
      if (group.conflictState === "conflict") {
        if (!primaryModified) return result;
        result.push({ candidateId: primary.id, action: "correct", value: primaryValue, fieldKey: primary.fieldKey, fieldLabel: primary.fieldLabel, category: primary.category, ownerType: primary.proposedOwnerType, ownerId: primary.proposedOwnerId });
        for (const candidate of allMembers.filter((item) => item.id !== primary.id)) result.push({ candidateId: candidate.id, action: "ignore", reason: "已由人工核對此跨來源 review group" });
        return result;
      }
      for (const candidate of members) {
        const value = drafts[candidate.id] ?? candidate.proposedValue ?? "";
        const modified = value !== (candidate.proposedValue ?? "");
        if (!modified && !isPendingReview(candidate)) continue;
        if (!modified) result.push({ candidateId: candidate.id, action: "accept" });
        else result.push({ candidateId: candidate.id, action: "correct", value, fieldKey: candidate.fieldKey, fieldLabel: candidate.fieldLabel, category: candidate.category, ownerType: candidate.proposedOwnerType, ownerId: candidate.proposedOwnerId });
      }
      return result;
    }, []);
  }

  async function commitPdm() {
    if (!session || disabled || busy || session.status === "formalized") return;
    const decisions = collectDecisions();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = commitIdempotencyKeyRef.current ?? `recognition-commit:${crypto.randomUUID()}`;
      commitIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedRowVersion: session.rowVersion, decisions })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messageFrom(body, "寫入 PDM 失敗；目前修改仍保留在畫面上。"));
      setNotice(Number(body.result?.appliedCount ?? 0) === 0 ? "PDM 已是最新，已完成同步確認。" : "已寫入 PDM，送審前仍可編輯辨識結果。");
      commitIdempotencyKeyRef.current = null;
      await loadSession(session.id, true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "寫入 PDM 失敗；目前修改仍保留在畫面上。");
    } finally {
      setBusy(false);
    }
  }

  async function handoffPartWorks() {
    if (!session || disabled || busy || !session.applicationScope || session.status === "formalized" && !hasHandoffDraftChanges) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = handoffIdempotencyKeyRef.current ?? `recognition-part-work-handoff:${session.id}:${session.rowVersion}`;
      handoffIdempotencyKeyRef.current = idempotencyKey;
      const normalizeEntry = (entry: { fieldKey: string; value: string | null }) => ({ fieldKey: entry.fieldKey, intent: entry.value === "無" ? "not_applicable" : entry.value?.trim() ? "value" : "clear", value: entry.value });
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/handoff`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey, "x-pdm-workbench-contract": session.contractToken ?? "" },
        body: JSON.stringify({
          expectedRowVersion: session.rowVersion,
          expectedSourceSetFingerprint: (session as Session & { sourceSetFingerprint?: string }).sourceSetFingerprint,
          expectedRelationScopeFingerprint: session.applicationScope.relationScopeFingerprint,
          commonValues: handoffFields.map(normalizeEntry),
          overrides: handoffOverrides.map((entry) => ({ partId: entry.partId, fieldKey: entry.fieldKey, intent: entry.value === "無" ? "not_applicable" : entry.value?.trim() ? "value" : "clear", value: entry.value }))
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messageFrom(body, "帶入料號工作失敗；目前修改仍保留在畫面上。"));
      handoffIdempotencyKeyRef.current = null;
      const result = body.handoff;
      setNotice(Number(result?.workMutationCount ?? 0) > 0 ? `已帶入 ${result.workMutationCount} 個料號工作` : "資料已一致，沒有需要新增的料號工作");
      await loadSession(session.id, true);
      const destination = typeof result?.destination?.path === "string" ? result.destination.path : "";
      if (destination && !snapshotMode) window.location.assign(destination);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帶入料號工作失敗；目前修改仍保留在畫面上。");
    } finally {
      setBusy(false);
    }
  }

  async function openAmendment() {
    if (!session || disabled || busy || session.status !== "formalized") return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = amendmentIdempotencyKeyRef.current ?? `recognition-amendment:${crypto.randomUUID()}`;
      amendmentIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/amendments`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedRowVersion: session.rowVersion })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.session?.id) throw new Error(messageFrom(body, "辨識編輯版本建立失敗。"));
      amendmentIdempotencyKeyRef.current = null;
      await loadSession(String(body.session.id), true);
      setNotice("已建立辨識編輯版本；原始證據保持不變。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "辨識編輯版本建立失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAmendment() {
    if (!session || disabled || busy || session.sessionPurpose !== "amendment" || !session.evidenceOriginSessionId) return;
    if (!cancelArmed) {
      setCancelArmed(true);
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const idempotencyKey = cancelAmendmentIdempotencyKeyRef.current ?? `recognition-cancel-amendment:${crypto.randomUUID()}`;
      cancelAmendmentIdempotencyKeyRef.current = idempotencyKey;
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/cancel-amendment`, {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
        body: JSON.stringify({ expectedRowVersion: session.rowVersion })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messageFrom(body, "取消辨識編輯失敗。"));
      cancelAmendmentIdempotencyKeyRef.current = null;
      await loadSession(session.evidenceOriginSessionId, true);
      setNotice("已取消辨識編輯；原本的 PDM 資料未變更。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "取消辨識編輯失敗。");
    } finally {
      setCancelArmed(false);
      setBusy(false);
    }
  }

  async function rerunNativeMetadata() {
    if (!session || disabled || busy || hasDraftChanges || ["queued", "extracting"].includes(session.status)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/reruns`, {
        method: "POST",
        headers: { "idempotency-key": `recognition-rerun:${crypto.randomUUID()}` }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.session?.id) throw new Error(messageFrom(body, "重新辨識建立失敗。"));
      await loadSession(String(body.session.id), true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "重新辨識建立失敗。");
    } finally {
      setBusy(false);
    }
  }

  function selectEvidence(observations: ReviewGroup["observations"], preferredObservationId?: string) {
    const observation = (preferredObservationId
      ? observations.find((item) => item.id === preferredObservationId)
      : undefined) ?? [...observations].sort((left, right) => {
      const leftPdf = /\.pdf$/iu.test(left.sourceFileName ?? "");
      const rightPdf = /\.pdf$/iu.test(right.sourceFileName ?? "");
      return Number(rightPdf && isNormalizedPageGeometry(right.geometry)) - Number(leftPdf && isNormalizedPageGeometry(left.geometry));
    }).find((item) => isNormalizedPageGeometry(item.geometry)) ?? observations[0];
    if (!observation || !onEvidenceSelect) return;
    onEvidenceSelect({
      sessionId: session?.id ?? null,
      sourceId: observation.sourceId,
      sourceRole: observation.sourceRole ?? session?.sources.find((item) => item.id === observation.sourceId)?.sourceRole ?? null,
      rawText: observation.rawText,
      fileName: observation.sourceFileName ?? session?.sources.find((item) => item.id === observation.sourceId)?.fileName ?? null,
      pageNumber: observation.pageNumber,
      sheetName: observation.sheetName,
      configurationName: observation.configurationName,
      geometry: observation.geometry,
      locatable: isNormalizedPageGeometry(observation.geometry)
    });
  }

  const recognitionProcessing = Boolean(session && ["queued", "extracting"].includes(session.status));
  return (
    <div className={`${styles.panelStyles} dev079-recognition-panel`} data-dev079-recognition={snapshotMode ? "immutable-review" : "embedded"}>
      {snapshotMode && session ? <div className="canonical-note" role="status"><strong>辨識送審快照</strong><span>投影 {snapshotProjection?.projectionHash.slice(0, 12)} · {session.sources.length} 個來源</span></div> : null}
      {restricted ? <div className="dev079-recognition-state"><ScanSearch size={18} /><strong>目前無辨識核對權限</strong><span>不影響既有版次權限或送審資格。</span></div> : null}
      {!restricted && !featureEnabled ? <div className="dev079-recognition-state"><ScanSearch size={18} /><strong>智慧辨識尚未啟用</strong><span>版次與檔案功能仍可正常使用。</span></div> : null}
      {!restricted && featureEnabled && loading ? <div className="dev079-recognition-state"><LoaderCircle className="spin" size={18} />正在讀取辨識結果…</div> : null}
      {error ? <div className="dev079-recognition-alert is-error" role="alert"><AlertTriangle size={15} />{error}<button type="button" className="link-button" onClick={() => void loadLatest()}><RefreshCcw size={14} />重試</button></div> : null}
      {notice ? <div className="dev079-recognition-alert is-success" role="status"><Check size={15} />{notice}</div> : null}

      {!loading && !restricted && featureEnabled && !session && !error ? (
        <div className="dev079-recognition-state"><ScanSearch size={18} /><strong>尚無可辨識的檔案</strong><span>檔案上傳完成後，系統會自動開始辨識。</span></div>
      ) : null}

      {recognitionProcessing ? <div className="dev079-recognition-state" role="status"><LoaderCircle className="spin" size={18} /><strong>智慧辨識處理中</strong><span>完成後會自動顯示辨識結果。</span></div> : null}

      {session && !recognitionProcessing ? (
        <>
          {session.errorSummary ? <div className="dev079-recognition-alert is-error" role="alert"><AlertTriangle size={15} />{session.errorSummary}</div> : null}
          <NativeMetadataHealthBanner
            health={session.adapterHealth?.nativeMetadata}
            onRetry={disabled ? undefined : () => void rerunNativeMetadata()}
            retryDisabled={busy || hasDraftChanges}
          />
          {session.applicationScope ? (
            <section className="dev079-recognition-common-first" aria-label="辨識共用值與例外">
              <header className="dev079-recognition-common-header">
                <div><strong>共用值</strong><span>套用到 {session.applicationScope.eligiblePartCount} 個料號</span></div>
                <small>{session.handoffControl?.state === "blocked" ? "有項目需要處理" : "只在有差異時顯示個別例外"}</small>
              </header>
              {handoffCommonFields.length === 0 ? <p className="dev079-recognition-empty-inline">目前沒有自動辨識的共用值；需要時可直接輸入，或用「個別設定」指定特定料號。</p> : null}
              <div className="dev079-recognition-common-fields">
                {handoffFieldRows.map((field) => (
                  <div key={field.fieldKey} className="dev079-recognition-common-field">
                    <label><span>{field.label}</span><input aria-label={`${field.label}共用值`} value={handoffCommonDraft[field.fieldKey] ?? field.value ?? ""} disabled={disabled || busy || snapshotMode} onChange={(event) => { setNotice(""); setHandoffCommonDraft((current) => ({ ...current, [field.fieldKey]: event.target.value })); }} /></label>
                    <small>{field.exceptionCount > 0 ? `${field.exceptionCount} 個例外` : "所有關聯料號相同"}</small>
                  </div>
                ))}
              </div>
              {handoffExceptions.length > 0 ? (
                <div className="dev079-recognition-exceptions" aria-label="料號例外">
                  <strong>個別例外</strong>
                  {handoffExceptions.map((field) => {
                    const key = `${field.partId}:${field.fieldKey}`;
                    return <div key={key} className="dev079-recognition-exception-row"><span>{field.partNumber} · {field.label}</span><input aria-label={`${field.partNumber}${field.label}例外值`} value={handoffOverrideDraft[key] ?? field.value ?? ""} disabled={disabled || busy || snapshotMode} onChange={(event) => setHandoffOverrideDraft((current) => ({ ...current, [key]: event.target.value }))} /><button type="button" className="link-button" disabled={disabled || busy || snapshotMode} onClick={() => setHandoffOverrideDraft((current) => { const next = { ...current }; delete next[key]; return next; })}>恢復共用值</button></div>;
                  })}
                </div>
              ) : null}
              {session.applicationScope.eligibleParts.length > 0 && !snapshotMode ? (
                <div className="dev079-recognition-manual-override">
                  <strong>個別設定</strong>
                  <select aria-label="選擇例外料號" value={overridePartId} disabled={disabled || busy} onChange={(event) => setOverridePartId(event.target.value)}><option value="">選擇料號</option>{session.applicationScope.eligibleParts.map((part) => <option key={part.id} value={part.id}>{part.partNumber} · {part.partName}</option>)}</select>
                  <select aria-label="選擇例外欄位" value={overrideFieldKey} disabled={disabled || busy} onChange={(event) => setOverrideFieldKey(event.target.value)}>{HANDOFF_FIELD_OPTIONS.map((field) => <option key={field.fieldKey} value={field.fieldKey}>{field.label}</option>)}</select>
                  <input aria-label="輸入例外值" value={overrideValue} disabled={disabled || busy} onChange={(event) => setOverrideValue(event.target.value)} placeholder="輸入不同值" />
                  <button type="button" className="secondary-button" disabled={disabled || busy || !overridePartId || !overrideValue.trim()} onClick={() => { const key = `${overridePartId}:${overrideFieldKey}`; setHandoffOverrideDraft((current) => ({ ...current, [key]: overrideValue.trim() })); setOverrideValue(""); }}>加入例外</button>
                </div>
              ) : null}
              {!snapshotMode && !disabled ? <div className="dev079-recognition-save-status" role="status" aria-live="polite"><CheckCircle2 size={19} aria-hidden="true" /><div><strong>{session.handoffControl?.state === "synchronized" && !hasHandoffDraftChanges ? "已帶入料號工作" : hasHandoffDraftChanges || session.handoffControl?.state === "ready" ? "待帶入料號工作" : "待核對"}</strong><span>確認後只建立或更新料號工作，不直接修改正式主檔。</span></div><button type="button" className="primary-button" disabled={busy || session.handoffControl?.state === "blocked"} onClick={() => void handoffPartWorks()}>{busy ? "帶入中…" : session.handoffControl?.state === "synchronized" && !hasHandoffDraftChanges ? "確認資料已一致" : `帶入 ${session.handoffControl?.workMutationCount ?? session.applicationScope.eligiblePartCount} 個料號工作`}</button></div> : null}
            </section>
          ) : null}
          {visibleCandidates.length > 0 ? (
            <>
              <div className="dev079-recognition-sections">
                {sections.map((section) => {
                  const groups = displayReviewGroups.filter((group) => group.category === section.key);
                  if (groups.length === 0) return null;
                  return (
                    <section key={section.key} className="dev079-recognition-section" aria-label={section.title}>
                      {groups.map((group) => {
                        const candidate = visibleCandidates.find((item) => item.id === group.primaryCandidateId) ?? visibleCandidates.find((item) => group.memberCandidateIds.includes(item.id));
                        if (!candidate) return null;
                        const modified = group.memberCandidateIds.some((id) => {
                          const member = visibleCandidates.find((item) => item.id === id);
                          return member && (drafts[id] ?? member.proposedValue ?? "") !== (member.proposedValue ?? "");
                        });
                        const unresolvedPartOwner = Boolean(group.blockingReason) || group.memberCandidateIds.some((id) => {
                          const member = visibleCandidates.find((item) => item.id === id);
                          return Boolean(member && requiresPartOwner(member));
                        });
                        const exception = ["conflict", "blocked"].includes(group.reviewState)
                          ? getStatusDisplay(group.reviewState, "recognitionReviewStatus").label
                          : null;
                        const exceptionHelp = exception ? recognitionExceptionHelp(group) : null;
                        const ownerErrorId = `recognition-owner-error-${candidate.id}`;
                        const crossScopeConflict = group.reviewGroups.length > 1 && group.distinctValues.length > 1;
                        const updateDrafts = (candidateIds: string[], value: string) => {
                          setNotice("");
                          setDrafts((current) => ({ ...current, ...Object.fromEntries(candidateIds.map((id) => [id, value])) }));
                        };
                        const renderEvidenceSources = (reviewGroup: Pick<ReviewGroup, "fieldLabel" | "observations">) => {
                          if (reviewGroup.observations.length <= 1) return null;
                          const sortedObservations = [...reviewGroup.observations].sort((left, right) => (left.sourceFileName ?? "").localeCompare(right.sourceFileName ?? "", "zh-Hant") || (left.configurationName ?? "").localeCompare(right.configurationName ?? "", "zh-Hant") || left.id.localeCompare(right.id));
                          const observationsBySourceLabel = new Map<string, typeof sortedObservations>();
                          for (const observation of sortedObservations) {
                            const label = evidenceSourceLabel(observation);
                            observationsBySourceLabel.set(label, [...(observationsBySourceLabel.get(label) ?? []), observation]);
                          }
                          return (
                            <div className="dev079-recognition-evidence-sources" aria-label={`${reviewGroup.fieldLabel}來源證據`}>
                              <div>
                                {[...observationsBySourceLabel.entries()].map(([label, observations]) => (
                                <button
                                  key={label}
                                  type="button"
                                  className="dev079-recognition-evidence-source"
                                  data-evidence-source-id={observations[0]?.sourceId}
                                  data-evidence-observation-count={observations.length}
                                  onClick={() => selectEvidence(observations)}
                                  disabled={disabled || busy}
                                >
                                  {label}
                                </button>
                                ))}
                              </div>
                            </div>
                          );
                        };
                        return (
                          <article
                            key={group.id}
                            className={`dev079-recognition-candidate is-${group.reviewState}${modified ? " is-modified" : ""}${unresolvedPartOwner ? " is-owner-required" : ""}`}
                            data-recognition-field-key={group.fieldKey ?? ""}
                            data-review-group-count={group.reviewGroups.length}
                            data-observation-count={group.observations.length}
                            data-owner-required={unresolvedPartOwner ? "true" : undefined}
                            data-owner-resolution={group.ownerResolution}
                          >
                            <header><strong>{group.fieldLabel}</strong><span className="dev079-recognition-field-signals">{modified ? <small className="is-modified">已修改</small> : null}{unresolvedPartOwner ? <small className="is-owner-required"><AlertTriangle size={12} aria-hidden="true" />需指定料號</small> : exception && exceptionHelp ? <TextHint title={exceptionHelp} className="dev079-recognition-exception-hint"><small className="is-exception">{exception}</small></TextHint> : null}</span></header>
                            {unresolvedPartOwner ? <p id={ownerErrorId} className="dev079-recognition-field-error" role="alert"><AlertTriangle size={14} aria-hidden="true" />尚未指定料號歸屬；系統無法唯一判定，此欄位不會納入批次儲存，其他版次操作不受影響。</p> : null}
                            {group.distinctValues.length > 1 ? <div className="dev079-recognition-conflict" role="status">{crossScopeConflict ? "不同適用範圍辨識出不同值，請逐項核對。" : `跨來源候選：${group.distinctValues.join(" ／ ")}；請人工選定唯一值`}</div> : null}
                            {crossScopeConflict ? (
                              <div className="dev079-recognition-scope-rows">
                                {group.reviewGroups.map((reviewGroup, index) => {
                                  const reviewCandidate = visibleCandidates.find((item) => item.id === reviewGroup.primaryCandidateId) ?? visibleCandidates.find((item) => reviewGroup.memberCandidateIds.includes(item.id));
                                  if (!reviewCandidate) return null;
                                  const reviewScope = scopeLabelsForGroup(reviewGroup, visibleCandidates).join("、") || `範圍 ${index + 1}`;
                                  const reviewModified = reviewGroup.memberCandidateIds.some((id) => {
                                    const member = visibleCandidates.find((item) => item.id === id);
                                    return member && (drafts[id] ?? member.proposedValue ?? "") !== (member.proposedValue ?? "");
                                  });
                                  return (
                                    <div key={reviewGroup.id} className="dev079-recognition-scope-row">
                                      <small>{reviewScope}</small>
                                      <label>
                                        <input aria-label={`${group.fieldLabel}－${reviewScope}辨識／修正值${reviewModified ? "，已修改" : ""}`} aria-invalid={requiresPartOwner(reviewCandidate) || undefined} aria-describedby={requiresPartOwner(reviewCandidate) ? ownerErrorId : undefined} value={drafts[reviewCandidate.id] ?? ""} readOnly={disabled || busy || session.status === "formalized" || requiresPartOwner(reviewCandidate)} onFocus={() => selectEvidence(reviewGroup.observations)} onChange={(event) => updateDrafts(reviewGroup.memberCandidateIds, event.target.value)} />
                                      </label>
                                      {renderEvidenceSources(reviewGroup)}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="dev079-recognition-value-row">
                                <label>
                                  <input aria-label={`${group.fieldLabel}辨識／修正值${modified ? "，已修改" : ""}`} aria-invalid={unresolvedPartOwner || undefined} aria-describedby={unresolvedPartOwner ? ownerErrorId : undefined} value={drafts[candidate.id] ?? ""} readOnly={disabled || busy || session.status === "formalized" || unresolvedPartOwner} data-merged-candidate-count={group.memberCandidateIds.length} onFocus={() => selectEvidence(group.observations)} onChange={(event) => updateDrafts(group.memberCandidateIds, event.target.value)} />
                                </label>
                                {renderEvidenceSources(group)}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
              {!session.applicationScope && !snapshotMode && !disabled ? (
                <div className="dev079-recognition-save-status" role="status" aria-live="polite">
                  <CheckCircle2 size={19} aria-hidden="true" />
                  <div><strong>{session.status === "formalized" ? "已寫入 PDM" : hasDraftChanges || hasDecisionsToSave ? "待寫入 PDM" : "核對結果已儲存"}</strong><span>{session.status === "formalized" ? "料號與圖面正式資料已更新" : "按一次即可保存核對並同步料號資料"}</span></div>
                  {session.status === "formalized" ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void openAmendment()}>編輯辨識</button> : <><button type="button" className="primary-button" disabled={busy || hasUnresolvedPartOwner} onClick={() => void commitPdm()}>{busy ? "寫入中…" : session.sessionPurpose === "amendment" ? "更新寫入 PDM" : "確認寫入 PDM"}</button>{session.sessionPurpose === "amendment" ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => void cancelAmendment()}>{cancelArmed ? "確認取消編輯" : "取消編輯"}</button>{cancelArmed ? <><span role="alert">尚未提交的修改會捨棄，原本已寫入的 PDM 不會回復。</span><button type="button" className="link-button" onClick={() => setCancelArmed(false)}>繼續編輯</button></> : null}</> : null}</>}
                </div>
              ) : null}
            </>
          ) : !session.errorSummary ? <div className="dev079-recognition-state"><ScanSearch size={18} /><strong>沒有可供核對的辨識結果</strong></div> : null}
        </>
      ) : null}
    </div>
  );
}
