"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { NumberSortDirection } from "@/lib/number-sort";

function directionLabel(direction: NumberSortDirection) {
  return direction === "asc" ? "遞增" : "遞減";
}

export function NumberSortHeader({
  label,
  direction,
  active = true,
  onToggle,
  className = ""
}: {
  label: string;
  direction: NumberSortDirection;
  active?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const currentDirection = directionLabel(direction);
  const nextDirection = directionLabel(direction === "asc" ? "desc" : "asc");
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;
  const accessibleLabel = active
    ? `${label}排序，目前${currentDirection}，點擊切換為${nextDirection}`
    : `${label}排序，點擊改為遞增`;

  return (
    <button
      className={`number-sort-header ${className}`.trim()}
      type="button"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      onClick={onToggle}
    >
      <span>{label}</span>
      {active ? <Icon className="number-sort-header-icon" size={14} strokeWidth={2.5} aria-hidden="true" /> : null}
    </button>
  );
}
