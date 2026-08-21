"use client";

import { WORK_STATUS_FILTER_OPTIONS, type WorkStatusFilter } from "@/lib/work-status-presentation";

export function HumanStatusFilterSelect({ value, onChange }: {
  value: WorkStatusFilter;
  onChange: (value: WorkStatusFilter) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value as WorkStatusFilter)}>
      {WORK_STATUS_FILTER_OPTIONS.map((option) => (
        <option value={option.value} key={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
