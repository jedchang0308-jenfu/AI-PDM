"use client";

import { useEffect, useState } from "react";
import { GitBranch, Link2 } from "lucide-react";
import { RelationMatrixTable } from "@/components/relation-matrix-table";
import type { RelationProjectionFull, RelationProjectionSummary, PdmProjectionEnvelope } from "@/lib/pdm-entity-detail-contract";
import type { RelationMatrixCell } from "@/lib/relation-workbench";

type RelationMaintenanceOperation = "link" | "set_primary" | "set_reference" | "remove";

export function RelationProjection({ projection, showMaintenancePanel = false, onRelationChange }: { projection: PdmProjectionEnvelope<RelationProjectionSummary, RelationProjectionFull>; showMaintenancePanel?: boolean; onRelationChange?: (input: { operation: RelationMaintenanceOperation; drawingNumber: string; partNumber: string }) => Promise<void> }) {
  const data = projection.data;
  const full = projection.level === "full" ? projection.data : null;
  const [drawingNumber, setDrawingNumber] = useState(full?.drawings[0]?.drawingNumber ?? "");
  const [partNumber, setPartNumber] = useState(full?.parts[0]?.partNumber ?? "");
  const [workingOperation, setWorkingOperation] = useState<RelationMaintenanceOperation | null>(null);
  const [message, setMessage] = useState("");
  const [maintenanceError, setMaintenanceError] = useState(false);
  const matrix: RelationMatrixCell[] = full?.matrix.map((cell) => ({
    drawingNumber: cell.drawingNumber,
    partNumber: cell.partNumber,
    relationType: relationTypeFromLinkType(cell.linkType)
  })) ?? [];

  useEffect(() => {
    if (!full) return;
    setDrawingNumber((current) => full.drawings.some((drawing) => drawing.drawingNumber === current) ? current : full.drawings[0]?.drawingNumber ?? "");
    setPartNumber((current) => full.parts.some((part) => part.partNumber === current) ? current : full.parts[0]?.partNumber ?? "");
    setMessage("");
    setMaintenanceError(false);
  }, [full]);

  const selectedDrawing = full?.drawings.find((drawing) => drawing.drawingNumber === drawingNumber) ?? null;
  const selectedPart = full?.parts.find((part) => part.partNumber === partNumber) ?? null;
  const existingLinks = full?.links.filter((link) => link.drawingNumber === drawingNumber && link.partNumber === partNumber) ?? [];
  const locked = [selectedDrawing?.recordStatus, selectedPart?.recordStatus].some((status) => ["PendingReview", "Released", "Obsolete", "Merged"].includes(status ?? ""));

  async function submit(operation: RelationMaintenanceOperation) {
    if (!onRelationChange || !selectedDrawing || !selectedPart || workingOperation) return;
    setWorkingOperation(operation);
    setMessage("");
    setMaintenanceError(false);
    try {
      await onRelationChange({ operation, drawingNumber: selectedDrawing.drawingNumber, partNumber: selectedPart.partNumber });
      setMessage(operation === "set_primary" ? `${selectedDrawing.drawingNumber} 已設為此圖料根號的唯一主要製造圖。` : "圖料關聯已更新。");
    } catch (caught) {
      setMaintenanceError(true);
      setMessage(caught instanceof Error ? caught.message : "圖料關聯尚未更新，請重新整理後再試。");
    } finally {
      setWorkingOperation(null);
    }
  }

  return (
    <section id="relation-maintenance" className="unified-pdm-projection" data-component="RelationProjection" aria-labelledby="unified-relation-projection-title">
      <div className="unified-pdm-projection-heading"><div><h3 id="unified-relation-projection-title">圖料關聯</h3></div><span className={`unified-pdm-health is-${data.relationshipHealth}`}>{data.relationshipHealth === "complete" ? "關聯完整" : "需要處理"}</span></div>
      <div className="unified-pdm-fact-grid"><div><span>圖料根號</span><strong>{data.rootCode}</strong></div><div><span>圖面</span><strong>{data.counts.drawings} 個</strong></div><div><span>料號</span><strong>{data.counts.parts} 個</strong></div><div><span>關聯</span><strong>{data.counts.links} 筆</strong></div></div>
      {data.blockers.length > 0 ? <div className="unified-pdm-blockers" role="alert">{data.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div> : null}
      {full ? <>
        {showMaintenancePanel && onRelationChange && selectedDrawing && selectedPart ? (
          <div className="unified-pdm-subsection">
            <h4><Link2 size={15} aria-hidden="true" />關聯維護</h4>
            <div className="pdm-relation-maintenance-grid">
              <label><span>圖號</span><select value={drawingNumber} disabled={Boolean(workingOperation)} onChange={(event) => { setDrawingNumber(event.target.value); setMessage(""); }}>{full.drawings.map((drawing) => <option value={drawing.drawingNumber} key={drawing.id}>{drawing.drawingNumber} / {drawing.purposeCode}</option>)}</select></label>
              <label><span>料號</span><select value={partNumber} disabled={Boolean(workingOperation)} onChange={(event) => { setPartNumber(event.target.value); setMessage(""); }}>{full.parts.map((part) => <option value={part.partNumber} key={part.id}>{part.partNumber} / {part.partName}</option>)}</select></label>
            </div>
            <p>目前關係：{existingLinks.length > 0 ? existingLinks.map((link) => link.linkType === "primary_manufacturing" ? "製造依據" : "參考").join("、") : "尚未關聯"}</p>
            <div className="unified-pdm-relation-actions">
              <button className="secondary-button" type="button" disabled={locked || Boolean(workingOperation)} onClick={() => void submit("link")}><Link2 size={15} aria-hidden="true" />建立／更新</button>
              <button className="primary-button" type="button" disabled={locked || Boolean(workingOperation) || !["M", "MA"].includes(selectedDrawing.purposeCode)} onClick={() => void submit("set_primary")}>設為主要製造圖</button>
              <button className="secondary-button" type="button" disabled={locked || Boolean(workingOperation)} onClick={() => void submit("set_reference")}>設為參考</button>
              <button className="danger-button" type="button" disabled={locked || Boolean(workingOperation) || existingLinks.length === 0} onClick={() => void submit("remove")}>移除關聯</button>
            </div>
            {message ? <div className={`pdm-relation-maintenance-message${maintenanceError ? " error" : ""}`} role={maintenanceError ? "alert" : "status"}>{message}</div> : null}
          </div>
        ) : null}
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
