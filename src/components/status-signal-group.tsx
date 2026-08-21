"use client";

import { AlertTriangle, Info } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { projectStatusSignals, type StatusSignalInput, type StatusSurface, type StatusVisibilityProjection } from "@/lib/status-visibility-policy";

type StatusSignalGroupProps = {
  signals?: readonly StatusSignalInput[];
  surface?: StatusSurface;
  primary?: ReactNode;
  className?: string;
};

function signalTone(projection: StatusVisibilityProjection) {
  if (projection.severity === "critical" || projection.severity === "blocking") return "critical";
  if (projection.severity === "action_required") return "warning";
  return "info";
}

export function StatusSignalGroup({ signals = [], surface = "list", primary, className = "" }: StatusSignalGroupProps) {
  const aggregate = projectStatusSignals(signals, surface);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const padding = 12;
    const gap = 8;
    const width = Math.min(390, Math.max(280, window.innerWidth - padding * 2));
    const left = Math.min(Math.max(padding, rect.left), Math.max(padding, window.innerWidth - width - padding));
    const belowTop = rect.bottom + gap;
    const belowSpace = window.innerHeight - belowTop - padding;
    const aboveSpace = rect.top - gap - padding;
    const placeAbove = belowSpace < 230 && aboveSpace > belowSpace;
    const maxHeight = Math.min(460, Math.max(180, placeAbove ? aboveSpace : belowSpace));
    const top = placeAbove ? Math.max(padding, rect.top - maxHeight - gap) : belowTop;
    setPosition({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setPosition(null);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (rootRef.current?.contains(target) || panelRef.current?.contains(target))) return;
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  const hasDetail = aggregate.exceptions.length > 0 || aggregate.details.length > 0;
  const representative = aggregate.exception;
  const detailCount = aggregate.exceptions.length + aggregate.details.length;
  const triggerLabel = representative
    ? `${representative.label}${aggregate.exceptions.length > 1 ? `，另有 ${aggregate.exceptions.length - 1} 項` : ""}，查看原因與處理說明`
    : `查看 ${detailCount} 項狀態說明`;

  const panel = open && position && hasDetail && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={panelRef}
          id={panelId}
          className="status-signal-popover"
          role="dialog"
          aria-label="狀態原因與處理說明"
          style={position}
          onClick={(event) => event.stopPropagation()}
        >
          <strong>狀態原因與處理說明</strong>
          <div className="status-signal-popover-list">
            {[...aggregate.exceptions, ...aggregate.details].map((item) => (
              <div className={`status-signal-popover-item is-${signalTone(item)}`} key={`${item.id}:${item.reason}`}>
                <span className="status-signal-popover-label">
                  {item.level === "exception" ? <AlertTriangle size={14} aria-hidden="true" /> : <Info size={14} aria-hidden="true" />}
                  <strong>{item.label}</strong>
                </span>
                <span>{item.description}</span>
                {item.actionHref ? <a className="status-signal-popover-action" href={item.actionHref}>{item.actionLabel ?? "查看處理入口"}</a> : null}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <span className={`status-signal-group ${className}`.trim()} ref={rootRef} data-status-surface={surface}>
      {primary ?? (aggregate.primary ? <span className="status-signal-primary-fallback">{aggregate.primary.label}</span> : null)}
      {hasDetail ? (
        <button
          ref={triggerRef}
          type="button"
          className={`status-signal-exception status-signal-exception-${representative ? signalTone(representative) : "info"}`}
          aria-label={triggerLabel}
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setPosition(null);
            setOpen((value) => !value);
          }}
        >
          {representative ? <AlertTriangle size={13} aria-hidden="true" /> : <Info size={13} aria-hidden="true" />}
          <span>{representative?.label ?? "查看說明"}</span>
          {aggregate.exceptions.length > 1 ? <small>＋{aggregate.exceptions.length - 1}</small> : null}
        </button>
      ) : null}
      {panel}
    </span>
  );
}
