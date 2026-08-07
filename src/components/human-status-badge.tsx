"use client";

import { AlertTriangle, Archive, Check, Clock3, Play } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { humanStatusDetail, humanStatusPrimaryLabel, type HumanStatusIcon, type HumanStatusProjection, type ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { AvailabilityScopeProjection } from "@/lib/availability-scope";

const iconMap: Record<HumanStatusIcon, typeof AlertTriangle> = {
  alert: AlertTriangle,
  archive: Archive,
  check: Check,
  clock: Clock3,
  play: Play
};

export function HumanStatusBadge({ status, viewerStatus, availabilityScope, className = "" }: { status: HumanStatusProjection | null | undefined; viewerStatus?: ViewerHumanStatusProjection | null; availabilityScope?: AvailabilityScopeProjection | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const detailId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        setPinned(false);
        anchorRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [open]);

  if (!status) return null;
  const viewerLabel = humanStatusPrimaryLabel(status, viewerStatus);
  const primaryLabel = viewerStatus?.category === "usable" && availabilityScope?.label ? availabilityScope.label : viewerLabel;
  const detail = humanStatusDetail(status, viewerStatus);
  const availabilityNeedsReview = viewerStatus?.category === "usable" && availabilityScope?.scope === "unknown";
  const Icon = availabilityNeedsReview ? AlertTriangle : iconMap[viewerStatus?.icon ?? status.icon];
  const tone = availabilityNeedsReview ? "warning" : viewerStatus?.tone ?? status.tone;

  return (
    <span
      ref={anchorRef}
      className={`human-status-badge-anchor ${open ? "is-open" : ""}`.trim()}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      aria-describedby={open ? detailId : undefined}
      aria-label={`狀態：${primaryLabel}，查看說明`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!pinned && !event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
      onClick={(event) => {
        event.stopPropagation();
        setPinned((value) => {
          const next = !value;
          setOpen(next);
          return next;
        });
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          setPinned((value) => {
            const next = !value;
            setOpen(next);
            return next;
          });
        }
      }}
    >
      <span
        className={`human-status-badge is-${tone} ${className}`.trim()}
        data-human-status-key={status.key}
        data-human-status-phase={status.phase}
        data-human-status-label={status.label}
        data-human-status-primary={primaryLabel}
        data-viewer-status-category={viewerStatus?.category ?? "unavailable"}
        data-viewer-status-basis={viewerStatus?.basis ?? "unavailable"}
        data-availability-scope={availabilityScope?.scope ?? "unavailable"}
      >
        <Icon size={13} aria-hidden="true" />
        <span>{primaryLabel}</span>
      </span>
      {open ? (
        <span id={detailId} className="human-status-detail-popover" role="tooltip">
          <strong>{detail.title}</strong>
          <span>{detail.summary}</span>
          <span>{detail.actor}</span>
          {viewerStatus && viewerStatus.category !== "usable" && viewerStatus.category !== "terminal"
            ? <span>{detail.autoCompletes ? "完成後會自動更新" : "需要人員完成"}</span>
            : null}
          {availabilityScope?.summary && (viewerStatus?.category === "usable" || availabilityScope.scope === "unknown")
            ? <span>可用範圍：{availabilityScope.summary}</span>
            : null}
          {detail.nextStep ? <span className="human-status-detail-next">下一步：{detail.nextStep}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
