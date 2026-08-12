"use client";

import { GitBranch } from "lucide-react";
import type { RelationProjectionFull, RelationProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";

export function RelationProjection({ projection }: { projection: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull> }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  return (
    <section className="unified-pdm-projection" data-component="RelationProjection" aria-labelledby="unified-relation-projection-title">
      <div className="unified-pdm-projection-heading"><div><span className="unified-pdm-section-kicker">RelationProjection</span><h3 id="unified-relation-projection-title">圖料關聯</h3></div><span className={`unified-pdm-health is-${data.relationshipHealth}`}>{data.relationshipHealth === "complete" ? "關聯完整" : "需要處理"}</span></div>
      <div className="unified-pdm-fact-grid"><div><span>主根</span><strong>{data.rootCode}</strong></div><div><span>圖面</span><strong>{data.counts.drawings} 個</strong></div><div><span>料號</span><strong>{data.counts.parts} 個</strong></div><div><span>關聯</span><strong>{data.counts.links} 筆</strong></div></div>
      {data.blockers.length > 0 ? <div className="unified-pdm-blockers" role="alert">{data.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div> : null}
      {full ? <div className="unified-pdm-subsection"><h4><GitBranch size={15} aria-hidden="true" />關聯矩陣</h4><ul>{full.matrix.map((cell, index) => <li key={`${cell.drawingNumber}:${cell.partNumber}:${index}`}>{cell.drawingNumber} ↔ {cell.partNumber} · {cell.linkType}</li>)}</ul></div> : null}
    </section>
  );
}
