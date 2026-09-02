import {
  BOM_EDITOR_ROOT_ID,
  cloneBomEditorSnapshot,
  type BomEditorCommand,
  type BomEditorDraftLike,
  type BomEditorFloatingTopic,
  type BomEditorLine,
  type BomEditorLocalError,
  type BomEditorSnapshot,
  type BomEditorViewAction
} from "@/components/bom-editor/bom-editor-types";
import {
  createBomEditorHistory,
  currentBomEditorSnapshot,
  isBomEditorHistoryDirty,
  markBomEditorHistorySaved,
  pushBomEditorHistory,
  redoBomEditorHistory,
  undoBomEditorHistory,
  type BomEditorHistory
} from "@/lib/bom-editor-history";

export type BomEditorSaveState = "idle" | "saving" | "conflict" | "error";

export type BomEditorControllerState = {
  history: BomEditorHistory<BomEditorSnapshot>;
  editorVersion: number;
  saveState: BomEditorSaveState;
  error: BomEditorLocalError | null;
};

export type BomEditorControllerAction =
  | { type: "command"; command: BomEditorCommand }
  | { type: "view"; action: BomEditorViewAction }
  | { type: "hydrate"; draft: BomEditorDraftLike }
  | { type: "save.begin" }
  | { type: "save.success"; draft: BomEditorDraftLike; editorVersion: number }
  | { type: "save.failure"; code: string; message: string; conflict?: boolean }
  | { type: "error.clear" };

export function createBomEditorControllerState(draft: BomEditorDraftLike): BomEditorControllerState {
  return {
    history: createBomEditorHistory(snapshotFromDraft(draft)),
    editorVersion: draft.editor_version ?? 0,
    saveState: "idle",
    error: null
  };
}

export function bomEditorControllerReducer(
  state: BomEditorControllerState,
  action: BomEditorControllerAction
): BomEditorControllerState {
  if (action.type === "hydrate") return createBomEditorControllerState(action.draft);
  if (action.type === "error.clear") return { ...state, error: null };
  if (action.type === "save.begin") return { ...state, saveState: "saving", error: null };
  if (action.type === "save.failure") {
    return {
      ...state,
      saveState: action.conflict ? "conflict" : "error",
      error: { code: action.code, message: action.message }
    };
  }
  if (action.type === "save.success") {
    const current = currentBomEditorSnapshot(state.history);
    const saved = snapshotFromDraft(action.draft);
    saved.selectedId = hasNode(saved, current.selectedId) ? current.selectedId : saved.lines[0]?.id ?? saved.floatingTopics[0]?.id ?? BOM_EDITOR_ROOT_ID;
    saved.collapsedIds = current.collapsedIds.filter((id) => hasNode(saved, id));
    saved.focusBranchId = hasNode(saved, current.focusBranchId) ? current.focusBranchId : null;
    return {
      ...state,
      history: markBomEditorHistorySaved(state.history, saved),
      editorVersion: action.editorVersion,
      saveState: "idle",
      error: null
    };
  }
  if (action.type === "view") {
    return {
      ...state,
      history: {
        ...state.history,
        entries: state.history.entries.map((entry, index) => index === state.history.index ? applyViewAction(entry, action.action) : entry)
      },
      error: null
    };
  }

  if (action.command.type === "history.undo") return { ...state, history: undoBomEditorHistory(state.history), error: null };
  if (action.command.type === "history.redo") return { ...state, history: redoBomEditorHistory(state.history), error: null };

  const result = applyBomEditorCommand(currentBomEditorSnapshot(state.history), action.command);
  if (result.error) return { ...state, error: result.error };
  if (!result.snapshot) return state;
  return {
    ...state,
    history: pushBomEditorHistory(state.history, result.snapshot),
    error: null,
    saveState: "idle"
  };
}

export function snapshotFromDraft(draft: BomEditorDraftLike): BomEditorSnapshot {
  return {
    lines: normalizeLineSequences((draft.lines ?? []).map((line) => ({ ...line }))),
    floatingTopics: normalizeFloatingSequences((draft.floating_topics ?? []).map((topic) => ({ ...topic }))),
    components: (draft.components ?? []).map((component) => ({
      ...component,
      child_part_number_ids: [...component.child_part_number_ids],
      child_candidates: component.child_candidates?.map((candidate) => ({ ...candidate })),
      parent_selections: component.parent_selections.map((selection) => ({ ...selection }))
    })),
    selectedId: draft.lines?.[0]?.id ?? draft.floating_topics?.[0]?.id ?? BOM_EDITOR_ROOT_ID,
    collapsedIds: [],
    focusBranchId: null
  };
}

