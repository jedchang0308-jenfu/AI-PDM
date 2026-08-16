"use client";

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { PdmDetailDrawer } from "@/components/pdm-detail-drawer";

type PdmEntityDetailDrawerProps = {
  open: boolean;
  width: number;
  ariaLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  entityType?: string;
  entityCode?: string;
  sourceContext?: string;
  detailFamily?: string;
  drawingDetailSkeleton?: boolean;
  resizeLabel?: string;
  resizeTitle?: string;
  closeLabel?: string;
  className?: string;
  keepOpenSelector?: string;
  onClose: () => void;
  onStartResize: (clientX: number) => void;
  children: ReactNode;
};

/**
 * Non-modal entity detail shell. It intentionally keeps the underlying list
 * interactive so users can inspect consecutive records without reopening it.
 */
export function PdmEntityDetailDrawer({
  open,
  width,
  ariaLabel,
  title,
  subtitle,
  eyebrow,
  status,
  actions,
  footer,
  entityType,
  entityCode,
  sourceContext,
  detailFamily,
  drawingDetailSkeleton,
  resizeLabel,
  resizeTitle,
  closeLabel = "關閉明細",
  className,
  keepOpenSelector,
  onClose,
  onStartResize,
  children
}: PdmEntityDetailDrawerProps) {
  const generatedTitleId = useId();
  const titleId = `pdm-entity-drawer-${generatedTitleId.replace(/:/gu, "")}`;
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) window.requestAnimationFrame(() => previousFocus.focus({ preventScroll: true }));
    };
  }, [open]);

  function closeFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".pdm-detail-drawer")) return;
      if (keepOpenSelector && target.closest(keepOpenSelector)) return;
      onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [keepOpenSelector, onClose, open]);

  useEffect(() => {
    if (!open) return;
    drawerRef.current
      ?.querySelector<HTMLElement>(".pdm-entity-drawer-body, .number-state-drawer-body")
      ?.scrollTo({ top: 0 });
  }, [entityCode, entityType, open]);

  return (
    <PdmDetailDrawer
      open={open}
      width={width}
      ariaLabel={ariaLabel}
      ariaLabelledBy={titleId}
      role="complementary"
      resizeLabel={resizeLabel}
      resizeTitle={resizeTitle}
      onClose={onClose}
      onStartResize={onStartResize}
      className={["pdm-entity-detail-drawer", className].filter(Boolean).join(" ")}
      dataEntityType={entityType}
      dataEntityCode={entityCode}
      dataSourceContext={sourceContext}
      dataDetailTarget={entityType}
      dataDetailCode={entityCode}
      dataDetailFamily={detailFamily}
      dataDrawingDetailSkeleton={drawingDetailSkeleton}
      drawerRef={drawerRef}
    >
      <header className="pdm-entity-drawer-header">
        <div className="pdm-entity-drawer-identity">
          {status ? <div className="pdm-entity-drawer-status">{status}</div> : null}
          <div className="pdm-entity-drawer-copy">
            {eyebrow ? <span className="pdm-entity-drawer-eyebrow">{eyebrow}</span> : null}
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
        </div>
        <div className="pdm-entity-drawer-actions">
          {actions}
          <button
            className="icon-button pdm-entity-drawer-close"
            type="button"
            onClick={onClose}
            onKeyDown={closeFromKeyboard}
            aria-label={closeLabel}
            data-pdm-drawer-close="true"
          >
            <X size={20} />
          </button>
        </div>
      </header>
      {children}
      {footer ? <footer className="pdm-entity-drawer-footer">{footer}</footer> : null}
    </PdmDetailDrawer>
  );
}
