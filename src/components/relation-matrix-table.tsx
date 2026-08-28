"use client";

import { useEffect, useRef } from "react";
import { SearchHighlight } from "@/components/search-highlight";
import { ReviewTargetMarkerSlots } from "@/components/review-target-marker-slots";
import type { ReviewPackageMarkerFacts } from "@/lib/pdm-review-package-contract";

export type RelationMatrixCell = {
  drawingNumberId?: string;
  partNumberId?: string;
  drawingNumber: string;
  partNumber: string;
  relationType: "manufacturing_basis" | "reference" | null;
};

export type RelationMatrixIdentity = {
  id: string;
  number: string;
  detailHref: string | null;
  targetId?: string;
  markers?: ReviewPackageMarkerFacts;
};

type RelationMatrixTableProps = {
  rootCode: string;
  drawings: RelationMatrixIdentity[];
  parts: RelationMatrixIdentity[];
  matrix: RelationMatrixCell[];
  query?: string;
  onOpenDrawing?: (detailHref: string) => void;
  onOpenPart?: (detailHref: string) => void;
  editable?: boolean;
  onChange?: (change: { drawingNumberId: string; partNumberId: string; relationType: RelationMatrixCell["relationType"] | null }) => void;
  activeTarget?: { entityType: "drawing" | "part"; targetId: string };
  onSelectDrawing?: (targetId: string) => void;
  onSelectPart?: (targetId: string) => void;
  showVisualMarkers?: boolean;
};

export function RelationMatrixTable({
  rootCode,
  drawings,
  parts,
  matrix,
  query = "",
  onOpenDrawing,
  onOpenPart,
  editable = false,
  onChange,
  activeTarget,
  onSelectDrawing,
  onSelectPart,
  showVisualMarkers = false
}: RelationMatrixTableProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = wrapRef.current?.querySelector<HTMLElement>(".pdm-relation-matrix-identity[aria-current='true']");
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTarget?.entityType, activeTarget?.targetId]);

  const cellByPair = new Map(matrix.map((cell) => [`${cell.partNumber}:${cell.drawingNumber}`, cell]));
  const identity = (item: RelationMatrixIdentity, onOpen: (() => void) | undefined, active = false) => <span className="pdm-relation-matrix-identity-wrap">
    {onOpen ? <button className={`pdm-relation-matrix-identity${active ? " is-active" : ""}`} type="button" aria-label={item.number} aria-current={active ? "true" : undefined} onClick={onOpen}><SearchHighlight value={item.number} query={query} /></button>
      : <span className="pdm-relation-matrix-identity"><SearchHighlight value={item.number} query={query} /></span>}
    {item.targetId && item.markers ? <ReviewTargetMarkerSlots targetKey={item.targetId} facts={item.markers} /> : null}
  </span>;

  if (drawings.length === 0 || parts.length === 0) {
    const singleAxis = drawings.length > 0 ? drawings : parts;
    const entityType = drawings.length > 0 ? "drawing" : "part";
    const onSelect = entityType === "drawing" ? onSelectDrawing : onSelectPart;
    if (!showVisualMarkers || singleAxis.length === 0) return <div className="pdm-relation-empty-line">目前沒有可顯示的關係矩陣。</div>;
    return <div ref={wrapRef} className="pdm-relation-matrix-wrap pdm-relation-single-axis" role="region" aria-label={`${rootCode} 圖料關係矩陣`} tabIndex={0} data-component="RelationMatrixTable">
      {singleAxis.map((item) => identity(item, item.targetId && onSelect ? () => onSelect(item.targetId!) : undefined, activeTarget?.entityType === entityType && activeTarget.targetId === item.targetId))}
    </div>;
  }

  return (
    <div ref={wrapRef} className="pdm-relation-matrix-wrap" role="region" aria-label={`${rootCode} 圖料關係矩陣`} tabIndex={0} data-component="RelationMatrixTable">
      <table className="pdm-relation-matrix">
        <thead>
          <tr>
            <th className="sticky-col pdm-relation-axis-header">
              <span className="pdm-relation-axis-drawing">圖號</span>
              <span className="pdm-relation-axis-part">料號</span>
            </th>
            {drawings.map((drawing) => <th key={drawing.id}>{identity(drawing, onOpenDrawing && drawing.detailHref ? () => onOpenDrawing(drawing.detailHref!) : drawing.targetId && onSelectDrawing ? () => onSelectDrawing(drawing.targetId!) : undefined, activeTarget?.entityType === "drawing" && activeTarget.targetId === drawing.targetId)}</th>)}
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id}>
              <th className="sticky-col">{identity(part, onOpenPart && part.detailHref ? () => onOpenPart(part.detailHref!) : part.targetId && onSelectPart ? () => onSelectPart(part.targetId!) : undefined, activeTarget?.entityType === "part" && activeTarget.targetId === part.targetId)}</th>
              {drawings.map((drawing) => {
                const cell = cellByPair.get(`${part.number}:${drawing.number}`);
                const label = cellLabel(cell);
                const cellLabelText = `${part.number} 與 ${drawing.number}：${label}`;
                const visual = showVisualMarkers ? <span className={`pdm-relation-matrix-marker is-${cell?.relationType ?? "none"}`} title={cellLabelText} aria-hidden="true" /> : label;
                return <td key={drawing.id} className={`relation-${cell?.relationType ?? "none"}`} aria-label={cellLabelText}>{editable ? <button type="button" className="pdm-relation-matrix-cell-button" aria-label={`${cellLabelText}，點擊切換`} onClick={() => onChange?.({ drawingNumberId: drawing.id, partNumberId: part.id, relationType: nextRelationType(cell?.relationType) })}>{visual}</button> : visual}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellLabel(cell: RelationMatrixCell | undefined) {
  if (!cell) return "—";
  if (cell.relationType === "manufacturing_basis") return "製造";
  return "參考";
}

function nextRelationType(value: RelationMatrixCell["relationType"] | undefined): RelationMatrixCell["relationType"] | null {
  if (!value) return "manufacturing_basis";
  if (value === "manufacturing_basis") return "reference";
  return null;
}