export function applyBomEditorCommand(snapshot: BomEditorSnapshot, command: BomEditorCommand): { snapshot?: BomEditorSnapshot; error?: BomEditorLocalError } {
  const next = cloneBomEditorSnapshot(snapshot);
  switch (command.type) {
    case "line.insert": {
      if (command.location === "formal") {
        if (command.parentId && !next.lines.some((line) => line.id === command.parentId)) return localError("BOM_PARENT_NOT_FOUND", "找不到要插入的父階層");
        const node: BomEditorLine = {
          ...command.node,
          parent_line_id: command.parentId,
          sequence_no: nextSequence(next.lines, command.parentId)
        };
        const siblings = next.lines.filter((line) => (line.parent_line_id ?? null) === command.parentId).sort((a, b) => a.sequence_no - b.sequence_no);
        const insertAt = command.afterId ? siblings.findIndex((line) => line.id === command.afterId) + 1 : siblings.length;
        node.sequence_no = insertAt >= 0 ? insertAt + 1 : siblings.length + 1;
        const ordered = siblings.filter((line) => line.id !== command.node.id);
        ordered.splice(insertAt >= 0 ? insertAt : ordered.length, 0, node);
        const siblingIds = new Set(ordered.map((line) => line.id));
        next.lines = [...next.lines.filter((line) => !siblingIds.has(line.id)), ...ordered];
        next.lines = normalizeLineSequences(next.lines);
        if (command.component) next.components.push(cloneComponent(command.component));
      } else {
        if (command.parentId && !next.floatingTopics.some((topic) => topic.id === command.parentId)) return localError("BOM_FLOATING_PARENT_NOT_FOUND", "找不到暫存區父階層");
        const node: BomEditorFloatingTopic = {
          ...command.node,
          parent_floating_topic_id: command.parentId,
          sequence_no: nextSequence(next.floatingTopics, command.parentId),
          root_position_x: 320,
          root_position_y: 220
        };
        const siblings = next.floatingTopics.filter((topic) => (topic.parent_floating_topic_id ?? null) === command.parentId).sort((a, b) => a.sequence_no - b.sequence_no);
        const insertAt = command.afterId ? siblings.findIndex((topic) => topic.id === command.afterId) + 1 : siblings.length;
        node.sequence_no = insertAt >= 0 ? insertAt + 1 : siblings.length + 1;
        const ordered = siblings.filter((topic) => topic.id !== command.node.id);
        ordered.splice(insertAt >= 0 ? insertAt : ordered.length, 0, node);
        const siblingIds = new Set(ordered.map((topic) => topic.id));
        next.floatingTopics = [...next.floatingTopics.filter((topic) => !siblingIds.has(topic.id)), ...ordered];
        next.floatingTopics = normalizeFloatingSequences(next.floatingTopics);
        if (command.component) next.components.push(cloneComponent(command.component));
      }
      next.selectedId = command.node.id;
      return { snapshot: next };
    }
    case "line.remove": {
      if (!hasNode(next, command.id)) return localError("BOM_NODE_NOT_FOUND", "找不到要移除的節點");
      if (command.mode === "branch") {
        const lineIds = collectBranchIds(next.lines, command.id, "parent_line_id");
        const floatingIds = collectBranchIds(next.floatingTopics, command.id, "parent_floating_topic_id");
        next.lines = normalizeLineSequences(next.lines.filter((line) => !lineIds.has(line.id)));
        next.floatingTopics = normalizeFloatingSequences(next.floatingTopics.filter((topic) => !floatingIds.has(topic.id)));
        next.components = next.components.filter((component) => !lineIds.has(component.node_id) && !floatingIds.has(component.node_id));
      } else {
        const line = next.lines.find((candidate) => candidate.id === command.id);
        if (line) {
          for (const child of next.lines.filter((candidate) => candidate.parent_line_id === line.id)) child.parent_line_id = line.parent_line_id;
          next.lines = normalizeLineSequences(next.lines.filter((candidate) => candidate.id !== line.id));
        }
        const floating = next.floatingTopics.find((candidate) => candidate.id === command.id);
        if (floating) {
          for (const child of next.floatingTopics.filter((candidate) => candidate.parent_floating_topic_id === floating.id)) child.parent_floating_topic_id = floating.parent_floating_topic_id;
          next.floatingTopics = normalizeFloatingSequences(next.floatingTopics.filter((candidate) => candidate.id !== floating.id));
        }
        next.components = next.components.filter((component) => component.node_id !== command.id);
      }
      next.selectedId = null;
      return { snapshot: next };
    }
    case "line.reparent": {
      const line = next.lines.find((candidate) => candidate.id === command.id);
      if (!line) return localError("BOM_LINE_NOT_FOUND", "只可調整正式 BOM 階層");
      if (command.parentId === command.id || (command.parentId && isDescendant(next.lines, command.id, command.parentId))) return localError("BOM_CYCLE", "不能把節點移入自己的子階層");
      if (command.parentId && !next.lines.some((candidate) => candidate.id === command.parentId)) return localError("BOM_PARENT_NOT_FOUND", "找不到要移入的父階層");
      const siblings = next.lines.filter((candidate) => (candidate.parent_line_id ?? null) === command.parentId && candidate.id !== command.id);
      if (!Number.isInteger(command.index) || command.index < 0 || command.index > siblings.length) return localError("BOM_INDEX_INVALID", "階層位置無效");
      line.parent_line_id = command.parentId;
      next.lines = reorderWithinParent(next.lines, command.id, command.parentId, command.index);
      return { snapshot: next };
    }
    case "line.reorder": {
      const line = next.lines.find((candidate) => candidate.id === command.id);
      if (!line) return localError("BOM_LINE_NOT_FOUND", "找不到要排序的節點");
      const parent = line.parent_line_id ?? null;
      const siblings = next.lines.filter((candidate) => (candidate.parent_line_id ?? null) === parent);
      if (!Number.isInteger(command.index) || command.index < 0 || command.index >= siblings.length) return localError("BOM_INDEX_INVALID", "排序位置無效");
      next.lines = reorderWithinParent(next.lines, command.id, parent, command.index);
      return { snapshot: next };
    }
    case "line.quantity.set": {
      const line = next.lines.find((candidate) => candidate.id === command.id) ?? next.floatingTopics.find((candidate) => candidate.id === command.id);
      if (!line) return localError("BOM_LINE_NOT_FOUND", "找不到要設定數量的節點");
      const numericQuantity = typeof command.quantity === "number" ? command.quantity : Number(command.quantity);
      if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) return localError("BOM_QUANTITY_INVALID", "數量必須是大於 0 的有限數字");
      line.quantity = command.quantity;
      return { snapshot: next };
    }
    case "line.group.rename": {
      const groupName = command.groupName.trim();
      if (!groupName) return localError("BOM_GROUP_NAME_REQUIRED", "群組名稱不可為空白");
      const line = next.lines.find((candidate) => candidate.id === command.id);
      const floating = next.floatingTopics.find((candidate) => candidate.id === command.id);
      if (line?.node_type === "group") line.group_name = groupName;
      else if (floating?.node_type === "group") floating.group_name = groupName;
      else return localError("BOM_GROUP_NOT_FOUND", "只可重新命名群組");
      return { snapshot: next };
    }
    case "line.location.move":
      return moveLocation(next, command);
    case "component.mapping.select": {
      const component = next.components.find((candidate) => candidate.logical_line_id === command.logicalLineId || candidate.node_id === command.logicalLineId);
      if (!component) return localError("BOM_COMPONENT_NOT_FOUND", "找不到零件對應");
      if (!component.child_part_number_ids.includes(command.childPartNumberId)) return localError("BOM_CANDIDATE_NOT_FOUND", "零件候選不存在");
      if (!component.parent_selections.some((selection) => selection.parent_part_number_id === command.parentPartNumberId)) {
        component.parent_selections.push({ parent_part_number_id: command.parentPartNumberId, child_part_number_id: command.childPartNumberId });
      } else {
        component.parent_selections = component.parent_selections.map((selection) => selection.parent_part_number_id === command.parentPartNumberId
          ? { ...selection, child_part_number_id: command.childPartNumberId }
          : selection);
      }
      return { snapshot: next };
    }
    case "component.replace": {
      const component = command.component;
      if (!hasNode(next, component.node_id)) return localError("BOM_COMPONENT_NODE_NOT_FOUND", "找不到零件對應所屬節點");
      const index = next.components.findIndex((candidate) => candidate.node_id === component.node_id || candidate.logical_line_id === component.logical_line_id);
      const normalized = cloneComponent(component);
      if (index >= 0) next.components[index] = normalized;
      else next.components.push(normalized);
      return { snapshot: next };
    }
    default:
      return localError("BOM_COMMAND_UNSUPPORTED", "目前不支援此 BOM 操作");
  }
}

