"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, FileSearch, LoaderCircle, RefreshCcw } from "lucide-react";
import type { BrowserPdfOcrProgress } from "@/lib/browser-pdf-ocr";

export type DrawingRecognitionPendingClientAdapter = {
  sourceId: string;
  fileName: string;
  contentHash: string;
  adapterCode: "browser-pdf-ocr.v1";
};

export type DrawingRecognitionPdfOcrSource = {
  sourceId: string;
  fileName: string;
  status: "pending" | "succeeded" | "partial" | "unsupported" | "failed" | "timeout";
  observationCount: number;
  diagnostics: string[];
  requiredOutcomes: Array<{
    fieldKey: string;
    fieldLabel: string;
    outcome: "pending" | "found" | "conflict" | "not_found";
    distinctValueCount: number;
    overflow: boolean;
  }>;
};

export type DrawingRecognitionBrowserOcrSession = {
  id: string;
  status: string;
  rowVersion: number;
  pendingClientAdapters?: DrawingRecognitionPendingClientAdapter[];
  pdfOcrSources?: DrawingRecognitionPdfOcrSource[];
};

type OcrActivity = {
  sourceId: string;
  fileName: string;
  progress: BrowserPdfOcrProgress;
};

type PendingFailure = { sourceId: string; fileName: string; message: string };

function messageFrom(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { message?: string; error?: string | { message?: string } };
  return record.message || (typeof record.error === "object" ? record.error.message : record.error) || fallback;
}

function progressLabel(progress: BrowserPdfOcrProgress) {
  if (progress.stage === "preparing") return "準備 PDF 辨識元件";
  if (progress.stage === "text_layer") return `讀取文字層${progress.pageNumber && progress.pageCount ? `（第 ${progress.pageNumber}/${progress.pageCount} 頁）` : ""}`;
  if (progress.stage === "ocr") return `辨識掃描頁${progress.pageNumber && progress.pageCount ? `（第 ${progress.pageNumber}/${progress.pageCount} 頁）` : ""}`;
  if (progress.stage === "ranking") return "整理必要欄位與其他關鍵字";
  return "提交候選結果";
}

function sourceStatusLabel(status: DrawingRecognitionPdfOcrSource["status"]) {
  if (status === "pending") return "等待此瀏覽器辨識";
  if (status === "succeeded") return "辨識完成";
  if (status === "partial") return "部分完成";
  if (status === "unsupported") return "此瀏覽器不支援";
  if (status === "timeout") return "辨識逾時";
  return "辨識失敗";
}

function outcomeLabel(outcome: DrawingRecognitionPdfOcrSource["requiredOutcomes"][number]) {
  if (outcome.outcome === "pending") return "待辨識";
  if (outcome.outcome === "found") return outcome.distinctValueCount > 1 ? `找到 ${outcome.distinctValueCount} 個值` : "已找到";
  if (outcome.outcome === "conflict") return outcome.overflow ? "值衝突（超過顯示上限）" : `值衝突（${outcome.distinctValueCount} 個）`;
  return "未找到";
}

function diagnosticLabel(code: string) {
  if (code === "pdf_encrypted_or_password_required") return "PDF 已加密或需要密碼。";
  if (code === "pdf_ocr_browser_capability_missing") return "目前瀏覽器缺少必要的 PDF/OCR 能力。";
  if (code === "pdf_ocr_page_timeout") return "單頁辨識超過時間限制。";
  if (code === "pdf_ocr_document_timeout") return "整份文件辨識超過時間限制。";
  if (code === "pdf_ocr_runtime_unavailable") return "本機 OCR 元件暫時無法載入。";
  if (code === "pdf_ocr_page_limit_reached") return "掃描頁數已達安全上限，其餘頁面未執行 OCR。";
  if (code === "pdf_source_invalid") return "來源內容不是有效 PDF。";
  if (code.startsWith("required_field_conflict_overflow:")) return "必要欄位的不同值超過保留上限。";
  return "辨識完成，但有部分內容未能處理。";
}

function userVisibleDiagnostics(codes: string[]) {
  return [...new Set(codes)].filter((code) => !code.startsWith("result_fingerprint:")
    && !code.startsWith("required_field_")
    && !code.startsWith("selection_counts:"));
}

function safePendingFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "pdf_content_hash_changed") return "PDF 內容已變更，請重新整理後再辨識。";
  if (message === "pdf_content_type_invalid") return "伺服器回傳的來源不是 PDF。";
  return message || "PDF 內容目前無法取得。";
}

