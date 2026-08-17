"use client";

import { LockKeyhole, LoaderCircle } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { PdmDetailActionDescriptor } from "@/lib/pdm-entity-detail-contract";

type TooltipPosition = { left: number; top: number; maxWidth: number };

export function PdmDetailActionControl({ action, busy = false, onAction }: { action: PdmDetailActionDescriptor; busy?: boolean; onAction: (action: PdmDetailActionDescriptor) => void }) {
  const describedById = `pdm-action-reason-${useId().replace(/:/gu, "")}`;
  const controlRef = useRef<HTMLButtonElement | HTMLAnchorElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const locked = !action.enabled || action.execution === null;
  const unavailable = locked || busy;

  function clearHoverTimer() {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }

  function closeTooltip() {
    clearHoverTimer();
    setTooltipOpen(false);
  }

  useEffect(() => () => clearHoverTimer(), []);

  useEffect(() => {
    if (!tooltipOpen) return;
    function onOutsidePointer(event: globalThis.PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node) || controlRef.current?.contains(target) || tooltipRef.current?.contains(target)) return;
      closeTooltip();
    }
    function onEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") closeTooltip();
    }
    document.addEventListener("pointerdown", onOutsidePointer);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsidePointer);
      document.removeEventListener("keydown", onEscape);
    };
  }, [tooltipOpen]);

  useLayoutEffect(() => {
    if (!tooltipOpen || !controlRef.current || !tooltipRef.current) {
      setPosition(null);
      return;
    }
    const control = controlRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const margin = 12;
    const gap = 8;
    const maxWidth = Math.min(320, window.innerWidth - margin * 2);
    const measuredWidth = Math.min(tooltip.width || maxWidth, maxWidth);
    const left = Math.min(Math.max(margin, control.left + control.width / 2 - measuredWidth / 2), window.innerWidth - measuredWidth - margin);
    const preferredTop = control.top - tooltip.height - gap;
    const top = preferredTop >= margin ? preferredTop : Math.min(window.innerHeight - tooltip.height - margin, control.bottom + gap);
    setPosition({ left, top, maxWidth });
  }, [tooltipOpen, action.disabledReason]);

  function onPointerEnter(event: PointerEvent<HTMLElement>) {
    if (!locked || event.pointerType !== "mouse") return;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => setTooltipOpen(true), 300);
  }

  function onPointerLeave() {
    closeTooltip();
  }

  function blockLocked(event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
    if (!unavailable) return false;
    event.preventDefault();
    event.stopPropagation();
    if (locked) setTooltipOpen(true);
    return true;
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!unavailable || (event.key !== "Enter" && event.key !== " ")) return;
    blockLocked(event);
  }

  const className = [
    "pdm-detail-action-control",
    locked ? "secondary-button is-locked" : action.tone === "danger" ? "danger-button" : action.tone === "primary" ? "primary-button" : "secondary-button",
    busy ? "is-busy" : ""
  ].filter(Boolean).join(" ");
  const shared = {
    className,
    "aria-disabled": unavailable || undefined,
    "aria-busy": busy || undefined,
    "aria-describedby": locked ? describedById : undefined,
    "data-action-id": action.id,
    "data-action-group": action.group,
    "data-action-order": action.order,
    "data-action-enabled": action.enabled,
    "data-action-reason-code": action.disabledReasonCode ?? undefined,
    onPointerEnter,
    onPointerLeave,
    onFocus: () => { if (locked) setTooltipOpen(true); },
    onBlur: () => closeTooltip(),
    onKeyDown
  } as const;
  const content = <>{busy ? <LoaderCircle className="pdm-detail-action-spinner" size={15} aria-hidden="true" /> : locked ? <LockKeyhole className="pdm-detail-action-lock" size={14} aria-hidden="true" /> : null}<span>{action.label}</span></>;

  const control = action.enabled && action.execution?.type === "navigate"
    ? <a {...shared} ref={controlRef as RefObject<HTMLAnchorElement | null>} href={action.execution.href} onClick={(event) => { if (blockLocked(event)) return; event.preventDefault(); onAction(action); }}>{content}</a>
    : <button {...shared} ref={controlRef as RefObject<HTMLButtonElement | null>} type="button" onClick={(event) => { if (blockLocked(event)) return; onAction(action); }}>{content}</button>;

  return <>
    {control}
    {locked ? <span className="sr-only" id={describedById}>{action.disabledReason}</span> : null}
    {locked && tooltipOpen && typeof document !== "undefined" ? createPortal(
      <div
        ref={tooltipRef}
        className="pdm-detail-action-tooltip"
        role="tooltip"
        data-action-tooltip-for={action.id}
        style={{ left: position?.left ?? 12, top: position?.top ?? 12, maxWidth: position?.maxWidth ?? 320, visibility: position ? "visible" : "hidden" }}
      >
        {action.disabledReason}
      </div>,
      document.body
    ) : null}
  </>;
}
