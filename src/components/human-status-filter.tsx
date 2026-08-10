"use client";

import { HUMAN_STATUS_FILTER_OPTIONS, type HumanStatusFilter } from "@/lib/human-status-projection";

export function HumanStatusFilterSelect({ value, onChange }: {
  value: HumanStatusFilter;
  onChange: (value: HumanStatusFilter) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as HumanStatusFilter)}>
      {HUMAN_STATUS_FILTER_OPTIONS.map((option) => (
        <option value={option.value} key={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
