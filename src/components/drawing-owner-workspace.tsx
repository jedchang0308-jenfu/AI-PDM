"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowLeft, CheckCircle2, FileText, Files, LoaderCircle, LockKeyhole, RefreshCcw, ScanSearch, Send } from "lucide-react";
import { DrawingDetailPreview, type DrawingDetailPreviewCard, type DrawingDetailPreviewKind } from "@/components/drawing-detail-preview";
import { DrawingRecognitionWorkspacePanel, type DrawingRecognitionEvidence } from "@/components/drawing-recognition-workspace-panel";
import { DrawingRevisionWorkbench } from "@/app/numbering/revisions/page";
import { NumberingCandidateRevisionEditor, type CandidateRevisionWorkspace } from "@/components/numbering-candidate-revision-editor";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";
import { normalizePdmDrawingReturnTo } from "@/lib/pdm-review-navigation";
import type { DrawingWorkbenchDetailResponse } from "@/lib/drawing-workbench";
import type { PdmEntityDetailResponse } from "@/lib/pdm-entity-detail-contract";

type OwnerIntent = "view" | "edit_revision" | "submit_review" | "create_revision" | "withdraw_review" | "recovery" | "manage_files";
type ApiMessage = { error?: string | { message?: string }; message?: string };

const DETAIL_PANEL_STORAGE_KEY = "ai-pdm:drawing-workspace:detail-panel-width:v1";
const DETAIL_PANEL_MIN_WIDTH = 360;
const DETAIL_PANEL_MAX_WIDTH = 720;
const DETAIL_PANEL_DEFAULT_WIDTH = 520;
const VISUAL_PANEL_MIN_WIDTH = 420;
const DETAIL_RESIZER_WIDTH = 10;
const DETAIL_PANEL_KEYBOARD_STEP = 24;

function messageOf(body: ApiMessage, fallback: string) {
  return typeof body.error === "object" ? body.error.message ?? fallback : body.message ?? body.error ?? fallback;
}

function candidateStage(workspace: CandidateRevisionWorkspace | null | undefined) {
  return workspace?.lifecycleV2?.stage ?? "drawing_preparation";
}

function primaryDrawingCode(workspace: CandidateRevisionWorkspace) {
  return workspace.drawings.find((drawing) => drawing.candidateCode)?.candidateCode ?? workspace.drawings[0]?.candidateCode ?? null;
}

function previewCardsOf(projection: PdmEntityDetailResponse["projections"]["drawing"] | null, evidence: DrawingRecognitionEvidence | null) {
  if (!projection || projection.level !== "full") return [];
  const focusRegion = evidence?.locatable ? evidenceRegion(evidence.geometry) : null;
  return projection.data.previews.map((preview): DrawingDetailPreviewCard => ({
    kind: preview.kind,
    title: preview.title,
    fileName: preview.fileName,
    state: preview.state === "queued" || preview.state === "running" ? "pending" : preview.state,
    stateTitle: preview.stateTitle,
    stateText: preview.stateText,
    media: preview.state === "ready" && preview.mediaHref ? {
      href: preview.kind === "two-d" && evidence?.locatable && evidence.sessionId && evidence.sourceId
        ? `/api/numbering/recognition-sessions/${encodeURIComponent(evidence.sessionId)}/sources/${encodeURIComponent(evidence.sourceId)}/content`
        : preview.mediaHref,
      mode: preview.kind === "three-d" ? "image" : "document",
      title: preview.kind === "two-d" && evidence?.locatable ? `${preview.title} · 第 ${evidence.pageNumber ?? 1} 頁` : preview.title,
      alt: preview.fileName ?? preview.title,
      pageNumber: preview.kind === "two-d" && evidence?.locatable ? evidence.pageNumber : undefined,
      openInNewTab: true,
      focusRegion: preview.kind === "two-d" && evidence?.locatable ? focusRegion ?? undefined : undefined
    } : undefined
  }));
}

