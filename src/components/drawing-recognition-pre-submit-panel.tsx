"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, ScanSearch } from "lucide-react";
import { useMemo, useState } from "react";
import { DrawingRecognitionStatusChip } from "@/components/drawing-recognition-status-chip";
import { StatusSignalGroup } from "@/components/status-signal-group";
import { getStatusDisplay } from "@/lib/status-display";

type RecognitionSession = {
  id: string;
  status: string;
};

export function DrawingRecognitionPreSubmitPanel({
  drawingNumberId,
  drawingNumber,
  sourceAssetIds,
  returnTo,
  refreshKey = "",
  sourceContextType = "drawing_number",
  sourceContextId = drawingNumberId,
  compact = false,
  disabled = false,
  onSessionStarted
}: {
  drawingNumberId: string;
  drawingNumber: string;
  sourceAssetIds: string[];
  returnTo?: string | null;
  refreshKey?: string | number | null;
  sourceContextType?: "drawing_number" | "candidate_revision" | "revision_package" | "drawing_revision";
  sourceContextId?: string;
  compact?: boolean;
  disabled?: boolean;
  onSessionStarted?: (session: RecognitionSession) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [session, setSession] = useState<RecognitionSession | null>(null);
  const [startedSelectionKey, setStartedSelectionKey] = useState("");
  const [statusRefreshKey, setStatusRefreshKey] = useState(0);
  const selectionKey = useMemo(() => [...sourceAssetIds].sort().join("|"), [sourceAssetIds]);
  const selectionChanged = Boolean(startedSelectionKey && startedSelectionKey !== selectionKey);
  const recognitionReturnTo = returnTo || `/numbering/revisions?drawingNumber=${encodeURIComponent(drawingNumber)}`;
  const reviewHref = session
    ? `/numbering/recognition/${encodeURIComponent(session.id)}?returnTo=${encodeURIComponent(recognitionReturnTo)}`
    : null;

  async function startRecognition() {
    if (busy || disabled || sourceAssetIds.length === 0 || !sourceContextId) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/numbering/recognition-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceContextType,
          sourceContextId,
          sourceAssetIds
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.session?.id) {
        throw new Error(body?.message || body?.error?.message || body?.error || "目前無法建立辨識工作。請稍後重試。");
      }
      const nextSession = { id: body.session.id, status: body.session.status };
      setSession(nextSession);
      onSessionStarted?.(nextSession);
      setStartedSelectionKey(selectionKey);
      setStatusRefreshKey((current) => current + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "目前無法建立辨識工作。請稍後重試。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`drawing-revision-recognition-panel drawing-revision-recognition-pre-submit${compact ? " is-compact" : ""}`} aria-label="送審前圖面辨識" data-recognition-entry="pre-submit" data-recognition-context={sourceContextType}>
      <div className="drawing-revision-recognition-copy">
        {!compact ? (
          <>
            <div className="drawing-revision-recognition-title">
              <ScanSearch size={18} aria-hidden="true" />
              <strong>送審前圖面辨識</strong>
            </div>
            <p>先辨識目前勾選的檔案，再人工核對候選結果；辨識只建立審核證據，不會直接寫入 PDM。</p>
            <small>目前來源：{sourceAssetIds.length} 個受控檔案</small>
          </>
        ) : null}
      </div>
      <div className="drawing-revision-recognition-actions">
        <button className="secondary-button" type="button" onClick={() => void startRecognition()} disabled={busy || disabled || sourceAssetIds.length === 0 || !sourceContextId}>
          {busy ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />}
          {busy ? "建立辨識工作中" : "開始辨識"}
        </button>
        {selectionChanged ? (
          <StatusSignalGroup
            surface="form"
            primary={<span className="drawing-recognition-chip is-warning"><span>圖面辨識</span><strong>{getStatusDisplay("blocked", "recognitionReviewStatus").label}</strong></span>}
            signals={[{ id: "recognition-source-selection-changed", context: "recognitionReviewStatus", raw: "blocked", isPrimaryAxis: false, affectsCurrentAction: true, description: "本次勾選檔案已變更，上一輪辨識結果不再代表本次送審檔案；請重新開始辨識。" }]}
          />
        ) : !compact ? (
          <DrawingRecognitionStatusChip
            drawingNumber={drawingNumber}
            sourceAssetIds={sourceAssetIds}
            refreshKey={`${refreshKey}:${statusRefreshKey}`}
            returnTo={recognitionReturnTo}
            emptyLabel="尚未開始辨識"
          />
        ) : null}
        {reviewHref && !selectionChanged && !compact ? <Link className="secondary-button" href={reviewHref}>查看辨識結果</Link> : null}
      </div>
      {sourceAssetIds.length === 0 ? (
        <p className="drawing-revision-recognition-hint"><AlertTriangle size={15} />請先勾選本次要送審的 2D／3D 或其他圖面檔案。</p>
      ) : null}
      {disabled && sourceAssetIds.length > 0 ? (
        <p className="drawing-revision-recognition-hint"><AlertTriangle size={15} />目前僅供查看；可查看既有辨識結果。</p>
      ) : null}
      {selectionChanged ? (
        <p className="drawing-revision-recognition-hint is-warning"><AlertTriangle size={15} />目前勾選檔案已變更，上一輪辨識結果不再代表本次送審檔案；請重新開始辨識。</p>
      ) : null}
      {session && !selectionChanged ? (
        <p className="drawing-revision-recognition-hint is-success"><CheckCircle2 size={15} />辨識工作已建立；完成後可進入同一頁人工核對。</p>
      ) : null}
      {error ? <p className="drawing-revision-recognition-hint is-error" role="alert"><AlertTriangle size={15} />{error}</p> : null}
    </section>
  );
}
