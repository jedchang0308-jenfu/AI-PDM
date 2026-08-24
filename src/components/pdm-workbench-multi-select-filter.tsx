"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import type { PdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-contract";
import { canonicalizePdmWorkbenchFilterSelection } from "@/lib/pdm-workbench-filter-selection";

export type PdmWorkbenchFilterOption<T extends string> = { value: T; label: string };

export type PdmWorkbenchMultiSelectFilterProps<T extends string> = {
  label: string;
  value: PdmWorkbenchFilterSelection<T>;
  options: readonly PdmWorkbenchFilterOption<T>[];
  onApply: (value: PdmWorkbenchFilterSelection<T>) => void;
  searchable?: boolean;
  disabled?: boolean;
};

function selectionSummary<T extends string>(selection: PdmWorkbenchFilterSelection<T>, options: readonly PdmWorkbenchFilterOption<T>[]) {
  if (selection.mode === "all") return "全部";
  if (selection.mode === "none") return "未選取";
  const labels = selection.values.map((value) => options.find((option) => option.value === value)?.label ?? value);
  return labels.length === 1 ? labels[0] : `${labels[0]} +${labels.length - 1}`;
}

export function PdmWorkbenchMultiSelectFilter<T extends string>({ label, value, options, onApply, searchable = false, disabled = false }: PdmWorkbenchMultiSelectFilterProps<T>) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const allRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState({ top: 0, left: 0, width: 300 });
  const triggerId = useId();
  const dialogId = `${triggerId}-dialog`;
  const optionId = `${triggerId}-option`;
  const visibleOptions = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("zh-Hant");
    return needle ? options.filter((option) => option.label.toLocaleLowerCase("zh-Hant").includes(needle) || option.value.toLocaleLowerCase("zh-Hant").includes(needle)) : options;
  }, [options, search]);
  const selectedValues = draft.mode === "some" ? draft.values : draft.mode === "all" ? options.map((option) => option.value) : [];
  const allChecked = options.length > 0 && selectedValues.length === options.length && options.every((option) => selectedValues.includes(option.value));
  const allIndeterminate = !allChecked && selectedValues.length > 0;

  useEffect(() => {
    if (!open) return;
    setDraft(value);
    setSearch("");
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(360, Math.max(260, rect.width));
      const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
      const below = rect.bottom + 8;
      const height = Math.min(420, Math.max(220, window.innerHeight - 24));
      const top = below + height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - height - 8);
      setPosition({ top, left, width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    allRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = allIndeterminate;
  }, [allIndeterminate]);

  const closeWithoutApply = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const apply = () => {
    const next = canonicalizePdmWorkbenchFilterSelection(draft, options.map((option) => option.value));
    onApply(next);
    setOpen(false);
    triggerRef.current?.focus();
  };
  const toggleAll = () => setDraft(allChecked ? { mode: "none" } : { mode: "all" });
  const toggleOption = (option: PdmWorkbenchFilterOption<T>) => {
    const next = selectedValues.includes(option.value) ? selectedValues.filter((value) => value !== option.value) : [...selectedValues, option.value];
    setDraft(canonicalizePdmWorkbenchFilterSelection({ mode: next.length === 0 ? "none" : "some", values: next }, options.map((item) => item.value)));
  };

  const popover = open && typeof document !== "undefined" ? createPortal(
    <div ref={popoverRef} id={dialogId} className="pdm-workbench-multi-select-popover" role="dialog" aria-modal="false" aria-label={`${label}篩選`} style={{ top: position.top, left: position.left, width: position.width }} onKeyDown={(event) => { if (event.key === "Escape") closeWithoutApply(); }}>
      <div className="pdm-workbench-multi-select-header">
        <strong>{label}</strong>
        <button type="button" className="icon-button" aria-label="關閉篩選" onClick={closeWithoutApply}><X size={16} /></button>
      </div>
      {searchable ? <label className="pdm-workbench-multi-select-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜尋選項" aria-label={`${label}選項搜尋`} /></label> : null}
      <div className="pdm-workbench-multi-select-options" role="group" aria-label={`${label}選項`}>
        <label className="pdm-workbench-multi-select-option is-all"><input ref={allRef} type="checkbox" checked={allChecked} aria-checked={allIndeterminate ? "mixed" : allChecked} onChange={toggleAll} disabled={options.length === 0} /><span>全部</span></label>
        {visibleOptions.map((option, index) => <label className="pdm-workbench-multi-select-option" key={option.value}><input id={`${optionId}-${index}`} type="checkbox" checked={selectedValues.includes(option.value)} onChange={() => toggleOption(option)} /><span>{option.label}</span></label>)}
        {visibleOptions.length === 0 ? <p className="pdm-workbench-multi-select-empty">沒有符合的選項</p> : null}
      </div>
      <div className="pdm-workbench-multi-select-actions"><button type="button" className="secondary-button" onClick={closeWithoutApply}>取消</button><button type="button" className="primary-button" onClick={apply}>確定</button></div>
    </div>, document.body
  ) : null;

  return <div className="pdm-workbench-multi-select-filter"><span className="pdm-workbench-multi-select-label">{label}</span><button ref={triggerRef} type="button" className="pdm-workbench-multi-select-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined} disabled={disabled} onClick={() => setOpen((current) => !current)}><span>{selectionSummary(value, options)}</span><ChevronDown size={15} /></button>{popover}</div>;
}
