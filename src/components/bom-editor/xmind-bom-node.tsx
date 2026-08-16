"use client";

import { memo, useEffect, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { BomDropZone } from "@/components/bom-editor/bom-editor-types";

export type XmindBomNodeData = {
  kind: "root" | "line" | "floating";
  label: string;
  subtitle: string;
  meta: string;
  selected: boolean;
  mutable: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  editing: boolean;
  dropZone: BomDropZone | null;
  onAddChild: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onCommitLabel: (id: string, label: string) => void;
  onCancelEdit: () => void;
};

export type XmindBomFlowNode = Node<XmindBomNodeData, "xmindBomNode">;

export const XmindBomNode = memo(function XmindBomNode({ id, data }: NodeProps<XmindBomFlowNode>) {
  const [value, setValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setValue(data.label), [data.label]);
  useEffect(() => {
    if (!data.editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [data.editing]);

  const commit = () => {
    const next = value.trim();
    if (next && next !== data.label) data.onCommitLabel(id, next);
    else data.onCancelEdit();
  };

  return (
    <div
      className={`xmind-bom-node ${data.kind} ${data.selected ? "selected" : ""} ${data.dropZone ? `drop-${data.dropZone}` : ""}`}
      data-editor-node-id={id}
      data-editor-node-kind={data.kind}
      aria-selected={data.selected}
    >
      {data.kind !== "root" ? <Handle type="target" position={Position.Left} isConnectable={false} /> : null}
      <div className="xmind-bom-node-content">
        {data.editing ? (
          <input
            ref={inputRef}
            className="xmind-bom-node-inline-input"
            value={value}
            aria-label="編輯主題名稱"
            onChange={(event) => setValue(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setValue(data.label);
                data.onCancelEdit();
              }
            }}
          />
        ) : (
          <strong>{data.label}</strong>
        )}
        {data.subtitle ? <span>{data.subtitle}</span> : null}
        {data.meta ? <small>{data.meta}</small> : null}
      </div>
      {data.hasChildren ? (
        <button
          className="xmind-bom-node-fold"
          type="button"
          title={data.collapsed ? "展開分支 (Ctrl+/)" : "摺疊分支 (Ctrl+/)"}
          aria-label={data.collapsed ? "展開分支" : "摺疊分支"}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggleCollapse(id);
          }}
        >
          <ChevronRight className={data.collapsed ? "" : "expanded"} aria-hidden="true" />
        </button>
      ) : null}
      {data.kind !== "floating" && data.mutable ? (
        <button
          className="xmind-bom-node-add"
          type="button"
          title="新增子主題 (Tab)"
          aria-label="新增子主題"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            data.onAddChild(id);
          }}
        >
          <Plus aria-hidden="true" />
        </button>
      ) : null}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
});
