"use client";

import { SearchHighlight } from "@/components/search-highlight";

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
};

type RelationMatrixTableProps = {
  rootCode: string;
  drawings: RelationMatrixIdentity[];
  parts: RelationMatrixIdentity[];
  matrix: RelationMatrixCell[];
  query?: string;
  onOpenDrawing?: (drawingNumber: string) => void;
  onOpenPart?: (partNumber: string) => void;
  editable?: boolean;
  onChange?: (change: { drawingNumberId: string; partNumberId: string; relationType: RelationMatrixCell["relationType"] | null }) => void;
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
  onChange
}: RelationMatrixTableProps) {
  if (drawings.length === 0 || parts.length === 0) return <div className="pdm-relation-empty-line">目前沒有可顯示的關係矩陣。</div>;

  const cellByPair = new Map(matrix.map((cell) => [`${cell.partNumber}:${cell.drawingNumber}`, cell]));
  const identity = (number: string, onOpen: (() => void) | undefined) => onOpen ? (
    <button className="pdm-relation-matrix-identity" type="button" aria-label={number} onClick={onOpen}>
      <SearchHighlight value={number} query={query} />
    </button>
  ) : (
    <span className="pdm-relation-matrix-identity"><SearchHighlight value={number} query={query} /></span>
  );

  return (
    <div className="pdm-relation-matrix-wrap" role="region" aria-label={`${rootCode} 圖料關係矩陣`} tabIndex={0} data-component="RelationMatrixTable">
      <table className="pdm-relation-matrix">
        <thead>
          <tr>
            <th className="sticky-col pdm-relation-axis-header">
              <span className="pdm-relation-axis-drawing">圖號</span>
              <span className="pdm-relation-axis-part">料號</span>
            </th>
            {drawings.map((drawing) => <th key={drawing.id}>{identity(drawing.number, onOpenDrawing ? () => onOpenDrawing(drawing.number) : undefined)}</th>)}
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id}>
              <th className="sticky-col">{identity(part.number, onOpenPart ? () => onOpenPart(part.number) : undefined)}</th>
              {drawings.map((drawing) => {
                const cell = cellByPair.get(`${part.number}:${drawing.number}`);
                const label = cellLabel(cell);
                const cellLabelText = `${part.number} 與 ${drawing.number}：${label}`;
                return <td key={drawing.id} className={`relation-${cell?.relationType ?? "none"}`} aria-label={cellLabelText}>{editable ? <button type="button" className="pdm-relation-matrix-cell-button" aria-label={`${cellLabelText}，點擊切換`} onClick={() => onChange?.({ drawingNumberId: drawing.id, partNumberId: part.id, relationType: nextRelationType(cell?.relationType) })}>{label}</button> : label}</td>;
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
