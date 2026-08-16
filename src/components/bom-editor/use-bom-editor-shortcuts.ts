"use client";

import { useEffect, useRef } from "react";

type ShortcutHandlers = {
  enabled: boolean;
  mutable: boolean;
  overlayOpen: boolean;
  onTopic: () => void;
  onSubtopic: () => void;
  onParentTopic: () => void;
  onEdit: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDeleteOnly: () => void;
  onDeleteBranch: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onToggleFold: () => void;
  onToggleAllFolds: () => void;
  onToggleFocus: () => void;
  onEscape: () => void;
  onSave: () => void;
  onSelectRoot: () => void;
};

export function useBomEditorShortcuts(handlers: ShortcutHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!handlers.enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const active = handlersRef.current;
      if (isEditableTarget(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const run = (action: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      };

      if (event.key === "Escape") return run(active.onEscape);
      if (active.overlayOpen) return;
      if (command && key === "s") return run(active.onSave);
      if (command && key === "z" && !event.shiftKey) return run(active.onUndo);
      if ((command && key === "z" && event.shiftKey) || (command && key === "y")) return run(active.onRedo);
      if (command && event.altKey && event.key === "/") return run(active.onToggleAllFolds);
      if (command && event.key === "/") return run(active.onToggleFold);
      if (command && event.key === ";") return run(active.onToggleFocus);
      if (event.key === "Home" && !command && !event.altKey) return run(active.onSelectRoot);

      if (!active.mutable) return;
      if (command && event.key === "Enter") return run(active.onParentTopic);
      if (event.key === "Enter" && !command && !event.altKey) return run(active.onTopic);
      if (event.key === "Tab" && !command && !event.altKey) return run(active.onSubtopic);
      if (event.key === " " && !command && !event.altKey) return run(active.onEdit);
      if (event.altKey && event.key === "ArrowUp") return run(active.onMoveUp);
      if (event.altKey && event.key === "ArrowDown") return run(active.onMoveDown);
      if (command && event.key === "Delete") return run(active.onDeleteOnly);
      if (event.key === "Delete" && !command) return run(active.onDeleteBranch);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [handlers.enabled]);
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu']"));
}
