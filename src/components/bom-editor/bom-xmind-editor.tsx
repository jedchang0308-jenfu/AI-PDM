"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, List, Map as MapIcon, Maximize2, Minus, Plus, RotateCcw, X } from "lucide-react";
import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type OnNodeDrag,
  type ReactFlowInstance,
  type XYPosition
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { BomFloatingStage } from "@/components/bom-editor/bom-floating-stage";
import { BomInlinePicker } from "@/components/bom-editor/bom-inline-picker";
import { BomNodeContextMenu } from "@/components/bom-editor/bom-node-context-menu";
import { BomNodeInspector } from "@/components/bom-editor/bom-node-inspector";
import { BomOutliner } from "@/components/bom-editor/bom-outliner";
import {
  BOM_EDITOR_ROOT_ID,
  cloneBomEditorSnapshot,
  type BomDropZone,
  type BomEditorDraftLike,
  type BomEditorFloatingTopic,
  type BomEditorItemCandidate,
  type BomEditorLine,
  type BomEditorSharedComponent,
  type BomEditorSnapshot,
  type BomEditorViewMode
} from "@/components/bom-editor/bom-editor-types";
import { useBomEditorShortcuts } from "@/components/bom-editor/use-bom-editor-shortcuts";
import { XmindBomNode, type XmindBomFlowNode } from "@/components/bom-editor/xmind-bom-node";
import { XmindBomToolbar } from "@/components/bom-editor/xmind-bom-toolbar";
import {
  createBomEditorHistory,
  currentBomEditorSnapshot,
  isBomEditorHistoryDirty,
  markBomEditorHistorySaved,
  pushBomEditorHistory,
  redoBomEditorHistory,
  undoBomEditorHistory
} from "@/lib/bom-editor-history";

const nodeTypes = { xmindBomNode: XmindBomNode };
const ROOT_PARENT = "__root__";
const NODE_WIDTH = 214;

type PickerState = {
  x: number;
  y: number;
  mode: "topic" | "subtopic" | "floating";
  targetId: string | null;
  position?: XYPosition;
};

type ContextMenuState = { x: number; y: number; nodeId: string };
type DropPreview = { targetId: string; zone: BomDropZone } | null;