export function isBomEditorDirty(state: BomEditorControllerState) {
  return isBomEditorHistoryDirty(state.history);
}

function applyViewAction(snapshot: BomEditorSnapshot, action: BomEditorViewAction): BomEditorSnapshot {
  const next = cloneBomEditorSnapshot(snapshot);
  switch (action.type) {
    case "selection.set": next.selectedId = action.id; break;
    case "collapse.toggle": {
      const collapsed = new Set(next.collapsedIds);
      if (collapsed.has(action.id)) collapsed.delete(action.id); else collapsed.add(action.id);
      next.collapsedIds = [...collapsed];
      break;
    }
    case "focus.set": next.focusBranchId = action.id; break;
    case "view.set": break;
    case "floating.expanded.set": break;
    case "inspector.set": break;
  }
  return next;
}

function moveLocation(snapshot: BomEditorSnapshot, command: Extract<BomEditorCommand, { type: "line.location.move" }>): { snapshot?: BomEditorSnapshot; error?: BomEditorLocalError } {
  if (command.to === "formal") {
    const root = snapshot.floatingTopics.find((topic) => topic.id === command.id);
    if (!root) return localError("BOM_FLOATING_NOT_FOUND", "找不到要歸位的暫存節點");
    if (command.parentId && !snapshot.lines.some((line) => line.id === command.parentId)) return localError("BOM_PARENT_NOT_FOUND", "找不到正式階層父節點");
    const ids = collectBranchIds(snapshot.floatingTopics, command.id, "parent_floating_topic_id");
    const branch = snapshot.floatingTopics.filter((topic) => ids.has(topic.id));
    snapshot.floatingTopics = normalizeFloatingSequences(snapshot.floatingTopics.filter((topic) => !ids.has(topic.id)));
    const converted = branch.map((topic) => ({
      ...topic,
      parent_line_id: topic.id === command.id ? command.parentId : null,
      sequence_no: topic.id === command.id ? command.index + 1 : topic.sequence_no
    }));
    const parentByOld = new Map(branch.map((topic) => [topic.id, topic.parent_floating_topic_id]));
    const lines = converted.map((topic) => ({
      id: topic.id,
      logical_line_id: topic.logical_line_id,
      bom_draft_id: topic.bom_draft_id,
      parent_line_id: topic.id === command.id ? command.parentId : parentByOld.get(topic.id) && ids.has(parentByOld.get(topic.id)!) ? parentByOld.get(topic.id)! : command.parentId,
      node_type: topic.node_type,
      item_id: topic.item_id,
      part_number: topic.part_number,
      part_name: topic.part_name,
      revision: topic.revision,
      group_name: topic.group_name,
      quantity: topic.quantity,
      sequence_no: topic.sequence_no,
      source: topic.source,
      source_priority: 30
    } satisfies BomEditorLine));
    snapshot.lines = normalizeLineSequences([...snapshot.lines, ...lines]);
    snapshot.components = snapshot.components.map((component) => ids.has(component.node_id) ? { ...component, node_location: "tree" } : component);
    return { snapshot };
  }

  const root = snapshot.lines.find((line) => line.id === command.id);
  if (!root) return localError("BOM_LINE_NOT_FOUND", "找不到要暫存的正式節點");
  if (command.parentId && !snapshot.floatingTopics.some((topic) => topic.id === command.parentId)) return localError("BOM_FLOATING_PARENT_NOT_FOUND", "找不到暫存區父節點");
  const ids = collectBranchIds(snapshot.lines, command.id, "parent_line_id");
  const branch = snapshot.lines.filter((line) => ids.has(line.id));
  snapshot.lines = normalizeLineSequences(snapshot.lines.filter((line) => !ids.has(line.id)));
  const parentByOld = new Map(branch.map((line) => [line.id, line.parent_line_id]));
  const topics = branch.map((line) => ({
    id: line.id,
    logical_line_id: line.logical_line_id,
    bom_draft_id: line.bom_draft_id,
    parent_floating_topic_id: line.id === command.id ? command.parentId : parentByOld.get(line.id) && ids.has(parentByOld.get(line.id)!) ? parentByOld.get(line.id)! : command.parentId,
    node_type: line.node_type,
    item_id: line.item_id,
    part_number: line.part_number,
    part_name: line.part_name,
    revision: line.revision,
    group_name: line.group_name,
    quantity: line.quantity,
    sequence_no: line.id === command.id ? command.index + 1 : line.sequence_no,
    root_position_x: command.rootPosition?.x ?? 320,
    root_position_y: command.rootPosition?.y ?? 220,
    source: line.source
  } satisfies BomEditorFloatingTopic));
  snapshot.floatingTopics = normalizeFloatingSequences([...snapshot.floatingTopics, ...topics]);
  snapshot.components = snapshot.components.map((component) => ids.has(component.node_id) ? { ...component, node_location: "floating" } : component);
  return { snapshot };
}

