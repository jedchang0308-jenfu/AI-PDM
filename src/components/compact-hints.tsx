import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";

type HintTone = "info" | "warning" | "danger";

type HintProps = {
  title: string;
  tone?: HintTone;
  className?: string;
};

export function InfoHint({ title, tone = "info", className = "" }: HintProps) {
  return (
    <button type="button" className={`ui-hint ui-hint-${tone} ${className}`.trim()} title={title} aria-label={title}>
      <Info size={12} strokeWidth={2.4} />
    </button>
  );
}

export function RiskHint({ title, tone = "warning", className = "" }: HintProps) {
  const Icon = tone === "info" ? Info : AlertTriangle;
  return (
    <button type="button" className={`ui-hint ui-hint-${tone} ${className}`.trim()} title={title} aria-label={title}>
      <Icon size={12} strokeWidth={2.4} />
    </button>
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
