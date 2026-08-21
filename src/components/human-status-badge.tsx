"use client";

import { AlertTriangle, Archive, Check, Clock3, Play } from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { humanStatusDetail, type HumanStatusIcon, type HumanStatusProjection, type ViewerHumanStatusProjection } from "@/lib/human-status-projection";
import type { AvailabilityScopeProjection } from "@/lib/availability-scope";
import { type ResponsibilityStatusProjection, type ViewerActionabilityProjection } from "@/lib/responsibility-status-projection";
import { StatusSignalGroup } from "@/components/status-signal-group";
import type { StatusSignalInput, StatusSurface } from "@/lib/status-visibility-policy";
import { projectWorkStatusPresentation } from "@/lib/work-status-presentation";

const iconMap: Record<HumanStatusIcon, typeof AlertTriangle> = {
  alert: AlertTriangle,
  archive: Archive,
  check: Check,
  clock: Clock3,
  play: Play
};

export function HumanStatusBadge({ status, responsibilityStatus, viewerActionability, viewerStatus, availabilityScope, exceptionSignals = [], surface = "list", className = "" }: { status: HumanStatusProjection | null | undefined; responsibilityStatus?: ResponsibilityStatusProjection | null; viewerActionability?: ViewerActionabilityProjection | null; viewerStatus?: ViewerHumanStatusProjection | null; availabilityScope?: AvailabilityScopeProjection | null; exceptionSignals?: readonly StatusSignalInput[]; surface?: StatusSurface; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ left: 12, top: 12 });
  const detailId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;

    function positionPopover() {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const viewportPadding = 12;
      const anchorRect = anchor.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();
      const maxLeft = Math.max(viewportPadding, window.innerWidth - popoverRect.width - viewportPadding);
      const left = Math.min(Math.max(anchorRect.left, viewportPadding), maxLeft);
      const below = anchorRect.bottom + 8;
      const top = below + popoverRect.height <= window.innerHeight - viewportPadding
        ? below
        : Math.max(viewportPadding, anchorRect.top - popoverRect.height - 8);
      setPopoverPosition((current) => current.left === left && current.top === top ? current : { left, top });
    }

    positionPopover();
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open]);

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
  const presentation = projectWorkStatusPresentation({ status, responsibilityStatus, availabilityScope });
  if (!presentation) return null;
  const primaryLabel = presentation.label;
  const detail = humanStatusDetail(status, null);
  const Icon = iconMap[presentation.icon];
  const tone = presentation.tone;
  const stableActor = presentation.kind === "terminal_result"
    ? "目前不用處理"
    : presentation.reason === "automatic_finalization"
      ? "系統"
      : presentation.reason === "system_admin_recovery"
        ? "系統管理員"
        : responsibilityStatus?.actorLabel ?? "責任待確認";
  const stableNextStep = responsibilityStatus?.nextStep ?? detail.nextStep;

  const primaryBadge = (
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
        data-human-status-presentation-kind={presentation.kind}
        data-human-status-presentation-reason={presentation.reason}
        data-responsibility-status-category={responsibilityStatus?.category ?? "unknown"}
        data-responsibility-status-basis={responsibilityStatus?.basis ?? "unknown"}
        data-viewer-actionability={viewerActionability?.isMine ? "mine" : "not-mine"}
        data-viewer-status-category={viewerStatus?.category ?? "unavailable"}
        data-viewer-status-basis={viewerStatus?.basis ?? "unavailable"}
        data-availability-scope={availabilityScope?.scope ?? "unavailable"}
      >
        <Icon size={13} aria-hidden="true" />
        <span>{primaryLabel}</span>
      </span>
      {open ? (
        <span
          ref={popoverRef}
          id={detailId}
          className="human-status-detail-popover"
          role="tooltip"
          style={{ left: popoverPosition.left, top: popoverPosition.top } as CSSProperties}
        >
          <strong>{presentation.label}</strong>
          <span>{presentation.description}</span>
          <span>{stableActor}</span>
          {presentation.reason === "automatic_finalization" ? <span>不需人工操作</span> : null}
          {availabilityScope?.summary && (presentation.reason === "availability_unknown" || presentation.reason === "rd_available" || presentation.reason === "production_available")
            ? <span>可用範圍：{availabilityScope.summary}</span>
            : null}
          {presentation.kind === "work_status" && ["owner", "review_owner", "system_admin_recovery"].includes(presentation.reason) && stableNextStep
            ? <span className="human-status-detail-next">處理：{stableNextStep}</span>
            : null}
          {viewerActionability && responsibilityStatus && ["owner", "review_owner", "system_admin"].includes(responsibilityStatus.category)
            ? <span>目前使用者：{viewerActionability.canAct ? "可處理" : viewerActionability.isMine ? "負責此角色但條件尚未滿足" : "非此筆處理人"}</span>
            : null}
        </span>
      ) : null}
    </span>
  );
  return <StatusSignalGroup signals={exceptionSignals} surface={surface} primary={primaryBadge} />;
}
