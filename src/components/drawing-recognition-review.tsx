"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, FileSearch, RefreshCcw, Save, X } from "lucide-react";
import {
  DrawingRecognitionPdfOcrStatus,
  useDrawingRecognitionBrowserOcr,
  type DrawingRecognitionBrowserOcrSession
} from "@/components/drawing-recognition-pdf-ocr";
import { StatusScopeHelp } from "@/components/status-help-popover";
import { getStatusDisplay } from "@/lib/status-display";

type Observation = { id: string; sourceId?: string; rawText: string; confidenceBand: string; pageNumber: number | null; sheetName: string | null; configurationName: string | null; geometry?: Record<string, unknown> | null };
type Candidate = {
  id: string; category: string; fieldKey: string | null; fieldLabel: string; rawValue: string | null; proposedValue: string | null;
  proposedOwnerType: string | null; proposedOwnerId: string | null; applicabilityScope: string; variantStatus: string; confidenceBand: string;
  reviewState: string; currentFormalValue: string | null; observations: Observation[];
};
type Session = DrawingRecognitionBrowserOcrSession & {
  id: string; status: string; rowVersion: number; drawingId: string | null; drawingRevisionId: string | null; warningCount: number;
  conflictCount: number; unclassifiedCount: number; errorSummary: string | null; createdAt: string;
  adapterHealth?: { nativeMetadata: NativeMetadataHealth | null };
  sources: Array<{ id: string; fileName: string; sourceRole: string }>;
  candidates: Candidate[];
  baseline: Array<{ fieldKey: string; fieldLabel: string; value: string; support: number; partCount: number }>;
};
type NativeMetadataHealth = {
  state: "ready" | "empty" | "partial" | "unavailable" | "failed";
  issueCode: string | null;
  message: string | null;
  retryable: boolean;
  affectedSources: Array<{ sourceId: string; fileName: string; status: string }>;
};

function NativeMetadataHealthBanner({ health, onRetry, retryDisabled = false }: { health: NativeMetadataHealth | null | undefined; onRetry?: () => void; retryDisabled?: boolean }) {
  if (!health || health.state === "ready") return null;
  const isError = health.state === "failed";
  const affected = health.affectedSources.map((source) => source.fileName).filter(Boolean);
  const showRetry = Boolean(onRetry && ["partial", "unavailable", "failed"].includes(health.state));
  return <div className={`drawing-recognition-adapter-health is-${health.state}`} role={isError ? "alert" : "status"}>
    {isError ? <AlertTriangle size={16} aria-hidden="true" /> : <RefreshCcw size={16} aria-hidden="true" />}
    <div><strong>{health.state === "empty" ? "SolidWorks 屬性讀取已完成" : health.state === "partial" ? "SolidWorks 屬性讀取部分完成" : health.state === "unavailable" ? "此批未使用 SolidWorks 屬性讀取器" : "SolidWorks 屬性讀取失敗"}</strong><span>{health.message}</span>{affected.length > 0 ? <small>受影響來源：{affected.join("、")}</small> : null}{showRetry ? <button type="button" className="link-button" disabled={retryDisabled} onClick={onRetry}><RefreshCcw size={14} />重新辨識</button> : null}</div>
  </div>;
}
type Impact = {
  impactToken: string; changes: ImpactChange[];
  blockers: Array<{ candidateId: string; reason: string }>; exclusions: Array<{ candidateId: string; reason: string }>; requiresPostReleaseChange: boolean;
};
type ImpactChange = { candidateId: string; targetType: string; targetId: string; fieldLabel: string; beforeValue: string | null; afterValue: string | null; changeKind: string };
type Draft = { value: string; fieldKey: string; fieldLabel: string; category: string; ownerType: string; ownerId: string; reason: string };

const sections = [
  { key: "identity_relation", title: "1. 識別與關聯" },
  { key: "part_attribute", title: "2. 料號基準與各料號變體" },
  { key: "drawing_revision", title: "3. 圖面與版次資料" },
  { key: "controlled_note", title: "4. 特殊要求與受控註記" },
  { key: "engineering_evidence", title: "5. 幾何與工程辨識證據" },
  { key: "unclassified", title: "6. 尚未歸類 OCR" }
] as const;
const categoryOptions = sections.map((section) => ({ value: section.key, label: section.title.replace(/^\d+\.\s*/u, "") }));

