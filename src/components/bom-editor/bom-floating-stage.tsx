"use client";

import { LocateFixed, Move } from "lucide-react";

export function BomFloatingStage({ count, onLocate, expanded, onToggle }: { count: number; onLocate?: () => void; expanded?: boolean; onToggle?: () => void }) {
  if (count === 0) return null;
  return (
    <div className="bom-floating-stage" aria-label={`未納入 BOM，共 ${count} 個主題`}>
      <Move aria-hidden="true" />
      <span>未納入 BOM</span>
      <strong>{count}</strong>
      {onToggle ? <button type="button" onClick={onToggle} aria-expanded={expanded}>{expanded ? "收合" : "展開"}</button> : null}
      {onLocate ? <button type="button" onClick={onLocate} aria-label="定位未納入 BOM"><LocateFixed aria-hidden="true" /></button> : null}
    </div>
  );
}
