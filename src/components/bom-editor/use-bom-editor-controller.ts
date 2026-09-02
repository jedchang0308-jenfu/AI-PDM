"use client";

import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  bomEditorControllerReducer,
  createBomEditorControllerState,
  isBomEditorDirty,
  type BomEditorControllerAction,
  type BomEditorControllerState
} from "@/components/bom-editor/bom-editor-reducer";
import type {
  BomEditorCommand,
  BomEditorDraftLike,
  BomEditorViewAction
} from "@/components/bom-editor/bom-editor-types";
import { currentBomEditorSnapshot } from "@/lib/bom-editor-history";

export function useBomEditorController(draft: BomEditorDraftLike) {
  const [state, dispatch] = useReducer(bomEditorControllerReducer, draft, createBomEditorControllerState);
  const appliedDraftVersion = useRef(`${draft.id}:${draft.editor_version ?? 0}`);

  useEffect(() => {
    const key = `${draft.id}:${draft.editor_version ?? 0}`;
    if (appliedDraftVersion.current === key) return;
    appliedDraftVersion.current = key;
    dispatch({ type: "hydrate", draft });
  }, [draft]);

  const snapshot = currentBomEditorSnapshot(state.history);
  const dirty = isBomEditorDirty(state);
  const actions = useMemo(() => ({
    command: (command: BomEditorCommand) => dispatch({ type: "command", command }),
    view: (action: BomEditorViewAction) => dispatch({ type: "view", action }),
    beginSave: () => dispatch({ type: "save.begin" }),
    saveSuccess: (nextDraft: BomEditorDraftLike, editorVersion: number) => {
      appliedDraftVersion.current = `${nextDraft.id}:${editorVersion}`;
      dispatch({ type: "save.success", draft: nextDraft, editorVersion });
    },
    saveFailure: (code: string, message: string, conflict = false) => dispatch({ type: "save.failure", code, message, conflict }),
    clearError: () => dispatch({ type: "error.clear" }),
    hydrate: (nextDraft: BomEditorDraftLike) => {
      appliedDraftVersion.current = `${nextDraft.id}:${nextDraft.editor_version ?? 0}`;
      dispatch({ type: "hydrate", draft: nextDraft });
    }
  }), []);

  return {
    state,
    snapshot,
    dirty,
    canUndo: state.history.index > 0,
    canRedo: state.history.index < state.history.entries.length - 1,
    ...actions
  };
}

export type BomEditorController = ReturnType<typeof useBomEditorController>;
export type BomEditorControllerDispatch = (action: BomEditorControllerAction) => void;
