"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { DrawingProjection } from "@/components/drawing-projection";
import { PartProjection } from "@/components/part-projection";
import { RelationProjection } from "@/components/relation-projection";
import { ReviewContextProjection } from "@/components/review-context-projection";
import type { PdmDetailActionDescriptor, PdmDetailSurface, PdmEntityDetailResponse } from "@/lib/pdm-entity-detail-contract";

type UnifiedPdmEntityDetailDrawerProps = {
  open: boolean;
  entityKey: string | null;
  surface: PdmDetailSurface;
  reviewRequestId?: string | null;
  width: number;
  returnTo: string;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
};

function readError(body: unknown) {
  if (!body || typeof body !== "object") return "明細目前無法載入，請重新整理。";
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "明細目前無法載入，請重新整理。";
}

function actionButton(action: PdmDetailActionDescriptor, onAction: (action: PdmDetailActionDescriptor) => void) {
  if (action.href) return <a className={action.tone === "danger" ? "danger-button" : action.tone === "primary" ? "primary-button" : "secondary-button"} href={action.href} aria-disabled={!action.enabled}>{action.label}</a>;
  return <button className={action.tone === "danger" ? "danger-button" : action.tone === "primary" ? "primary-button" : "secondary-button"} type="button" disabled={!action.enabled} title={action.disabledReason ?? undefined} onClick={() => onAction(action)}>{action.kind === "refresh" ? <RefreshCcw size={15} aria-hidden="true" /> : null}{action.label}</button>;
}

export function UnifiedPdmEntityDetailDrawer({ open, entityKey, surface, reviewRequestId, width, returnTo, onClose, onStartResize }: UnifiedPdmEntityDetailDrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<PdmEntityDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    if (!entityKey || !open) return;
    setLoading(true); setError("");
    const params = new URLSearchParams({ surface, returnTo });
    if (reviewRequestId) params.set("reviewRequestId", reviewRequestId);
    try {
      const response = await fetch(`/api/pdm/entity-details/${encodeURIComponent(entityKey)}?${params.toString()}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body));
      setDetail(body as PdmEntityDetailResponse);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setDetail(null); setError(caught instanceof Error ? caught.message : "明細目前無法載入，請重新整理。");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [entityKey, open, reviewRequestId, returnTo, surface]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!open || !detail) return;
    const pendingPreview = Object.values(detail.projections)
      .some((projection) => projection?.level === "full" && "previews" in projection.data && projection.data.previews.some((slot) => ["queued", "running", "delayed"].includes(slot.state)));
    if (!pendingPreview) return;
    const timer = window.setInterval(() => setRefreshToken((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, [detail, open]);

  useEffect(() => {
    if (refreshToken === 0 || !open || !entityKey) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [entityKey, load, open, refreshToken]);

  const ownerHref = detail?.navigation.ownerHref ?? returnTo;
  const actions = useMemo(() => detail?.actionBar ?? null, [detail]);
  const handleAction = useCallback(async (action: PdmDetailActionDescriptor) => {
    if (action.kind === "refresh") {
      setRefreshToken((value) => value + 1);
      return;
    }
    if (!detail?.projections.review || !["approve", "reject", "return_for_correction"].includes(action.kind)) return;
    const review = detail.projections.review.data;
    const decision = action.kind === "approve" ? "approved" : action.kind === "reject" ? "rejected" : "needs_info";
    const comment = decision === "approved" ? null : window.prompt(decision === "needs_info" ? "請輸入補充資料說明" : "請輸入退回原因", "")?.trim() || null;
    if (decision !== "approved" && !comment) return;
    setActionBusy(true); setError("");
    try {
      const response = await fetch(`/api/approvals/requests/${encodeURIComponent(review.requestId)}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": `pdm-detail:${review.requestId}:${decision}:${crypto.randomUUID()}` },
        body: JSON.stringify({ decision, comment })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readError(body));
      setRefreshToken((value) => value + 1);
      router.push(detail.navigation.returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "審核操作未完成，請重新整理確認狀態。");
    } finally {
      setActionBusy(false);
    }
  }, [detail, router]);
  const header = detail?.header;
  const title = header?.entityCode ?? entityKey ?? "明細";
  const surfaceLabel = surface === "drawing" ? "圖號" : surface === "part" ? "料號" : "圖料";

  return (
    <PdmEntityDetailDrawer
      open={open}
      width={width}
      ariaLabel={`${surfaceLabel}統一明細`}
      title={title}
      subtitle={header?.displayName ?? (loading ? "正在載入明細…" : "")}
      eyebrow={header ? `${surfaceLabel} · 統一明細` : surfaceLabel}
      status={header ? <HumanStatusBadge status={header.humanStatus} viewerStatus={header.viewerStatus} availabilityScope={header.availabilityScope} /> : null}
      entityType={header?.entityKind}
      entityCode={header?.entityCode}
      sourceContext={`${surface}_workbench`}
      detailFamily={header?.stateFamily}
      keepOpenSelector={`[data-${surface}-workbench-row='true'], [data-search-row='true']`}
      onClose={onClose}
      onStartResize={onStartResize}
      footer={actions ? <div className="unified-pdm-action-bar" data-component="ContextActionBar"><div className="unified-pdm-action-primary">{actionButton({ ...actions.primary, href: actions.primary.kind === "return" ? actions.primary.href ?? ownerHref : actions.primary.href, enabled: actions.primary.enabled && !actionBusy }, handleAction)}</div><div className="unified-pdm-action-secondary">{actions.secondary.map((action) => <span key={action.id}>{actionButton({ ...action, enabled: action.enabled && !actionBusy }, handleAction)}</span>)}</div></div> : null}
    >
      <div className="pdm-entity-drawer-body unified-pdm-entity-detail-body" data-component="unified-pdm-entity-detail-drawer">
        {loading && !detail ? <div className="unified-pdm-loading" role="status">正在載入統一明細…</div> : null}
        {error ? <div className="unified-pdm-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => setRefreshToken((value) => value + 1)}>重新載入</button></div> : null}
        {detail ? <div data-component="ProjectionComposer">
          {detail.projections.drawing ? <DrawingProjection projection={detail.projections.drawing} /> : null}
          {detail.projections.part ? <PartProjection projection={detail.projections.part} /> : null}
          {detail.projections.relation ? <RelationProjection projection={detail.projections.relation} /> : null}
          {detail.projections.review ? <ReviewContextProjection data={detail.projections.review.data} /> : null}
        </div> : null}
      </div>
    </PdmEntityDetailDrawer>
  );
}
