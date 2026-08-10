"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { SearchHighlight } from "@/components/search-highlight";
import { getStatusDisplay, getStatusHelpItems, type StatusDisplayContext } from "@/lib/status-display";
import { getStatusScopeDefinition, getStatusScopeHelpGroups, type StatusScopeId } from "@/lib/status-scope-display";

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
  highlightQuery?: string;
};

type StatusScopeHelpProps = {
  scope: StatusScopeId;
  buttonLabel?: string;
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
      setOverlayStyle(null);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    }

    function closeWithoutFocusRestore() {
      setOpen(false);
      setOverlayStyle(null);
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
          setOverlayStyle(null);
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

export function StatusScopeHelp({ scope, buttonLabel, className = "" }: StatusScopeHelpProps) {
  const [open, setOpen] = useState(false);
  const [overlayStyle, setOverlayStyle] = useState<CSSProperties | null>(null);
  const dialogId = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const definition = getStatusScopeDefinition(scope);
  const groups = getStatusScopeHelpGroups(scope);
  const accessibleLabel = buttonLabel ?? `查看${definition.section}狀態說明`;

  const updateOverlayPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const padding = 12;
    const gap = 8;
    const width = Math.min(560, Math.max(280, window.innerWidth - padding * 2));
    const belowTop = rect.bottom + gap;
    const belowSpace = window.innerHeight - belowTop - padding;
    const aboveSpace = rect.top - gap - padding;
    const placeAbove = belowSpace < 300 && aboveSpace > belowSpace;
    const maxHeight = Math.min(600, Math.max(220, placeAbove ? aboveSpace : belowSpace));
    const left = Math.min(Math.max(padding, rect.left), Math.max(padding, window.innerWidth - width - padding));
    const top = placeAbove ? Math.max(padding, rect.top - maxHeight - gap) : belowTop;
    setOverlayStyle({ left, top, width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) return;
    updateOverlayPosition();

    function closeAndRestoreFocus() {
      setOpen(false);
      setOverlayStyle(null);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    }

    function closeWithoutFocusRestore() {
      setOpen(false);
      setOverlayStyle(null);
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
      if (target instanceof Node && panelRef.current?.contains(target)) return;
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

  const panel = open && overlayStyle && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={panelRef}
          className="status-scope-help-popover"
          role="dialog"
          id={dialogId}
          aria-label={definition.title}
          data-status-scope-help="true"
          data-status-scope={scope}
          style={overlayStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="status-scope-help-heading">
            <div>
              <strong>{definition.title}</strong>
              <p>{definition.description}</p>
            </div>
            <button
              className="status-scope-help-close"
              type="button"
              onClick={() => {
                setOpen(false);
                setOverlayStyle(null);
                window.requestAnimationFrame(() => buttonRef.current?.focus());
              }}
              aria-label={`關閉${definition.title}`}
            >
              ×
            </button>
          </div>
          <div className="status-scope-help-groups">
            {groups.map((group) => {
              const seen = new Set<string>();
              const items = group.contexts.flatMap((entry) => entry.items).filter((item) => {
                if (seen.has(item.label)) return false;
                seen.add(item.label);
                return true;
              });
              return (
                <section className="status-scope-help-group" key={group.axis.id}>
                  <h3>{group.axis.label}</h3>
                  <p className="status-scope-help-question">{group.axis.question}</p>
                  <div className="status-help-list">
                    {items.map((item) => (
                      <div className="status-help-item" key={`${group.axis.id}-${item.label}`}>
                        <span className={`status-help-chip ${item.tone}`}>{item.label}</span>
                        <span>{item.description}</span>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <span className={`status-scope-help-root ${className}`.trim()} ref={rootRef} data-status-scope-help-trigger={scope}>
      <button
        ref={buttonRef}
        className="status-scope-help-button"
        type="button"
        aria-label={accessibleLabel}
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOverlayStyle(null);
          setOpen((current) => !current);
        }}
      >
        <span aria-hidden="true">?</span>
        <span className="sr-only">{accessibleLabel}</span>
      </button>
      {panel}
    </span>
  );
}

export function StatusBadge({ status, context = "generic", className = "", highlightQuery = "" }: StatusBadgeProps) {
  const display = getStatusDisplay(status, context);
  return (
    <span className={`badge ${safeClassToken(display.raw)} status-badge ${display.tone} ${className}`.trim()} data-status-label={display.label}>
      <SearchHighlight value={display.label} query={highlightQuery} />
    </span>
  );
}
