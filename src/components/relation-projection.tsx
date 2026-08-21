"use client";

import { GitBranch } from "lucide-react";
import { RelationMatrixTable } from "@/components/relation-matrix-table";
import type { RelationProjectionFull, RelationProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";
import type { RelationMatrixCell } from "@/lib/relation-workbench";

export function RelationProjection({ projection }: { projection: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull> }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  const matrix: RelationMatrixCell[] = full?.matrix.map((cell) => ({
    drawingNumber: cell.drawingNumber,
    partNumber: cell.partNumber,
    relationType: relationTypeFromLinkType(cell.linkType)
  })) ?? [];

  return (
    <section id="relation-maintenance" className="unified-pdm-projection" data-component="RelationProjection" aria-labelledby="unified-relation-projection-title">
      <div className="unified-pdm-projection-heading"><div><h3 id="unified-relation-projection-title">圖料關聯</h3></div><span className={`unified-pdm-health is-${data.relationshipHealth}`}>{data.relationshipHealth === "complete" ? "關聯完整" : "需要處理"}</span></div>
      <div className="unified-pdm-fact-grid"><div><span>圖料根號</span><strong>{data.rootCode}</strong></div><div><span>圖面</span><strong>{data.counts.drawings} 個</strong></div><div><span>料號</span><strong>{data.counts.parts} 個</strong></div><div><span>關聯</span><strong>{data.counts.links} 筆</strong></div></div>
      {data.blockers.length > 0 ? <div className="unified-pdm-blockers" role="alert">{data.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div> : null}
      {full ? <>
        <div className="unified-pdm-subsection"><h4><GitBranch size={15} aria-hidden="true" />關聯矩陣</h4><RelationMatrixTable rootCode={data.rootCode} drawings={full.drawings.map((drawing) => ({ id: drawing.id, number: drawing.drawingNumber }))} parts={full.parts.map((part) => ({ id: part.id, number: part.partNumber }))} matrix={matrix} /></div>
      </> : null}
    </section>
  );
}

function relationTypeFromLinkType(linkType: string): RelationMatrixCell["relationType"] {
  if (linkType === "primary_manufacturing" || linkType === "manufacturing_basis") return "manufacturing_basis";
  if (linkType === "reference") return "reference";
  if (linkType === "required_missing") return "required_missing";
  if (linkType === "blocked") return "blocked";
  return "pending";
}
