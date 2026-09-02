"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, FileDown, FolderPlus, List, Map as MapIcon, PackagePlus, Redo2, RotateCcw, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { BomFloatingStage } from "@/components/bom-editor/bom-floating-stage";
import { BomInlinePicker } from "@/components/bom-editor/bom-inline-picker";
import { BomMapView } from "@/components/bom-editor/bom-map-view";
import { BomNodeInspector } from "@/components/bom-editor/bom-node-inspector";
import { BomOutliner } from "@/components/bom-editor/bom-outliner";
import {
  BOM_EDITOR_ROOT_ID,
  type BomEditorDraftLike,
  type BomEditorItemCandidate,
  type BomEditorSharedComponent
} from "@/components/bom-editor/bom-editor-types";
import { snapshotFromDraft } from "@/components/bom-editor/bom-editor-reducer";
import { useBomEditorController } from "@/components/bom-editor/use-bom-editor-controller";
import { useBomEditorShortcuts } from "@/components/bom-editor/use-bom-editor-shortcuts";

type PickerState = { mode: "formal-sibling" | "formal-child" | "floating"; targetId: string | null };
type LifecycleActions = {
  onSubmitReview?: (reason: string) => Promise<void>;
  onReconfirmReplacementFlags?: () => Promise<void>;
  onRequestObsolete?: (reason: string) => Promise<void>;
  onClone?: () => Promise<void>;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onSetActive?: () => Promise<void>;
};

