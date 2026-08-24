"use client";

import { useEffect, useRef, useState } from "react";
import { FolderPlus, LoaderCircle, PackagePlus, Search } from "lucide-react";
import type { BomEditorItemCandidate } from "@/components/bom-editor/bom-editor-types";

type InlinePickerProps = {
  x: number;
  y: number;
  onPickItem: (item: BomEditorItemCandidate) => void;
  onCreateGroup: () => void;
  onClose: () => void;
  canonicalParts?: boolean;
};

export function BomInlinePicker({ x, y, onPickItem, onCreateGroup, onClose, canonicalParts = false }: InlinePickerProps) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<BomEditorItemCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}${canonicalParts ? "&entity=part" : ""}`, { signal: controller.signal });
        const body = (await response.json().catch(() => ({}))) as { submissions?: BomEditorItemCandidate[]; parts?: BomEditorItemCandidate[] };
        if (response.ok) setItems(canonicalParts ? body.parts ?? [] : body.submissions ?? []);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canonicalParts, query]);

  return (
    <div className="xmind-bom-inline-picker" role="dialog" aria-label="插入主題" style={{ left: x, top: y }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="xmind-bom-inline-picker-search">
        <Search aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          placeholder="搜尋料號或品名"
          aria-label="搜尋料件"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter" && items[0]) onPickItem(items[0]);
          }}
        />
        {loading ? <LoaderCircle className="spin" aria-label="搜尋中" /> : null}
      </div>
      <button className="xmind-bom-inline-create-group" type="button" onClick={onCreateGroup}>
        <FolderPlus aria-hidden="true" />
        <span>建立群組主題</span>
        <kbd>Enter</kbd>
      </button>
      <div className="xmind-bom-inline-results" role="listbox" aria-label="料件搜尋結果">
        {items.map((item) => (
          <button key={item.id} type="button" role="option" onClick={() => onPickItem(item)}>
            <PackagePlus aria-hidden="true" />
            <span><strong>{item.part_number}</strong><small>{item.part_name || "未填品名"}</small></span>
            <em>{item.revision ? `來源 Drawing Rev ${item.revision}` : "無來源 Drawing Rev"}</em>
          </button>
        ))}
        {query.trim().length >= 2 && !loading && items.length === 0 ? <p>找不到可插入的料件</p> : null}
      </div>
    </div>
  );
}
