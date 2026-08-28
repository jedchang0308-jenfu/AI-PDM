"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewPackageMarkerFacts } from "@/lib/pdm-review-package-contract";

type MarkerKind = "submitted" | "change" | "risk";

function markerDescription(kind: MarkerKind, facts: ReviewPackageMarkerFacts) {
  if (kind === "submitted") return "此對象屬於本次送審範圍";
  if (kind === "change") return `此對象包含${facts.change?.kind === "file" ? "檔案" : facts.change?.kind === "lifecycle" ? "生命週期" : "欄位"}變更${facts.change?.paths.length ? `：${facts.change.paths.join("、")}` : ""}`;
  return `此對象有${facts.risk?.level === "high" ? "高風險" : "注意"}事項${facts.risk?.codes.length ? `：${facts.risk.codes.join("、")}` : ""}`;
}

export function ReviewTargetMarkerSlots({ targetKey, facts }: { targetKey: string; facts: ReviewPackageMarkerFacts }) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRefs = useRef(new Map<MarkerKind, HTMLButtonElement>());
  const [open, setOpen] = useState<MarkerKind | null>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(null); setPinned(false);
    }
    function closeFromEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const trigger = open ? triggerRefs.current.get(open) : null;
      setOpen(null); setPinned(false); trigger?.focus();
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  const present: Record<MarkerKind, boolean> = {
    submitted: facts.submitted,
    change: facts.change !== null,
    risk: facts.risk !== null
  };

  return <span className="review-target-marker-slots" ref={rootRef} data-review-marker-slots={targetKey}>
    {(["submitted", "change", "risk"] as const).map((kind) => {
      const id = `review-marker-${kind}-${targetKey.replace(/[^a-z0-9_-]/giu, "-")}`;
      if (!present[kind]) return <span key={kind} className={`review-target-marker-slot is-${kind}`} data-marker-slot={kind} aria-hidden="true" />;
      const description = markerDescription(kind, facts);
      return <span key={kind} className={`review-target-marker-slot is-${kind}`} data-marker-slot={kind}>
        <button
          ref={(node) => { if (node) triggerRefs.current.set(kind, node); else triggerRefs.current.delete(kind); }}
          type="button"
          className={`review-target-marker-trigger is-${kind}`}
          aria-label={description}
          aria-expanded={open === kind}
          aria-describedby={open === kind ? id : undefined}
          onPointerEnter={() => { if (!pinned) setOpen(kind); }}
          onPointerLeave={() => { if (!pinned) setOpen(null); }}
          onFocus={() => { if (!pinned) setOpen(kind); }}
          onBlur={(event) => { if (!pinned && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(null); }}
          onClick={(event) => {
            event.stopPropagation();
            if (open === kind && pinned) { setOpen(null); setPinned(false); }
            else { setOpen(kind); setPinned(true); }
          }}
        />
        {open === kind ? <span id={id} className="review-target-marker-popover" role="tooltip">{description}</span> : null}
      </span>;
    })}
  </span>;
}