export function BomXmindEditor({
  draft,
  rootPartNumber,
  rootPartName,
  onReload,
  onSaved,
  onSetActiveDraft,
  onCloneDraft,
  onDeleteDraft,
  onRestoreDraft,
  onReconfirmReplacementFlags,
  onRequestObsolete
}: {
  draft: BomEditorDraftLike;
  rootPartNumber: string;
  rootPartName: string;
  onReload: () => void;
  onSaved?: (draft: BomEditorDraftLike) => void;
  onSetActiveDraft?: () => void;
  onCloneDraft?: () => void;
  onDeleteDraft?: () => void;
  onRestoreDraft?: () => void;
  onReconfirmReplacementFlags?: () => Promise<void>;
  onRequestObsolete?: (reason: string) => Promise<void>;
}) {
  const [history, setHistory] = useState(() => createBomEditorHistory(snapshotFromDraft(draft)));
  const [editorVersion, setEditorVersion] = useState(draft.editor_version ?? 0);
  const [viewMode, setViewMode] = useState<BomEditorViewMode>("map");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [dragPositions, setDragPositions] = useState<Record<string, XYPosition>>({});
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [obsoleteReason, setObsoleteReason] = useState("");
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [contextParentPartNumberId, setContextParentPartNumberId] = useState(
    draft.context_parent_part_number_id ?? draft.applicable_parents?.[0]?.part_number_id ?? ""
  );
  const [deletePrompt, setDeletePrompt] = useState<{ nodeId: string; label: string; branchCount: number } | null>(null);
  const [draftDeletePrompt, setDraftDeletePrompt] = useState(false);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<XmindBomFlowNode, Edge> | null>(null);
  const appliedDraftVersionRef = useRef(`${draft.id}:${draft.editor_version ?? 0}`);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const draftVersionKey = `${draft.id}:${draft.editor_version ?? 0}`;
    if (appliedDraftVersionRef.current === draftVersionKey) return;
    appliedDraftVersionRef.current = draftVersionKey;
    setHistory(createBomEditorHistory(snapshotFromDraft(draft)));
    setEditorVersion(draft.editor_version ?? 0);
    setEditingId(null);
    setPicker(null);
    setContextMenu(null);
    setConflict(false);
    setContextParentPartNumberId(draft.context_parent_part_number_id ?? draft.applicable_parents?.[0]?.part_number_id ?? "");
  }, [draft, draft.id, draft.editor_version]);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    if (mobile.matches) {
      setViewMode("outliner");
      setInspectorOpen(false);
    }
  }, []);

  const snapshot = currentBomEditorSnapshot(history);
  const dirty = isBomEditorHistoryDirty(history);
  const mutable = draft.status === "Draft" || draft.status === "Rejected";
  const sharedDefinition = Boolean(draft.definition_id);
  const selectedNode = findEditorNode(snapshot, snapshot.selectedId);
  const selectedComponent = snapshot.components.find((component) => component.node_id === snapshot.selectedId) ?? null;
  const selectedId = snapshot.selectedId;
  const usesCanonicalPartIdentity = draft.identity_authority === "canonical_part_number";
  const usesSharedStructure = Boolean(draft.definition_id);
  const unresolvedMappings = usesSharedStructure ? listUnresolvedMappings(snapshot.components, draft.applicable_parents ?? []) : [];
  const rootLabel = `${rootPartNumber} · BOM Rev ${draft.bom_revision ?? draft.parent_revision ?? "-"}`;

  const openPicker = (mode: PickerState["mode"], targetId: string | null = selectedId, position?: XYPosition) => {
    setInsertMenuOpen(false);
    setMoreOpen(false);
    setContextMenu(null);
    setPicker({ x: 250, y: 78, mode, targetId, position });
  };

  const replaceEphemeral = (patch: Partial<Pick<BomEditorSnapshot, "selectedId" | "collapsedIds" | "focusBranchId">>) => {
    setHistory((current) => ({
      ...current,
      entries: current.entries.map((entry, index) => index === current.index ? { ...entry, ...patch } : entry)
    }));
  };

  const commit = (producer: (current: BomEditorSnapshot) => BomEditorSnapshot) => {
    if (!mutable) return;
    setHistory((current) => {
      const base = cloneBomEditorSnapshot(currentBomEditorSnapshot(current));
      return pushBomEditorHistory(current, producer(base), 100);
    });
    setError("");
    setMessage("");
  };

  const revealFlowNode = (id: string, onRevealed?: () => void) => {
    if (viewMode !== "map" || !flowInstance) {
      onRevealed?.();
      return;
    }
    const revealWhenMeasured = (remaining: number) => window.requestAnimationFrame(() => {
      const node = flowInstance?.getNode(id);
      if ((!node || !node.measured?.width || !node.measured?.height) && remaining > 0) {
        revealWhenMeasured(remaining - 1);
        return;
      }
      if (!node) {
        onRevealed?.();
        return;
      }
      void flowInstance.fitView({ nodes: [node], padding: 0.8, maxZoom: 1, duration: 0 }).finally(() => onRevealed?.());
    });
    revealWhenMeasured(12);
  };

  const addGroup = (mode: "topic" | "subtopic" | "floating", targetId = selectedId, position?: XYPosition) => {
    const id = makeEditorId();
    commit((current) => {
      if (mode === "floating") {
        current.floatingTopics.push(makeFloatingGroup(draft.id, id, null, position ?? { x: 320, y: 220 }, usesSharedStructure));
      } else {
        const target = current.lines.find((line) => line.id === targetId);
        const floatingTarget = current.floatingTopics.find((topic) => topic.id === targetId);
        if (floatingTarget) {
          const parentId = mode === "subtopic" ? floatingTarget.id : floatingTarget.parent_floating_topic_id;
          current.floatingTopics.push(makeFloatingGroup(draft.id, id, parentId, rootPositionForFloating(current.floatingTopics, floatingTarget), usesSharedStructure));
          current.floatingTopics = normalizeFloatingSequences(current.floatingTopics);
        } else {
          const parentId = mode === "subtopic" && target ? target.id : target?.parent_line_id ?? null;
          current.lines.push(makeFormalGroup(draft.id, id, parentId, usesSharedStructure));
          current.lines = normalizeLineSequences(current.lines);
        }
      }
      current.selectedId = id;
      return current;
    });
    setInsertMenuOpen(false);
    setPicker(null);
    revealFlowNode(id, () => setEditingId(id));
  };

  const addItem = (item: BomEditorItemCandidate, pickerState: PickerState) => {
    const id = makeEditorId();
    commit((current) => {
      if (pickerState.mode === "floating") {
        current.floatingTopics.push(makeFloatingItem(draft.id, id, null, pickerState.position ?? { x: 320, y: 220 }, item, !usesCanonicalPartIdentity, usesSharedStructure));
      } else {
        const formalTarget = current.lines.find((line) => line.id === pickerState.targetId);
        const floatingTarget = current.floatingTopics.find((topic) => topic.id === pickerState.targetId);
        if (floatingTarget) {
          const parentId = pickerState.mode === "subtopic" ? floatingTarget.id : floatingTarget.parent_floating_topic_id;
          current.floatingTopics.push(makeFloatingItem(draft.id, id, parentId, rootPositionForFloating(current.floatingTopics, floatingTarget), item, !usesCanonicalPartIdentity, usesSharedStructure));
          current.floatingTopics = normalizeFloatingSequences(current.floatingTopics);
        } else {
          const parentId = pickerState.mode === "subtopic" && formalTarget ? formalTarget.id : formalTarget?.parent_line_id ?? null;
          current.lines.push(makeFormalItem(draft.id, id, parentId, item, !usesCanonicalPartIdentity, usesSharedStructure));
          current.lines = normalizeLineSequences(current.lines);
        }
      }
      if (usesSharedStructure) current.components.push(makeSharedComponent(id, pickerState.mode === "floating" || current.floatingTopics.some((topic) => topic.id === id) ? "floating" : "tree", item));
      current.selectedId = id;
      return current;
    });
    setPicker(null);
    revealFlowNode(id);
  };

  const addParentTopic = () => {
    if (!selectedId || selectedId === BOM_EDITOR_ROOT_ID) return;
    const id = makeEditorId();
    commit((current) => {
      const line = current.lines.find((item) => item.id === selectedId);
      if (line) {
        const parentId = line.parent_line_id;
        const group = makeFormalGroup(draft.id, id, parentId, usesSharedStructure);
        group.sequence_no = line.sequence_no;
        line.parent_line_id = id;
        line.sequence_no = 1;
        current.lines.push(group);
        current.lines = normalizeLineSequences(current.lines);
      } else {
        const topic = current.floatingTopics.find((item) => item.id === selectedId);
        if (!topic) return current;
        const parentId = topic.parent_floating_topic_id;
        const group = makeFloatingGroup(draft.id, id, parentId, rootPositionForFloating(current.floatingTopics, topic), usesSharedStructure);
        group.sequence_no = topic.sequence_no;
        topic.parent_floating_topic_id = id;
        topic.sequence_no = 1;
        current.floatingTopics.push(group);
        current.floatingTopics = normalizeFloatingSequences(current.floatingTopics);
      }
      current.selectedId = id;
      return current;
    });
    setInsertMenuOpen(false);
    revealFlowNode(id, () => setEditingId(id));
  };

  const beginEdit = (id = selectedId) => {
    if (!id || id === BOM_EDITOR_ROOT_ID) return;
    const node = findEditorNode(snapshot, id);
    replaceEphemeral({ selectedId: id });
    if (node?.node_type === "group") setEditingId(id);
    else setInspectorOpen(true);
    setContextMenu(null);
  };

  const commitLabel = (id: string, label: string) => {
    commit((current) => {
      const line = current.lines.find((item) => item.id === id);
      const floating = current.floatingTopics.find((item) => item.id === id);
      if (line?.node_type === "group") line.group_name = label;
      if (floating?.node_type === "group") floating.group_name = label;
      return current;
    });
    setEditingId(null);
  };

  const updateSelected = (patch: { groupName?: string; quantity?: number }) => {
    if (!selectedId) return;
    commit((current) => {
      const node = findEditorNode(current, selectedId);
      if (!node) return current;
      if (node.node_type === "group" && patch.groupName) node.group_name = patch.groupName;
      if (node.node_type === "item" && patch.quantity) node.quantity = patch.quantity;
      return current;
    });
  };

  const updateSelectedComponent = (component: BomEditorSharedComponent) => {
    commit((current) => {
      current.components = current.components.map((entry) => entry.node_id === component.node_id ? component : entry);
      const node = findEditorNode(current, component.node_id);
      const primaryCandidate = component.child_candidates?.find((candidate) => candidate.part_number_id === component.child_part_number_ids[0]);
      if (node?.node_type === "item" && primaryCandidate) {
        node.part_number = primaryCandidate.part_number;
        node.part_name = primaryCandidate.part_name;
      }
      return current;
    });
  };

  const moveSelected = (direction: -1 | 1) => {
    if (!selectedId) return;
    commit((current) => {
      const line = current.lines.find((item) => item.id === selectedId);
      if (line) current.lines = moveSibling(current.lines, line, direction, "parent_line_id");
      const floating = current.floatingTopics.find((item) => item.id === selectedId);
      if (floating) current.floatingTopics = moveSibling(current.floatingTopics, floating, direction, "parent_floating_topic_id");
      return current;
    });
    setContextMenu(null);
  };

  const deleteSelectedOnly = () => {
    if (!selectedId) return;
    commit((current) => {
      const line = current.lines.find((item) => item.id === selectedId);
      if (line) {
        for (const child of current.lines.filter((item) => item.parent_line_id === line.id)) child.parent_line_id = line.parent_line_id;
        current.lines = normalizeLineSequences(current.lines.filter((item) => item.id !== line.id));
      }
      const floating = current.floatingTopics.find((item) => item.id === selectedId);
      if (floating) {
        for (const child of current.floatingTopics.filter((item) => item.parent_floating_topic_id === floating.id)) child.parent_floating_topic_id = floating.parent_floating_topic_id;
        current.floatingTopics = normalizeFloatingSequences(current.floatingTopics.filter((item) => item.id !== floating.id));
      }
      current.components = current.components.filter((component) => component.node_id !== selectedId);
      current.selectedId = line?.parent_line_id ?? floating?.parent_floating_topic_id ?? null;
      return current;
    });
    setContextMenu(null);
  };

  const deleteBranch = (nodeId: string) => {
    commit((current) => {
      if (current.lines.some((item) => item.id === nodeId)) {
        const ids = collectBranchIds(current.lines, nodeId, "parent_line_id");
        current.lines = normalizeLineSequences(current.lines.filter((item) => !ids.has(item.id)));
        current.components = current.components.filter((component) => !ids.has(component.node_id));
      } else {
        const ids = collectBranchIds(current.floatingTopics, nodeId, "parent_floating_topic_id");
        current.floatingTopics = normalizeFloatingSequences(current.floatingTopics.filter((item) => !ids.has(item.id)));
        current.components = current.components.filter((component) => !ids.has(component.node_id));
      }
      current.selectedId = null;
      return current;
    });
    setContextMenu(null);
    setDeletePrompt(null);
  };

  const requestDeleteSelectedBranch = () => {
    if (!selectedId || selectedId === BOM_EDITOR_ROOT_ID) return;
    const node = findEditorNode(snapshot, selectedId);
    if (!node) return;
    const formal = snapshot.lines.some((item) => item.id === selectedId);
    const branchCount = formal
      ? collectBranchIds(snapshot.lines, selectedId, "parent_line_id").size
      : collectBranchIds(snapshot.floatingTopics, selectedId, "parent_floating_topic_id").size;
    if (branchCount <= 1) {
      deleteSelectedOnly();
      return;
    }
    setDeletePrompt({
      nodeId: selectedId,
      label: node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件",
      branchCount
    });
    setContextMenu(null);
  };

  const toggleFold = (id = selectedId) => {
    if (!id || id === BOM_EDITOR_ROOT_ID) return;
    const collapsed = new Set(snapshot.collapsedIds);
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    replaceEphemeral({ collapsedIds: [...collapsed] });
  };

  const toggleAllFolds = () => {
    const parents = [...snapshot.lines, ...snapshot.floatingTopics]
      .filter((node) => hasEditorChildren(snapshot, node.id))
      .map((node) => node.id);
    replaceEphemeral({ collapsedIds: snapshot.collapsedIds.length > 0 ? [] : parents });
  };

  const toggleFocus = () => {
    replaceEphemeral({ focusBranchId: snapshot.focusBranchId ? null : selectedId && selectedId !== BOM_EDITOR_ROOT_ID ? selectedId : null });
  };

  const escape = () => {
    if (editingId) setEditingId(null);
    else if (picker) setPicker(null);
    else if (contextMenu) setContextMenu(null);
    else if (deletePrompt) setDeletePrompt(null);
    else if (draftDeletePrompt) setDraftDeletePrompt(false);
    else if (moreOpen) setMoreOpen(false);
    else if (insertMenuOpen) setInsertMenuOpen(false);
    else if (snapshot.focusBranchId) replaceEphemeral({ focusBranchId: null });
    else setInspectorOpen(false);
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    setConflict(false);
    try {
      const response = await fetch(`/api/bom/drafts/${encodeURIComponent(draft.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "XMind-style BOM editor save",
          expectedEditorVersion: editorVersion,
          lines: snapshot.lines.map(toPatchLine),
          floatingTopics: snapshot.floatingTopics.map(toPatchFloatingTopic),
          components: usesSharedStructure ? snapshot.components.map(toPatchComponent) : undefined
        })
      });
      const body = (await response.json().catch(() => ({}))) as { draft?: BomEditorDraftLike; error?: string; message?: string };
      if (!response.ok || !body.draft) {
        if (response.status === 409) setConflict(true);
        throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      }
      const saved = snapshotFromDraft(body.draft);
      const savedIds = new Set([BOM_EDITOR_ROOT_ID, ...saved.lines.map((line) => line.id), ...saved.floatingTopics.map((topic) => topic.id)]);
      saved.selectedId = savedIds.has(snapshot.selectedId ?? "") ? snapshot.selectedId : BOM_EDITOR_ROOT_ID;
      saved.collapsedIds = snapshot.collapsedIds.filter((id) => savedIds.has(id));
      saved.focusBranchId = snapshot.focusBranchId && savedIds.has(snapshot.focusBranchId) ? snapshot.focusBranchId : null;
      setHistory((current) => markBomEditorHistorySaved(current, saved));
      const savedEditorVersion = body.draft.editor_version ?? editorVersion + 1;
      appliedDraftVersionRef.current = `${body.draft.id}:${savedEditorVersion}`;
      setEditorVersion(savedEditorVersion);
      setMessage(`已儲存 ${saved.lines.length} 個正式節點與 ${saved.floatingTopics.length} 個 Floating Topic`);
      onSaved?.(body.draft);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  useBomEditorShortcuts({
    enabled: true,
    mutable,
    overlayOpen: Boolean(picker || contextMenu || editingId || deletePrompt || draftDeletePrompt || moreOpen || insertMenuOpen),
    onTopic: () => openPicker("topic"),
    onSubtopic: () => openPicker("subtopic"),
    onParentTopic: addParentTopic,
    onEdit: () => beginEdit(),
    onMoveUp: () => moveSelected(-1),
    onMoveDown: () => moveSelected(1),
    onDeleteOnly: deleteSelectedOnly,
    onDeleteBranch: requestDeleteSelectedBranch,
    onUndo: () => setHistory((current) => undoBomEditorHistory(current)),
    onRedo: () => setHistory((current) => redoBomEditorHistory(current)),
    onToggleFold: () => toggleFold(),
    onToggleAllFolds: toggleAllFolds,
    onToggleFocus: toggleFocus,
    onEscape: escape,
    onSave: () => void save(),
    onSelectRoot: () => replaceEphemeral({ selectedId: BOM_EDITOR_ROOT_ID })
  });

  const callbacks = {
    onAddChild: (id: string) => openPicker("subtopic", id),
    onToggleCollapse: (id: string) => toggleFold(id),
    onCommitLabel: commitLabel,
    onCancelEdit: () => setEditingId(null)
  };
  const graph = useMemo(
    () => buildEditorGraph(snapshot, rootLabel, mutable, editingId, dropPreview, callbacks, dragPositions),
    [snapshot, rootLabel, mutable, editingId, dropPreview, dragPositions]
  );

  const onNodeDrag: OnNodeDrag<XmindBomFlowNode> = (event, node) => {
    setDragPositions((current) => ({ ...current, [node.id]: node.position }));
    setDropPreview((current) => resolveDropPreview(event, node, snapshot, canvasRef.current, current));
  };

  const onNodeDragStop: OnNodeDrag<XmindBomFlowNode> = (_, node) => {
    const preview = dropPreview;
    commit((current) => applyDrop(current, node.id, preview, node.position));
    setDropPreview(null);
    setDragPositions({});
  };

  const selectedSiblingState = siblingState(snapshot, selectedId);
  const overlayOpen = Boolean(picker || contextMenu || moreOpen || insertMenuOpen || draftDeletePrompt);
  const hasOpenReconfirmationFlags = (draft.reconfirmation_flags?.length ?? 0) > 0;

  const submitReview = async () => {
    if (!mutable || dirty || snapshot.floatingTopics.length > 0 || unresolvedMappings.length > 0 || hasOpenReconfirmationFlags || !reviewReason.trim()) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/bom/drafts/${encodeURIComponent(draft.id)}/submit-review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ changeReason: reviewReason.trim() })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
      setMessage("已送出 BOM 審核");
      setReviewReason("");
      onReload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "送出審核失敗");
    } finally {
      setSaving(false);
    }
  };

  const reconfirmReplacementFlags = async () => {
    if (!onReconfirmReplacementFlags || dirty || lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");
    try {
      await onReconfirmReplacementFlags();
      setMessage("已重新確認被取代料號");
      setMoreOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "重新確認失敗");
    } finally {
      setLifecycleBusy(false);
    }
  };

  const requestObsolete = async () => {
    if (!onRequestObsolete || !obsoleteReason.trim() || dirty || lifecycleBusy) return;
    setLifecycleBusy(true);
    setError("");
    try {
      await onRequestObsolete(obsoleteReason.trim());
      setObsoleteReason("");
      setMessage("BOM 作廢申請已送出，等待主管審核。");
      setMoreOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "申請作廢失敗");
    } finally {
      setLifecycleBusy(false);
    }
  };

  return (
    <section className={`xmind-bom-editor-shell ${(message || error) ? "has-alert" : ""}`} aria-label="XMind 式 BOM 編輯器" data-testid="xmind-bom-editor">
      <header className="xmind-bom-editor-header">
        <div>
          <Link href="/bom/workbench" onClick={(event) => { if (dirty) { event.preventDefault(); setError("返回清單前請先儲存或復原變更"); } }}>BOM 工作台</Link>
          <span aria-hidden="true">/</span>
          <strong>{rootLabel}</strong>
          <small>{rootPartName}</small>
          {draft.status === "Rejected" ? <span className="badge warning">已退回</span> : null}
          {draft.status === "PendingReview" ? <span className="badge warning">審核中</span> : null}
          {draft.status === "Released" ? <span className="badge success">已發布</span> : null}
          {draft.status === "Obsolete" ? <span className="badge danger">已作廢</span> : null}
        </div>
        <div className="xmind-bom-sync-state" aria-live="polite">
          {saving ? <><RotateCcw className="spin" />儲存中</> : dirty ? <><AlertTriangle />未儲存</> : <><Check />已同步</>}
        </div>
      </header>

      <XmindBomToolbar
        mutable={mutable}
        dirty={dirty}
        saving={saving}
        canUndo={history.index > 0}
        canRedo={history.index < history.entries.length - 1}
        inspectorOpen={inspectorOpen}
        focused={Boolean(snapshot.focusBranchId)}
        onUndo={() => setHistory((current) => undoBomEditorHistory(current))}
        onRedo={() => setHistory((current) => redoBomEditorHistory(current))}
        onTopic={() => openPicker("topic")}
        onSubtopic={() => openPicker("subtopic")}
        onInsert={() => { setInsertMenuOpen((open) => !open); setMoreOpen(false); setPicker(null); }}
        onToggleFold={() => toggleFold()}
        onToggleFocus={toggleFocus}
        onSave={() => void save()}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
        onToggleMore={() => setMoreOpen((open) => !open)}
      />

      {draft.status === "Rejected" && draft.latest_review?.decision_reason ? (
        <div className="xmind-bom-editor-alert error" role="status">
          <span>退回原因：{draft.latest_review.decision_reason}</span>
        </div>
      ) : null}

      {(message || error) ? (
        <div className={`xmind-bom-editor-alert ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>
          <span>{error || message}</span>
          {conflict ? <button type="button" onClick={onReload}>重新載入伺服器版本</button> : null}
          <button type="button" aria-label="關閉訊息" onClick={() => { setError(""); setMessage(""); }}><X aria-hidden="true" /></button>
        </div>
      ) : null}

      {insertMenuOpen ? (
        <div className="xmind-bom-insert-menu" role="menu" aria-label="插入選項" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" role="menuitem" onClick={() => addParentTopic()} disabled={!mutable || !selectedId || selectedId === BOM_EDITOR_ROOT_ID}>
            <span>父主題</span><small>Parent Topic</small><kbd>Ctrl+Enter</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => openPicker("subtopic")} disabled={!mutable}>
            <span>搜尋料件</span><small>Insert Item</small><kbd>Enter</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => openPicker("floating", null)} disabled={!mutable}>
            <span>浮動主題</span><small>Floating Topic</small><kbd>Double-click</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => addGroup("topic")} disabled={!mutable}>
            <span>群組主題</span><small>Group Topic</small><kbd>Space</kbd>
          </button>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="xmind-bom-more-menu" role="dialog" aria-label="更多編輯選項" onPointerDown={(event) => event.stopPropagation()}>
          <div className="xmind-bom-view-switch" role="group" aria-label="編輯檢視">
            <button type="button" aria-pressed={viewMode === "map"} onClick={() => { setViewMode("map"); setMoreOpen(false); }}><MapIcon />心智圖</button>
            <button type="button" aria-pressed={viewMode === "outliner"} onClick={() => { setViewMode("outliner"); setMoreOpen(false); }}><List />大綱</button>
          </div>
          <dl><div><dt>主題／子主題</dt><dd>Enter／Tab</dd></div><div><dt>父主題</dt><dd>Ctrl+Enter</dd></div><div><dt>復原／重做</dt><dd>Ctrl+Z／Ctrl+Shift+Z</dd></div><div><dt>摺疊／專注</dt><dd>Ctrl+/／Ctrl+;</dd></div></dl>
          {mutable ? <div className="xmind-bom-review-action">
            <label><span>送審原因</span><input value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} placeholder="簡述本次 BOM 變更" /></label>
            {snapshot.floatingTopics.length > 0 ? <p role="status">尚有 {snapshot.floatingTopics.length} 個 Floating Topic 未歸位，暫時無法送審。</p> : unresolvedMappings.length > 0 ? <p role="status">尚有 {unresolvedMappings.length} 個適用料號對應未完成。</p> : dirty ? <p role="status">請先儲存本次變更，再送出審核。</p> : hasOpenReconfirmationFlags ? <p role="status">請先重新確認被取代料號，再送出審核。</p> : null}
            <button type="button" disabled={!mutable || dirty || snapshot.floatingTopics.length > 0 || unresolvedMappings.length > 0 || hasOpenReconfirmationFlags || !reviewReason.trim() || saving} onClick={() => void submitReview()}>送出審核</button>
          </div> : null}
          {mutable && hasOpenReconfirmationFlags ? (
            <div className="xmind-bom-review-action" role="status">
              <strong>BOM 需重新確認</strong>
              {draft.reconfirmation_flags?.map((flag) => <p key={flag.id}>{flag.old_part_number} 已被 {flag.new_part_number} 取代；{flag.reason}</p>)}
              <button type="button" disabled={dirty || lifecycleBusy || !onReconfirmReplacementFlags} onClick={() => void reconfirmReplacementFlags()}>已重新確認</button>
            </div>
          ) : null}
          {draft.status === "Released" && draft.release_snapshot_id ? (
            <div className="xmind-bom-review-action" role="group" aria-label="正式 BOM 匯出">
              <strong>正式 BOM 匯出</strong>
              {sharedDefinition && (draft.applicable_parents?.length ?? 0) > 1 ? (
                <label>
                  <span>適用 Parent</span>
                  <select value={contextParentPartNumberId} onChange={(event) => setContextParentPartNumberId(event.target.value)}>
                    {draft.applicable_parents?.map((parent) => (
                      <option key={parent.part_number_id} value={parent.part_number_id}>{parent.part_number} — {parent.part_name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <a className="secondary-button" href={releaseExportUrl(draft.release_snapshot_id, "csv", sharedDefinition ? contextParentPartNumberId : null)}>下載正式 CSV</a>
              <a className="secondary-button" href={releaseExportUrl(draft.release_snapshot_id, "xlsx", sharedDefinition ? contextParentPartNumberId : null)}>下載正式 XLSX</a>
            </div>
          ) : null}
          {draft.status === "Released" && onRequestObsolete ? (
            <div className="xmind-bom-review-action">
              <label><span>作廢原因</span><input value={obsoleteReason} onChange={(event) => setObsoleteReason(event.target.value)} placeholder="描述正式 BOM 為何需要作廢" /></label>
              <button type="button" className="danger" disabled={!obsoleteReason.trim() || dirty || lifecycleBusy || !onRequestObsolete} onClick={() => void requestObsolete()}>申請作廢</button>
            </div>
          ) : null}
          <div className="xmind-bom-more-actions" role="group" aria-label="BOM 操作">
            <button type="button" onClick={() => { setViewMode("map"); setMoreOpen(false); }}>導覽圖</button>
            {!sharedDefinition ? <button type="button" disabled={!onSetActiveDraft || draft.is_active === 1 || dirty || saving} onClick={() => { setMoreOpen(false); onSetActiveDraft?.(); }}>設為目前</button> : null}
            {!sharedDefinition || draft.status === "Released" ? <button type="button" disabled={!onCloneDraft || dirty || saving} onClick={() => { setMoreOpen(false); onCloneDraft?.(); }}>{sharedDefinition ? "建立下一版" : "複製草稿"}</button> : null}
            {sharedDefinition && draft.status === "Archived" ? <button type="button" disabled={!onRestoreDraft || saving} onClick={() => { setMoreOpen(false); onRestoreDraft?.(); }}>恢復草稿</button> : null}
            {draft.status !== "Archived" ? <button type="button" className="danger" disabled={!onDeleteDraft || draft.status !== "Draft" || dirty || saving} onClick={() => { setMoreOpen(false); setDraftDeletePrompt(true); }}>{sharedDefinition ? "封存草稿" : "刪除草稿"}</button> : null}
          </div>
        </div>
      ) : null}

      <div className={`xmind-bom-editor-main ${inspectorOpen ? "with-inspector" : ""}`}>
        <div
          ref={canvasRef}
          className="xmind-bom-workspace"
          onPointerDown={() => { if (overlayOpen) { setPicker(null); setContextMenu(null); setMoreOpen(false); setInsertMenuOpen(false); } }}
          onDoubleClick={(event) => {
            if (!mutable || !(event.target instanceof Element) || !event.target.closest(".react-flow__pane")) return;
            const position = flowInstance?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
            addGroup("floating", null, position ?? { x: event.clientX, y: event.clientY });
          }}
        >
          <div className="xmind-bom-view-tabs" role="tablist" aria-label="編輯檢視">
            <button type="button" role="tab" aria-selected={viewMode === "map"} onClick={() => setViewMode("map")}><MapIcon />心智圖</button>
            <button type="button" role="tab" aria-selected={viewMode === "outliner"} onClick={() => setViewMode("outliner")}><List />大綱</button>
          </div>
          {snapshot.focusBranchId ? <button className="xmind-bom-focus-exit" type="button" onClick={() => replaceEphemeral({ focusBranchId: null })}>顯示完整內容</button> : null}
          {viewMode === "map" ? (
            <ReactFlowProvider>
              <ReactFlow<XmindBomFlowNode, Edge>
                nodes={graph.nodes}
                edges={graph.edges}
                nodeTypes={nodeTypes}
                onInit={(instance) => setFlowInstance(instance)}
                fitView
                fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
                minZoom={0.25}
                maxZoom={2}
                zoomOnDoubleClick={false}
                nodesConnectable={false}
                nodesDraggable={mutable}
                selectionOnDrag={false}
                onNodeClick={(_, node) => replaceEphemeral({ selectedId: node.id })}
                onNodeDoubleClick={(_, node) => beginEdit(node.id)}
                onNodeContextMenu={(event, node) => {
                  event.preventDefault();
                  replaceEphemeral({ selectedId: node.id });
                  setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
                }}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onPaneClick={() => { setContextMenu(null); setPicker(null); }}
              defaultEdgeOptions={{ type: "straight", markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 } }}
                aria-label="BOM 心智圖畫布"
              >
                <Background gap={20} size={1} color="#d9dde5" />
                <BomCanvasControls />
              </ReactFlow>
            </ReactFlowProvider>
          ) : (
            <BomOutliner
              rootLabel={rootLabel}
              lines={snapshot.lines}
              floatingTopics={snapshot.floatingTopics}
              selectedId={selectedId}
              collapsedIds={snapshot.collapsedIds}
              onSelect={(id) => replaceEphemeral({ selectedId: id })}
              onToggleCollapse={toggleFold}
              onEdit={beginEdit}
            />
          )}
          <BomFloatingStage count={snapshot.floatingTopics.length} />
          {picker ? (
            <BomInlinePicker
              x={picker.x}
              y={picker.y}
              onPickItem={(item) => addItem(item, picker)}
              onCreateGroup={() => addGroup(picker.mode, picker.targetId, picker.position)}
              onClose={() => setPicker(null)}
              canonicalParts={usesSharedStructure}
            />
          ) : null}
        </div>
        {inspectorOpen ? <BomNodeInspector
          node={selectedNode}
          mutable={mutable}
          showLegacyRevision={!usesCanonicalPartIdentity}
          component={selectedComponent}
          applicableParents={draft.applicable_parents ?? []}
          onCommit={updateSelected}
          onCommitComponent={updateSelectedComponent}
        /> : null}
      </div>

      {contextMenu ? (
        <BomNodeContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          mutable={mutable && contextMenu.nodeId !== BOM_EDITOR_ROOT_ID}
          canMoveUp={selectedSiblingState.canMoveUp}
          canMoveDown={selectedSiblingState.canMoveDown}
          onClose={() => setContextMenu(null)}
          onEdit={() => beginEdit(contextMenu.nodeId)}
          onTopic={() => addGroup("topic", contextMenu.nodeId)}
          onSubtopic={() => addGroup("subtopic", contextMenu.nodeId)}
          onParentTopic={addParentTopic}
          onMoveUp={() => moveSelected(-1)}
          onMoveDown={() => moveSelected(1)}
          onDeleteOnly={deleteSelectedOnly}
          onDeleteBranch={requestDeleteSelectedBranch}
        />
      ) : null}
      {deletePrompt ? (
        <div className="xmind-bom-confirm-backdrop" role="presentation" onPointerDown={() => setDeletePrompt(null)}>
          <div className="xmind-bom-confirm" role="alertdialog" aria-modal="true" aria-labelledby="xmind-bom-delete-title" onPointerDown={(event) => event.stopPropagation()}>
            <h2 id="xmind-bom-delete-title">刪除這個分支？</h2>
            <p><strong>{deletePrompt.label}</strong>{deletePrompt.branchCount > 1 ? ` 與其下 ${deletePrompt.branchCount - 1} 個子主題` : ""}會從草稿移除。</p>
            <small>刪除後仍可立即使用 Ctrl+Z 復原。</small>
            <div><button type="button" onClick={() => setDeletePrompt(null)}>取消</button><button className="danger" type="button" onClick={() => deleteBranch(deletePrompt.nodeId)}>刪除分支</button></div>
          </div>
        </div>
      ) : null}
      {draftDeletePrompt ? (
        <div className="xmind-bom-confirm-backdrop" role="presentation" onPointerDown={() => setDraftDeletePrompt(false)}>
          <div className="xmind-bom-confirm" role="alertdialog" aria-modal="true" aria-labelledby="xmind-bom-draft-delete-title" onPointerDown={(event) => event.stopPropagation()}>
            <h2 id="xmind-bom-draft-delete-title">{sharedDefinition ? "封存 BOM 草稿？" : "刪除 BOM 草稿？"}</h2>
            <p><strong>{draft.draft_name ?? "目前草稿"}</strong> 將移至封存狀態，現有 BOM 編輯內容與 Definition 關聯都會保留。</p>
            <small>需要續作時可恢復；此操作不會刪除受控歷史。</small>
            <div><button type="button" onClick={() => setDraftDeletePrompt(false)}>取消</button><button className="danger" type="button" onClick={() => { setDraftDeletePrompt(false); onDeleteDraft?.(); }}>{sharedDefinition ? "確認封存草稿" : "確認刪除草稿"}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function BomCanvasControls() {
  const instance = useReactFlow();
  const zoom = useStore((state) => state.transform[2]);
  return (
    <Panel className="xmind-bom-canvas-controls" position="bottom-right">
      <button type="button" aria-label="縮小" title="縮小" onClick={() => void instance.zoomOut({ duration: 120 })}><Minus /></button>
      <span>{Math.round(zoom * 100)}%</span>
      <button type="button" aria-label="放大" title="放大" onClick={() => void instance.zoomIn({ duration: 120 })}><Plus /></button>
      <button type="button" aria-label="符合畫面" title="符合畫面" onClick={() => void instance.fitView({ padding: 0.18, duration: 180 })}><Maximize2 /></button>
    </Panel>
  );
}

function snapshotFromDraft(draft: BomEditorDraftLike): BomEditorSnapshot {
  return {
    lines: normalizeLineSequences((draft.lines ?? []).map((line) => ({ ...line }))),
    floatingTopics: normalizeFloatingSequences((draft.floating_topics ?? []).map((topic) => ({ ...topic }))),
    components: (draft.components ?? []).map((component) => ({
      ...component,
      child_part_number_ids: [...component.child_part_number_ids],
      child_candidates: component.child_candidates?.map((candidate) => ({ ...candidate })),
      parent_selections: component.parent_selections.map((selection) => ({ ...selection }))
    })),
    selectedId: draft.lines[0]?.id ?? draft.floating_topics?.[0]?.id ?? BOM_EDITOR_ROOT_ID,
    collapsedIds: [],
    focusBranchId: null
  };
}

function buildEditorGraph(
  snapshot: BomEditorSnapshot,
  rootLabel: string,
  mutable: boolean,
  editingId: string | null,
  dropPreview: DropPreview,
  callbacks: Pick<XmindBomFlowNode["data"], "onAddChild" | "onToggleCollapse" | "onCommitLabel" | "onCancelEdit">,
  dragPositions: Record<string, XYPosition>
): { nodes: XmindBomFlowNode[]; edges: Edge[] } {
  const nodes: XmindBomFlowNode[] = [];
  const edges: Edge[] = [];
  const selected = snapshot.selectedId;
  nodes.push({
    id: BOM_EDITOR_ROOT_ID,
    type: "xmindBomNode",
    position: dragPositions[BOM_EDITOR_ROOT_ID] ?? { x: 36, y: 260 },
    draggable: false,
    data: {
      kind: "root",
      label: rootLabel,
      subtitle: "正式 BOM 根節點",
      meta: `${snapshot.lines.length} 個正式節點`,
      selected: selected === BOM_EDITOR_ROOT_ID,
      mutable,
      collapsed: false,
      hasChildren: snapshot.lines.some((line) => !line.parent_line_id),
      editing: false,
      dropZone: dropPreview?.targetId === BOM_EDITOR_ROOT_ID ? dropPreview.zone : null,
      ...callbacks
    }
  });

  const visibleFormalIds = visibleBranchIds(snapshot.lines, "parent_line_id", snapshot.collapsedIds, snapshot.focusBranchId);
  const formalChildren = groupByParent(snapshot.lines, "parent_line_id");
  let formalRow = 0;
  const visitFormal = (parentId: string | null, depth: number) => {
    for (const line of formalChildren.get(parentId ?? ROOT_PARENT) ?? []) {
      if (!visibleFormalIds.has(line.id)) continue;
      const position = dragPositions[line.id] ?? { x: 330 + depth * 270, y: 56 + formalRow * 96 };
      formalRow += 1;
      nodes.push(editorFlowNode(line, "line", position, snapshot, mutable, editingId, dropPreview, callbacks));
      edges.push({ id: `formal-${line.parent_line_id ?? "root"}-${line.id}`, source: line.parent_line_id ?? BOM_EDITOR_ROOT_ID, target: line.id, className: "xmind-bom-edge formal" });
      if (!snapshot.collapsedIds.includes(line.id)) visitFormal(line.id, depth + 1);
    }
  };
  if (snapshot.focusBranchId && snapshot.lines.some((line) => line.id === snapshot.focusBranchId)) {
    const focus = snapshot.lines.find((line) => line.id === snapshot.focusBranchId) as BomEditorLine;
    const position = dragPositions[focus.id] ?? { x: 330, y: 180 };
    nodes.push(editorFlowNode(focus, "line", position, snapshot, mutable, editingId, dropPreview, callbacks));
    edges.push({ id: `focus-root-${focus.id}`, source: BOM_EDITOR_ROOT_ID, target: focus.id, className: "xmind-bom-edge formal" });
    if (!snapshot.collapsedIds.includes(focus.id)) visitFormal(focus.id, 1);
  } else {
    visitFormal(null, 0);
  }

  const visibleFloatingIds = visibleBranchIds(snapshot.floatingTopics, "parent_floating_topic_id", snapshot.collapsedIds, snapshot.focusBranchId);
  const floatingChildren = groupByParent(snapshot.floatingTopics, "parent_floating_topic_id");
  const visitFloating = (parentId: string | null, root: XYPosition, depth: number, rowState: { value: number }) => {
    for (const topic of floatingChildren.get(parentId ?? ROOT_PARENT) ?? []) {
      if (!visibleFloatingIds.has(topic.id)) continue;
      const topicRoot = parentId ? root : { x: topic.root_position_x, y: topic.root_position_y };
      const position = dragPositions[topic.id] ?? (parentId ? { x: topicRoot.x + depth * 250, y: topicRoot.y + rowState.value++ * 88 } : topicRoot);
      nodes.push(editorFlowNode(topic, "floating", position, snapshot, mutable, editingId, dropPreview, callbacks));
      if (topic.parent_floating_topic_id) edges.push({ id: `floating-${topic.parent_floating_topic_id}-${topic.id}`, source: topic.parent_floating_topic_id, target: topic.id, className: "xmind-bom-edge floating" });
      if (!snapshot.collapsedIds.includes(topic.id)) visitFloating(topic.id, topicRoot, depth + 1, rowState);
    }
  };
  visitFloating(null, { x: 0, y: 0 }, 0, { value: 1 });
  return { nodes, edges };
}

function editorFlowNode(
  node: BomEditorLine | BomEditorFloatingTopic,
  kind: "line" | "floating",
  position: XYPosition,
  snapshot: BomEditorSnapshot,
  mutable: boolean,
  editingId: string | null,
  dropPreview: DropPreview,
  callbacks: Pick<XmindBomFlowNode["data"], "onAddChild" | "onToggleCollapse" | "onCommitLabel" | "onCancelEdit">
): XmindBomFlowNode {
  return {
    id: node.id,
    type: "xmindBomNode",
    position,
    data: {
      kind,
      label: node.node_type === "group" ? node.group_name ?? "未命名群組" : node.part_number ?? "未命名料件",
      subtitle: node.node_type === "group" ? "群組" : node.part_name ?? "",
      meta: node.node_type === "item" ? `數量 ${node.quantity ?? 1}${node.revision ? ` · Rev ${node.revision}` : ""}` : "",
      selected: snapshot.selectedId === node.id,
      mutable,
      collapsed: snapshot.collapsedIds.includes(node.id),
      hasChildren: hasEditorChildren(snapshot, node.id),
      editing: editingId === node.id,
      dropZone: dropPreview?.targetId === node.id ? dropPreview.zone : null,
      ...callbacks
    }
  };
}

function resolveDropPreview(
  event: MouseEvent | TouchEvent,
  dragged: XmindBomFlowNode,
  snapshot: BomEditorSnapshot,
  canvas: HTMLDivElement | null,
  currentPreview: DropPreview
): DropPreview {
  if (!canvas) return null;
  const excluded = snapshot.lines.some((line) => line.id === dragged.id)
    ? collectBranchIds(snapshot.lines, dragged.id, "parent_line_id")
    : collectBranchIds(snapshot.floatingTopics, dragged.id, "parent_floating_topic_id");
  const point = "touches" in event && event.touches.length > 0
    ? { x: event.touches[0].clientX, y: event.touches[0].clientY }
    : { x: (event as MouseEvent).clientX, y: (event as MouseEvent).clientY };
  const elements = [...canvas.querySelectorAll<HTMLElement>("[data-editor-node-id]")];
  const zoneFor = (rect: DOMRect): BomDropZone => {
    const relativeY = (point.y - rect.top) / rect.height;
    return relativeY < 0.3 ? "before" : relativeY > 0.7 ? "after" : "child";
  };
  const isInDropHalo = (rect: DOMRect) => point.x >= rect.left - 28 && point.x <= rect.right + 28 && point.y >= rect.top - 24 && point.y <= rect.bottom + 24;
  if (currentPreview && !excluded.has(currentPreview.targetId)) {
    const currentTarget = elements.find((element) => element.dataset.editorNodeId === currentPreview.targetId);
    if (currentTarget) {
      const rect = currentTarget.getBoundingClientRect();
      if (isInDropHalo(rect)) return { targetId: currentPreview.targetId, zone: zoneFor(rect) };
    }
  }
  let nearest: { id: string; rect: DOMRect; distance: number } | null = null;
  for (const element of elements) {
    const id = element.dataset.editorNodeId;
    if (!id || id === dragged.id || excluded.has(id)) continue;
    const rect = element.getBoundingClientRect();
    if (!isInDropHalo(rect)) continue;
    const distance = Math.hypot(point.x - (rect.left + rect.width / 2), point.y - (rect.top + rect.height / 2));
    if (!nearest || distance < nearest.distance) nearest = { id, rect, distance };
  }
  if (!nearest) return null;
  return { targetId: nearest.id, zone: zoneFor(nearest.rect) };
}

function applyDrop(snapshot: BomEditorSnapshot, draggedId: string, preview: DropPreview, position: XYPosition): BomEditorSnapshot {
  if (draggedId === BOM_EDITOR_ROOT_ID) return snapshot;
  const formal = snapshot.lines.find((line) => line.id === draggedId);
  const floating = snapshot.floatingTopics.find((topic) => topic.id === draggedId);
  if (!preview) {
    if (formal) return formalBranchToFloating(snapshot, draggedId, position);
    if (floating) {
      const branchIds = collectBranchIds(snapshot.floatingTopics, draggedId, "parent_floating_topic_id");
      const root = snapshot.floatingTopics.find((topic) => topic.id === draggedId);
      if (root) {
        root.parent_floating_topic_id = null;
        root.root_position_x = position.x;
        root.root_position_y = position.y;
        for (const topic of snapshot.floatingTopics.filter((item) => branchIds.has(item.id) && item.id !== draggedId)) {
          if (!branchIds.has(topic.parent_floating_topic_id ?? "")) topic.parent_floating_topic_id = draggedId;
        }
      }
      snapshot.floatingTopics = normalizeFloatingSequences(snapshot.floatingTopics);
    }
    return snapshot;
  }

  const targetLine = snapshot.lines.find((line) => line.id === preview.targetId);
  const targetFloating = snapshot.floatingTopics.find((topic) => topic.id === preview.targetId);
  if (preview.targetId === BOM_EDITOR_ROOT_ID) {
    if (floating) return floatingBranchToFormal(snapshot, draggedId, null, "child");
    if (formal) {
      formal.parent_line_id = null;
      snapshot.lines = normalizeLineSequences(snapshot.lines);
    }
    return snapshot;
  }
  if (formal && targetLine) {
    formal.parent_line_id = preview.zone === "child" ? targetLine.id : targetLine.parent_line_id;
    formal.sequence_no = preview.zone === "before" ? targetLine.sequence_no - 0.5 : preview.zone === "after" ? targetLine.sequence_no + 0.5 : 9999;
    snapshot.lines = normalizeLineSequences(snapshot.lines);
    return snapshot;
  }
  if (floating && targetFloating) {
    floating.parent_floating_topic_id = preview.zone === "child" ? targetFloating.id : targetFloating.parent_floating_topic_id;
    floating.sequence_no = preview.zone === "before" ? targetFloating.sequence_no - 0.5 : preview.zone === "after" ? targetFloating.sequence_no + 0.5 : 9999;
    snapshot.floatingTopics = normalizeFloatingSequences(snapshot.floatingTopics);
    return snapshot;
  }
  if (formal && targetFloating) {
    const converted = formalBranchToFloating(snapshot, draggedId, position);
    const convertedRoot = converted.floatingTopics.find((topic) => topic.id === draggedId);
    if (convertedRoot) {
      convertedRoot.parent_floating_topic_id = preview.zone === "child" ? targetFloating.id : targetFloating.parent_floating_topic_id;
      convertedRoot.sequence_no = preview.zone === "before" ? targetFloating.sequence_no - 0.5 : preview.zone === "after" ? targetFloating.sequence_no + 0.5 : 9999;
      converted.floatingTopics = normalizeFloatingSequences(converted.floatingTopics);
    }
    return converted;
  }
  if (floating && targetLine) return floatingBranchToFormal(snapshot, draggedId, targetLine, preview.zone);
  return snapshot;
}

function formalBranchToFloating(snapshot: BomEditorSnapshot, rootId: string, position: XYPosition) {
  const branchIds = collectBranchIds(snapshot.lines, rootId, "parent_line_id");
  const branch = snapshot.lines.filter((line) => branchIds.has(line.id));
  snapshot.lines = normalizeLineSequences(snapshot.lines.filter((line) => !branchIds.has(line.id)));
  snapshot.floatingTopics.push(...branch.map((line) => ({
    id: line.id,
    logical_line_id: line.logical_line_id,
    bom_draft_id: line.bom_draft_id,
    parent_floating_topic_id: line.id === rootId ? null : line.parent_line_id,
    node_type: line.node_type,
    item_id: line.item_id,
    part_number: line.part_number,
    part_name: line.part_name,
    revision: line.revision,
    group_name: line.group_name,
    quantity: line.quantity,
    sequence_no: line.sequence_no,
    root_position_x: line.id === rootId ? position.x : 0,
    root_position_y: line.id === rootId ? position.y : 0,
    source: "manual" as const
  })));
  snapshot.components = snapshot.components.map((component) => branchIds.has(component.node_id) ? { ...component, node_location: "floating" } : component);
  snapshot.floatingTopics = normalizeFloatingSequences(snapshot.floatingTopics);
  return snapshot;
}

function floatingBranchToFormal(snapshot: BomEditorSnapshot, rootId: string, target: BomEditorLine | null, zone: BomDropZone) {
  const branchIds = collectBranchIds(snapshot.floatingTopics, rootId, "parent_floating_topic_id");
  const branch = snapshot.floatingTopics.filter((topic) => branchIds.has(topic.id));
  snapshot.floatingTopics = normalizeFloatingSequences(snapshot.floatingTopics.filter((topic) => !branchIds.has(topic.id)));
  const parentId = !target ? null : zone === "child" ? target.id : target.parent_line_id;
  snapshot.lines.push(...branch.map((topic) => ({
    id: topic.id,
    logical_line_id: topic.logical_line_id,
    bom_draft_id: topic.bom_draft_id,
    parent_line_id: topic.id === rootId ? parentId : topic.parent_floating_topic_id,
    node_type: topic.node_type,
    item_id: topic.item_id,
    part_number: topic.part_number,
    part_name: topic.part_name,
    revision: topic.revision,
    group_name: topic.group_name,
    quantity: topic.quantity,
    sequence_no: topic.id === rootId && target ? (zone === "before" ? target.sequence_no - 0.5 : zone === "after" ? target.sequence_no + 0.5 : 9999) : topic.sequence_no,
    source: "manual" as const,
    source_priority: 30
  })));
  snapshot.components = snapshot.components.map((component) => branchIds.has(component.node_id) ? { ...component, node_location: "tree" } : component);
  snapshot.lines = normalizeLineSequences(snapshot.lines);
  return snapshot;
}

function visibleBranchIds<T extends { id: string }>(nodes: T[], parentKey: "parent_line_id" | "parent_floating_topic_id", collapsedIds: string[], focusId: string | null) {
  const visible = new Set<string>();
  const children = groupByParent(nodes, parentKey);
  const visit = (id: string) => {
    visible.add(id);
    if (collapsedIds.includes(id)) return;
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  if (focusId && nodes.some((node) => node.id === focusId)) visit(focusId);
  else for (const root of children.get(ROOT_PARENT) ?? []) visit(root.id);
  return visible;
}

function groupByParent<T extends { id: string }>(nodes: T[], parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const grouped = new Map<string, T[]>();
  for (const node of nodes) {
    const parent = String((node as T & Record<string, string | null>)[parentKey] ?? ROOT_PARENT);
    grouped.set(parent, [...(grouped.get(parent) ?? []), node]);
  }
  for (const children of grouped.values()) children.sort((a, b) => Number((a as T & { sequence_no: number }).sequence_no) - Number((b as T & { sequence_no: number }).sequence_no));
  return grouped;
}

function collectBranchIds<T extends { id: string }>(nodes: T[], rootId: string, parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const ids = new Set<string>();
  const children = groupByParent(nodes, parentKey);
  const visit = (id: string) => {
    ids.add(id);
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  if (nodes.some((node) => node.id === rootId)) visit(rootId);
  return ids;
}

function normalizeLineSequences(lines: BomEditorLine[]) {
  return normalizeSequences(lines, "parent_line_id");
}

function normalizeFloatingSequences(topics: BomEditorFloatingTopic[]) {
  return normalizeSequences(topics, "parent_floating_topic_id");
}

function normalizeSequences<T extends { id: string; sequence_no: number }>(nodes: T[], parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const grouped = groupByParent(nodes, parentKey);
  const sequenceById = new Map<string, number>();
  for (const children of grouped.values()) children.forEach((child, index) => sequenceById.set(child.id, index + 1));
  return nodes.map((node) => ({ ...node, sequence_no: sequenceById.get(node.id) ?? node.sequence_no }));
}

function moveSibling<T extends { id: string; sequence_no: number }>(nodes: T[], node: T, direction: -1 | 1, parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const parent = (node as T & Record<string, string | null>)[parentKey] ?? null;
  const siblings = nodes.filter((item) => ((item as T & Record<string, string | null>)[parentKey] ?? null) === parent).sort((a, b) => a.sequence_no - b.sequence_no);
  const index = siblings.findIndex((item) => item.id === node.id);
  const other = siblings[index + direction];
  if (!other) return nodes;
  return normalizeSequences(nodes.map((item) => item.id === node.id ? { ...item, sequence_no: other.sequence_no } : item.id === other.id ? { ...item, sequence_no: node.sequence_no } : item), parentKey);
}

function siblingState(snapshot: BomEditorSnapshot, id: string | null) {
  const line = snapshot.lines.find((item) => item.id === id);
  const floating = snapshot.floatingTopics.find((item) => item.id === id);
  const nodes = line ? snapshot.lines : snapshot.floatingTopics;
  const key = line ? "parent_line_id" : "parent_floating_topic_id";
  const node = line ?? floating;
  if (!node) return { canMoveUp: false, canMoveDown: false };
  const parent = (node as typeof node & Record<string, string | null>)[key] ?? null;
  const siblings = nodes.filter((item) => ((item as typeof item & Record<string, string | null>)[key] ?? null) === parent).sort((a, b) => a.sequence_no - b.sequence_no);
  const index = siblings.findIndex((item) => item.id === id);
  return { canMoveUp: index > 0, canMoveDown: index >= 0 && index < siblings.length - 1 };
}

function findEditorNode(snapshot: BomEditorSnapshot, id: string | null) {
  if (!id || id === BOM_EDITOR_ROOT_ID) return null;
  return snapshot.lines.find((line) => line.id === id) ?? snapshot.floatingTopics.find((topic) => topic.id === id) ?? null;
}

function hasEditorChildren(snapshot: BomEditorSnapshot, id: string) {
  return snapshot.lines.some((line) => line.parent_line_id === id) || snapshot.floatingTopics.some((topic) => topic.parent_floating_topic_id === id);
}

function rootPositionForFloating(topics: BomEditorFloatingTopic[], topic: BomEditorFloatingTopic) {
  let current = topic;
  const seen = new Set<string>();
  while (current.parent_floating_topic_id && !seen.has(current.id)) {
    seen.add(current.id);
    current = topics.find((candidate) => candidate.id === current.parent_floating_topic_id) ?? current;
    if (current.id === topic.id) break;
  }
  return { x: current.root_position_x, y: current.root_position_y };
}

function makeFormalGroup(draftId: string, id: string, parentId: string | null, shared: boolean): BomEditorLine {
  return { id, logical_line_id: shared ? id : null, bom_draft_id: draftId, parent_line_id: parentId, node_type: "group", item_id: null, part_number: null, revision: null, group_name: "新主題", quantity: null, sequence_no: 9999, source: "manual", source_priority: 30 };
}

function makeFormalItem(draftId: string, id: string, parentId: string | null, item: BomEditorItemCandidate, preserveLegacyRevision: boolean, shared: boolean): BomEditorLine {
  return { id, logical_line_id: shared ? id : null, bom_draft_id: draftId, parent_line_id: parentId, node_type: "item", item_id: item.item_id, part_number: item.part_number, part_name: item.part_name, revision: preserveLegacyRevision ? item.revision || null : null, group_name: null, quantity: 1, sequence_no: 9999, source: "manual", source_priority: 30 };
}

function makeFloatingGroup(draftId: string, id: string, parentId: string | null, position: XYPosition, shared: boolean): BomEditorFloatingTopic {
  return { id, logical_line_id: shared ? id : null, bom_draft_id: draftId, parent_floating_topic_id: parentId, node_type: "group", item_id: null, part_number: null, revision: null, group_name: "Floating Topic", quantity: null, sequence_no: 9999, root_position_x: position.x, root_position_y: position.y, source: "manual" };
}

function makeFloatingItem(draftId: string, id: string, parentId: string | null, position: XYPosition, item: BomEditorItemCandidate, preserveLegacyRevision: boolean, shared: boolean): BomEditorFloatingTopic {
  return { id, logical_line_id: shared ? id : null, bom_draft_id: draftId, parent_floating_topic_id: parentId, node_type: "item", item_id: item.item_id, part_number: item.part_number, part_name: item.part_name, revision: preserveLegacyRevision ? item.revision || null : null, group_name: null, quantity: 1, sequence_no: 9999, root_position_x: position.x, root_position_y: position.y, source: "manual" };
}

function toPatchLine(line: BomEditorLine) {
  return { id: line.id, logicalLineId: line.logical_line_id, parentLineId: line.parent_line_id, nodeType: line.node_type, partNumber: line.part_number, revision: line.revision, groupName: line.group_name, quantity: line.quantity, sequenceNo: line.sequence_no };
}

function toPatchFloatingTopic(topic: BomEditorFloatingTopic) {
  return { id: topic.id, logicalLineId: topic.logical_line_id, parentFloatingTopicId: topic.parent_floating_topic_id, nodeType: topic.node_type, partNumber: topic.part_number, revision: topic.revision, groupName: topic.group_name, quantity: topic.quantity, sequenceNo: topic.sequence_no, rootPositionX: topic.root_position_x, rootPositionY: topic.root_position_y };
}

function makeSharedComponent(nodeId: string, nodeLocation: "tree" | "floating", item: BomEditorItemCandidate): BomEditorSharedComponent {
  const partNumberId = item.part_number_id ?? item.id;
  return {
    node_id: nodeId,
    logical_line_id: nodeId,
    node_location: nodeLocation,
    component_mode: "fixed",
    child_part_root_id: item.part_root_id ?? "",
    child_part_number_ids: [partNumberId],
    child_candidates: [{
      part_number_id: partNumberId,
      part_number: item.part_number,
      part_name: item.part_name,
      part_root_id: item.part_root_id ?? ""
    }],
    parent_selections: []
  };
}

function toPatchComponent(component: BomEditorSharedComponent) {
  return {
    nodeId: component.node_id,
    logicalLineId: component.logical_line_id,
    nodeLocation: component.node_location,
    componentMode: component.component_mode,
    childPartNumberIds: component.child_part_number_ids,
    parentSelections: component.parent_selections.map((selection) => ({
      parentPartNumberId: selection.parent_part_number_id,
      childPartNumberId: selection.child_part_number_id
    }))
  };
}

function listUnresolvedMappings(components: BomEditorSharedComponent[], parents: NonNullable<BomEditorDraftLike["applicable_parents"]>) {
  return components.flatMap((component) => component.component_mode === "by_parent"
    ? parents.filter((parent) => !component.parent_selections.some((selection) => selection.parent_part_number_id === parent.part_number_id))
      .map((parent) => ({ logicalLineId: component.logical_line_id, parentPartNumberId: parent.part_number_id }))
    : []);
}

function releaseExportUrl(releaseSnapshotId: string, format: "csv" | "xlsx", parentPartNumberId: string | null) {
  const params = new URLSearchParams({ format });
  if (parentPartNumberId) params.set("parentPartNumberId", parentPartNumberId);
  return `/api/bom/releases/${encodeURIComponent(releaseSnapshotId)}/export?${params.toString()}`;
}

function makeEditorId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `bom-node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