function candidateReviewLabel(candidate: Candidate) {
  if (candidate.reviewState === "corrected" && candidate.variantStatus === "explicit_not_applicable") return "不適用";
  return getStatusDisplay(candidate.reviewState, "recognitionReviewStatus").label;
}

function requiresPartOwner(candidate: Candidate, draft?: Draft) {
  const ownerType = draft?.ownerType || candidate.proposedOwnerType;
  const ownerId = draft?.ownerId || candidate.proposedOwnerId;
  const value = draft?.value ?? candidate.proposedValue;
  return ownerType === "part_number" && !ownerId && Boolean(value?.trim());
}

function messageFrom(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { message?: string; error?: string | { message?: string } };
  return record.message || (typeof record.error === "object" ? record.error.message : record.error) || fallback;
}

function candidateDraft(candidate: Candidate): Draft {
  return { value: candidate.proposedValue ?? "", fieldKey: candidate.fieldKey ?? "", fieldLabel: candidate.fieldLabel, category: candidate.category, ownerType: candidate.proposedOwnerType ?? "", ownerId: candidate.proposedOwnerId ?? "", reason: "" };
}

function bestObservation(candidate: Candidate, session: Session) {
  const sourceById = new Map(session.sources.map((source) => [source.id, source]));
  const normalized = (value: Record<string, unknown> | null | undefined) => {
    if (!value || value.coordinateSpace !== "normalized_page" || value.origin !== "top_left") return false;
    const numbers = [value.x, value.y, value.width, value.height].map(Number);
    return numbers.every(Number.isFinite) && numbers[0] >= 0 && numbers[1] >= 0 && numbers[2] > 0 && numbers[3] > 0 && numbers[0] + numbers[2] <= 1.000001 && numbers[1] + numbers[3] <= 1.000001;
  };
  return [...candidate.observations].sort((left, right) => {
    const leftPdf = /\.pdf$/iu.test(sourceById.get(left.sourceId ?? "")?.fileName ?? "") && normalized(left.geometry);
    const rightPdf = /\.pdf$/iu.test(sourceById.get(right.sourceId ?? "")?.fileName ?? "") && normalized(right.geometry);
    return Number(rightPdf) - Number(leftPdf);
  })[0];
}

function recognitionOwnerDefaults(category: string, session: Session) {
  if (["drawing_revision", "controlled_note", "engineering_evidence"].includes(category) && session.drawingRevisionId) {
    return { ownerType: "drawing_revision", ownerId: session.drawingRevisionId };
  }
  return null;
}

function impactTarget(change: ImpactChange, candidate?: Candidate) {
  const kind = change.targetType === "part_number" ? "料號"
    : change.targetType === "drawing_revision" ? "圖面版次"
      : change.targetType === "drawing" ? "圖面" : "資料目標";
  const scopedLabel = candidate?.applicabilityScope && candidate.applicabilityScope !== "overall"
    ? candidate.applicabilityScope
    : kind === "圖面版次" ? "目前版次" : kind;
  return { kind, label: scopedLabel };
}

function impactBlockerReason(reason: string) {
  if (reason === "target_mapping_required") return "缺少正式寫入目標；請設定歸屬，或改為延後／忽略。";
  if (reason === "unresolved_conflict") return "與系統正式值不同；請確認接受、修正或排除。";
  if (reason === "review_required") return "尚未完成核對；請接受、修正、歸類或排除。";
  return "目前不能正式寫入；請返回核對。";
}

