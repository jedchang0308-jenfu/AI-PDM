"use client";

import type { RelationMatrixCell } from "@/lib/relation-workbench";
import { SearchHighlight } from "@/components/search-highlight";

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
};

export function RelationMatrixTable({
  rootCode,
  drawings,
  parts,
  matrix,
  query = "",
  onOpenDrawing,
  onOpenPart
}: RelationMatrixTableProps) {
  if (drawings.length === 0 || parts.length === 0) return <div className="pdm-relation-empty-line">目前沒有可顯示的關係矩陣。</div>;

  const cellByPair = new Map(matrix.map((cell) => [`${cell.partNumber}:${cell.drawingNumber}`, cell]));
  const identity = (number: string, onOpen: (() => void) | undefined) => onOpen ? (
    <button className="pdm-relation-matrix-identity" type="button" onClick={onOpen}>
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
            <th className="sticky-col">料號＼圖號</th>
            {drawings.map((drawing) => <th key={drawing.id}>{identity(drawing.number, onOpenDrawing ? () => onOpenDrawing(drawing.number) : undefined)}</th>)}
          </tr>
        </thead>
        <tbody>
          {parts.map((part) => (
            <tr key={part.id}>
              <th className="sticky-col">{identity(part.number, onOpenPart ? () => onOpenPart(part.number) : undefined)}</th>
              {drawings.map((drawing) => {
                const cell = cellByPair.get(`${part.number}:${drawing.number}`);
                return <td key={drawing.id}><span className={`pdm-relation-cell is-${cell?.relationType ?? "not_applicable"}`}>{cellLabel(cell)}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellLabel(cell: RelationMatrixCell | undefined) {
  if (!cell || cell.relationType === "not_applicable") return "—";
  if (cell.relationType === "manufacturing_basis") return "製造";
  if (cell.relationType === "reference") return "參考";
  if (cell.relationType === "required_missing") return "缺必要";
  if (cell.relationType === "blocked") return "阻擋";
  return "待判定";
}
