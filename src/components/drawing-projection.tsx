"use client";

import { Link2 } from "lucide-react";
import { DrawingDetailPreview, type DrawingDetailPreviewCard } from "@/components/drawing-detail-preview";
import { CandidateDrawingFileUpload } from "@/components/candidate-drawing-file-upload";
import { HumanStatusBadge } from "@/components/human-status-badge";
import { MasterAttachmentPanel } from "@/components/master-attachment-panel";
import type { DrawingProjectionFull, DrawingProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";
import { isManufacturingDrawingPurpose } from "@/lib/numbering-identity";

function drawingAttachmentRoleLabel(role: string | null) {
  return ({
    cad_3d: "3D 模型",
    drawing_2d: "2D 圖面",
    pdf: "PDF",
    dwg_dxf: "DWG／DXF",
    intermediate: "中間檔",
    other: "附件"
  } as Record<string, string>)[role ?? ""] ?? "附件";
}

export function DrawingProjection({ projection, returnTo = "/numbering/drawings", showStatusBadge = true, showPreviewHeader = true, showMaintenancePanel = false, onMaintenanceChanged }: { projection: PdmProjectionEnvelope<DrawingProjectionSummary, DrawingProjectionFull>; returnTo?: string; showStatusBadge?: boolean; showPreviewHeader?: boolean; showMaintenancePanel?: boolean; onMaintenanceChanged?: () => void }) {
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
  const historicalRevisionHref = (revision: string) => {
    const params = new URLSearchParams({ drawingNumber: data.drawingNumber ?? "", revision, source: "historical_backfill" });
    if (returnTo.startsWith("/") && !returnTo.startsWith("//")) params.set("returnTo", returnTo);
    return `/numbering/revisions?${params.toString()}`;
  };
  return (
    <section id="drawing-data-maintenance" className="unified-pdm-projection" data-component="DrawingProjection" aria-labelledby="unified-drawing-projection-title">
      <div className="unified-pdm-projection-heading">
        <div><h3 id="unified-drawing-projection-title">圖面資料</h3></div>
        {showStatusBadge ? <HumanStatusBadge status={data.humanStatus} viewerStatus={data.viewerStatus} availabilityScope={data.availabilityScope} /> : null}
      </div>
      <div className="unified-pdm-fact-grid">
        <div><span>圖號</span><strong>{data.drawingNumber ?? data.displayName}</strong></div>
        <div><span>用途</span><strong>{data.purposeLabel ?? data.purposeCode ?? "尚未指定"}</strong></div>
        <div><span>關聯料號</span><strong>{data.linkedPartCount} 個</strong></div>
      </div>
      {full ? <>
        <DrawingDetailPreview cards={previewCards} title="自動預覽" meta={`${previewCards.filter((preview) => preview.fileName).length} 類`} dataSection="unified-drawing-preview" showHeader={showPreviewHeader} />
        <div id="drawing-controlled-attachments" className="unified-pdm-subsection">
          <h4>版本與附件</h4>
          {showMaintenancePanel && (full.maintenanceTarget?.kind === "candidate_revision" || full.maintenanceTarget?.kind === "candidate_revision_pending") ? (
            <CandidateDrawingFileUpload target={full.maintenanceTarget} attachments={full.attachments} onUploaded={onMaintenanceChanged} />
          ) : showMaintenancePanel && full.maintenanceTarget?.kind === "formal_drawing" ? (
            <MasterAttachmentPanel
              compact
              entityType="drawing_number"
              entityCode={full.maintenanceTarget.drawingNumber}
              processControlled={isManufacturingDrawingPurpose(data.purposeCode ?? "")}
              authorityMode="controlled_summary"
              allowControlledUpload
              hidePreview
            />
          ) : <>
            <p>目前版次：{full.currentRevision.revision ?? "尚未建立"}；附件 {full.attachments.length} 件。</p>
            {full.attachments.length > 0 ? (
              <ul className="unified-pdm-attachment-list" aria-label="本版受控附件">
                {full.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <div>
                      <strong>{attachment.displayName}</strong>
                      <span>{drawingAttachmentRoleLabel(attachment.role)}</span>
                    </div>
                    {attachment.href ? <a className="secondary-button" href={attachment.href} target="_blank" rel="noreferrer">查看</a> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>}
        </div>
        {full.revisionHistory.length > 0 ? (
          <details className="unified-pdm-history-disclosure">
            <summary>歷史版次 <span>{full.revisionHistory.length} 個</span></summary>
            <div className="unified-pdm-history-list">
              <p className="unified-pdm-history-hint">歷史版次平時收合；如需補檔，選擇對應版次進入補登流程。</p>
              {full.revisionHistory.map((history) => (
                <div className="unified-pdm-history-row" key={history.revision}>
                  <div>
                    <strong>版次 {history.revision}</strong>
                    <span>{history.fileCount} 個附件{history.updatedAt ? ` · 更新於 ${history.updatedAt.slice(0, 10)}` : ""}</span>
                  </div>
                  <a className="secondary-button" href={historicalRevisionHref(history.revision)}>補登檔案</a>
                </div>
              ))}
            </div>
          </details>
        ) : null}
        <div className="unified-pdm-subsection"><h4>關聯料號</h4>{full.linkedParts.length > 0 ? <ul>{full.linkedParts.map((part) => <li key={part.id}><Link2 size={14} aria-hidden="true" />{part.partNumber} · {part.partName}</li>)}</ul> : <p>目前尚無關聯料號。</p>}</div>
      </> : null}
    </section>
  );
}
