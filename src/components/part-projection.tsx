"use client";

import { Link2, Package } from "lucide-react";
import { HumanStatusBadge } from "@/components/human-status-badge";
import type { PartProjectionFull, PartProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";

export function PartProjection({ projection }: { projection: PdmProjectionEnvelope<PartProjectionSummary, PartProjectionFull> }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  return (
    <section className="unified-pdm-projection" data-component="PartProjection" aria-labelledby="unified-part-projection-title">
      <div className="unified-pdm-projection-heading">
        <div><span className="unified-pdm-section-kicker">PartProjection</span><h3 id="unified-part-projection-title">料號資料</h3></div>
        <HumanStatusBadge status={data.humanStatus} viewerStatus={data.viewerStatus} availabilityScope={data.availabilityScope} />
      </div>
      <div className="unified-pdm-fact-grid">
        <div><span>料號</span><strong>{data.partNumber}</strong></div>
        <div><span>主根</span><strong>{data.rootCode || "尚未指定"}</strong></div>
        <div><span>品項類型</span><strong>{data.itemKind || "尚未指定"}</strong></div>
        <div><span>關聯圖面</span><strong>{data.linkedDrawingCount} 個</strong></div>
      </div>
      {full ? <>
        <div className="unified-pdm-subsection"><h4><Package size={15} aria-hidden="true" />料號屬性</h4><p>自訂規格：{full.attributes.customSpecification ?? "未填寫"}；系列：{full.attributes.seriesCode ?? "未指定"}</p></div>
        <div className="unified-pdm-subsection"><h4><Link2 size={15} aria-hidden="true" />關聯圖面</h4>{full.linkedDrawings.length > 0 ? <ul>{full.linkedDrawings.map((drawing) => <li key={drawing.id}>{drawing.drawingNumber} · {drawing.linkType}</li>)}</ul> : <p>目前尚無關聯圖面。</p>}</div>
      </> : null}
    </section>
  );
}
