"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, LoaderCircle, RefreshCcw, Save, ScanSearch } from "lucide-react";
import {
  useDrawingRecognitionBrowserOcr,
  type DrawingRecognitionBrowserOcrSession
} from "@/components/drawing-recognition-pdf-ocr";
import { TextHint } from "@/components/compact-hints";
import { getStatusDisplay } from "@/lib/status-display";

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
};

type NativeMetadataHealth = {
  state: "ready" | "empty" | "partial" | "unavailable" | "failed";
  issueCode: string | null;
  message: string | null;
  retryable: boolean;
  affectedSources: Array<{ sourceId: string; fileName: string; status: string }>;
};

function NativeMetadataHealthBanner({ health }: { health: NativeMetadataHealth | null | undefined }) {
  if (!health || health.state === "ready") return null;
  const isError = health.state === "failed";
  const affected = health.affectedSources.map((source) => source.fileName).filter(Boolean);
  return (
    <div className={`dev079-recognition-adapter-health is-${health.state}`} role={isError ? "alert" : "status"}>
      {isError ? <AlertTriangle size={15} aria-hidden="true" /> : <ScanSearch size={15} aria-hidden="true" />}
      <div><strong>{health.state === "empty" ? "SolidWorks 屬性讀取已完成" : health.state === "partial" ? "SolidWorks 屬性讀取部分完成" : health.state === "unavailable" ? "尚未啟用 SolidWorks 屬性讀取器" : "SolidWorks 屬性讀取失敗"}</strong><span>{health.message}</span>{affected.length > 0 ? <small>受影響來源：{affected.join("、")}</small> : null}</div>
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

export function DrawingRecognitionWorkspacePanel({
  drawingNumber,
  sourceContextType,
  sourceContextId,
  sourceAssetIds,
  disabled = false,
  onEvidenceSelect,
  onDirtyChange
}: {
  drawingNumber: string;
  sourceContextType: "candidate_revision" | "drawing_revision" | "drawing_number";
  sourceContextId: string;
  sourceAssetIds: string[];
  disabled?: boolean;
  onEvidenceSelect?: (evidence: DrawingRecognitionEvidence) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restricted, setRestricted] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const loadedSourceContextRef = useRef<string | null>(null);
  const sourceKey = useMemo(() => [...sourceAssetIds].filter(Boolean).sort().join("|"), [sourceAssetIds]);
  const stableSourceAssetIds = useMemo(() => sourceKey ? sourceKey.split("|") : [], [sourceKey]);
  const visibleCandidates = useMemo(() => session?.candidates.filter((candidate) => !isHiddenCandidate(candidate)) ?? [], [session]);
  const visibleReviewGroups = useMemo(() => {
    if (!session) return [];
    const groups = session.reviewGroups?.filter((group) => !isHiddenCandidate({ fieldKey: group.fieldKey } as Candidate));
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
  const displayReviewGroups = useMemo(() => coalesceReviewGroupsForDisplay(visibleReviewGroups, visibleCandidates), [visibleCandidates, visibleReviewGroups]);
  const hasDraftChanges = useMemo(() => visibleCandidates.some((candidate) => (drafts[candidate.id] ?? "") !== (candidate.proposedValue ?? "")), [drafts, visibleCandidates]);
  const hasDecisionsToSave = visibleReviewGroups.some((group) => {
    const modified = group.memberCandidateIds.some((id) => {
      const candidate = visibleCandidates.find((item) => item.id === id);
      return candidate && (drafts[id] ?? candidate.proposedValue ?? "") !== (candidate.proposedValue ?? "");
    });
    return modified || (group.conflictState === "none" && group.memberCandidateIds.some((id) => {
      const candidate = visibleCandidates.find((item) => item.id === id);
      return candidate ? isPendingReview(candidate) : false;
    }));
  });

  const setProjection = useCallback((next: Session) => {
    setSession(next);
    setDrafts(Object.fromEntries(next.candidates.map((candidate) => [candidate.id, candidate.proposedValue ?? ""])));
  }, []);

  const mergeProjection = useCallback((next: Session) => {
    setSession(next);
    setDrafts((current) => Object.fromEntries(next.candidates.map((candidate) => [candidate.id, current[candidate.id] ?? candidate.proposedValue ?? ""])));
  }, []);

  useDrawingRecognitionBrowserOcr({
    session,
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
        const next = body.session as Session;
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
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/numbering/drawings/${encodeURIComponent(drawingNumber)}/recognition-session`, { cache: "no-store" });
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
          body: JSON.stringify({ sourceContextType, sourceContextId, sourceAssetIds: stableSourceAssetIds })
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
      setError(cause instanceof Error ? cause.message : "辨識狀態目前無法載入。");
    } finally {
      setLoading(false);
    }
  }, [disabled, drawingNumber, loadSession, sourceContextId, sourceContextType, stableSourceAssetIds]);

  useEffect(() => {
    const loadKey = `${sourceContextType}:${sourceContextId}:${sourceKey}`;
    if (loadedSourceContextRef.current === loadKey) return;
    loadedSourceContextRef.current = loadKey;
    void loadLatest();
  }, [loadLatest, sourceContextId, sourceContextType, sourceKey]);
  useEffect(() => { onDirtyChange?.(hasDraftChanges); }, [hasDraftChanges, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  useEffect(() => {
    if (!session || !["queued", "extracting"].includes(session.status)) return;
    const timer = window.setInterval(() => void loadSession(session.id, true), 2_500);
    return () => window.clearInterval(timer);
  }, [loadSession, session]);

  async function saveAllDecisions() {
    if (!session || disabled || busy) return;
    const decisions = visibleReviewGroups.reduce<BatchDecision[]>((result, group) => {
      const members = group.memberCandidateIds.map((id) => visibleCandidates.find((candidate) => candidate.id === id)).filter((candidate): candidate is Candidate => Boolean(candidate));
      const primary = members.find((candidate) => candidate.id === group.primaryCandidateId) ?? members[0];
      if (!primary) return result;
      const primaryValue = drafts[primary.id] ?? primary.proposedValue ?? "";
      const primaryModified = primaryValue !== (primary.proposedValue ?? "");
      if (group.conflictState === "conflict") {
        if (!primaryModified) return result;
        result.push({ candidateId: primary.id, action: "correct", value: primaryValue, fieldKey: primary.fieldKey, fieldLabel: primary.fieldLabel, category: primary.category, ownerType: primary.proposedOwnerType, ownerId: primary.proposedOwnerId });
        for (const candidate of members.filter((item) => item.id !== primary.id)) result.push({ candidateId: candidate.id, action: "ignore", reason: "已由人工核對此跨來源 review group" });
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
    if (decisions.length === 0) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/decisions`, {
        method: "PATCH",
        headers: { "content-type": "application/json", "idempotency-key": `dev079:recognition-batch:${crypto.randomUUID()}` },
        body: JSON.stringify({ expectedRowVersion: session.rowVersion, decisions })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.session) {
        setError(messageFrom(body, "全部核對結果儲存失敗；目前修改仍保留在畫面上。"));
        return;
      }
      setProjection(body.session as Session);
      setNotice("全部核對結果已儲存。");
    } catch {
      setError("全部核對結果儲存失敗；目前修改仍保留在畫面上。");
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
    <div className="dev079-recognition-panel" data-dev079-recognition="embedded">
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
          <NativeMetadataHealthBanner health={session.adapterHealth?.nativeMetadata} />
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
                        const exception = ["conflict", "blocked"].includes(group.reviewState)
                          ? getStatusDisplay(group.reviewState, "recognitionReviewStatus").label
                          : null;
                        const exceptionHelp = group.reviewState === "conflict"
                          ? `辨識結果與目前系統正式值不同。系統正式值：${group.currentFormalValue ?? "尚無"}。請人工確認後再儲存。`
                          : "此欄位需要人工確認後才能完成核對。";
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
                            className={`dev079-recognition-candidate is-${group.reviewState}${modified ? " is-modified" : ""}`}
                            data-recognition-field-key={group.fieldKey ?? ""}
                            data-review-group-count={group.reviewGroups.length}
                            data-observation-count={group.observations.length}
                          >
                            <header><strong>{group.fieldLabel}</strong><span className="dev079-recognition-field-signals">{modified ? <small className="is-modified">已修改</small> : null}{exception ? <TextHint title={exceptionHelp} className="dev079-recognition-exception-hint"><small className="is-exception">{exception}</small></TextHint> : null}</span></header>
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
                                        <input aria-label={`${group.fieldLabel}－${reviewScope}辨識／修正值${reviewModified ? "，已修改" : ""}`} value={drafts[reviewCandidate.id] ?? ""} readOnly={disabled || busy} onFocus={() => selectEvidence(reviewGroup.observations)} onChange={(event) => updateDrafts(reviewGroup.memberCandidateIds, event.target.value)} />
                                      </label>
                                      {renderEvidenceSources(reviewGroup)}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="dev079-recognition-value-row">
                                <label>
                                  <input aria-label={`${group.fieldLabel}辨識／修正值${modified ? "，已修改" : ""}`} value={drafts[candidate.id] ?? ""} readOnly={disabled || busy} data-merged-candidate-count={group.memberCandidateIds.length} onFocus={() => selectEvidence(group.observations)} onChange={(event) => updateDrafts(group.memberCandidateIds, event.target.value)} />
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
              {!disabled ? <button type="button" className="primary-button dev079-recognition-save-all" disabled={busy || !hasDecisionsToSave} onClick={() => void saveAllDecisions()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}{hasDecisionsToSave ? "完成核對並儲存" : "核對結果已儲存"}</button> : null}
            </>
          ) : !session.errorSummary ? <div className="dev079-recognition-state"><ScanSearch size={18} /><strong>沒有可供核對的辨識結果</strong></div> : null}
        </>
      ) : null}
    </div>
  );
}
