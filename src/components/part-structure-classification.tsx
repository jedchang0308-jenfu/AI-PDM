"use client";

import { useEffect, useId, useRef, useState } from "react";
import { numberingStructureTypeLabel, type NumberingStructureType, type StoredPartStructureType } from "@/lib/numbering-structure-type";
import type { PartStructureClassificationCandidate, PartStructureClassificationView } from "@/lib/part-structure-classification";

export function PartStructureClassification({ partNumberId, contractToken, onSaved }: { partNumberId: string; contractToken: string; onSaved: () => void }) {
  const [view, setView] = useState<PartStructureClassificationView | null>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<NumberingStructureType>("single_part");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const load = async (signal?: AbortSignal, preserveForm?: { selected: string[]; target: NumberingStructureType; reason: string }) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/pdm/parts/${encodeURIComponent(partNumberId)}/structure-type`, { cache: "no-store", signal });
      const body = await response.json() as { data?: PartStructureClassificationView; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message || "結構型態資料載入失敗");
      setView(body.data);
      const availableIds = new Set(body.data.candidates.map((candidate) => candidate.partNumberId));
      setSelected(preserveForm
        ? [partNumberId, ...preserveForm.selected.filter((id) => id !== partNumberId && availableIds.has(id))]
        : [partNumberId]);
      setTarget(preserveForm?.target ?? (body.data.structureType === "assembly" ? "assembly" : "single_part"));
      setReason(preserveForm?.reason ?? "");
    } catch (caught) {
      if (!(caught instanceof Error && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "結構型態資料載入失敗");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  // `partNumberId` is the exact Part authority and the only reload key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partNumberId]);
  useEffect(() => { if (open) cancelRef.current?.focus(); }, [open]);

  if (loading && !view) return <section className="part-structure-classification" data-section="part-structure-classification"><p className="canonical-drawer-message" role="status">結構型態載入中…</p></section>;
  if (!view) return error ? <section className="part-structure-classification" data-section="part-structure-classification"><p className="canonical-error" role="alert">{error}</p></section> : null;

  const openDialog = () => {
    setSelected([partNumberId]);
    setTarget(view.structureType === "assembly" ? "assembly" : "single_part");
    setReason("");
    setError("");
    setOpen(true);
  };
  const close = () => {
    if (saving) return;
    setOpen(false);
    setError("");
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  };
  const save = async () => {
    if (!selected.length || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/pdm/parts/${encodeURIComponent(partNumberId)}/structure-type`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          "if-match": view.etag,
          "idempotency-key": crypto.randomUUID(),
          "x-pdm-workbench-contract": contractToken
        },
        body: JSON.stringify({ targetPartNumberIds: selected, structureType: target, reason })
      });
      const body = await response.json() as { error?: { code?: string; message?: string } };
      if (!response.ok) {
        const stale = response.status === 412 || body.error?.code === "PART_STRUCTURE_STALE_ETAG";
        if (stale) {
          const preserveForm = { selected, target, reason };
          await load(undefined, preserveForm);
          setError("資料已更新，候選清單已重新載入；請確認保留的選擇後再儲存。");
          return;
        }
        throw new Error(body.error?.message || "結構型態儲存失敗");
      }
      close();
      await load();
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "結構型態儲存失敗"); }
    finally { setSaving(false); }
  };

  return <section className="part-structure-classification" data-section="part-structure-classification">
    <div className="canonical-drawer-section-heading"><h3>結構型態</h3>{view.canMutate ? <button ref={triggerRef} type="button" className="secondary-button" onClick={openDialog}>分類／批次分類</button> : null}</div>
    <p className="part-structure-classification-summary">{numberingStructureTypeLabel(view.structureType)} · 以目前料號為準；同根號其他料號僅供批次選擇。</p>
    {error && !open ? <p className="canonical-error" role="alert">{error}</p> : null}
    {open ? <div className="canonical-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} className="canonical-modal part-structure-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); return; }
        if (event.key !== "Tab") return;
        const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])") ?? [])];
        if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }}>
        <header><h2 id={titleId}>設定結構型態</h2><p>複選只會同時分類料號，不會因顏色差異建立不同 BOM。</p></header>
        <div className="part-structure-dialog-body">
          <fieldset disabled={saving}><legend>目標結構型態</legend><label><input type="radio" checked={target === "single_part"} onChange={() => setTarget("single_part")} /> 單一零件</label><label><input type="radio" checked={target === "assembly"} onChange={() => setTarget("assembly")} /> 組立件</label></fieldset>
          <fieldset disabled={saving}><legend>複選同根號料號</legend>{view.candidates.map((candidate) => <CandidateRow key={candidate.partNumberId} candidate={candidate} checked={selected.includes(candidate.partNumberId)} disabled={!candidate.selectable || candidate.partNumberId === partNumberId} onChange={(checked) => setSelected((current) => checked ? [...new Set([...current, candidate.partNumberId])] : current.filter((id) => id !== candidate.partNumberId))} />)}</fieldset>
          <label><span>分類原因{selected.length > 1 || view.candidates.some((candidate) => selected.includes(candidate.partNumberId) && candidate.structureType !== "unclassified" && candidate.structureType !== target) ? "（必填）" : "（選填）"}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={500} /></label>
          {error ? <p className="canonical-error" role="alert" aria-live="assertive">{error}</p> : null}
        </div>
        <div className="part-structure-dialog-actions"><button type="button" className="primary-button" disabled={!selected.length || saving} onClick={() => void save()}>{saving ? "儲存中…" : "儲存分類"}</button><button ref={cancelRef} type="button" className="secondary-button" disabled={saving} onClick={close}>取消</button></div>
      </div>
    </div> : null}
  </section>;
}

function CandidateRow({ candidate, checked, disabled, onChange }: { candidate: PartStructureClassificationCandidate; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  const attributes = [candidate.material, candidate.color, candidate.surfaceTreatment].filter(Boolean).join(" · ");
  return <label className="part-structure-candidate"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><strong>{candidate.partNumber}</strong>{candidate.name ? ` ${candidate.name}` : ""}<small>{numberingStructureTypeLabel(candidate.structureType)}{attributes ? ` · ${attributes}` : ""}{candidate.blockedReason ? ` · ${candidate.blockedReason}` : ""}</small></span></label>;
}
