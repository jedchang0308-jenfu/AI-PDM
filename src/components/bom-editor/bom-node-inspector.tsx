"use client";

import { useEffect, useState } from "react";
import type { BomEditorFloatingTopic, BomEditorLine } from "@/components/bom-editor/bom-editor-types";

type EditorNode = BomEditorLine | BomEditorFloatingTopic;

export function BomNodeInspector({ node, mutable, showLegacyRevision = true, onCommit }: { node: EditorNode | null; mutable: boolean; showLegacyRevision?: boolean; onCommit: (patch: { groupName?: string; quantity?: number }) => void }) {
  const [groupName, setGroupName] = useState("");
  const [quantity, setQuantity] = useState("1");
  useEffect(() => {
    setGroupName(node?.group_name ?? "");
    setQuantity(String(node?.quantity ?? 1));
  }, [node]);

  if (!node) {
    return <aside className="xmind-bom-inspector"><div className="xmind-bom-inspector-empty">選取主題以查看詳細資料</div></aside>;
  }
  const commitGroupName = () => {
    const next = groupName.trim();
    if (next && next !== node.group_name) onCommit({ groupName: next });
  };
  const commitQuantity = () => {
    const next = Number(quantity);
    if (Number.isFinite(next) && next > 0 && next !== node.quantity) onCommit({ quantity: next });
  };
  return (
    <aside className="xmind-bom-inspector" aria-label="主題詳細資料">
      <header><h2>詳細資料</h2><span>{node.node_type === "group" ? "群組" : "料件"}</span></header>
      <div className="xmind-bom-inspector-body">
        {node.node_type === "group" ? (
          <label><span>群組名稱</span><input value={groupName} disabled={!mutable} onChange={(event) => setGroupName(event.target.value)} onBlur={commitGroupName} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
        ) : (
          <>
            <label><span>料號</span><input value={node.part_number ?? ""} readOnly /></label>
            <label><span>品名</span><input value={node.part_name ?? ""} readOnly /></label>
            {showLegacyRevision ? <label><span>來源 Drawing Rev</span><input value={node.revision ?? ""} readOnly /></label> : null}
            <label><span>數量</span><input type="number" min="0.001" step="0.001" value={quantity} disabled={!mutable} onChange={(event) => setQuantity(event.target.value)} onBlur={commitQuantity} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} /></label>
          </>
        )}
      </div>
    </aside>
  );
}
