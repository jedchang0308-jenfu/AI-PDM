"use client";

import { Move } from "lucide-react";

export function BomFloatingStage({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <div className="xmind-bom-floating-stage" aria-label={`Floating Topic 暫存區，共 ${count} 個主題`}>
      <Move aria-hidden="true" />
      <span>Floating Topic</span>
      <strong>{count}</strong>
      <small>拖回 BOM 樹即可正式歸位</small>
    </div>
  );
}
