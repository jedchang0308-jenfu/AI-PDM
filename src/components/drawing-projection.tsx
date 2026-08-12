"use client";

import { Link2 } from "lucide-react";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import { HumanStatusBadge } from "@/components/human-status-badge";
import type { DrawingProjectionFull, DrawingProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";

export function DrawingProjection({ projection }: { projection: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull> }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  const previewCards: DrawingDetailPreviewCard[] = full ? full.previews.map((preview) => ({
    kind: preview.kind,
    title: preview.title,
    fileName: preview.fileName,
    state: preview.state === "queued" || preview.state === "running" ? "pending" : preview.state,
    stateTitle: preview.stateTitle,
    stateText: preview.stateText,
    media: preview.state === "ready" && preview.mediaHref ? {
      href: preview.mediaHref,
      mode: preview.kind === "three-d" ? "image" : "document",
      title: preview.title,
      alt: preview.fileName ?? preview.title
    } : undefined
  })) : [];
  return (
    <section className="unified-pdm-projection" data-component="DrawingProjection" aria-labelledby="unified-drawing-projection-title">
      <div className="unified-pdm-projection-heading">
        <div><span className="unified-pdm-section-kicker">DrawingProjection</span><h3 id="unified-drawing-projection-title">圖面資料</h3></div>
        <HumanStatusBadge status={data.humanStatus} viewerStatus={data.viewerStatus} availabilityScope={data.availabilityScope} />
      </div>
      <div className="unified-pdm-fact-grid">
        <div><span>圖號</span><strong>{data.drawingNumber ?? data.displayName}</strong></div>
        <div><span>用途</span><strong>{data.purposeLabel ?? data.purposeCode ?? "尚未指定"}</strong></div>
        <div><span>關聯料號</span><strong>{data.linkedPartCount} 個</strong></div>
        <div><span>預覽狀態</span><strong>{data.representativePreview.stateTitle}</strong></div>
      </div>
      {full ? <>
        <DrawingDetailPreview cards={previewCards} title="自動預覽" meta={`${previewCards.filter((preview) => preview.fileName).length} 類`} dataSection="unified-drawing-preview" />
        <div className="unified-pdm-subsection"><h4>版本與附件</h4><p>目前版次：{full.currentRevision.revision ?? "尚未建立"}；附件 {full.attachments.length} 件。</p></div>
        <div className="unified-pdm-subsection"><h4>關聯料號</h4>{full.linkedParts.length > 0 ? <ul>{full.linkedParts.map((part) => <li key={part.id}><Link2 size={14} aria-hidden="true" />{part.partNumber} · {part.partName}</li>)}</ul> : <p>目前尚無關聯料號。</p>}</div>
      </> : null}
    </section>
  );
}
