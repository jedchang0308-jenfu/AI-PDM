"use client";

import { useEffect, useState } from "react";
import type {
  BomEditorApplicableParent,
  BomEditorFloatingTopic,
  BomEditorItemCandidate,
  BomEditorLine,
  BomEditorSharedComponent
} from "@/components/bom-editor/bom-editor-types";

type EditorNode = BomEditorLine | BomEditorFloatingTopic;

export function BomNodeInspector({
  node,
  mutable,
  showLegacyRevision = true,
  component = null,
  applicableParents = [],
  onCommit,
  onCommitComponent
}: {
  node: EditorNode | null;
  mutable: boolean;
  showLegacyRevision?: boolean;
  component?: BomEditorSharedComponent | null;
  applicableParents?: BomEditorApplicableParent[];
  onCommit: (patch: { groupName?: string; quantity?: number }) => void;
  onCommitComponent?: (component: BomEditorSharedComponent) => void;
}) {
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
            {component && onCommitComponent ? (
              <SharedComponentEditor
                component={component}
                parents={applicableParents}
                mutable={mutable}
                onCommit={onCommitComponent}
              />
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function SharedComponentEditor({ component, parents, mutable, onCommit }: {
  component: BomEditorSharedComponent;
  parents: BomEditorApplicableParent[];
  mutable: boolean;
  onCommit: (component: BomEditorSharedComponent) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BomEditorItemCandidate[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/search?entity=part&q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
      const body = await response.json().catch(() => ({})) as { parts?: BomEditorItemCandidate[] };
      if (response.ok) setResults((body.parts ?? []).filter((part) => !component.child_part_root_id || part.part_root_id === component.child_part_root_id));
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [component.child_part_root_id, query]);

  const candidates = component.child_candidates ?? component.child_part_number_ids.map((partNumberId) => ({
    part_number_id: partNumberId,
    part_number: partNumberId,
    part_name: "",
    part_root_id: component.child_part_root_id
  }));
  const toggleCandidate = (candidate: BomEditorItemCandidate) => {
    const partNumberId = candidate.part_number_id ?? candidate.id;
    const selected = component.child_part_number_ids.includes(partNumberId);
    if (selected && component.child_part_number_ids.length === 1) return;
    const childPartNumberIds = selected
      ? component.child_part_number_ids.filter((id) => id !== partNumberId)
      : [...component.child_part_number_ids, partNumberId];
    const childCandidates = selected
      ? candidates.filter((entry) => entry.part_number_id !== partNumberId)
      : [...candidates, { part_number_id: partNumberId, part_number: candidate.part_number, part_name: candidate.part_name, part_root_id: candidate.part_root_id ?? component.child_part_root_id }];
    const fixed = childPartNumberIds.length === 1;
    onCommit({
      ...component,
      component_mode: fixed ? "fixed" : "by_parent",
      child_part_root_id: component.child_part_root_id || candidate.part_root_id || "",
      child_part_number_ids: childPartNumberIds,
      child_candidates: childCandidates,
      parent_selections: fixed ? [] : component.parent_selections.filter((selection) => childPartNumberIds.includes(selection.child_part_number_id))
    });
  };
  const setParentSelection = (parentPartNumberId: string, childPartNumberId: string) => {
    onCommit({
      ...component,
      parent_selections: [
        ...component.parent_selections.filter((selection) => selection.parent_part_number_id !== parentPartNumberId),
        ...(childPartNumberId ? [{ parent_part_number_id: parentPartNumberId, child_part_number_id: childPartNumberId }] : [])
      ]
    });
  };

  return <section className="xmind-bom-component-editor" aria-label="適用料號對應">
    <h3>零件候選</h3>
    <p>{component.component_mode === "fixed" ? "固定零件" : "依適用料號對應"}</p>
    <div className="xmind-bom-component-candidates">
      {candidates.map((candidate) => <label key={candidate.part_number_id}>
        <input type="checkbox" checked disabled={!mutable || component.child_part_number_ids.length === 1} onChange={() => toggleCandidate({ id: candidate.part_number_id, item_id: "", part_number_id: candidate.part_number_id, part_root_id: candidate.part_root_id, part_number: candidate.part_number, part_name: candidate.part_name, revision: "" })} />
        <span><strong>{candidate.part_number}</strong><small>{candidate.part_name}</small></span>
      </label>)}
    </div>
    {mutable ? <label><span>加入候選（可複選）</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋料號或品名" /></label> : null}
    {mutable && results.length ? <div className="xmind-bom-component-results">
      {results.map((result) => {
        const partNumberId = result.part_number_id ?? result.id;
        const checked = component.child_part_number_ids.includes(partNumberId);
        return <label key={partNumberId}>
          <input type="checkbox" checked={checked} onChange={() => toggleCandidate(result)} />
          <span><strong>{result.part_number}</strong><small>{result.part_name}</small></span>
        </label>;
      })}
    </div> : null}
    {component.component_mode === "by_parent" ? <div className="xmind-bom-parent-mapping">
      <h3>適用料號對應</h3>
      {parents.map((parent) => <label key={parent.part_number_id}>
        <span>{parent.part_number}<small>{parent.part_name}</small></span>
        <select disabled={!mutable} value={component.parent_selections.find((selection) => selection.parent_part_number_id === parent.part_number_id)?.child_part_number_id ?? ""} onChange={(event) => setParentSelection(parent.part_number_id, event.target.value)}>
          <option value="">尚未指定</option>
          {candidates.map((candidate) => <option key={candidate.part_number_id} value={candidate.part_number_id}>{candidate.part_number} {candidate.part_name}</option>)}
        </select>
      </label>)}
    </div> : null}
  </section>;
}