export function BomStructuredEditor({
  draft,
  rootPartNumber,
  rootPartName,
  editorEnabled = true,
  releasedReadOnly = false,
  readOnlyMessage,
  onReload,
  onSaved,
  ...lifecycle
}: {
  draft: BomEditorDraftLike;
  rootPartNumber: string;
  rootPartName: string;
  editorEnabled?: boolean;
  releasedReadOnly?: boolean;
  readOnlyMessage?: string;
  onReload: () => void;
  onSaved?: (draft: BomEditorDraftLike) => void;
} & LifecycleActions) {
  const controller = useBomEditorController(draft);
  const router = useRouter();
  const [desktop, setDesktop] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<{ id: string; label: string; branch: number } | null>(null);
  const [floatingExpanded, setFloatingExpanded] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [obsoleteReason, setObsoleteReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"outliner" | "map">("outliner");
  const [navigationPrompt, setNavigationPrompt] = useState<"list" | null>(null);

  useEffect(() => {
    const update = () => setDesktop(window.innerWidth >= 1024);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (desktop) return;
    setViewMode("outliner");
    setInspectorOpen(false);
  }, [desktop]);

  const snapshot = controller.snapshot;
  const mutable = editorEnabled && !releasedReadOnly && (draft.status === "Draft" || draft.status === "Rejected") && desktop;
  const selectedNode = snapshot.lines.find((line) => line.id === snapshot.selectedId) ?? snapshot.floatingTopics.find((topic) => topic.id === snapshot.selectedId) ?? null;
  const selectedComponent = snapshot.components.find((component) => component.node_id === snapshot.selectedId) ?? null;
  const unresolvedMappings = useMemo(() => listUnresolvedMappings(snapshot.components, draft.applicable_parents ?? []), [draft.applicable_parents, snapshot.components]);
  const floatingCount = snapshot.floatingTopics.length;
  const hasReplacementFlags = (draft.reconfirmation_flags?.length ?? 0) > 0;
  const primaryAction = mutable && controller.dirty ? "save" : mutable && floatingCount === 0 && unresolvedMappings.length === 0 && !hasReplacementFlags ? "submit" : "none";
  const error = controller.state.error?.message ?? "";
  const overlayOpen = Boolean(picker || deletePrompt);

  const setSelection = (id: string | null) => controller.view({ type: "selection.set", id });
  const openPicker = (mode: PickerState["mode"], targetId = snapshot.selectedId) => setPicker({ mode, targetId });
  const addGroup = (location: "formal" | "floating" = "formal", targetId = snapshot.selectedId, child = false) => {
    if (!mutable) return;
    const id = makeEditorId();
    const line = snapshot.lines.find((candidate) => candidate.id === targetId);
    const node = {
      id,
      logical_line_id: draft.definition_id ? id : null,
      bom_draft_id: draft.id,
      node_type: "group" as const,
      item_id: null,
      part_number: null,
      part_name: null,
      revision: null,
      group_name: "新群組",
      quantity: null,
      source: "manual" as const,
      source_priority: 30
    };
    controller.command({ type: "line.insert", location, parentId: location === "floating" ? null : child ? line?.id ?? null : line?.parent_line_id ?? null, afterId: null, node });
    setSelection(id);
    setPicker(null);
  };

  const addItem = (item: BomEditorItemCandidate, pickerState: PickerState) => {
    if (!mutable) return;
    const id = makeEditorId();
    const location = pickerState.mode === "floating" ? "floating" : "formal";
    const target = snapshot.lines.find((line) => line.id === pickerState.targetId);
    const node = {
      id,
      logical_line_id: draft.definition_id ? id : null,
      bom_draft_id: draft.id,
      node_type: "item" as const,
      item_id: item.item_id,
      part_number: item.part_number,
      part_name: item.part_name,
      revision: draft.identity_authority === "canonical_part_number" ? null : item.revision || null,
      group_name: null,
      quantity: 1,
      quantity_uom_code: item.base_uom_code ?? null,
      source: "manual" as const,
      source_priority: 30
    };
    const component: BomEditorSharedComponent | undefined = draft.definition_id ? {
      node_id: id,
      logical_line_id: id,
      node_location: location === "floating" ? "floating" : "tree",
      component_mode: "fixed",
      child_part_root_id: item.part_root_id ?? "",
      child_part_number_ids: [item.part_number_id ?? item.id],
      child_candidates: [{ part_number_id: item.part_number_id ?? item.id, part_number: item.part_number, part_name: item.part_name, part_root_id: item.part_root_id ?? "" }],
      parent_selections: []
    } : undefined;
    controller.command({ type: "line.insert", location, parentId: location === "floating" ? null : pickerState.mode === "formal-child" ? target?.id ?? null : target?.parent_line_id ?? null, afterId: null, node, component });
    setSelection(id);
    setPicker(null);
  };

  const selectedSiblingIndex = selectedNode && "parent_line_id" in selectedNode
    ? snapshot.lines.filter((line) => (line.parent_line_id ?? null) === (selectedNode.parent_line_id ?? null)).sort((a, b) => a.sequence_no - b.sequence_no).findIndex((line) => line.id === selectedNode.id)
    : -1;
  const moveSelection = (direction: -1 | 1) => {
    if (!mutable || !selectedNode || !("parent_line_id" in selectedNode)) return;
    controller.command({ type: "line.reorder", id: selectedNode.id, index: selectedSiblingIndex + direction });
  };
  const indentSelection = () => {
    if (!mutable || !selectedNode || !("parent_line_id" in selectedNode)) return;
    const siblings = snapshot.lines.filter((line) => (line.parent_line_id ?? null) === (selectedNode.parent_line_id ?? null)).sort((a, b) => a.sequence_no - b.sequence_no);
    const previous = siblings[selectedSiblingIndex - 1];
    if (!previous) return;
    controller.command({ type: "line.reparent", id: selectedNode.id, parentId: previous.id, index: snapshot.lines.filter((line) => line.parent_line_id === previous.id).length });
  };
  const outdentSelection = () => {
    if (!mutable || !selectedNode || !("parent_line_id" in selectedNode) || !selectedNode.parent_line_id) return;
    const parent = snapshot.lines.find((line) => line.id === selectedNode.parent_line_id);
    controller.command({ type: "line.reparent", id: selectedNode.id, parentId: parent?.parent_line_id ?? null, index: parent ? parent.sequence_no : snapshot.lines.filter((line) => !line.parent_line_id).length });
  };
  const requestDelete = (mode: "single" | "branch") => {
    if (!mutable || !selectedNode) return;
    if (mode === "single") return controller.command({ type: "line.remove", id: selectedNode.id, mode });
    const branch = countBranch(snapshot, selectedNode.id);
    if (branch <= 1) return controller.command({ type: "line.remove", id: selectedNode.id, mode: "single" });
    setDeletePrompt({ id: selectedNode.id, label: nodeLabel(selectedNode), branch });
  };
  const moveSelectedLocation = (to: "formal" | "floating") => {
    if (!mutable || !selectedNode) return;
    if (to === "floating" && !("parent_line_id" in selectedNode)) return;
    if (to === "formal" && !("parent_floating_topic_id" in selectedNode)) return;
    controller.command({
      type: "line.location.move",
      id: selectedNode.id,
      to,
      parentId: null,
      index: to === "formal" ? snapshot.lines.filter((line) => !line.parent_line_id).length : 0,
      rootPosition: { x: 320, y: 220 }
    });
    setFloatingExpanded(to === "floating");
    setViewMode("outliner");
  };

  const save = async (): Promise<boolean> => {
    if (!controller.dirty || busy || !editorEnabled || !desktop) return false;
    setBusy(true);
    controller.beginSave();
    try {
      const response = await fetch(`/api/bom/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "BOM Workbench structured editor save",
          expectedEditorVersion: controller.state.editorVersion,
          lines: snapshot.lines.map(toPatchLine),
          floatingTopics: snapshot.floatingTopics.map(toPatchFloatingTopic),
          components: snapshot.components.map(toPatchComponent)
        })
      });
      const body = await response.json().catch(() => ({})) as { draft?: BomEditorDraftLike; error?: string; message?: string };
      if (!response.ok || !body.draft) {
        controller.saveFailure(String(body.error ?? `HTTP ${response.status}`), String(body.message ?? body.error ?? "儲存失敗"), response.status === 409);
        return false;
      }
      const savedVersion = body.draft.editor_version ?? controller.state.editorVersion + 1;
      controller.saveSuccess(body.draft, savedVersion);
      setMessage(`已儲存 ${body.draft.lines.length} 個正式節點與 ${(body.draft.floating_topics ?? []).length} 個暫存節點`);
      onSaved?.(body.draft);
      return true;
    } catch (caught) {
      controller.saveFailure("BOM_SAVE_NETWORK_ERROR", caught instanceof Error ? caught.message : "儲存失敗");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const leaveToList = async (mode: "save" | "discard") => {
    if (busy) return;
    if (mode === "save") {
      const saved = await save();
      if (!saved) return;
    } else {
      controller.hydrate(draft);
      setMessage("");
    }
    setNavigationPrompt(null);
    router.push("/bom/workbench");
  };

  const submitReview = async () => {
    if (!lifecycle.onSubmitReview || primaryAction !== "submit" || !reviewReason.trim() || busy) return;
    setBusy(true);
    try { await lifecycle.onSubmitReview(reviewReason.trim()); setReviewReason(""); setMessage("已送出 BOM 審核"); } catch (caught) { controller.saveFailure("BOM_REVIEW_SUBMIT_FAILED", caught instanceof Error ? caught.message : "送審失敗"); } finally { setBusy(false); }
  };

  const runLifecycleAction = async (action: () => Promise<void>, successMessage: string) => {
    if (busy) return;
    setBusy(true);
    controller.clearError();
    try {
      await action();
      setMessage(successMessage);
    } catch (caught) {
      controller.saveFailure("BOM_LIFECYCLE_FAILED", caught instanceof Error ? caught.message : "BOM 生命週期操作失敗");
    } finally {
      setBusy(false);
    }
  };

  const toggleAllFolds = () => {
    const groupIds = snapshot.lines.filter((line) => line.node_type === "group").map((line) => line.id);
    if (groupIds.length === 0) return;
    const collapsed = new Set(snapshot.collapsedIds);
    const expandAll = groupIds.every((id) => collapsed.has(id));
    for (const id of groupIds) {
      if (expandAll ? collapsed.has(id) : !collapsed.has(id)) controller.view({ type: "collapse.toggle", id });
    }
  };

  useBomEditorShortcuts({
    enabled: desktop,
    mutable,
    overlayOpen,
    onTopic: () => openPicker("formal-sibling"),
    onSubtopic: () => openPicker("formal-child"),
    onParentTopic: () => addGroup("formal", snapshot.selectedId, false),
    onEdit: () => setInspectorOpen(true),
    onMoveUp: () => moveSelection(-1),
    onMoveDown: () => moveSelection(1),
    onDeleteOnly: () => requestDelete("single"),
    onDeleteBranch: () => requestDelete("branch"),
    onUndo: () => controller.command({ type: "history.undo" }),
    onRedo: () => controller.command({ type: "history.redo" }),
    onToggleFold: () => snapshot.selectedId && controller.view({ type: "collapse.toggle", id: snapshot.selectedId }),
    onToggleAllFolds: toggleAllFolds,
    onToggleFocus: () => controller.view({ type: "focus.set", id: snapshot.focusBranchId ? null : snapshot.selectedId }),
    onEscape: () => { setPicker(null); setDeletePrompt(null); setInspectorOpen(false); },
    onSave: () => void save(),
    onSelectRoot: () => setSelection(BOM_EDITOR_ROOT_ID)
  });

  const onCommitComponent = (component: BomEditorSharedComponent) => controller.command({ type: "component.replace", component });
  const rootLabel = `${rootPartNumber} · BOM Rev ${draft.bom_revision ?? draft.parent_revision ?? "-"}`;
  const canSubmit = primaryAction === "submit" && Boolean(reviewReason.trim()) && Boolean(lifecycle.onSubmitReview);

  return (
    <section className={`bom-structured-editor ${error ? "has-error" : ""}`} aria-label="BOM 工作台編輯器" data-testid="bom-structured-editor">
      <header className="bom-structured-header">
        <div className="bom-structured-heading">
          <Link href="/bom/workbench" onClick={(event) => { if (controller.dirty) { event.preventDefault(); setNavigationPrompt("list"); } }}>BOM 工作台</Link>
          <span aria-hidden="true">/</span>
          <strong>{rootLabel}</strong>
          <small>{rootPartName}</small>
          <span className="bom-purpose-label">{draft.bom_purpose === "sales_kit" ? "非製造 BOM" : "製造 BOM"}</span>
        </div>
        <div className={`bom-sync-state ${controller.dirty ? "dirty" : ""}`} aria-live="polite">
          {controller.state.saveState === "saving" || busy ? <><RotateCcw className="spin" aria-hidden="true" />儲存中</> : controller.dirty ? <><AlertTriangle aria-hidden="true" />未儲存</> : <><Check aria-hidden="true" />已同步</>}
        </div>
      </header>

      <div className="bom-editor-action-bar" role="toolbar" aria-label="BOM 操作">
        {primaryAction === "save" ? <button className="primary-button" type="button" onClick={() => void save()} disabled={busy}><Save size={16} aria-hidden="true" />儲存</button> : null}
        {primaryAction === "submit" ? <button className="primary-button" type="button" onClick={() => void submitReview()} disabled={!canSubmit || busy}><Send size={16} aria-hidden="true" />送出審核</button> : null}
        {desktop && viewMode === "outliner" ? <button className="secondary-button" type="button" onClick={() => controller.command({ type: "history.undo" })} disabled={!mutable || !controller.canUndo || busy}><Undo2 size={16} aria-hidden="true" />復原</button> : null}
        {desktop && viewMode === "outliner" ? <button className="secondary-button" type="button" onClick={() => controller.command({ type: "history.redo" })} disabled={!mutable || !controller.canRedo || busy}><Redo2 size={16} aria-hidden="true" />重做</button> : null}
        {desktop && viewMode === "outliner" ? <button className="secondary-button" type="button" onClick={() => openPicker("formal-sibling")} disabled={!mutable || busy}><PackagePlus size={16} aria-hidden="true" />插入料件</button> : null}
        {desktop && viewMode === "outliner" ? <button className="secondary-button" type="button" onClick={() => addGroup()} disabled={!mutable || busy}><FolderPlus size={16} aria-hidden="true" />新增群組</button> : null}
        {desktop && viewMode === "outliner" && selectedNode && "parent_line_id" in selectedNode ? <button className="secondary-button" type="button" onClick={() => moveSelectedLocation("floating")} disabled={!mutable || busy}>移至未納入</button> : null}
        {desktop && viewMode === "outliner" && selectedNode && "parent_floating_topic_id" in selectedNode ? <button className="secondary-button" type="button" onClick={() => moveSelectedLocation("formal")} disabled={!mutable || busy}>歸位至 BOM</button> : null}
        {desktop ? <button className="secondary-button" type="button" onClick={() => { setViewMode("map"); controller.view({ type: "view.set", mode: "map" }); }} aria-pressed={viewMode === "map"}><MapIcon size={16} aria-hidden="true" />檢視關聯圖</button> : null}
        {desktop ? <button className="secondary-button" type="button" onClick={() => { setViewMode("outliner"); controller.view({ type: "view.set", mode: "outliner" }); }} aria-pressed={viewMode === "outliner"}><List size={16} aria-hidden="true" />階層表</button> : null}
        <button className="secondary-button" type="button" onClick={onReload} disabled={busy}><RotateCcw size={16} aria-hidden="true" />重新整理</button>
        {desktop ? <button className="secondary-button" type="button" onClick={() => setInspectorOpen((open) => !open)} aria-pressed={inspectorOpen}>欄位</button> : null}
        <div className="bom-editor-action-spacer" />
        {desktop && lifecycle.onSetActive && draft.status !== "Released" && draft.status !== "Archived" && !draft.is_active ? <button className="secondary-button" type="button" onClick={() => void runLifecycleAction(lifecycle.onSetActive!, "已設為目前使用版本")} disabled={busy}>設為目前使用</button> : null}
        {desktop && draft.status === "Released" && lifecycle.onClone ? <button className="secondary-button" type="button" onClick={() => void runLifecycleAction(lifecycle.onClone!, "已建立下一版 BOM")} disabled={busy}>建立下一版</button> : null}
        {desktop && draft.status === "Archived" && lifecycle.onRestore ? <button className="secondary-button" type="button" onClick={() => void runLifecycleAction(lifecycle.onRestore!, "已恢復 BOM 草稿")} disabled={busy}>恢復</button> : null}
        {desktop && lifecycle.onDelete && (draft.status === "Draft" || draft.status === "Rejected") ? <button className="secondary-button danger-button" type="button" onClick={() => { if (window.confirm("確定要刪除這份 BOM 草稿嗎？")) void runLifecycleAction(lifecycle.onDelete!, "已刪除 BOM 草稿"); }} disabled={busy || controller.dirty}>刪除草稿</button> : null}
      </div>

      {primaryAction === "submit" ? <label className="bom-review-reason"><span>送審原因</span><input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="簡述本次 BOM 變更" /></label> : null}
      {draft.status === "Rejected" && draft.latest_review?.decision_reason ? <div className="bom-inline-notice warning" role="status">退回原因：{draft.latest_review.decision_reason}</div> : null}
      {!editorEnabled ? <div className="bom-inline-notice warning" role="status">{readOnlyMessage ?? "此版本目前為唯讀；請等待受控編輯器啟用後再修改。"}</div> : null}
      {floatingCount > 0 ? <BomFloatingStage count={floatingCount} expanded={floatingExpanded} onToggle={() => setFloatingExpanded((open) => !open)} onLocate={() => { setFloatingExpanded(true); setSelection(snapshot.floatingTopics[0]?.id ?? null); setViewMode("outliner"); controller.view({ type: "view.set", mode: "outliner" }); }} /> : null}
      {draft.reconfirmation_flags?.length ? <div className="bom-inline-notice warning" role="status">有 {draft.reconfirmation_flags.length} 個被取代料號需要重新確認。{lifecycle.onReconfirmReplacementFlags ? <button type="button" onClick={() => void runLifecycleAction(lifecycle.onReconfirmReplacementFlags!, "已重新確認被取代料號")} disabled={controller.dirty || busy}>重新確認</button> : null}</div> : null}
      {(error || message) ? <div className={`bom-inline-notice ${error ? "error" : "success"}`} role={error ? "alert" : "status"}><span>{error || message}</span>{controller.state.saveState === "conflict" ? <button type="button" onClick={onReload}>重新載入最新版本</button> : null}<button type="button" aria-label="關閉訊息" onClick={() => { controller.clearError(); setMessage(""); }}><X aria-hidden="true" /></button></div> : null}

      <div className={`bom-editor-main ${inspectorOpen && desktop ? "with-inspector" : ""}`}>
        <main className="bom-editor-workspace">
          {controller.snapshot && controller.snapshot.lines.length === 0 && controller.snapshot.floatingTopics.length === 0 ? <div className="bom-editor-empty"><strong>尚無料件</strong><button className="primary-button" type="button" onClick={() => openPicker("formal-sibling")} disabled={!mutable}>插入第一個料件</button></div> : null}
          {controller.snapshot && (controller.snapshot.lines.length > 0 || controller.snapshot.floatingTopics.length > 0) ? (
            viewMode === "map" ? <BomMapView rootLabel={rootLabel} lines={snapshot.lines} floatingTopics={snapshot.floatingTopics} selectedId={snapshot.selectedId} collapsedIds={snapshot.collapsedIds} focusBranchId={snapshot.focusBranchId} onSelect={setSelection} onToggleCollapse={(id) => controller.view({ type: "collapse.toggle", id })} onLocateFloating={() => { setFloatingExpanded(true); setSelection(snapshot.floatingTopics[0]?.id ?? null); }} /> : <BomOutliner rootLabel={rootLabel} lines={snapshot.lines} floatingTopics={floatingExpanded ? snapshot.floatingTopics : []} selectedId={snapshot.selectedId} collapsedIds={snapshot.collapsedIds} onSelect={setSelection} onToggleCollapse={(id) => controller.view({ type: "collapse.toggle", id })} onEdit={desktop ? () => setInspectorOpen(true) : () => undefined} onAddChild={desktop ? (id) => openPicker("formal-child", id) : undefined} />
          ) : null}
          {picker ? <BomInlinePicker x={18} y={18} onPickItem={(item) => addItem(item, picker)} onCreateGroup={() => addGroup(picker.mode === "floating" ? "floating" : "formal", picker.targetId, picker.mode === "formal-child")} onClose={() => setPicker(null)} canonicalParts={Boolean(draft.definition_id)} /> : null}
          {desktop ? <div className="bom-editor-nudge" aria-label="階層調整">
            <button type="button" onClick={() => moveSelection(-1)} disabled={!mutable} aria-label="向上移動">↑</button>
            <button type="button" onClick={() => moveSelection(1)} disabled={!mutable} aria-label="向下移動">↓</button>
            <button type="button" onClick={indentSelection} disabled={!mutable} aria-label="移入子階層">→</button>
            <button type="button" onClick={outdentSelection} disabled={!mutable} aria-label="移出子階層">←</button>
            <button type="button" onClick={() => requestDelete("branch")} disabled={!mutable} aria-label="刪除分支"><Trash2 size={15} aria-hidden="true" /></button>
          </div> : null}
        </main>
        {inspectorOpen && desktop ? <BomNodeInspector node={selectedNode} mutable={mutable} showLegacyRevision={draft.identity_authority !== "canonical_part_number"} component={selectedComponent} applicableParents={draft.applicable_parents ?? []} onCommit={(patch) => { if (patch.quantity !== undefined && selectedNode) controller.command({ type: "line.quantity.set", id: selectedNode.id, quantity: patch.quantity }); if (patch.groupName !== undefined && selectedNode) controller.command({ type: "line.group.rename", id: selectedNode.id, groupName: patch.groupName }); }} onCommitComponent={onCommitComponent} /> : null}
      </div>

      {draft.status === "Released" && draft.release_snapshot_id ? <div className="bom-export-bar"><span>正式 BOM</span><a href={releaseExportUrl(draft.release_snapshot_id, "csv", draft.context_parent_part_number_id ?? null)}><FileDown size={15} aria-hidden="true" />CSV</a><a href={releaseExportUrl(draft.release_snapshot_id, "xlsx", draft.context_parent_part_number_id ?? null)}><FileDown size={15} aria-hidden="true" />XLSX</a></div> : null}
      {desktop && draft.status === "Released" && lifecycle.onRequestObsolete ? <div className="bom-secondary-lifecycle"><label><span>作廢原因</span><input value={obsoleteReason} onChange={(event) => setObsoleteReason(event.target.value)} /></label><button className="danger-button" type="button" disabled={!obsoleteReason.trim() || busy} onClick={() => void runLifecycleAction(() => lifecycle.onRequestObsolete!(obsoleteReason.trim()), "已提出作廢申請")}>申請作廢</button></div> : null}

      {deletePrompt ? <div className="bom-confirm-backdrop" role="presentation" onPointerDown={() => setDeletePrompt(null)}><div className="bom-confirm" role="alertdialog" aria-modal="true" aria-labelledby="bom-delete-title" onPointerDown={(event) => event.stopPropagation()}><h2 id="bom-delete-title">刪除這個分支？</h2><p><strong>{deletePrompt.label}</strong> 與其下 {deletePrompt.branch - 1} 個節點會從草稿移除。</p><div><button type="button" onClick={() => setDeletePrompt(null)}>取消</button><button className="danger-button" type="button" onClick={() => { controller.command({ type: "line.remove", id: deletePrompt.id, mode: "branch" }); setDeletePrompt(null); }}>刪除分支</button></div></div></div> : null}
      {navigationPrompt ? <div className="bom-confirm-backdrop" role="presentation" onPointerDown={() => setNavigationPrompt(null)}><div className="bom-confirm" role="alertdialog" aria-modal="true" aria-labelledby="bom-navigation-title" onPointerDown={(event) => event.stopPropagation()}><h2 id="bom-navigation-title">尚有未儲存變更</h2><p>離開 BOM 工作台前，請選擇如何處理目前編輯內容。</p><div><button type="button" onClick={() => setNavigationPrompt(null)} disabled={busy}>取消</button><button type="button" onClick={() => void leaveToList("discard")} disabled={busy}>放棄變更</button><button className="primary-button" type="button" onClick={() => void leaveToList("save")} disabled={busy}>儲存並離開</button></div></div></div> : null}
    </section>
  );
}

function listUnresolvedMappings(components: BomEditorSharedComponent[], parents: NonNullable<BomEditorDraftLike["applicable_parents"]>) {
  return components.flatMap((component) => component.component_mode === "by_parent"
    ? parents.filter((parent) => !component.parent_selections.some((selection) => selection.parent_part_number_id === parent.part_number_id)).map((parent) => ({ logicalLineId: component.logical_line_id, parentPartNumberId: parent.part_number_id }))
    : []);
}

function nodeLabel(node: NonNullable<ReturnType<typeof snapshotFromDraft>["lines"]>[number] | NonNullable<ReturnType<typeof snapshotFromDraft>["floatingTopics"]>[number]) {
  return node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件";
}

function countBranch(snapshot: ReturnType<typeof snapshotFromDraft>, rootId: string) {
  const lines = snapshot.lines.some((line) => line.id === rootId) ? snapshot.lines : snapshot.floatingTopics;
  const parentKey = snapshot.lines.some((line) => line.id === rootId) ? "parent_line_id" : "parent_floating_topic_id";
  const children = new Map<string, string[]>();
  for (const node of lines) {
    const parent = String((node as typeof node & Record<string, string | null>)[parentKey] ?? "__root__");
    children.set(parent, [...(children.get(parent) ?? []), node.id]);
  }
  let count = 0;
  const visit = (id: string) => { count += 1; for (const child of children.get(id) ?? []) visit(child); };
  visit(rootId);
  return count;
}

function makeEditorId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `bom-node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toPatchLine(line: ReturnType<typeof snapshotFromDraft>["lines"][number]) {
  return { id: line.id, logicalLineId: line.logical_line_id, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, quantityUomCode: line.quantity_uom_code, sequenceNo: line.sequence_no };
}

function toPatchFloatingTopic(topic: ReturnType<typeof snapshotFromDraft>["floatingTopics"][number]) {
  return { id: topic.id, logicalLineId: topic.logical_line_id, parentFloatingTopicId: topic.parent_floating_topic_id, nodeType: topic.node_type, partNumber: topic.part_number, revision: topic.revision, groupName: topic.group_name, quantity: topic.quantity, quantityUomCode: topic.quantity_uom_code, sequenceNo: topic.sequence_no, rootPositionX: topic.root_position_x, rootPositionY: topic.root_position_y };
}

function toPatchComponent(component: BomEditorSharedComponent) {
  return { nodeId: component.node_id, logicalLineId: component.logical_line_id, nodeLocation: component.node_location, componentMode: component.component_mode, childPartNumberIds: component.child_part_number_ids, parentSelections: component.parent_selections.map((selection) => ({ parentPartNumberId: selection.parent_part_number_id, childPartNumberId: selection.child_part_number_id })) };
}

function releaseExportUrl(releaseSnapshotId: string, format: "csv" | "xlsx", parentPartNumberId: string | null) {
  const params = new URLSearchParams({ format });
  if (parentPartNumberId) params.set("parentPartNumberId", parentPartNumberId);
  return `/api/bom/releases/${encodeURIComponent(releaseSnapshotId)}/export?${params.toString()}`;
}
