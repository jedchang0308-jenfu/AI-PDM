"use client";

import { ChevronRight, CircleDot, LocateFixed, Package } from "lucide-react";
import { BOM_EDITOR_ROOT_ID, type BomEditorFloatingTopic, type BomEditorLine } from "@/components/bom-editor/bom-editor-types";

type BomMapViewProps = {
  rootLabel: string;
  lines: BomEditorLine[];
  floatingTopics: BomEditorFloatingTopic[];
  selectedId: string | null;
  collapsedIds: string[];
  focusBranchId: string | null;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onLocateFloating?: () => void;
};

export function BomMapView(props: BomMapViewProps) {
  const formal = buildRows(props.lines, "parent_line_id", props.collapsedIds, props.focusBranchId);
  const floating = buildRows(props.floatingTopics, "parent_floating_topic_id", props.collapsedIds, null);
  return (
    <div className="bom-map-view" role="tree" aria-label="BOM 關聯圖" data-testid="bom-map-view">
      <div className="bom-map-root" role="treeitem" aria-level={1} aria-selected={props.selectedId === BOM_EDITOR_ROOT_ID}>
        <CircleDot aria-hidden="true" />
        <strong>{props.rootLabel}</strong>
      </div>
      <div className="bom-map-rows">
        {formal.map((row) => <MapRow key={row.node.id} row={row} selectedId={props.selectedId} collapsedIds={props.collapsedIds} onSelect={props.onSelect} onToggleCollapse={props.onToggleCollapse} />)}
        {floating.length > 0 ? <div className="bom-map-section" role="presentation"><span>未納入 BOM</span>{props.onLocateFloating ? <button type="button" onClick={props.onLocateFloating}><LocateFixed aria-hidden="true" />定位</button> : null}</div> : null}
        {floating.map((row) => <MapRow key={row.node.id} row={row} selectedId={props.selectedId} collapsedIds={props.collapsedIds} onSelect={props.onSelect} onToggleCollapse={props.onToggleCollapse} floating />)}
      </div>
    </div>
  );
}

function MapRow({ row, selectedId, collapsedIds, onSelect, onToggleCollapse, floating = false }: {
  row: { node: BomEditorLine | BomEditorFloatingTopic; depth: number; hasChildren: boolean };
  selectedId: string | null;
  collapsedIds: string[];
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  floating?: boolean;
}) {
  const node = row.node;
  const label = node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件";
  const subtitle = node.node_type === "group" ? "群組" : node.part_name ?? "";
  return (
    <div className={`bom-map-row ${selectedId === node.id ? "selected" : ""} ${floating ? "floating" : ""}`} role="treeitem" aria-level={row.depth + 1} aria-selected={selectedId === node.id} style={{ marginInlineStart: row.depth * 28 }}>
      {row.hasChildren ? <button type="button" aria-label={collapsedIds.includes(node.id) ? "展開" : "摺疊"} onClick={() => onToggleCollapse(node.id)}><ChevronRight className={collapsedIds.includes(node.id) ? "" : "expanded"} aria-hidden="true" /></button> : <span className="bom-map-indent" aria-hidden="true" />}
      <button type="button" className="bom-map-node" onClick={() => onSelect(node.id)}>
        <Package aria-hidden="true" />
        <span><strong>{label}</strong><small>{subtitle}</small></span>
      </button>
    </div>
  );
}

function buildRows<T extends { id: string; sequence_no: number }>(nodes: T[], parentKey: "parent_line_id" | "parent_floating_topic_id", collapsedIds: string[], focusId: string | null) {
  const children = new Map<string, T[]>();
  for (const node of nodes) {
    const parent = ((node as T & Record<string, string | null>)[parentKey] ?? "__root__") as string;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  const rows: Array<{ node: T; depth: number; hasChildren: boolean }> = [];
  const visit = (parent: string, depth: number) => {
    for (const node of [...(children.get(parent) ?? [])].sort((a, b) => a.sequence_no - b.sequence_no)) {
      rows.push({ node, depth, hasChildren: (children.get(node.id)?.length ?? 0) > 0 });
      if (!collapsedIds.includes(node.id)) visit(node.id, depth + 1);
    }
  };
  if (focusId && nodes.some((node) => node.id === focusId)) visit(focusId, 0); else visit("__root__", 0);
  return rows;
}
