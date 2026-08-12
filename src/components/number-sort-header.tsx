"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { NumberSortDirection } from "@/lib/number-sort";

function directionLabel(direction: NumberSortDirection) {
  return direction === "asc" ? "遞增" : "遞減";
}

export function NumberSortHeader({
  label,
  direction,
  onToggle,
  className = ""
}: {
  label: string;
  direction: NumberSortDirection;
  onToggle: () => void;
  className?: string;
}) {
  const currentDirection = directionLabel(direction);
  const nextDirection = directionLabel(direction === "asc" ? "desc" : "asc");
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      className={`number-sort-header ${className}`.trim()}
      type="button"
      aria-label={`${label}排序，目前${currentDirection}，點擊切換為${nextDirection}`}
      title={`${label}排序：目前${currentDirection}，點擊切換為${nextDirection}`}
      onClick={onToggle}
    >
      <span>{label}</span>
      <Icon className="number-sort-header-icon" size={14} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}
