export type BomEditorHistory<T> = {
  entries: T[];
  index: number;
  savedIndex: number;
};

export function createBomEditorHistory<T>(initial: T): BomEditorHistory<T> {
  return { entries: [initial], index: 0, savedIndex: 0 };
}

export function pushBomEditorHistory<T>(history: BomEditorHistory<T>, next: T, limit = 100): BomEditorHistory<T> {
  const entries = [...history.entries.slice(0, history.index + 1), next];
  const overflow = Math.max(0, entries.length - limit);
  return {
    entries: entries.slice(overflow),
    index: entries.length - overflow - 1,
    savedIndex: Math.max(-1, history.savedIndex - overflow)
  };
}

export function undoBomEditorHistory<T>(history: BomEditorHistory<T>): BomEditorHistory<T> {
  return history.index > 0 ? { ...history, index: history.index - 1 } : history;
}

export function redoBomEditorHistory<T>(history: BomEditorHistory<T>): BomEditorHistory<T> {
  return history.index < history.entries.length - 1 ? { ...history, index: history.index + 1 } : history;
}

export function markBomEditorHistorySaved<T>(history: BomEditorHistory<T>, saved: T): BomEditorHistory<T> {
  return { entries: [saved], index: 0, savedIndex: 0 };
}

export function currentBomEditorSnapshot<T>(history: BomEditorHistory<T>): T {
  return history.entries[history.index];
}

export function isBomEditorHistoryDirty<T>(history: BomEditorHistory<T>) {
  return history.index !== history.savedIndex;
}
