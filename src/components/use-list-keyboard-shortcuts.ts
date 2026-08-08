"use client";

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from "react";
import { useCallback } from "react";
import { copyTextToClipboardBestEffort } from "@/lib/client-clipboard";

export const LIST_KEYBOARD_SHORTCUTS = "ArrowUp ArrowDown Enter Escape PageUp PageDown Home End Control+C";

type ShortcutSelectOptions = {
  openDetail: boolean;
};

type UseListKeyboardShortcutsOptions<T> = {
  items: T[];
  selectedKey: string | null;
  listRef: RefObject<HTMLElement | null>;
  rowSelector: string;
  getKey: (item: T) => string;
  getCopyText: (item: T) => string;
  onSelect: (item: T, options: ShortcutSelectOptions) => void;
  onOpenDetail: (item: T) => void;
  onCloseDetail: () => void;
  isDetailOpen: boolean;
};

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target.closest("input, textarea, select")) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true'], [contenteditable='']"));
}

function hasSelectedText() {
  return Boolean(window.getSelection()?.toString());
}

export function useListKeyboardShortcuts<T>({
  items,
  selectedKey,
  listRef,
  rowSelector,
  getKey,
  getCopyText,
  onSelect,
  onOpenDetail,
  onCloseDetail,
  isDetailOpen
}: UseListKeyboardShortcutsOptions<T>) {
  const focusList = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
  }, [listRef]);

  const scrollRowIntoView = useCallback(
    (index: number) => {
      requestAnimationFrame(() => {
        const rows = listRef.current?.querySelectorAll<HTMLElement>(rowSelector);
        rows?.[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    },
    [listRef, rowSelector]
  );

  const selectedIndex = useCallback(() => items.findIndex((item) => getKey(item) === selectedKey), [getKey, items, selectedKey]);

  const selectAt = useCallback(
    (index: number, openDetail: boolean) => {
      if (items.length === 0) return;
      const nextIndex = Math.min(Math.max(index, 0), items.length - 1);
      onSelect(items[nextIndex], { openDetail });
      scrollRowIntoView(nextIndex);
      focusList();
    },
    [focusList, items, onSelect, scrollRowIntoView]
  );

  const pageStep = useCallback(() => {
    const listElement = listRef.current;
    const firstRow = listElement?.querySelector<HTMLElement>(rowSelector);
    if (!listElement || !firstRow) return 8;
    return Math.max(1, Math.floor(listElement.clientHeight / Math.max(firstRow.getBoundingClientRect().height, 1)) - 1);
  }, [listRef, rowSelector]);

  const currentItem = useCallback(() => {
    if (items.length === 0) return null;
    const currentIndex = selectedIndex();
    return items[currentIndex === -1 ? 0 : currentIndex] ?? null;
  }, [items, selectedIndex]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (isEditableShortcutTarget(event.target)) return;

      if (event.key === "Escape") {
        if (!isDetailOpen) return;
        event.preventDefault();
        onCloseDetail();
        focusList();
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() !== "c" || hasSelectedText()) return;
        const item = currentItem();
        if (!item) return;
        event.preventDefault();
        void copyTextToClipboardBestEffort(getCopyText(item));
        return;
      }

      if (items.length === 0) return;

      const currentIndex = selectedIndex();
      const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectAt(currentIndex === -1 ? 0 : currentIndex + 1, isDetailOpen);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectAt(currentIndex === -1 ? items.length - 1 : currentIndex - 1, isDetailOpen);
      } else if (event.key === "PageDown") {
        event.preventDefault();
        selectAt(fallbackIndex + pageStep(), isDetailOpen);
      } else if (event.key === "PageUp") {
        event.preventDefault();
        selectAt(fallbackIndex - pageStep(), isDetailOpen);
      } else if (event.key === "Home") {
        event.preventDefault();
        selectAt(0, isDetailOpen);
      } else if (event.key === "End") {
        event.preventDefault();
        selectAt(items.length - 1, isDetailOpen);
      } else if (event.key === "Enter") {
        const item = currentItem();
        if (!item) return;
        event.preventDefault();
        onOpenDetail(item);
        focusList();
      }
    },
    [currentItem, focusList, getCopyText, isDetailOpen, items.length, onCloseDetail, onOpenDetail, pageStep, selectAt, selectedIndex]
  );

  return { handleKeyDown, shortcuts: LIST_KEYBOARD_SHORTCUTS };
}
