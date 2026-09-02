"use client";

import { ChevronRight, CircleDot, Package } from "lucide-react";
import { BOM_EDITOR_ROOT_ID, type BomEditorFloatingTopic, type BomEditorLine } from "@/components/bom-editor/bom-editor-types";

type OutlinerProps = {
  rootLabel: string;
  lines: BomEditorLine[];
  floatingTopics: BomEditorFloatingTopic[];
  selectedId: string | null;
  collapsedIds: string[];
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (id: string) => void;
  onAddChild?: (id: string) => void;
};

export function BomOutliner(props: OutlinerProps) {
  const formalRows = buildRows(props.lines, "parent_line_id", props.collapsedIds);
  const floatingRows = buildRows(props.floatingTopics, "parent_floating_topic_id", props.collapsedIds);
  return (
    <div className="bom-outliner" role="tree" aria-label="BOM 階層表">
      <button className="bom-outliner-row root" type="button" role="treeitem" aria-level={1} aria-selected={props.selectedId === BOM_EDITOR_ROOT_ID} onClick={() => props.onSelect(BOM_EDITOR_ROOT_ID)}>
        <CircleDot aria-hidden="true" />
        <strong>{props.rootLabel}</strong>
      </button>
      {formalRows.map(({ node, depth, hasChildren }) => (
        <OutlinerRow
          key={node.id}
          id={node.id}
          depth={depth + 1}
          label={node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件"}
          subtitle={node.node_type === "item" ? node.part_name ?? "" : "群組"}
          selected={props.selectedId === node.id}
          collapsed={props.collapsedIds.includes(node.id)}
          hasChildren={hasChildren}
          floating={false}
          onSelect={props.onSelect}
          onToggleCollapse={props.onToggleCollapse}
          onEdit={props.onEdit}
          onAddChild={props.onAddChild}
        />
      ))}
      {floatingRows.length > 0 ? <div className="bom-outliner-section">未納入 BOM</div> : null}
      {floatingRows.map(({ node, depth, hasChildren }) => (
        <OutlinerRow
          key={node.id}
          id={node.id}
          depth={depth + 1}
          label={node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件"}
          subtitle={node.node_type === "item" ? node.part_name ?? "" : "群組"}
          selected={props.selectedId === node.id}
          collapsed={props.collapsedIds.includes(node.id)}
          hasChildren={hasChildren}
          floating
          onSelect={props.onSelect}
          onToggleCollapse={props.onToggleCollapse}
          onEdit={props.onEdit}
          onAddChild={props.onAddChild}
        />
      ))}
    </div>
  );
}

function OutlinerRow(props: {
  id: string;
  depth: number;
  label: string;
  subtitle: string;
  selected: boolean;
  collapsed: boolean;
  hasChildren: boolean;
  floating: boolean;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEdit: (id: string) => void;
  onAddChild?: (id: string) => void;
}) {
  return (
    <div
      className={`bom-outliner-row ${props.selected ? "selected" : ""} ${props.floating ? "floating" : ""}`}
      role="treeitem"
      aria-level={props.depth + 1}
      aria-selected={props.selected}
      style={{ paddingInlineStart: 12 + props.depth * 22 }}
      onDoubleClick={() => props.onEdit(props.id)}
    >
      {props.hasChildren ? (
        <button type="button" aria-label={props.collapsed ? "展開" : "摺疊"} onClick={() => props.onToggleCollapse(props.id)}>
          <ChevronRight className={props.collapsed ? "" : "expanded"} aria-hidden="true" />
        </button>
      ) : <span className="bom-outliner-indent" aria-hidden="true" />}
      <button type="button" onClick={() => props.onSelect(props.id)}>
        <Package aria-hidden="true" />
        <span><strong>{props.label}</strong>{props.subtitle ? <small>{props.subtitle}</small> : null}</span>
      </button>
      {props.onAddChild && !props.floating ? <button type="button" className="bom-outliner-add" aria-label={`在${props.label}下新增`} onClick={() => props.onAddChild?.(props.id)}>＋</button> : null}
    </div>
  );
}

function buildRows<T extends { id: string }>(
  nodes: T[],
  parentKey: "parent_line_id" | "parent_floating_topic_id",
  collapsedIds: string[]
) {
  const children = new Map<string, T[]>();
  for (const node of nodes) {
    const parent = ((node as T & Record<typeof parentKey, string | null>)[parentKey] ?? "__root__") as string;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const rows: Array<{ node: T; depth: number; hasChildren: boolean }> = [];
  const visit = (parent: string, depth: number) => {
    const siblings = (children.get(parent) ?? []).sort((a, b) => Number((a as T & { sequence_no?: number }).sequence_no ?? 0) - Number((b as T & { sequence_no?: number }).sequence_no ?? 0));
    for (const node of siblings) {
      rows.push({ node, depth, hasChildren: (children.get(node.id)?.length ?? 0) > 0 });
      if (!collapsedIds.includes(node.id)) visit(node.id, depth + 1);
    }
  };
  visit("__root__", 0);
  return rows;
}