function evidenceRegion(geometry: Record<string, unknown> | null) {
  if (!geometry || geometry.coordinateSpace !== "normalized_page" || geometry.origin !== "top_left") return null;
  const values = [geometry.x, geometry.y, geometry.width, geometry.height].map(Number);
  if (!values.every(Number.isFinite) || values[0] < 0 || values[1] < 0 || values[2] <= 0 || values[3] <= 0 || values[0] + values[2] > 1.000001 || values[1] + values[3] > 1.000001) return null;
  const [x, y, width, height] = values;
  return { x, y, width, height };
}

export function DrawingOwnerWorkspace({ drawingId }: { drawingId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const intent = (searchParams.get("intent") as OwnerIntent | null) ?? "view";
  const returnTo = normalizePdmDrawingReturnTo(searchParams.get("returnTo"));
  const [detail, setDetail] = useState<DrawingWorkbenchDetailResponse | null>(null);
  const [projection, setProjection] = useState<PdmEntityDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recognitionDirty, setRecognitionDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailMode, setDetailMode] = useState<"files" | "recognition">("files");
  const [visualKind, setVisualKind] = useState<DrawingDetailPreviewKind>("two-d");
  const [selectedEvidence, setSelectedEvidence] = useState<DrawingRecognitionEvidence | null>(null);
  const [evidenceLocationNotice, setEvidenceLocationNotice] = useState<{ message: string } | null>(null);
  const [evidenceOriginKind, setEvidenceOriginKind] = useState<DrawingDetailPreviewKind | null>(null);
  const [detailPanelWidth, setDetailPanelWidth] = useState<number | null>(null);
  const [detailPanelMaxWidth, setDetailPanelMaxWidth] = useState(DETAIL_PANEL_MAX_WIDTH);
  const [isResizingDetail, setIsResizingDetail] = useState(false);
  const workspaceGridRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLElement>(null);
  const detailPanelPreferredWidthRef = useRef(DETAIL_PANEL_DEFAULT_WIDTH);
  const detailResizeStartRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const canLeave = useUnsavedChangesGuard(dirty || recognitionDirty);
  const drawingKey = `drawing:${drawingId}`;

  const detailPanelWidthBounds = useCallback(() => {
    const containerWidth = workspaceGridRef.current?.getBoundingClientRect().width ?? DETAIL_PANEL_MAX_WIDTH + VISUAL_PANEL_MIN_WIDTH + DETAIL_RESIZER_WIDTH;
    return {
      min: DETAIL_PANEL_MIN_WIDTH,
      max: Math.max(DETAIL_PANEL_MIN_WIDTH, Math.min(DETAIL_PANEL_MAX_WIDTH, containerWidth - VISUAL_PANEL_MIN_WIDTH - DETAIL_RESIZER_WIDTH))
    };
  }, []);

  const clampDetailPanelWidth = useCallback((width: number) => {
    const bounds = detailPanelWidthBounds();
    return Math.min(bounds.max, Math.max(bounds.min, width));
  }, [detailPanelWidthBounds]);

  const applyDetailPanelWidth = useCallback((width: number, persist = false) => {
    const nextWidth = Math.round(clampDetailPanelWidth(width));
    setDetailPanelWidth(nextWidth);
    if (persist) {
      detailPanelPreferredWidthRef.current = nextWidth;
      try {
        window.localStorage.setItem(DETAIL_PANEL_STORAGE_KEY, String(nextWidth));
      } catch {
        // The workspace remains resizable when browser storage is unavailable.
      }
    }
    return nextWidth;
  }, [clampDetailPanelWidth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detailResponse, projectionResponse] = await Promise.all([
        fetch(`/api/numbering/drawings/workbench/${encodeURIComponent(drawingKey)}`, { cache: "no-store" }),
        fetch(`/api/pdm/entity-details/${encodeURIComponent(drawingKey)}?surface=drawing&returnTo=${encodeURIComponent(returnTo)}`, { cache: "no-store" })
      ]);
      const detailBody = await detailResponse.json().catch(() => ({}));
      const projectionBody = await projectionResponse.json().catch(() => ({}));
      if (!detailResponse.ok) throw new Error(messageOf(detailBody, "圖號工作區目前無法載入。"));
      setDetail(detailBody as DrawingWorkbenchDetailResponse);
      if (projectionResponse.ok) setProjection(projectionBody as PdmEntityDetailResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "圖號工作區目前無法載入。請重新整理。 ");
    } finally {
      setLoading(false);
    }
  }, [drawingKey, returnTo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const measuredWidth = detailPanelRef.current?.getBoundingClientRect().width ?? DETAIL_PANEL_MIN_WIDTH;
    setDetailPanelMaxWidth(detailPanelWidthBounds().max);
    let preferredWidth = window.matchMedia("(max-width: 900px)").matches ? DETAIL_PANEL_DEFAULT_WIDTH : measuredWidth;
    try {
      const storedWidth = Number(window.localStorage.getItem(DETAIL_PANEL_STORAGE_KEY));
      if (Number.isFinite(storedWidth) && storedWidth > 0) preferredWidth = storedWidth;
    } catch {
      // Fall back to the current layout when browser storage is unavailable.
    }
    detailPanelPreferredWidthRef.current = preferredWidth;
    applyDetailPanelWidth(preferredWidth);
  }, [applyDetailPanelWidth, detailPanelWidthBounds]);
  useEffect(() => {
    const workspaceGrid = workspaceGridRef.current;
    if (!workspaceGrid || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setDetailPanelMaxWidth(detailPanelWidthBounds().max);
      setDetailPanelWidth((currentWidth) => currentWidth === null ? currentWidth : clampDetailPanelWidth(detailPanelPreferredWidthRef.current));
    });
    observer.observe(workspaceGrid);
    return () => observer.disconnect();
  }, [clampDetailPanelWidth, detailPanelWidthBounds]);
  useEffect(() => {
    if (!evidenceLocationNotice) return;
    const timer = window.setTimeout(() => setEvidenceLocationNotice(null), 2_800);
    return () => window.clearTimeout(timer);
  }, [evidenceLocationNotice]);

  function detailPanelWidthFromPointer(clientX: number) {
    const resizeStart = detailResizeStartRef.current;
    if (!resizeStart) return detailPanelWidth ?? DETAIL_PANEL_MIN_WIDTH;
    return resizeStart.startWidth + resizeStart.startX - clientX;
  }

  function startDetailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (window.matchMedia("(max-width: 900px)").matches) return;
    const currentWidth = detailPanelRef.current?.getBoundingClientRect().width ?? detailPanelWidth ?? DETAIL_PANEL_MIN_WIDTH;
    detailResizeStartRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: currentWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsResizingDetail(true);
    event.preventDefault();
  }

  function resizeDetailFromPointer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (detailResizeStartRef.current?.pointerId !== event.pointerId) return;
    applyDetailPanelWidth(detailPanelWidthFromPointer(event.clientX));
  }

  function finishDetailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    if (detailResizeStartRef.current?.pointerId !== event.pointerId) return;
    applyDetailPanelWidth(detailPanelWidthFromPointer(event.clientX), true);
    detailResizeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsResizingDetail(false);
  }

  function cancelDetailResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const resizeStart = detailResizeStartRef.current;
    if (resizeStart?.pointerId !== event.pointerId) return;
    applyDetailPanelWidth(resizeStart.startWidth);
    detailResizeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsResizingDetail(false);
  }

  function resizeDetailFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    const currentWidth = detailPanelWidth ?? detailPanelRef.current?.getBoundingClientRect().width ?? DETAIL_PANEL_MIN_WIDTH;
    const bounds = detailPanelWidthBounds();
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = currentWidth + DETAIL_PANEL_KEYBOARD_STEP;
    if (event.key === "ArrowRight") nextWidth = currentWidth - DETAIL_PANEL_KEYBOARD_STEP;
    if (event.key === "Home") nextWidth = bounds.min;
    if (event.key === "End") nextWidth = bounds.max;
    if (nextWidth === null) return;
    event.preventDefault();
    applyDetailPanelWidth(nextWidth, true);
  }

  const candidate = detail?.candidate as CandidateRevisionWorkspace | null | undefined;
  const drawing = detail?.drawing;
  const projectionFull = projection?.projections.drawing?.level === "full" ? projection.projections.drawing : null;
  const title = detail?.row.displayCode ?? projection?.header.entityCode ?? drawingId;
  const drawingName = detail?.row.displayName ?? projection?.header.displayName ?? "";
  const primaryCandidateDrawing = candidate?.drawings.find((item) => item.candidateCode) ?? candidate?.drawings[0] ?? null;
  const primaryCandidateRevision = candidate?.candidateRevisions.find((revision) => revision.drawingDraftId === primaryCandidateDrawing?.id) ?? candidate?.candidateRevisions[0] ?? null;
  const recognitionSourceAssetIds = useMemo(() => primaryCandidateRevision?.files.filter((file) => !file.removedAt).map((file) => file.sourceFileAssetId).filter(Boolean) ?? [], [primaryCandidateRevision]);
  const recognitionDrawingNumber = (candidate ? primaryDrawingCode(candidate) : null) ?? drawing?.drawingNumber ?? projectionFull?.data.drawingNumber ?? title;
  const recognitionDrawingNumberId = detail?.row.drawingNumberId ?? primaryCandidateDrawing?.id ?? drawingId;
  const recognitionSourceContextType = primaryCandidateRevision ? "candidate_revision" as const : "drawing_number" as const;
  const recognitionSourceContextId = primaryCandidateRevision?.id ?? recognitionDrawingNumberId;
  const previewCards = useMemo(() => previewCardsOf(projection?.projections.drawing ?? null, selectedEvidence), [projection, selectedEvidence]);

  function locateRecognitionEvidence(evidence: DrawingRecognitionEvidence) {
    if (!evidence.locatable || !evidenceRegion(evidence.geometry)) {
      setSelectedEvidence(null);
      const sourceMessage = /\.pdf$/iu.test(evidence.fileName ?? "")
        ? `版次已辨識；來源：${evidence.fileName ?? "PDF"}${evidence.pageNumber ? ` 第 ${evidence.pageNumber} 頁` : ""}，但沒有可用的正規化定位座標。`
        : `版次已辨識；來源：${evidence.fileName ?? "CAD 檔案屬性"}，這是檔案屬性證據，沒有圖面座標。`;
      setEvidenceLocationNotice({ message: sourceMessage });
      return;
    }
    if (!selectedEvidence) setEvidenceOriginKind(visualKind);
    setEvidenceLocationNotice(null);
    setSelectedEvidence(evidence);
    setVisualKind("two-d");
  }

  function clearRecognitionEvidence() {
    setSelectedEvidence(null);
    if (evidenceOriginKind) setVisualKind(evidenceOriginKind);
    setEvidenceOriginKind(null);
  }

  function selectVisualKind(kind: DrawingDetailPreviewKind) {
    setVisualKind(kind);
    if (kind !== "two-d") clearRecognitionEvidence();
  }

  function selectDetailMode(next: "files" | "recognition") {
    if (next === detailMode || canLeave()) setDetailMode(next);
  }

  async function runCandidateAction(action: "submit" | "withdraw" | "cancel" | "retry") {
    if (!candidate || busy) return;
    if (action === "submit" && !detail?.capabilities.canSubmitReview) {
      setError("目前僅供查看；此帳號不具備送審權限。");
      return;
    }
    if (action === "cancel" && !detail?.capabilities.canUpdateDraft) {
      setError("目前僅供查看；此帳號不具備取消圖號工作的權限。");
      return;
    }
    setBusy(true);
    setError("");
    const requestId = candidate.candidateRevisions.find((revision) => revision.approvalRequestId)?.approvalRequestId;
    const endpoint = action === "submit"
      ? candidate.lifecycleV2 ? "submit-bundle-review" : "submit-review"
      : action === "withdraw" ? "withdraw-bundle-review" : action === "cancel" ? "cancel" : null;
    try {
      if (action === "retry" && requestId) {
        const response = await fetch(`/api/approvals/requests/${encodeURIComponent(requestId)}/apply`, {
          method: "POST",
          headers: { "Idempotency-Key": `dev079:retry:${requestId}:${crypto.randomUUID()}` },
          body: "{}"
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(messageOf(body, "正式化重試失敗。"));
      } else if (endpoint) {
        const response = await fetch(`/api/numbering/draft-workspaces/${encodeURIComponent(candidate.id)}/${endpoint}`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": `dev079:${action}:${candidate.id}:${crypto.randomUUID()}` },
          body: JSON.stringify(action === "submit"
            ? { expectedWorkspaceRowVersion: candidate.rowVersion, reason: "drawing_owner_workspace" }
            : action === "withdraw"
              ? { expectedWorkspaceRowVersion: candidate.rowVersion, reason: "drawing_owner_workspace_withdraw" }
              : { expectedRowVersion: candidate.rowVersion, reason: "user_cancelled_draft" })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(messageOf(body, "圖號工作操作未完成。"));
      }
      setDirty(false);
      setNotice(action === "submit" ? "已送交審核。" : action === "withdraw" ? "已撤回送審。" : action === "retry" ? "已送出正式化重試。" : "已取消圖號工作。 ");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作未完成，請重新整理後再試。 ");
    } finally {
      setBusy(false);
    }
  }

  async function runFormalWithdraw() {
    const commandHref = detail?.row.secondaryAction?.commandHref;
    if (!commandHref || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(commandHref, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `dev081:formal-withdraw:${crypto.randomUUID()}` },
        body: "{}"
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messageOf(body, "圖面版次撤回未完成。"));
      setNotice("已撤回送審。");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "撤回未完成，請重新整理後再試。 ");
    } finally {
      setBusy(false);
    }
  }

  function leave(href: string) {
    if (canLeave()) router.push(href);
  }

  if (loading) return <main className="dev079-workspace-loading" role="status"><LoaderCircle className="spin" size={20} />正在載入圖號工作區...</main>;
  if (!detail) return <main className="dev079-workspace-state"><h1>圖號工作區</h1><p role="alert">{error || "找不到這筆圖號。"}</p><button className="secondary-button" type="button" onClick={() => void load()}>重新載入</button></main>;

  const isCandidate = Boolean(candidate);
  const isEditing = isCandidate && ["edit_revision", "submit_review", "manage_files", "view"].includes(intent);
  const isFormal = !isCandidate && Boolean(drawing);
  const candidateStageValue = candidateStage(candidate);
  const canEditCandidate = isCandidate && detail.capabilities.canUpdateDraft;
  const candidateEditingDisabledReason = !isCandidate
    ? null
    : candidateStageValue === "in_review"
      ? "此版次正在審核，審核期間不能更換檔案；需要修改時，請先撤回送審。"
      : candidateStageValue === "auto_finalizing"
        ? "系統正在建立正式版次，完成前不能更換檔案。"
        : candidateStageValue === "recovery_required"
          ? "此版次正在等待恢復處理，完成前不能更換檔案。"
          : candidateStageValue === "history_only"
            ? "此版次已結束，不能再變更版次或檔案。"
            : !detail.capabilities.canUpdateDraft
              ? "你目前不是這筆工作的負責人，或帳號沒有維護權限。請由負責人操作；需接手時，請聯絡研發主管或系統管理員。"
              : null;
  const canSubmitCandidate = isCandidate && detail.capabilities.canSubmitReview && candidateStageValue === "bundle_ready";
  const submitDisabledReason = !detail.capabilities.canSubmitReview
    ? "此帳號不具備送審權限。"
    : candidateStageValue !== "bundle_ready"
      ? "請先完成本次必要檔案與版次資料。"
      : dirty
        ? "請先儲存未完成的變更。"
        : "送交審核";
  const requestId = candidate?.candidateRevisions.find((revision) => revision.approvalRequestId)?.approvalRequestId ?? detail.row.primaryAction?.href?.match(/requestId=([^&]+)/u)?.[1] ?? null;
  const visualTabs: Array<{ kind: DrawingDetailPreviewKind; title: string; fileName?: string | null }> = [
    { kind: "three-d", title: "3D 模型", fileName: previewCards.find((card) => card.kind === "three-d")?.fileName },
    { kind: "two-d", title: "2D 圖面", fileName: previewCards.find((card) => card.kind === "two-d")?.fileName }
  ];

  return (
    <main className="dev079-workspace" data-dev="DEV-079" data-workspace-kind={isCandidate ? "candidate" : "formal"}>
      <header className="dev079-workspace-header">
        <div className="dev079-workspace-heading">
          <button className="icon-button" type="button" onClick={() => leave(returnTo)} aria-label="返回圖號清單" title="返回圖號清單"><ArrowLeft size={18} /></button>
          <div className="dev079-workspace-heading-copy">
            <h1>{title}</h1>
            {drawingName ? <span className="dev079-workspace-heading-name">{drawingName}</span> : null}
            <div className="dev079-workspace-preview-tabs" role="tablist" aria-label="圖面預覽類型">
              {visualTabs.map((tab) => (
                <button key={tab.kind} type="button" role="tab" aria-selected={visualKind === tab.kind} className={visualKind === tab.kind ? "is-active" : ""} onClick={() => selectVisualKind(tab.kind)}>
                  <span>{tab.title}</span>
                  <small>{tab.fileName || "尚無檔案"}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="dev079-workspace-header-actions">
          {dirty ? <span className="dev079-dirty-indicator">尚有未儲存變更</span> : null}
          {isCandidate && requestId && candidateStage(candidate) === "recovery_required" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void runCandidateAction("retry")}><RefreshCcw size={15} />重試正式化</button> : null}
          <button className="secondary-button" type="button" onClick={() => void load()} disabled={busy}><RefreshCcw size={15} />重新整理</button>
        </div>
      </header>

      {notice ? <div className="dev079-workspace-notice is-success" role="status"><CheckCircle2 size={16} />{notice}</div> : null}
      {error ? <div className="dev079-workspace-notice is-error" role="alert">{error}</div> : null}
      {isCandidate && candidateEditingDisabledReason ? <div className="dev079-workspace-notice is-readonly" role="status"><LockKeyhole size={16} /><span><strong>目前僅供查看</strong>右側會顯示無法編輯的原因與處理方式；圖面與檔案仍可查看。</span></div> : null}

      <div
        ref={workspaceGridRef}
        className={`dev079-workspace-grid${isResizingDetail ? " is-resizing-detail" : ""}`}
        style={detailPanelWidth === null ? undefined : { "--dev079-detail-panel-width": `${detailPanelWidth}px` } as CSSProperties}
      >
        <section className="dev079-workspace-visual" aria-label="圖面主視覺">
          <div className="dev079-visual-panel">
            <DrawingDetailPreview
              cards={previewCards}
              title={null}
              showHeader={false}
              showTabFileNames
              showTabs={false}
              showCardHeader={false}
              showFileName={false}
              dataSection="dev079-primary-visual"
              layout="tabs"
              activeKind={visualKind}
              onActiveKindChange={selectVisualKind}
            />
            {evidenceLocationNotice ? <div className="dev079-evidence-flash" role="status" aria-live="polite"><FileText size={15} aria-hidden="true" />{evidenceLocationNotice.message}</div> : null}
          </div>
        </section>

        <button
          className="dev079-workspace-resizer"
          type="button"
          role="separator"
          aria-label="調整版次與辨識面板寬度"
          aria-orientation="vertical"
          aria-valuemin={DETAIL_PANEL_MIN_WIDTH}
          aria-valuemax={detailPanelMaxWidth}
          aria-valuenow={Math.round(detailPanelWidth ?? DETAIL_PANEL_MIN_WIDTH)}
          title="拖曳調整寬度；也可使用左右方向鍵"
          onPointerDown={startDetailResize}
          onPointerMove={resizeDetailFromPointer}
          onPointerUp={finishDetailResize}
          onPointerCancel={cancelDetailResize}
          onKeyDown={resizeDetailFromKeyboard}
        />

        <aside ref={detailPanelRef} className="dev079-workspace-detail" aria-label="版次與辨識操作">
          <div className="dev079-task-panel">
            <div className="dev079-task-tabs" role="tablist" aria-label="工作模式">
              <button type="button" role="tab" aria-selected={detailMode === "files"} className={detailMode === "files" ? "is-active" : ""} onClick={() => selectDetailMode("files")}><Files size={16} />版次與檔案</button>
              <button type="button" role="tab" aria-selected={detailMode === "recognition"} className={detailMode === "recognition" ? "is-active" : ""} onClick={() => selectDetailMode("recognition")}><ScanSearch size={16} />智慧辨識</button>
            </div>

            {detailMode === "files" ? (
              <section className="dev079-workspace-editor" role="tabpanel" aria-label="版次與檔案">
                {isCandidate && candidate && isEditing ? (
                  <NumberingCandidateRevisionEditor
                    workspace={candidate}
                    primaryDrawingCode={primaryDrawingCode(candidate)}
                    showDrawingLabel={false}
                    disabled={busy || Boolean(candidateEditingDisabledReason)}
                    disabledReason={candidateEditingDisabledReason}
                    onWorkspaceChange={(next) => { setDirty(false); setDetail((current) => current ? { ...current, candidate: next as unknown as NonNullable<DrawingWorkbenchDetailResponse["candidate"]> } : current); void load(); }}
                    onError={setError}
                    onNotice={setNotice}
                    onDirtyChange={setDirty}
                  />
                ) : isFormal && drawing ? (
                  <DrawingRevisionWorkbench initialDrawingNumber={drawing.drawingNumber} initialFocus={intent === "create_revision" ? "revision" : "upload"} compact onDirtyChange={setDirty} onClose={() => leave(returnTo)} />
                ) : <div className="dev079-workspace-empty"><FileText size={24} /><h2>目前沒有可編輯內容</h2><p>請回到圖號清單確認最新狀態。</p></div>}
              </section>
            ) : (
              <section role="tabpanel" aria-label="智慧辨識">
                <DrawingRecognitionWorkspacePanel
                  drawingNumber={recognitionDrawingNumber}
                  sourceContextType={recognitionSourceContextType}
                  sourceContextId={recognitionSourceContextId}
                  sourceAssetIds={recognitionSourceAssetIds}
                  disabled={busy || !canEditCandidate || candidateStageValue === "in_review" || candidateStageValue === "auto_finalizing" || candidateStageValue === "recovery_required"}
                  onEvidenceSelect={locateRecognitionEvidence}
                  onDirtyChange={setRecognitionDirty}
                />
              </section>
            )}
          </div>

          <footer className="dev079-workspace-footer" aria-label="圖號工作區操作列">
            <div className="dev079-workspace-footer-actions">
              {isCandidate && candidate && ["bundle_ready", "drawing_preparation", "correction_required"].includes(candidateStageValue) ? <button className="primary-button" type="button" disabled={busy || !canSubmitCandidate || dirty} title={submitDisabledReason} onClick={() => void runCandidateAction("submit")}><Send size={15} />送交審核</button> : null}
              {isCandidate && candidate && candidateStageValue === "in_review" ? <button className="primary-button" type="button" disabled={busy || !requestId} onClick={() => requestId ? router.push(`/approvals/${encodeURIComponent(requestId)}?returnTo=${encodeURIComponent(returnTo)}`) : undefined}><LockKeyhole size={15} />查看審核</button> : null}
              {isCandidate && candidate && candidateStageValue === "in_review" && (detail.capabilities as { canWithdrawReview?: boolean }).canWithdrawReview ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void runCandidateAction("withdraw")}><RefreshCcw size={15} />撤回送審</button> : null}
              {isCandidate && candidate && candidateStageValue !== "in_review" && canEditCandidate ? <button className="danger-button" type="button" disabled={busy} onClick={() => void runCandidateAction("cancel")}>取消圖號工作</button> : null}
              {isFormal && (detail.capabilities as { canWithdrawReview?: boolean }).canWithdrawReview && detail.row.secondaryAction?.kind === "withdraw_review" ? <button className="secondary-button" type="button" disabled={busy} onClick={() => void runFormalWithdraw()}><RefreshCcw size={15} />撤回送審</button> : null}
              <button className="secondary-button" type="button" onClick={() => leave(returnTo)}>返回圖號清單</button>
            </div>
          </footer>
        </aside>
      </div>
    </main>
  );
}
