"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { PdmEntityDetailDrawer } from "@/components/pdm-entity-detail-drawer";
import { DrawingProjection } from "@/components/drawing-projection";
import { PartProjection } from "@/components/part-projection";
import { RelationProjection } from "@/components/relation-projection";
import { ReviewContextProjection } from "@/components/review-context-projection";
import { PdmDetailActionControl } from "@/components/pdm-detail-action-control";
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

export function UnifiedPdmEntityDetailDrawer({ open, entityKey, surface, reviewRequestId, width, returnTo, onClose, onStartResize }: UnifiedPdmEntityDetailDrawerProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<PdmEntityDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  }, [entityKey, reviewRequestId]);

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

  const handleAction = useCallback(async (action: PdmDetailActionDescriptor) => {
    if (!action.enabled || !action.execution) return;
    if (action.execution.type === "local" && action.execution.command === "refresh") {
      setRefreshToken((value) => value + 1);
      return;
    }
    if (action.execution.type === "local" && action.execution.command === "return") {
      onClose();
      return;
    }
    if (action.execution.type === "navigate") {
      router.push(action.execution.href);
      return;
    }
    if (action.execution.type !== "command") {
      setError("此操作需在完整工作區完成；請使用上方導覽入口。");
      return;
    }
    setError("此操作需在完整工作區完成；請使用上方導覽入口。");
  }, [onClose, router]);
  const header = detail?.header;
  const title = header?.entityCode ?? entityKey ?? "明細";
  const surfaceLabel = surface === "drawing" ? "圖號" : surface === "part" ? "料號" : "圖料";
  const actionBar = detail?.actionBar ?? null;
  const orderedActions = actionBar ? [actionBar.primary, ...actionBar.secondary]
    .filter((action): action is PdmDetailActionDescriptor => Boolean(action))
    .filter((action) => surface !== "drawing" || action.execution?.type === "navigate" || action.kind === "view_review" || (action.owner === "navigation" && action.execution?.type === "local"))
    .sort((left, right) => left.order - right.order) : [];
  return <>
    <PdmEntityDetailDrawer
      open={open}
      width={width}
      ariaLabel={`${surfaceLabel}統一明細`}
      title={title}
      subtitle={header?.displayName ?? (loading ? "正在載入明細…" : "")}
      className="unified-pdm-entity-detail-drawer"
      actions={header && !reviewRequestId ? <HumanStatusBadge status={header.humanStatus} responsibilityStatus={header.responsibilityStatus} viewerActionability={header.viewerActionability} viewerStatus={header.viewerStatus} availabilityScope={header.availabilityScope} /> : null}
      entityType={header?.entityKind}
      entityCode={header?.entityCode}
      sourceContext={`${surface}_workbench`}
      detailFamily={header?.stateFamily}
      keepOpenSelector={`[data-${surface}-workbench-row='true'], [data-search-row='true']`}
      onClose={onClose}
      onStartResize={onStartResize}
      footer={actionBar ? <div className="unified-pdm-action-bar" data-component="ContextActionBar">{orderedActions.map((action) => <PdmDetailActionControl action={action} onAction={handleAction} key={action.id} />)}</div> : null}
    >
      <div className="pdm-entity-drawer-body unified-pdm-entity-detail-body" data-component="unified-pdm-entity-detail-drawer">
        {loading && !detail ? <div className="unified-pdm-loading" role="status">正在載入統一明細…</div> : null}
        {error ? <div className="unified-pdm-error" role="alert"><span>{error}</span><button className="secondary-button" type="button" onClick={() => setRefreshToken((value) => value + 1)}>重新載入</button></div> : null}
        {detail ? <div data-component="ProjectionComposer">
          {detail.projections.drawing ? <DrawingProjection projection={detail.projections.drawing} returnTo={returnTo} showStatusBadge={!reviewRequestId} showPreviewHeader={false} showMaintenancePanel={false} /> : null}
          {detail.projections.part ? <PartProjection projection={detail.projections.part} showStatusBadge={!reviewRequestId} /> : null}
          {detail.projections.relation ? <RelationProjection projection={detail.projections.relation} /> : null}
          {detail.projections.review ? <ReviewContextProjection data={detail.projections.review.data} /> : null}
        </div> : null}
      </div>
    </PdmEntityDetailDrawer>
  </>;
}
