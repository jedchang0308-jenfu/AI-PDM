"use client";

import { useRef } from "react";
import type { CanonicalWorkbenchLayout } from "@/lib/pdm-canonical-preview";

const OPTIONS: Array<{ value: CanonicalWorkbenchLayout; label: string }> = [
  { value: "list", label: "文字清單" },
  { value: "list_3d", label: "3D 清單" },
  { value: "preview", label: "預覽圖" }
];

export function PdmWorkbenchLayoutSwitch({ value, onChange, disabled = false }: { value: CanonicalWorkbenchLayout; onChange: (value: CanonicalWorkbenchLayout) => void; disabled?: boolean }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (index: number, delta: number) => {
    const next = Math.max(0, Math.min(OPTIONS.length - 1, index + delta));
    onChange(OPTIONS[next].value);
    refs.current[next]?.focus();
  };
  const selectEdge = (index: number) => {
    onChange(OPTIONS[index].value);
    refs.current[index]?.focus();
  };
  return (
    <div className="pdm-relation-view-switch pdm-workbench-layout-switch" role="radiogroup" aria-label="顯示方式" data-canonical-layout-switch>
      {OPTIONS.map((option, index) => <button
        key={option.value}
        ref={(node) => { refs.current[index] = node; }}
        type="button"
        className={value === option.value ? "active" : ""}
        role="radio"
        aria-checked={value === option.value}
        data-layout-mode={option.value}
        tabIndex={value === option.value ? 0 : -1}
        disabled={disabled}
        onClick={() => onChange(option.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
          else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
          else if (event.key === "Home") { event.preventDefault(); selectEdge(0); }
          else if (event.key === "End") { event.preventDefault(); selectEdge(OPTIONS.length - 1); }
          else if (event.key === " " || event.key === "Enter") { event.preventDefault(); onChange(option.value); }
        }}
      >{option.label}</button>)}
    </div>
  );
}