function localError(code: string, message: string): { error: BomEditorLocalError } {
  return { error: { code, message } };
}

function cloneComponent(component: BomEditorSnapshot["components"][number]): BomEditorSnapshot["components"][number] {
  return {
    ...component,
    child_part_number_ids: [...component.child_part_number_ids],
    child_candidates: component.child_candidates?.map((candidate) => ({ ...candidate })),
    parent_selections: component.parent_selections.map((selection) => ({ ...selection }))
  };
}

function hasNode(snapshot: BomEditorSnapshot, id: string | null): boolean {
  return Boolean(id && (id === BOM_EDITOR_ROOT_ID || snapshot.lines.some((line) => line.id === id) || snapshot.floatingTopics.some((topic) => topic.id === id)));
}

function groupByParent<T extends { id: string; sequence_no: number }>(nodes: T[], parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const grouped = new Map<string, T[]>();
  for (const node of nodes) {
    const parent = String((node as T & Record<string, string | null>)[parentKey] ?? "__root__");
    grouped.set(parent, [...(grouped.get(parent) ?? []), node]);
  }
  for (const children of grouped.values()) children.sort((a, b) => a.sequence_no - b.sequence_no);
  return grouped;
}

function collectBranchIds<T extends { id: string }>(nodes: T[], rootId: string, parentKey: "parent_line_id" | "parent_floating_topic_id") {
  const ids = new Set<string>();
  const children = groupByParent(nodes as Array<T & { sequence_no: number }>, parentKey);
  const visit = (id: string) => {
    ids.add(id);
    for (const child of children.get(id) ?? []) visit(child.id);
  };
  if (nodes.some((node) => node.id === rootId)) visit(rootId);
  return ids;
}

function nextSequence<T extends { sequence_no: number }>(nodes: T[], parentId: string | null, parentKey: "parent_line_id" | "parent_floating_topic_id" = "parent_line_id") {
  return nodes.filter((node) => ((node as T & Record<string, string | null>)[parentKey] ?? null) === parentId).length + 1;
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

function reorderWithinParent(nodes: BomEditorLine[], id: string, parentId: string | null, index: number) {
  const siblings = nodes.filter((node) => (node.parent_line_id ?? null) === parentId && node.id !== id).sort((a, b) => a.sequence_no - b.sequence_no);
  const moving = nodes.find((node) => node.id === id);
  if (!moving) return nodes;
  siblings.splice(index, 0, moving);
  const order = new Map(siblings.map((node, position) => [node.id, position + 1]));
  return nodes.map((node) => ({ ...node, sequence_no: order.get(node.id) ?? node.sequence_no }));
}

function isDescendant(lines: BomEditorLine[], rootId: string, possibleDescendantId: string) {
  let current = lines.find((line) => line.id === possibleDescendantId)?.parent_line_id ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    if (current === rootId) return true;
    seen.add(current);
    current = lines.find((line) => line.id === current)?.parent_line_id ?? null;
  }
  return false;
}
