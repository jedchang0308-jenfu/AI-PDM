"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";

type HintTone = "info" | "warning" | "danger";

type HintProps = {
  title: string;
  tone?: HintTone;
  className?: string;
};

type TextHintProps = HintProps & {
  children: ReactNode;
};

export function InfoHint({ title, tone = "info", className = "" }: HintProps) {
  return <AccessibleHint title={title} tone={tone} className={className} icon={<Info size={12} strokeWidth={2.4} />} />;
}

export function RiskHint({ title, tone = "warning", className = "" }: HintProps) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return <AccessibleHint title={title} tone={tone} className={className} icon={<Icon size={12} strokeWidth={2.4} />} />;
}

export function TextHint({ title, tone = "warning", className = "", children }: TextHintProps) {
  return <AccessibleHint title={title} tone={tone} className={`ui-hint-text ${className}`.trim()} icon={children} />;
}

function AccessibleHint({ title, tone, className, icon }: HintProps & { icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const id = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLSpanElement | null>(null);

  function updatePosition() {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(320, Math.max(220, window.innerWidth - 24));
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
    const belowTop = rect.bottom + 8;
    const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 0;
    const aboveTop = rect.top - popoverHeight - 8;
    const top = popoverHeight > 0 && belowTop + popoverHeight > window.innerHeight - 12 && aboveTop >= 12
      ? aboveTop
      : belowTop;
    setPosition({ left, top, width });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      setPosition(null);
      window.requestAnimationFrame(() => buttonRef.current?.focus());
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setPosition(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const popover = open && position && typeof document !== "undefined" ? createPortal(
    <span ref={popoverRef} id={id} className={`ui-hint-popover ui-hint-popover-${tone}`} role="tooltip" style={position}>
      {title}
    </span>,
    document.body
  ) : null;

  return (
    <span ref={rootRef} className="ui-hint-root">
      <button
        ref={buttonRef}
        type="button"
        className={`ui-hint ui-hint-${tone} ${className}`.trim()}
        aria-label={title}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => { setOpen(true); updatePosition(); }}
        onMouseLeave={() => { if (document.activeElement !== buttonRef.current) { setOpen(false); setPosition(null); } }}
        onFocus={() => { setOpen(true); updatePosition(); }}
        onBlur={() => { if (!open) return; setOpen(false); setPosition(null); }}
        onClick={() => { setOpen(true); updatePosition(); }}
      >
        {icon}
      </button>
      {popover}
    </span>
  );
}

export function LabelWithInfo({ children, title }: { children: ReactNode; title: string }) {
  return (
    <span className="ui-label-with-hint">
      <span>{children}</span>
      <InfoHint title={title} />
    </span>
  );
}

export function CompactSummary({ items }: { items: Array<{ label: string; value: ReactNode; tone?: HintTone; title?: string }> }) {
  return (
    <div className="compact-summary" aria-label="compact summary">
      {items.map((item) => (
        <span className={`compact-summary-item ${item.tone ? `compact-summary-${item.tone}` : ""}`.trim()} title={item.title} key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
