"use client";

export type PdmWorkbenchLayout = "list" | "preview";

export function PdmWorkbenchLayoutSwitch({ value, onChange, disabled = false }: { value: PdmWorkbenchLayout; onChange: (value: PdmWorkbenchLayout) => void; disabled?: boolean }) {
  return (
    <div className="pdm-relation-view-switch pdm-workbench-layout-switch" role="group" aria-label="工作台顯示模式">
      <button type="button" className={value === "list" ? "active" : ""} aria-pressed={value === "list"} disabled={disabled} onClick={() => onChange("list")}>清單</button>
      <button type="button" className={value === "preview" ? "active" : ""} aria-pressed={value === "preview"} disabled={disabled} onClick={() => onChange("preview")}>預覽圖</button>
    </div>
  );
}