export function DrawingRecognitionReview({ sessionId, returnTo = null }: { sessionId: string; returnTo?: string | null }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [impact, setImpact] = useState<Impact | null>(null);
  const [evidence, setEvidence] = useState<(Observation & { fileName?: string; sourceRole?: string }) | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const modalRef = useRef<HTMLDivElement | null>(null);
  const impactTriggerRef = useRef<HTMLButtonElement | null>(null);
  const evidenceTriggerRef = useRef<HTMLButtonElement | null>(null);

  const setProjection = useCallback((next: Session, preserveDrafts = false) => {
    setSession(next);
    setDrafts((current) => Object.fromEntries(next.candidates.map((candidate) => [
      candidate.id,
      preserveDrafts && current[candidate.id] ? current[candidate.id] : candidateDraft(candidate)
    ])));
  }, []);

  const pdfOcr = useDrawingRecognitionBrowserOcr({
    session,
    onProjection: (next) => setProjection(next, true),
    onError: setError,
    onNotice: setNotice
  });
  const hasPdfOcrSources = (session?.pdfOcrSources?.length ?? 0) > 0;
  const nativeRecoveryAvailable = ["partial", "unavailable", "failed"].includes(session?.adapterHealth?.nativeMetadata?.state ?? "");

  const load = useCallback(async () => {
    setError("");
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(messageFrom(body, "辨識結果讀取失敗。")); return; }
    const next = body.session as Session;
    setProjection(next);
  }, [sessionId, setProjection]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!session || !["queued", "extracting"].includes(session.status)) return;
    const timer = window.setInterval(() => void load(), 2_500);
    return () => window.clearInterval(timer);
  }, [load, session]);
  useEffect(() => {
    if (!impact) return;
    const impactTrigger = impactTriggerRef.current;
    modalRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setImpact(null);
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
      if (focusable.length === 0) { event.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === modalRef.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => impactTrigger?.focus());
    };
  }, [impact]);

  useEffect(() => {
    if (!evidence) return;
    const evidenceTrigger = evidenceTriggerRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setEvidence(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.requestAnimationFrame(() => evidenceTrigger?.focus());
    };
  }, [evidence]);

  const baselineByField = useMemo(() => new Map((session?.baseline ?? []).map((item) => [item.fieldKey, item])), [session]);
  const candidateById = useMemo(() => new Map((session?.candidates ?? []).map((candidate) => [candidate.id, candidate])), [session]);
  const pendingCount = session?.candidates.filter((candidate) => candidate.fieldKey !== "source_file_stem" && candidate.category !== "unclassified" && ["proposed", "conflict", "blocked"].includes(candidate.reviewState)).length ?? 0;
  const pdfOcrBlocksFormalization = session?.pdfOcrSources?.some((source) => ["pending", "failed", "timeout", "unsupported"].includes(source.status)) ?? false;

  async function saveDecisions(decisions: Array<Record<string, unknown>>, success: string) {
    if (!session || decisions.length === 0) return;
    setBusy(true); setError(""); setNotice("");
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/decisions`, {
      method: "PATCH", headers: { "content-type": "application/json", "idempotency-key": `recognition-review:${crypto.randomUUID()}` },
      body: JSON.stringify({ expectedRowVersion: session.rowVersion, decisions })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(messageFrom(body, "審核結果儲存失敗。")); return; }
    const next = body.session as Session;
    setProjection(next);
    setNotice(success);
  }

  async function acceptSection(category: string) {
    if (!session) return;
    const decisions = session.candidates
      .filter((candidate) => candidate.fieldKey !== "source_file_stem" && candidate.category === category && ["proposed", "conflict", "blocked"].includes(candidate.reviewState))
      .filter((candidate) => !requiresPartOwner(candidate, drafts[candidate.id]))
      .map((candidate) => ({ candidateId: candidate.id, action: "accept" }));
    await saveDecisions(decisions, `已接受「${sections.find((section) => section.key === category)?.title ?? category}」的辨識值。`);
  }

  async function saveCandidate(candidate: Candidate, action: "correct" | "map" | "ignore" | "not_applicable" | "defer") {
    const draft = drafts[candidate.id] ?? candidateDraft(candidate);
    await saveDecisions([{
      candidateId: candidate.id, action, value: draft.value, fieldKey: draft.fieldKey, fieldLabel: draft.fieldLabel,
      category: draft.category, ownerType: draft.ownerType || null, ownerId: draft.ownerId || null, reason: draft.reason || null
    }], "已儲存這筆人工核對結果。");
  }

  async function openEvidence(observationId: string) {
    if (!session) return;
    evidenceTriggerRef.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/observations/${encodeURIComponent(observationId)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) { setError(messageFrom(body, "證據讀取失敗。")); return; }
    setEvidence(body.observation);
  }

  async function previewImpact() {
    if (!session) return;
    setBusy(true); setError(""); setNotice("");
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/write-impact`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `recognition-impact:${crypto.randomUUID()}` },
      body: JSON.stringify({ expectedRowVersion: session.rowVersion })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(messageFrom(body, "寫入內容計算失敗。")); return; }
    setImpact(body.impact);
  }

  async function formalize() {
    if (!session || !impact) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/formalize`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `recognition-formalize:${crypto.randomUUID()}` },
      body: JSON.stringify({ impactToken: impact.impactToken, reason })
    });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(messageFrom(body, "正式寫入失敗。")); return; }
    setImpact(null); setNotice(`已正式寫入 ${body.result?.appliedCount ?? 0} 筆 PDM 資料。`); await load();
  }

  async function rerun() {
    if (!session || pdfOcr.activity) return;
    setBusy(true); setError("");
    const response = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/reruns`, { method: "POST", headers: { "idempotency-key": `recognition-rerun:${crypto.randomUUID()}` } });
    const body = await response.json().catch(() => ({})); setBusy(false);
    if (!response.ok) { setError(messageFrom(body, "重新辨識建立失敗。")); return; }
    const returnQuery = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
    router.push(`/numbering/recognition/${encodeURIComponent(body.session.id)}${returnQuery}`);
  }

  if (!session && !error) return <main className="drawing-recognition-page"><div className="drawing-recognition-loading">正在載入完整辨識結果…</div></main>;
  if (!session) return <main className="drawing-recognition-page"><Link href={returnTo ?? "/numbering/drawings"} className="secondary-button"><ArrowLeft size={16} />返回來源</Link><div className="drawing-recognition-alert is-error">{error}</div></main>;

  return (
    <main className="drawing-recognition-page">
      <header className="drawing-recognition-header">
        <div><Link href={returnTo ?? "/numbering/drawings"} className="drawing-recognition-back"><ArrowLeft size={15} />{returnTo ? "返回進版工作台" : "圖號工作台"}</Link><h1>圖面辨識完整核對</h1></div>
        <div className="drawing-recognition-header-state"><span>工作狀態</span><strong>{getStatusDisplay(session.status, "recognitionStatus").label}</strong><StatusScopeHelp scope="drawingRecognition" /><small>{session.sources.map((source) => source.fileName).join("、")}</small></div>
      </header>

      {error ? <div className="drawing-recognition-alert is-error" role="alert"><AlertTriangle size={16} />{error}</div> : null}
      {notice ? <div className="drawing-recognition-alert is-success" role="status"><Check size={16} />{notice}</div> : null}
      {session.errorSummary ? <div className="drawing-recognition-alert is-error" role="alert"><AlertTriangle size={16} />{session.errorSummary}</div> : null}
      <NativeMetadataHealthBanner health={session.adapterHealth?.nativeMetadata} onRetry={() => void rerun()} retryDisabled={busy || Boolean(pdfOcr.activity) || ["queued", "extracting"].includes(session.status)} />
      <DrawingRecognitionPdfOcrStatus session={session} activity={pdfOcr.activity} pendingFailure={pdfOcr.pendingFailure} onRetryPending={pdfOcr.retryPending} onRerun={() => void rerun()} />

      {sections.map((section) => {
        const candidates = session.candidates.filter((candidate) => candidate.category === section.key && candidate.fieldKey !== "source_file_stem");
        return (
          <section id={`recognition-${section.key}`} key={section.key} className="drawing-recognition-section">
            <div className="drawing-recognition-section-heading"><h2>{section.title}</h2>{candidates.some((candidate) => ["proposed", "conflict", "blocked"].includes(candidate.reviewState) && !requiresPartOwner(candidate, drafts[candidate.id])) ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void acceptSection(section.key)}><Check size={15} />接受此區辨識值</button> : null}</div>
            {section.key === "part_attribute" && session.baseline.length > 0 ? <div className="drawing-recognition-baseline"><strong>系統推定料號基準</strong>{session.baseline.map((item) => <span key={item.fieldKey}>{item.fieldLabel}：{item.value}<small>{item.support}/{item.partCount} 個料號一致</small></span>)}</div> : null}
            {candidates.length === 0 ? <div className="drawing-recognition-empty">此來源檔未辨識到這一類資料。</div> : <div className="drawing-recognition-candidate-list">{candidates.map((candidate) => {
              const draft = drafts[candidate.id] ?? candidateDraft(candidate);
              const baseline = candidate.fieldKey ? baselineByField.get(candidate.fieldKey) : null;
              const variantLabel = section.key === "part_attribute" && baseline ? (candidate.proposedValue === baseline.value ? "同基準" : `變體：基準為 ${baseline.value}`) : null;
              const ownerRequired = requiresPartOwner(candidate, draft);
              const ownerErrorId = `recognition-owner-error-${candidate.id}`;
              return <article className={`drawing-recognition-candidate is-${candidate.reviewState}${candidate.variantStatus === "explicit_not_applicable" ? " is-not-applicable" : ""}${ownerRequired ? " is-owner-required" : ""}`} data-owner-required={ownerRequired ? "true" : undefined} key={candidate.id}>
                <div className="drawing-recognition-candidate-main"><div className="drawing-recognition-candidate-title"><strong>{candidate.fieldLabel}</strong><span>{candidateReviewLabel(candidate)}</span>{ownerRequired ? <small className="drawing-recognition-owner-required"><AlertTriangle size={13} aria-hidden="true" />需指定料號</small> : null}{variantLabel ? <small>{variantLabel}</small> : null}</div>{ownerRequired ? <p id={ownerErrorId} className="drawing-recognition-field-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />尚未指定料號歸屬；請在下方「歸屬 ID」完成設定，或選擇延後／忽略。</p> : null}<div className="drawing-recognition-values"><label>辨識／修正值<input value={draft.value} aria-describedby={ownerRequired ? ownerErrorId : undefined} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, value: event.target.value } }))} /></label><div><span>系統正式值</span><strong>{candidate.currentFormalValue ?? "尚無"}</strong></div></div>
                  <details className="drawing-recognition-mapping" open={ownerRequired || undefined}><summary>欄位與歸屬設定</summary><div><label>分類<select value={draft.category} onChange={(event) => { const category = event.target.value; const owner = recognitionOwnerDefaults(category, session); setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, category, ...(owner ?? {}) } })); }}>{categoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>欄位代碼<input value={draft.fieldKey} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, fieldKey: event.target.value } }))} /></label><label>顯示名稱<input value={draft.fieldLabel} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, fieldLabel: event.target.value } }))} /></label><label>歸屬類型<input value={draft.ownerType} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, ownerType: event.target.value } }))} /></label><label className={ownerRequired ? "is-error" : undefined}>歸屬 ID<input value={draft.ownerId} aria-invalid={ownerRequired || undefined} aria-describedby={ownerRequired ? ownerErrorId : undefined} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, ownerId: event.target.value } }))} /></label></div></details>
                </div>
                <aside className="drawing-recognition-candidate-side"><div><span>可信度</span><strong>{candidate.confidenceBand}</strong></div><div><span>適用範圍</span><strong>{candidate.applicabilityScope}</strong></div>{bestObservation(candidate, session) ? <button type="button" className="link-button" onClick={() => void openEvidence(bestObservation(candidate, session)!.id)}><FileSearch size={14} />查看來源證據</button> : null}<label className="drawing-recognition-reason">忽略／不適用原因<input value={draft.reason} onChange={(event) => setDrafts((current) => ({ ...current, [candidate.id]: { ...draft, reason: event.target.value } }))} /></label><div className="drawing-recognition-row-actions"><button type="button" className="primary-button" disabled={busy} onClick={() => void saveDecisions([{ candidateId: candidate.id, action: candidate.category === "unclassified" ? "map" : "accept" }], "已接受這筆辨識值。")}>接受</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveCandidate(candidate, candidate.category === "unclassified" ? "map" : "correct")}><Save size={14} />套用修正</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveCandidate(candidate, "map")}>歸類／建立欄位</button><button type="button" className="secondary-button" disabled={busy || !draft.reason.trim()} onClick={() => void saveCandidate(candidate, "not_applicable")}>不適用</button><button type="button" className="secondary-button" disabled={busy || !draft.reason.trim()} onClick={() => void saveCandidate(candidate, "ignore")}>忽略</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void saveCandidate(candidate, "defer")}>延後</button>{!["proposed", "conflict", "blocked"].includes(candidate.reviewState) ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveDecisions([{ candidateId: candidate.id, action: "restore" }], "已恢復為待核對狀態。")}>恢復待核對</button> : null}</div></aside>
              </article>;
            })}</div>}
          </section>
        );
      })}

      <footer className="drawing-recognition-footer"><div><strong>{session.status === "formalized" ? "這批結果已正式寫入" : session.status === "extraction_failed" ? "辨識失敗，請更換來源檔或重新辨識" : ["queued", "extracting"].includes(session.status) ? "辨識處理中" : pdfOcrBlocksFormalization ? "PDF 辨識尚未成功完成；辨識結果暫不可正式寫入" : pendingCount > 0 ? `尚有 ${pendingCount} 筆需要核對` : "所有必要候選已核對"}</strong><span>確認寫入內容會列出每個欄位的寫入前後值，不會直接修改資料。</span></div><div>{!hasPdfOcrSources && !nativeRecoveryAvailable ? <button type="button" className="secondary-button" disabled={busy || Boolean(pdfOcr.activity) || ["queued", "extracting"].includes(session.status)} onClick={() => void rerun()}><RefreshCcw size={15} />重新辨識</button> : null}<button ref={impactTriggerRef} type="button" className="primary-button" disabled={busy || pdfOcrBlocksFormalization || pendingCount > 0 || session.status === "formalized" || ["queued", "extracting", "extraction_failed", "cancelled"].includes(session.status)} onClick={() => void previewImpact()}><ChevronRight size={15} />確認寫入內容</button></div></footer>

      {impact ? <div className="drawing-recognition-modal-backdrop" role="presentation"><div ref={modalRef} className="drawing-recognition-modal" role="dialog" aria-modal="true" aria-labelledby="recognition-impact-title" tabIndex={-1}><div className="drawing-recognition-modal-heading"><div><h2 id="recognition-impact-title">正式寫入影響預覽</h2><p>這一步仍未寫入；請核對目標、欄位與前後值。</p></div><button type="button" className="icon-button" aria-label="關閉預覽" onClick={() => setImpact(null)}><X size={18} /></button></div><div className="drawing-recognition-impact-counts"><span>將新增／更新 <strong>{impact.changes.length}</strong> 筆</span><span>不寫入 <strong>{impact.exclusions.length}</strong> 筆</span><span>阻擋 <strong>{impact.blockers.length}</strong> 筆</span></div><div className="drawing-recognition-impact-table"><table><thead><tr><th>目標</th><th>欄位</th><th>寫入前</th><th>寫入後</th></tr></thead><tbody>{impact.changes.map((change) => {
         const target = impactTarget(change, candidateById.get(change.candidateId));
         return <tr key={change.candidateId}><td data-label="目標" title={change.targetId}><strong>{target.label}</strong><small>{target.kind}</small></td><td data-label="欄位">{change.fieldLabel}</td><td data-label="寫入前">{change.beforeValue ?? "尚無"}</td><td data-label="寫入後">{change.afterValue ?? "不適用"}</td></tr>;
      })}</tbody></table></div>{impact.blockers.length > 0 ? <div className="drawing-recognition-impact-blockers drawing-recognition-alert is-error" role="alert"><strong>以下 {impact.blockers.length} 筆尚不能寫入</strong><ul>{impact.blockers.map((blocker) => {
        const candidate = candidateById.get(blocker.candidateId);
        return <li key={`${blocker.candidateId}:${blocker.reason}`}><span><strong>{candidate?.fieldLabel ?? "未命名候選"}</strong><small>{candidate?.applicabilityScope && candidate.applicabilityScope !== "overall" ? candidate.applicabilityScope : sections.find((section) => section.key === candidate?.category)?.title ?? "未分類"}</small></span><span>{impactBlockerReason(blocker.reason)}</span></li>;
      })}</ul><p>返回核對後，請處理上列欄位；若目前尚無可寫入的圖面版次目標，可先選「延後」或填理由後選「忽略」。</p></div> : null}{impact.requiresPostReleaseChange ? <label className="drawing-recognition-post-release-reason">已發行資料變更原因<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="必填：說明為何要變更已發行資料" /></label> : null}<div className="drawing-recognition-modal-actions"><button type="button" className="secondary-button" onClick={() => setImpact(null)}>返回核對</button><button type="button" className="primary-button" disabled={busy || impact.blockers.length > 0 || (impact.requiresPostReleaseChange && !reason.trim())} onClick={() => void formalize()}>正式寫入 PDM</button></div></div></div> : null}
      {evidence ? <aside className="drawing-recognition-evidence" role="dialog" aria-modal="false" aria-label="辨識來源證據"><div><h2>來源證據</h2><button type="button" className="icon-button" aria-label="關閉證據" onClick={() => setEvidence(null)}><X size={18} /></button></div><dl><dt>來源檔</dt><dd>{evidence.fileName ?? "—"}</dd><dt>位置</dt><dd>{[evidence.sheetName, evidence.pageNumber ? `第 ${evidence.pageNumber} 頁` : null, evidence.configurationName].filter(Boolean).join("／") || "檔案層級"}</dd><dt>可信度</dt><dd>{evidence.confidenceBand}</dd><dt>原始內容</dt><dd>{evidence.rawText}</dd></dl></aside> : null}
    </main>
  );
}
