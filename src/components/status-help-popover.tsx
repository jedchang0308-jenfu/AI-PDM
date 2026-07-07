"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getStatusDisplay, getStatusHelpItems, type StatusDisplayContext } from "@/lib/status-display";

type StatusHelpPopoverProps = {
  context?: StatusDisplayContext;
  buttonLabel?: string;
  className?: string;
};

type StatusColumnHeaderProps = {
  context?: StatusDisplayContext;
  label?: string;
  className?: string;
};

type StatusBadgeProps = {
  status: unknown;
  context?: StatusDisplayContext;
  className?: string;
};

function safeClassToken(value: unknown) {
  return String(value ?? "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function StatusHelpPopover({ context = "generic", buttonLabel = "查看狀態說明", className = "" }: StatusHelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties | null>(null);
  const dialogId = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);
  const items = getStatusHelpItems(context);

  const updateOverlayPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;

    const rect = button.getBoundingClientRect();
    const padding = 12;
    const gap = 8;
    const width = Math.min(360, Math.max(260, window.innerWidth - padding * 2));
    const left = Math.min(Math.max(padding, rect.left), Math.max(padding, window.innerWidth - width - padding));
    const belowTop = rect.bottom + gap;
    const belowSpace = window.innerHeight - belowTop - padding;
    const aboveSpace = rect.top - gap - padding;
    const placeAbove = belowSpace < 220 && aboveSpace > belowSpace;
    const maxHeight = Math.min(420, Math.max(180, placeAbove ? aboveSpace : belowSpace));
    const top = placeAbove ? Math.max(padding, rect.top - maxHeight - gap) : belowTop;

    setOverlayStyle({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;

    updateOverlayPosition();

    function closeAndRestoreFocus() {
      setOpen(false);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    }

    function closeWithoutFocusRestore() {
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndRestoreFocus();
      }
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      if (target instanceof Node && popoverRef.current?.contains(target)) return;
      closeWithoutFocusRestore();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("resize", updateOverlayPosition);
    window.addEventListener("scroll", updateOverlayPosition, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("resize", updateOverlayPosition);
      window.removeEventListener("scroll", updateOverlayPosition, true);
    };
  }, [open, updateOverlayPosition]);

  const popover =
    open && overlayStyle && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={popoverRef}
            className="status-help-popover"
            role="dialog"
            id={dialogId}
            aria-label="狀態說明"
            data-status-help-popover="true"
            style={overlayStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <strong>狀態說明</strong>
            <span className="status-help-list">
              {items.map((item) => (
                <span className="status-help-item" key={`${context}-${item.label}`}>
                  <span className={`status-help-chip ${item.tone}`}>{item.label}</span>
                  <span>{item.description}</span>
                </span>
              ))}
            </span>
          </span>,
          document.body
        )
      : null;

  return (
    <span className={`status-help-root ${className}`.trim()} ref={rootRef} data-status-help-context={context}>
      <button
        ref={buttonRef}
        className="status-help-button"
        type="button"
        aria-label={buttonLabel}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((current) => !current);
        }}
      >
        ?
      </button>
      {popover}
    </span>
  );
}

export function StatusColumnHeader({ context = "generic", label = "狀態", className = "" }: StatusColumnHeaderProps) {
  return (
    <span className={`status-column-header ${className}`.trim()}>
      <span>{label}</span>
      <StatusHelpPopover context={context} />
    </span>
  );
}

export function StatusBadge({ status, context = "generic", className = "" }: StatusBadgeProps) {
  const display = getStatusDisplay(status, context);
  return (
    <span className={`badge ${safeClassToken(display.raw)} status-badge ${display.tone} ${className}`.trim()} data-status-label={display.label}>
      {display.label}
    </span>
  );
}