export function useDrawingRecognitionBrowserOcr<T extends DrawingRecognitionBrowserOcrSession>(input: {
  session: T | null;
  onProjection: (session: T) => void;
  onError: (message: string) => void;
  onNotice?: (message: string) => void;
}) {
  const [activity, setActivity] = useState<OcrActivity | null>(null);
  const [pendingFailure, setPendingFailure] = useState<PendingFailure | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const attemptedRef = useRef(new Set<string>());
  const controllersRef = useRef(new Map<string, AbortController>());
  const callbacksRef = useRef(input);
  const sessionIdRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const controllers = controllersRef.current;
    const attempted = attemptedRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
      attempted.clear();
    };
  }, []);

  useEffect(() => {
    callbacksRef.current = input;
  }, [input]);

  useEffect(() => {
    const nextId = input.session?.id ?? null;
    if (sessionIdRef.current === nextId) return;
    for (const controller of controllersRef.current.values()) controller.abort();
    controllersRef.current.clear();
    attemptedRef.current.clear();
    sessionIdRef.current = nextId;
    setActivity(null);
    setPendingFailure(null);
  }, [input.session?.id]);

  useEffect(() => {
    const session = input.session;
    if (!session || ["queued", "extracting"].includes(session.status)) return;
    if (controllersRef.current.size > 0) return;
    const pending = [...(session.pendingClientAdapters ?? [])]
      .sort((left, right) => left.fileName.localeCompare(right.fileName, "zh-Hant"))
      .find((item) => !attemptedRef.current.has(item.sourceId) && !controllersRef.current.has(item.sourceId));
    if (!pending) return;
    attemptedRef.current.add(pending.sourceId);
    const controller = new AbortController();
    controllersRef.current.set(pending.sourceId, controller);

    void (async () => {
      if (mountedRef.current) {
        setPendingFailure(null);
        setActivity({ sourceId: pending.sourceId, fileName: pending.fileName, progress: { stage: "preparing" } });
      }
      try {
        const contentResponse = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/sources/${encodeURIComponent(pending.sourceId)}/content`, {
          cache: "no-store",
          signal: controller.signal
        });
        if (!contentResponse.ok) {
          const body = await contentResponse.json().catch(() => ({}));
          throw new Error(messageFrom(body, "PDF 內容目前無法取得。"));
        }
        if (!String(contentResponse.headers.get("content-type") ?? "").toLowerCase().startsWith("application/pdf")) throw new Error("pdf_content_type_invalid");
        if (String(contentResponse.headers.get("content-hash") ?? "").toLowerCase() !== pending.contentHash.toLowerCase()) throw new Error("pdf_content_hash_changed");
        const bytes = await contentResponse.arrayBuffer();
        const { runBrowserPdfOcr } = await import("@/lib/browser-pdf-ocr");
        const result = await runBrowserPdfOcr({
          sourceId: pending.sourceId,
          bytes,
          signal: controller.signal,
          onProgress: (progress) => {
            if (mountedRef.current) setActivity({ sourceId: pending.sourceId, fileName: pending.fileName, progress });
          }
        });
        if (mountedRef.current) setActivity({ sourceId: pending.sourceId, fileName: pending.fileName, progress: { stage: "submitting" } });
        const completionResponse = await fetch(`/api/numbering/recognition-sessions/${encodeURIComponent(session.id)}/client-adapter-results`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            expectedRowVersion: session.rowVersion,
            sourceId: pending.sourceId,
            contentHash: pending.contentHash,
            adapterCode: result.adapterCode,
            adapterVersion: result.adapterVersion,
            status: result.status,
            diagnostics: result.diagnostics,
            observations: result.observations
          })
        });
        const completionBody = await completionResponse.json().catch(() => ({}));
        if (!completionResponse.ok || !completionBody.session) throw new Error(messageFrom(completionBody, "PDF 辨識結果目前無法提交。"));
        if (mountedRef.current) {
          callbacksRef.current.onProjection(completionBody.session as T);
          callbacksRef.current.onNotice?.(result.status === "succeeded" ? `${pending.fileName} 的必要欄位辨識已完成。` : `${pending.fileName} 的 PDF 辨識已結束，請查看欄位覆蓋狀態。`);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (mountedRef.current) {
          const message = safePendingFailure(error);
          setPendingFailure({ sourceId: pending.sourceId, fileName: pending.fileName, message });
          callbacksRef.current.onError(message);
        }
      } finally {
        if (controllersRef.current.get(pending.sourceId) === controller) {
          controllersRef.current.delete(pending.sourceId);
          if (mountedRef.current) setActivity((current) => current?.sourceId === pending.sourceId ? null : current);
        }
      }
    })();
  }, [input.session, retryVersion]);

  const retryPending = useCallback(() => {
    if (!pendingFailure) return;
    attemptedRef.current.delete(pendingFailure.sourceId);
    setPendingFailure(null);
    setRetryVersion((value) => value + 1);
  }, [pendingFailure]);

  return { activity, pendingFailure, retryPending };
}

export function DrawingRecognitionPdfOcrStatus({
  session,
  activity,
  pendingFailure,
  onRetryPending,
  onRerun
}: {
  session: DrawingRecognitionBrowserOcrSession;
  activity: OcrActivity | null;
  pendingFailure: PendingFailure | null;
  onRetryPending: () => void;
  onRerun?: () => void;
}) {
  const sources = useMemo(() => session.pdfOcrSources ?? [], [session.pdfOcrSources]);
  if (sources.length === 0) return null;
  const hasTerminalFailure = sources.some((source) => ["failed", "timeout", "unsupported"].includes(source.status));
  const hasPendingSource = sources.some((source) => source.status === "pending");
  return (
    <section className="drawing-pdf-ocr" aria-labelledby={`drawing-pdf-ocr-${session.id}`}>
      <header>
        <div><FileSearch size={16} aria-hidden="true" /><strong id={`drawing-pdf-ocr-${session.id}`}>PDF 圖框智慧辨識</strong></div>
        <small>先辨識圖號、版次、料號、品名、材質、比例與製圖者，再依剩餘額度保留其他關鍵字。</small>
      </header>
      {activity ? (
        <div className="drawing-pdf-ocr-progress" role="status" aria-live="polite">
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
          <span><strong>{activity.fileName}</strong>{progressLabel(activity.progress)}；請保持此頁面開啟。</span>
          {typeof activity.progress.progress === "number" ? <progress max={1} value={Math.max(0, Math.min(1, activity.progress.progress))} aria-label="PDF 辨識進度" /> : null}
        </div>
      ) : null}
      {pendingFailure ? <div className="drawing-pdf-ocr-error" role="alert"><AlertTriangle size={15} aria-hidden="true" /><span><strong>{pendingFailure.fileName}</strong>{pendingFailure.message}</span><button type="button" className="secondary-button" onClick={onRetryPending}><RefreshCcw size={14} />重試此檔</button>{onRerun ? <button type="button" className="secondary-button" onClick={onRerun}><RefreshCcw size={14} />建立新批次</button> : null}</div> : null}
      <div className="drawing-pdf-ocr-sources">
        {sources.map((source) => (
          <article key={source.sourceId} className={`drawing-pdf-ocr-source is-${source.status}`}>
            <div className="drawing-pdf-ocr-source-heading">
              <strong>{source.fileName}</strong>
              <span>{source.status === "succeeded" ? <Check size={14} aria-hidden="true" /> : ["failed", "timeout", "unsupported"].includes(source.status) ? <AlertTriangle size={14} aria-hidden="true" /> : null}{sourceStatusLabel(source.status)}</span>
            </div>
            <div className="drawing-pdf-ocr-required" aria-label={`${source.fileName}必要欄位覆蓋`}>
              {source.requiredOutcomes.map((outcome) => <span key={outcome.fieldKey} className={`is-${outcome.outcome}`}><strong>{outcome.fieldLabel}</strong><small>{outcomeLabel(outcome)}</small></span>)}
            </div>
            {userVisibleDiagnostics(source.diagnostics).length > 0 ? <p>{userVisibleDiagnostics(source.diagnostics).slice(0, 3).map(diagnosticLabel).join(" ")}</p> : null}
          </article>
        ))}
      </div>
      {hasTerminalFailure && onRerun ? <div className="drawing-pdf-ocr-recovery"><span>失敗結果不會阻擋圖面儲存或送審，但要重新辨識需建立新批次。</span><button type="button" className="secondary-button" onClick={onRerun}><RefreshCcw size={14} />建立新辨識批次</button></div> : null}
      {!hasTerminalFailure && !hasPendingSource && onRerun ? <div className="drawing-pdf-ocr-recovery"><span>若來源已更新或辨識結果不正確，可建立新批次重新讀取 PDF。</span><button type="button" className="secondary-button" disabled={Boolean(activity)} onClick={onRerun}><RefreshCcw size={14} />重新辨識 PDF</button></div> : null}
    </section>
  );
}
